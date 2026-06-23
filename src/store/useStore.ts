import { create } from 'zustand';
import {
  hasValidYoutubeToken,
  getSignedInEmail,
  preloadAuth,
  restoreIOSRedirectSignIn,
  setYoutubeClientId,
  signIn as authSignIn,
  signInYoutube as authSignInYoutube,
  signOut as authSignOut,
  signOutYoutube as authSignOutYoutube,
  restoreSession,
} from '../services/googleAuth';
import {
  captureVideoFrameUrl,
  clearFolderCache,
  deleteFile,
  ensureAppStructure,
  fetchFileBlob,
  fetchThumbnailUrl,
  readJsonFile,
  setSharedRootFolder,
  uploadFile,
  writeJsonFile,
} from '../services/drive';
import {
  loadDatabase,
  mergeIdeas,
  mergeItems,
  mergeRecordings,
  saveDatabase,
} from '../services/database';
import {
  cancelYoutubePublication as cancelYoutubePublicationApi,
  deleteYoutubeVideo as deleteYoutubeVideoApi,
  getCurrentYoutubeChannel,
  uploadScheduledVideo,
  updateYoutubeVideoMetadata,
  type YouTubeChannelInfo,
  type YouTubeMetadataInput,
} from '../services/youtube';
import {
  createRecordingEvent,
  deleteRecordingEvent,
  updateRecordingEvent,
} from '../services/googleCalendar';
import { createLimiter } from '../lib/concurrency';
import {
  hasScheduledTimeArrived,
  isTrashExpired,
  NETWORKS,
  newContentItem,
  newRecording,
  type AppConfig,
  type AppFolders,
  newIdea,
  type ContentItem,
  type ContentType,
  type FileSlot,
  type Idea,
  type Network,
  type NetworkStatus,
  type Recording,
  type YouTubePrivacyStatus,
} from '../types';

/** Capas baixadas no máximo 4 por vez, para não saturar a rede. */
const coverLimiter = createLimiter(4);
/**
 * Capa provisória de vídeo: tentamos o thumbnail do Drive e, se falhar, geramos
 * o frame localmente. Quando até a captura local falha (rede/codec), reagendamos
 * algumas tentativas com espera crescente em vez de desistir na 1ª falha (senão
 * o placeholder ficaria a sessão inteira). `coverRetryScheduled` garante no
 * máximo um timer pendente por arquivo.
 */
const VIDEO_THUMB_RETRY_DELAYS = [4000, 10000, 20000, 40000, 60000];
const coverRetries = new Map<string, number>();
const coverRetryScheduled = new Set<string>();
/** Uploads em lote: no máximo 3 arquivos subindo ao mesmo tempo. */
const uploadLimiter = createLimiter(3);

/**
 * Limite para montar a estrutura do Drive no boot. As chamadas REST do Drive não
 * têm timeout próprio; numa rede móvel ruim uma delas pode pendurar e prender o
 * app em "conectando ao drive…" para sempre. Estourando este prazo, mostramos a
 * tela de erro (com botão "Voltar ao login") em vez de espera infinita.
 */
const CONNECT_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Destino de um upload: um slot de vídeo/capa ou uma imagem de carrossel. */
export type UploadKind = FileSlot | 'carousel';

export interface UploadTask {
  id: string;
  fileName: string;
  slot: UploadKind;
  itemTitle: string;
  progress: number; // 0..1
  error?: string;
}

interface AppState {
  authStatus: 'checking' | 'signedOut' | 'connecting' | 'ready' | 'error';
  youtubeAuthStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  errorMessage?: string;
  youtubeAccount?: YouTubeChannelInfo;
  youtubeErrorMessage?: string;
  /** Client ID OAuth do YouTube salvo no Drive (vazio = usa o padrão do build). */
  youtubeClientId?: string;
  /** E-mail da conta principal usada para Drive e Agenda. */
  accountEmail?: string;
  folders?: AppFolders;
  items: ContentItem[];
  recordings: Recording[];
  ideas: Idea[];
  uploads: UploadTask[];
  /** cache de blob-URLs das capas, por fileId */
  coverUrls: Record<string, string>;

  init(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): void;
  connectYoutube(): Promise<void>;
  disconnectYoutube(): void;
  /** Salva no Drive o Client ID OAuth usado para o YouTube e força reconexão. */
  saveYoutubeClientId(id: string): Promise<void>;
  refresh(): Promise<void>;
  reconcileScheduledPosts(): Promise<void>;
  connectSharedFolder(folderIdOrUrl: string): Promise<void>;

  /** Cria uma gravação planejada na agenda. */
  createRecording(input: {
    title: string;
    scheduledAt: string;
    location?: string;
    script?: string;
  }): Promise<Recording>;
  updateRecording(id: string, patch: Partial<Recording>): Promise<void>;
  /** Manda a gravação para a lixeira (soft delete). */
  deleteRecording(id: string): Promise<void>;
  /** Marca a gravação como cancelada (mantém no histórico). */
  cancelRecording(id: string): Promise<void>;
  /**
   * Marca a gravação como gravada: cria um ContentItem (vídeo cru) herdando
   * título/roteiro e vincula. Retorna o id do item criado (ou undefined se a
   * gravação não estava planejada).
   */
  markRecordingAsRecorded(id: string): Promise<string | undefined>;

  /** Cria uma ideia (rascunho sem data) no banco de ideias. */
  createIdea(title: string, notes?: string): Promise<Idea>;
  updateIdea(id: string, patch: Partial<Idea>): Promise<void>;
  /** Remove a ideia (soft delete). */
  deleteIdea(id: string): Promise<void>;
  /** Promove a ideia a uma gravação agendada e a retira do banco de ideias. */
  convertIdeaToRecording(
    id: string,
    input: { scheduledAt: string; location?: string; script?: string },
  ): Promise<Recording | undefined>;
  /** Promove a ideia a um ContentItem; retorna o id do item criado. */
  convertIdeaToItem(id: string): Promise<string | undefined>;

  createItem(title: string, notes?: string, type?: ContentType): Promise<ContentItem>;
  updateItem(id: string, patch: Partial<ContentItem>): Promise<void>;
  /** Manda o item para a lixeira (soft delete). */
  deleteItem(id: string): Promise<void>;
  setNetwork(id: string, network: Network, status: Partial<NetworkStatus>): Promise<void>;

  /** Aplica o mesmo patch de rede a vários itens numa única escrita. */
  bulkSetNetwork(ids: string[], network: Network, patch: Partial<NetworkStatus>): Promise<void>;
  uploadAndScheduleYoutube(
    id: string,
    input: {
      title: string;
      description?: string;
      publishAt?: string;
      publishNow?: boolean;
      categoryId?: string;
      tags?: string[];
      madeForKids?: boolean;
      containsSyntheticMedia?: boolean;
      embeddable?: boolean;
      publicStatsViewable?: boolean;
      notifySubscribers?: boolean;
      privacyStatus?: YouTubePrivacyStatus;
    },
  ): Promise<void>;
  updateYoutubePublication(id: string, input: YouTubeMetadataInput): Promise<void>;
  cancelYoutubePublication(id: string): Promise<void>;
  deleteYoutubePublication(id: string): Promise<void>;
  /** Manda vários itens para a lixeira de uma vez. */
  deleteItems(ids: string[]): Promise<void>;
  /** Tira itens da lixeira, devolvendo-os ao fluxo normal. */
  restoreItems(ids: string[]): Promise<void>;
  /** Exclui itens de vez (apaga também os arquivos no Drive). */
  purgeItems(ids: string[]): Promise<void>;

  uploadToItem(itemId: string, slot: FileSlot, file: File): Promise<void>;
  /** Cria um item por arquivo e enfileira os uploads (concorrência limitada). */
  bulkUploadAsItems(files: File[], slot: Extract<FileSlot, 'raw' | 'edited'>): Promise<void>;
  /** Sobe imagens para o carrossel de um item e as anexa em ordem. */
  addCarouselImages(itemId: string, files: File[]): Promise<void>;
  /** Remove uma imagem do carrossel (do array e do Drive). */
  removeCarouselImage(itemId: string, fileId: string): Promise<void>;
  /** Move uma imagem do carrossel de uma posição para outra (reordena a exibição). */
  reorderCarousel(itemId: string, from: number, to: number): Promise<void>;
  /**
   * Baixa e cacheia a miniatura de um arquivo. `thumbnailOnly` (usado quando o
   * fileId é um vídeo, p/ capa temporária pelo frame do Drive) impede o fallback
   * de baixar o arquivo inteiro: sem thumbnail, mantém o placeholder.
   */
  loadCover(fileId: string, options?: { thumbnailOnly?: boolean }): Promise<void>;
}

const SLOT_FIELD: Record<FileSlot, keyof Pick<
  ContentItem,
  'rawVideoFileId' | 'editedVideoFileId' | 'coverFileId'
>> = {
  raw: 'rawVideoFileId',
  edited: 'editedVideoFileId',
  cover: 'coverFileId',
};

function markElapsedScheduledPosts(
  items: ContentItem[],
  now = Date.now(),
): { items: ContentItem[]; changed: boolean } {
  const nowIso = new Date(now).toISOString();
  let changed = false;

  const next = items.map((item) => {
    let itemChanged = false;
    const networks = { ...item.networks };

    for (const network of NETWORKS) {
      const status = item.networks[network];
      if (!status.assigned || !hasScheduledTimeArrived(status, now)) continue;
      networks[network] = {
        ...status,
        status: 'posted',
        postedAt: status.postedAt ?? status.scheduledAt,
      };
      itemChanged = true;
    }

    if (!itemChanged) return item;
    changed = true;
    return { ...item, networks, updatedAt: nowIso };
  });

  return { items: next, changed };
}

export const useStore = create<AppState>((set, get) => {
  // Mutex de persistência: encadeia as gravações para que nunca rodem
  // concorrentes. Cada `mutate` lê o estado MAIS RECENTE (depois da gravação
  // anterior) antes de aplicar seu patch — sem isso, dois uploads que terminam
  // juntos leem o mesmo snapshot e um sobrescreve o fileId do outro.
  let chain: Promise<void> = Promise.resolve();

  // Grava SEMPRE as duas coleções juntas (items + recordings), lendo o estado
  // VIVO no momento da escrita: como cada `set` otimista já rodou antes desta
  // tarefa na cadeia, `get()` reflete a última versão de ambas. Assim uma
  // escrita disparada por uma alteração de item nunca apaga as gravações (e
  // vice-versa). O merge reconcilia contra mudanças de outro membro da equipe.
  async function persist(): Promise<void> {
    const { folders, items, recordings, ideas } = get();
    if (!folders) return;
    const saved = await saveDatabase(folders.dbFileId, items, recordings, ideas);
    set({
      items: mergeItems(get().items, saved.items),
      recordings: mergeRecordings(get().recordings, saved.recordings),
      ideas: mergeIdeas(get().ideas, saved.ideas),
    });
  }

  /** Enfileira uma escrita do par completo, serializada pelo mutex. */
  function queuePersist(): Promise<void> {
    const run = chain.then(() => persist());
    // mantém a cadeia viva mesmo se uma gravação falhar
    chain = run.catch(() => {});
    return run;
  }

  /**
   * Aplica `updater` aos itens e persiste, serializado pelo mutex.
   *
   * O patch é refletido no estado local IMEDIATAMENTE (update otimista) para
   * que a UI responda na hora — sem esperar o round-trip de gravação no Drive.
   * A persistência (releitura + merge + escrita remota) roda em segundo plano,
   * encadeada pelo mutex, e reconcilia o estado quando termina.
   */
  function mutate(updater: (items: ContentItem[]) => ContentItem[]): Promise<void> {
    const next = markElapsedScheduledPosts(updater(get().items)).items;
    set({ items: next });
    return queuePersist();
  }

  /** Igual ao `mutate`, mas para a coleção de gravações da agenda. */
  function mutateRecordings(updater: (recordings: Recording[]) => Recording[]): Promise<void> {
    set({ recordings: updater(get().recordings) });
    return queuePersist();
  }

  /** Igual ao `mutate`, mas para a coleção de ideias. */
  function mutateIdeas(updater: (ideas: Idea[]) => Idea[]): Promise<void> {
    set({ ideas: updater(get().ideas) });
    return queuePersist();
  }

  const touch = (item: ContentItem): ContentItem => ({
    ...item,
    updatedAt: new Date().toISOString(),
  });

  /** Revoga e remove do cache os blob-URLs de capa dos arquivos informados. */
  function dropCoverUrls(fileIds: string[]): void {
    const current = get().coverUrls;
    let changed = false;
    const next = { ...current };
    for (const fileId of fileIds) {
      const url = next[fileId];
      if (!url) continue;
      URL.revokeObjectURL(url);
      delete next[fileId];
      coverRetries.delete(fileId);
      changed = true;
    }
    if (changed) set({ coverUrls: next });
  }

  async function reconcileScheduledPosts(now = Date.now()): Promise<void> {
    const result = markElapsedScheduledPosts(get().items, now);
    if (!result.changed) return;
    await mutate(() => result.items);
  }

  async function refreshYoutubeAccount(force = false): Promise<void> {
    if (!force && !hasValidYoutubeToken()) {
      set({
        youtubeAuthStatus: 'disconnected',
        youtubeAccount: undefined,
        youtubeErrorMessage: undefined,
      });
      return;
    }
    set({ youtubeAuthStatus: 'connecting', youtubeErrorMessage: undefined });
    try {
      const youtubeAccount = await getCurrentYoutubeChannel();
      set({ youtubeAuthStatus: 'connected', youtubeAccount });
    } catch (error) {
      authSignOutYoutube();
      const message = error instanceof Error ? error.message : String(error);
      set({
        youtubeAuthStatus: 'error',
        youtubeAccount: undefined,
        youtubeErrorMessage: message,
      });
      if (force) throw error;
    }
  }

  async function connect(explicitRootId?: string): Promise<void> {
    set({ authStatus: 'connecting', errorMessage: undefined });

    // Carrega a estrutura de pastas e, em paralelo, config.json + db.json. Se a
    // estrutura veio do cache e algum ID ficou obsoleto (pasta movida/recriada
    // por outro membro), a leitura falha: zeramos o cache e redescobrimos do zero
    // uma única vez antes de propagar o erro.
    async function loadStructureAndData() {
      const attempt = async () => {
        const folders = await ensureAppStructure(explicitRootId);
        const [config, db] = await Promise.all([
          readJsonFile<AppConfig>(folders.configFileId).catch(() => ({}) as AppConfig),
          loadDatabase(folders.dbFileId),
        ]);
        return { folders, config, db };
      };
      try {
        return await attempt();
      } catch (firstError) {
        clearFolderCache();
        try {
          return await attempt();
        } catch {
          throw firstError;
        }
      }
    }

    try {
      const { folders, config, db } = await withTimeout(
        loadStructureAndData(),
        CONNECT_TIMEOUT_MS,
        'Não foi possível conectar ao Drive. Verifique sua conexão e tente novamente.',
      );
      setYoutubeClientId(config.youtubeClientId);
      const normalized = markElapsedScheduledPosts(db.items);
      set({
        authStatus: 'ready',
        folders,
        youtubeClientId: config.youtubeClientId,
        items: normalized.items,
        recordings: db.recordings,
        ideas: db.ideas,
      });
      const accountEmail = await getSignedInEmail();
      if (accountEmail) set({ accountEmail });
      if (normalized.changed) void persist();
      // limpa itens que já passaram dos 30 dias na lixeira
      const expired = normalized.items.filter(isTrashExpired).map((i) => i.id);
      if (expired.length > 0) void get().purgeItems(expired);
    } catch (error) {
      set({
        authStatus: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    authStatus: 'checking',
    youtubeAuthStatus: hasValidYoutubeToken() ? 'connected' : 'disconnected',
    items: [],
    recordings: [],
    ideas: [],
    uploads: [],
    coverUrls: {},

    async init() {
      // Carrega o GIS já na abertura: quando o usuário tocar em "Entrar", o popup
      // do OAuth abre dentro do gesto (o Safari do iPhone bloqueia popups tardios).
      preloadAuth();
      try {
        restoreIOSRedirectSignIn();
        if (await restoreSession()) {
          await connect();
          await refreshYoutubeAccount();
        } else {
          set({ authStatus: 'signedOut' });
        }
      } catch (error) {
        set({
          authStatus: 'signedOut',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    },

    async signIn() {
      // No iOS o login usa redirect: a página descarrega e esta Promise nunca
      // resolve (nada roda depois). No desktop é um popup: a Promise resolve aqui
      // com o token, então precisamos carregar o Drive em seguida — senão a tela
      // de login fica presa até um F5 (que só então dispara init → restoreSession).
      try {
        await authSignIn();
        await connect();
        await refreshYoutubeAccount();
      } catch (error) {
        set({
          authStatus: 'signedOut',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    },

    signOut() {
      authSignOut();
      setYoutubeClientId(undefined);
      // Revoga os blob-URLs das capas antes de descartar o cache, senão os blobs
      // ficam retidos na memória do navegador a cada login/logout.
      for (const url of Object.values(get().coverUrls)) URL.revokeObjectURL(url);
      coverRetries.clear();
      coverRetryScheduled.clear();
      set({
        authStatus: 'signedOut',
        youtubeAuthStatus: 'disconnected',
        folders: undefined,
        items: [],
        recordings: [],
        ideas: [],
        coverUrls: {},
        youtubeAccount: undefined,
        youtubeErrorMessage: undefined,
        youtubeClientId: undefined,
        accountEmail: undefined,
      });
    },

    async connectYoutube() {
      // Redireciona a página para o Google escolher a conta do YouTube. Ao voltar,
      // `init()` detecta o token e chama refreshYoutubeAccount automaticamente.
      try {
        authSignOutYoutube();
        authSignInYoutube({ forceAccountSelection: true });
      } catch (error) {
        set({
          youtubeAuthStatus: 'error',
          youtubeErrorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    },

    disconnectYoutube() {
      authSignOutYoutube();
      set({
        youtubeAuthStatus: 'disconnected',
        youtubeAccount: undefined,
        youtubeErrorMessage: undefined,
      });
    },

    async saveYoutubeClientId(id) {
      const { folders } = get();
      if (!folders) throw new Error('Conecte-se ao Drive antes de salvar o Client ID.');
      const youtubeClientId = id.trim() || undefined;
      const config: AppConfig = { youtubeClientId };
      await writeJsonFile(folders.configFileId, config);
      setYoutubeClientId(youtubeClientId);
      // O ID trocou de projeto OAuth: invalida o token atual e exige reconexão.
      authSignOutYoutube();
      set({
        youtubeClientId,
        youtubeAuthStatus: 'disconnected',
        youtubeAccount: undefined,
        youtubeErrorMessage: undefined,
      });
    },

    async refresh() {
      const { folders } = get();
      if (!folders) return;
      const db = await loadDatabase(folders.dbFileId);
      const normalized = markElapsedScheduledPosts(db.items);
      set({ items: normalized.items, recordings: db.recordings, ideas: db.ideas });
      if (normalized.changed) void persist();
    },

    reconcileScheduledPosts,

    async connectSharedFolder(folderIdOrUrl) {
      const id = setSharedRootFolder(folderIdOrUrl);
      await connect(id);
    },

    async createRecording(input) {
      const recording = newRecording(input.title, input.scheduledAt);
      if (input.location) recording.location = input.location;
      if (input.script) recording.script = input.script;
      await mutateRecordings((recordings) => [recording, ...recordings]);
      // espelha no Google Agenda em segundo plano (não trava a criação)
      void syncRecordingEvent(recording.id);
      return recording;
    },

    async updateRecording(id, patch) {
      await mutateRecordings((recordings) =>
        recordings.map((rec) =>
          rec.id === id
            ? { ...rec, ...patch, updatedAt: new Date().toISOString() }
            : rec,
        ),
      );
      void syncRecordingEvent(id);
    },

    async deleteRecording(id) {
      const now = new Date().toISOString();
      await mutateRecordings((recordings) =>
        recordings.map((rec) =>
          rec.id === id ? { ...rec, deletedAt: now, updatedAt: now } : rec,
        ),
      );
      // gravação saiu do "a fazer": remove o evento do Google Agenda
      void syncRecordingEvent(id);
    },

    async cancelRecording(id) {
      const now = new Date().toISOString();
      await mutateRecordings((recordings) =>
        recordings.map((rec) =>
          rec.id === id ? { ...rec, status: 'canceled', updatedAt: now } : rec,
        ),
      );
      void syncRecordingEvent(id);
    },

    async markRecordingAsRecorded(id) {
      const recording = get().recordings.find((rec) => rec.id === id && !rec.deletedAt);
      if (!recording || recording.status !== 'planned') return undefined;

      const item = newContentItem(recording.title);
      if (recording.script) item.notes = recording.script;
      const now = new Date().toISOString();

      // Grava o item novo e a gravação atualizada numa única escrita atômica.
      set({
        items: [item, ...get().items],
        recordings: get().recordings.map((rec) =>
          rec.id === id
            ? { ...rec, status: 'recorded', linkedItemId: item.id, updatedAt: now }
            : rec,
        ),
      });
      await queuePersist();
      // virou conteúdo: tira o lembrete da gravação do Google Agenda
      void syncRecordingEvent(id);
      return item.id;
    },

    async createIdea(title, notes) {
      const idea = newIdea(title);
      if (notes) idea.notes = notes;
      await mutateIdeas((ideas) => [idea, ...ideas]);
      return idea;
    },

    async updateIdea(id, patch) {
      await mutateIdeas((ideas) =>
        ideas.map((idea) =>
          idea.id === id ? { ...idea, ...patch, updatedAt: new Date().toISOString() } : idea,
        ),
      );
    },

    async deleteIdea(id) {
      const now = new Date().toISOString();
      await mutateIdeas((ideas) =>
        ideas.map((idea) => (idea.id === id ? { ...idea, deletedAt: now, updatedAt: now } : idea)),
      );
    },

    async convertIdeaToRecording(id, input) {
      const idea = get().ideas.find((i) => i.id === id && !i.deletedAt);
      if (!idea) return undefined;
      const recording = await get().createRecording({
        title: idea.title,
        scheduledAt: input.scheduledAt,
        location: input.location,
        script: input.script ?? idea.notes,
      });
      await get().deleteIdea(id);
      return recording;
    },

    async convertIdeaToItem(id) {
      const idea = get().ideas.find((i) => i.id === id && !i.deletedAt);
      if (!idea) return undefined;
      const item = await get().createItem(idea.title, idea.notes);
      await get().deleteIdea(id);
      return item.id;
    },

    async createItem(title, notes, type) {
      const item = newContentItem(title, type);
      if (notes) item.notes = notes;
      await mutate((items) => [item, ...items]);
      return item;
    },

    async updateItem(id, patch) {
      await mutate((items) =>
        items.map((item) => (item.id === id ? touch({ ...item, ...patch }) : item)),
      );
    },

    async deleteItem(id) {
      const now = new Date().toISOString();
      await mutate((items) =>
        items.map((item) =>
          item.id === id ? { ...item, deletedAt: now, updatedAt: now } : item,
        ),
      );
    },

    async setNetwork(id, network, status) {
      await mutate((items) =>
        items.map((item) =>
          item.id === id
            ? touch({
                ...item,
                networks: {
                  ...item.networks,
                  [network]: { ...item.networks[network], ...status },
                },
              })
            : item,
        ),
      );
    },

    async bulkSetNetwork(ids, network, patch) {
      const idSet = new Set(ids);
      await mutate((items) =>
        items.map((item) =>
          idSet.has(item.id)
            ? touch({
                ...item,
                networks: {
                  ...item.networks,
                  [network]: { ...item.networks[network], ...patch },
                },
              })
            : item,
        ),
      );
    },

    async uploadAndScheduleYoutube(id, input) {
      const item = get().items.find((i) => i.id === id);
      if (!item) return;
      if (!hasValidYoutubeToken()) {
        await refreshYoutubeAccount(true);
      }
      if (!item.editedVideoFileId && !item.rawVideoFileId) {
        throw new Error('Anexe ou selecione um video antes de enviar ao YouTube.');
      }
      const isScheduledUpload = !input.publishNow;
      if (isScheduledUpload && !input.publishAt) {
        throw new Error('Escolha a data e hora para agendar no YouTube.');
      }
      if (
        isScheduledUpload &&
        input.publishAt &&
        new Date(input.publishAt).getTime() <= Date.now()
      ) {
        throw new Error('Escolha uma data futura para o agendamento no YouTube.');
      }

      await mutate((items) =>
        items.map((current) =>
          current.id === id
            ? touch({
                ...current,
                networks: {
                  ...current.networks,
                  youtube: {
                    ...current.networks.youtube,
                    assigned: true,
                    status: isScheduledUpload ? 'scheduled' : 'none',
                    scheduledAt: isScheduledUpload ? input.publishAt : undefined,
                    postedAt: undefined,
                    youtubePrivacyStatus: isScheduledUpload
                      ? 'private'
                      : input.privacyStatus ?? 'public',
                    youtubeUploadStatus: 'uploading',
                    youtubeUploadProgress: 0,
                    youtubeUploadError: undefined,
                  },
                },
              })
            : current,
        ),
      );

      const setProgress = (progress: number) =>
        set({
          items: get().items.map((current) =>
            current.id === id
              ? {
                  ...current,
                  networks: {
                    ...current.networks,
                    youtube: {
                      ...current.networks.youtube,
                      youtubeUploadProgress: progress,
                    },
                  },
                }
              : current,
          ),
        });

      try {
        const fresh = get().items.find((current) => current.id === id) ?? item;
        const videoFileId = fresh.editedVideoFileId ?? fresh.rawVideoFileId;
        if (!videoFileId) throw new Error('Anexe ou selecione um video antes de agendar no YouTube.');
        const video = await fetchFileBlob(videoFileId);
        const thumbnail = fresh.coverFileId
          ? await fetchFileBlob(fresh.coverFileId).catch(() => undefined)
          : undefined;
        const result = await uploadScheduledVideo({
          video,
          thumbnail,
          title: input.title,
          description: input.description,
          publishAt: input.publishAt,
          categoryId: input.categoryId,
          tags: input.tags,
          madeForKids: input.madeForKids,
          containsSyntheticMedia: input.containsSyntheticMedia,
          embeddable: input.embeddable,
          publicStatsViewable: input.publicStatsViewable,
          notifySubscribers: input.notifySubscribers,
          privacyStatus: input.privacyStatus,
          onProgress: setProgress,
        });
        const postedAt = new Date().toISOString();

        await mutate((items) =>
          items.map((current) =>
            current.id === id
              ? touch({
                  ...current,
                  networks: {
                    ...current.networks,
                    youtube: {
                      ...current.networks.youtube,
                      assigned: true,
                      status: isScheduledUpload ? 'scheduled' : 'posted',
                      scheduledAt: isScheduledUpload ? input.publishAt : undefined,
                      postedAt: isScheduledUpload ? undefined : postedAt,
                      postUrl: result.url,
                      youtubeVideoId: result.videoId,
                      youtubePrivacyStatus: isScheduledUpload
                        ? 'private'
                        : input.privacyStatus ?? 'public',
                      youtubeUploadStatus: 'scheduled',
                      youtubeUploadProgress: 1,
                      youtubeUploadError: undefined,
                    },
                  },
                })
              : current,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await mutate((items) =>
          items.map((current) =>
            current.id === id
              ? touch({
                  ...current,
                  networks: {
                    ...current.networks,
                    youtube: {
                      ...current.networks.youtube,
                      youtubeUploadStatus: 'failed',
                      youtubeUploadError: message,
                    },
                  },
                })
              : current,
          ),
        );
        throw error;
      }
    },

    async updateYoutubePublication(id, input) {
      if (!hasValidYoutubeToken()) {
        await refreshYoutubeAccount(true);
      }
      const item = get().items.find((current) => current.id === id);
      const videoId = item?.networks.youtube.youtubeVideoId;
      if (!videoId) throw new Error('Nenhum video do YouTube vinculado a este item.');

      await updateYoutubeVideoMetadata(videoId, input);
      await mutate((items) =>
        items.map((current) =>
          current.id === id
            ? touch({
                ...current,
                title: input.title || current.title,
                notes: input.description,
                networks: {
                  ...current.networks,
                  youtube: {
                    ...current.networks.youtube,
                    ...(input.privacyStatus
                      ? { youtubePrivacyStatus: input.privacyStatus }
                      : {}),
                    youtubeUploadError: undefined,
                  },
                },
              })
            : current,
        ),
      );
    },

    async cancelYoutubePublication(id) {
      if (!hasValidYoutubeToken()) {
        await refreshYoutubeAccount(true);
      }
      const item = get().items.find((current) => current.id === id);
      const videoId = item?.networks.youtube.youtubeVideoId;
      if (!videoId) throw new Error('Nenhum video do YouTube vinculado a este item.');

      await cancelYoutubePublicationApi(videoId);
      await mutate((items) =>
        items.map((current) =>
          current.id === id
            ? touch({
                ...current,
                networks: {
                  ...current.networks,
                  youtube: {
                    ...current.networks.youtube,
                    status: 'none',
                    scheduledAt: undefined,
                    postedAt: undefined,
                    youtubePrivacyStatus: 'private',
                    youtubeUploadStatus: 'idle',
                    youtubeUploadError: undefined,
                  },
                },
              })
            : current,
        ),
      );
    },

    async deleteYoutubePublication(id) {
      if (!hasValidYoutubeToken()) {
        await refreshYoutubeAccount(true);
      }
      const item = get().items.find((current) => current.id === id);
      const videoId = item?.networks.youtube.youtubeVideoId;
      if (!videoId) throw new Error('Nenhum video do YouTube vinculado a este item.');

      await deleteYoutubeVideoApi(videoId);
      await mutate((items) =>
        items.map((current) =>
          current.id === id
            ? touch({
                ...current,
                networks: {
                  ...current.networks,
                  youtube: {
                    ...current.networks.youtube,
                    status: 'none',
                    scheduledAt: undefined,
                    postedAt: undefined,
                    postUrl: undefined,
                    youtubeVideoId: undefined,
                    youtubePrivacyStatus: undefined,
                    youtubeUploadStatus: 'idle',
                    youtubeUploadProgress: undefined,
                    youtubeUploadError: undefined,
                  },
                },
              })
            : current,
        ),
      );
    },

    async deleteItems(ids) {
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      await mutate((items) =>
        items.map((item) =>
          idSet.has(item.id) ? { ...item, deletedAt: now, updatedAt: now } : item,
        ),
      );
    },

    async restoreItems(ids) {
      const idSet = new Set(ids);
      await mutate((items) =>
        items.map((item) => {
          if (!idSet.has(item.id)) return item;
          const restored = { ...item, updatedAt: new Date().toISOString() };
          delete restored.deletedAt;
          return restored;
        }),
      );
    },

    async purgeItems(ids) {
      const idSet = new Set(ids);
      const targets = get().items.filter((item) => idSet.has(item.id));
      // remove do banco primeiro; a falha ao apagar arquivos não deve
      // deixar o item preso na lixeira
      await mutate((items) => items.filter((item) => !idSet.has(item.id)));
      const fileIds = targets.flatMap((item) =>
        [
          item.rawVideoFileId,
          item.editedVideoFileId,
          item.coverFileId,
          ...(item.carouselFileIds ?? []),
        ].filter((id): id is string => !!id),
      );
      // libera os blob-URLs de capa em cache desses arquivos antes de descartá-los
      dropCoverUrls(fileIds);
      // apaga os arquivos do Drive em paralelo, ignorando os que já sumiram
      await Promise.all(fileIds.map((fileId) => deleteFile(fileId).catch(() => {})));
    },

    async uploadToItem(itemId, slot, file) {
      const { folders, items } = get();
      if (!folders) return;
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      await runUpload(itemId, item.title, slot, file);
    },

    async bulkUploadAsItems(files, slot) {
      const { folders } = get();
      if (!folders || files.length === 0) return;

      const now = new Date().toISOString();
      const created = files.map((file) => {
        const item = newContentItem(stripExtension(file.name));
        item.createdAt = now;
        item.updatedAt = now;
        return { item, file };
      });

      // todos os itens entram numa única gravação
      await mutate((items) => [...created.map((c) => c.item), ...items]);

      // uploads em paralelo limitado; cada conclusão grava seu fileId (serializado)
      await Promise.all(
        created.map(({ item, file }) =>
          uploadLimiter(() => runUpload(item.id, item.title, slot, file)),
        ),
      );
    },

    async addCarouselImages(itemId, files) {
      const { folders, items } = get();
      if (!folders) return;
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      const images = files.filter((f) => f.type.startsWith('image/'));
      if (images.length === 0) return;
      await Promise.all(
        images.map((file) =>
          uploadLimiter(() => runUpload(itemId, item.title, 'carousel', file)),
        ),
      );
    },

    async removeCarouselImage(itemId, fileId) {
      await mutate((items) =>
        items.map((item) =>
          item.id === itemId
            ? touch({
                ...item,
                carouselFileIds: (item.carouselFileIds ?? []).filter((id) => id !== fileId),
              })
            : item,
        ),
      );
      dropCoverUrls([fileId]);
      await deleteFile(fileId).catch(() => {});
    },

    async reorderCarousel(itemId, from, to) {
      await mutate((items) =>
        items.map((item) => {
          if (item.id !== itemId) return item;
          const ids = [...(item.carouselFileIds ?? [])];
          if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) {
            return item;
          }
          const [moved] = ids.splice(from, 1);
          ids.splice(to, 0, moved);
          return touch({ ...item, carouselFileIds: ids });
        }),
      );
    },

    async loadCover(fileId, options) {
      if (get().coverUrls[fileId]) return;
      const cacheUrl = (url: string) => {
        coverRetries.delete(fileId);
        set({ coverUrls: { ...get().coverUrls, [fileId]: url } });
      };

      try {
        const url = await coverLimiter(() =>
          fetchThumbnailUrl(fileId, { allowFullDownload: !options?.thumbnailOnly }),
        );
        cacheUrl(url);
        return;
      } catch {
        // miniatura do Drive indisponível — capas de imagem param aqui (mantêm
        // o placeholder); vídeos seguem para o fallback de captura local
      }
      if (!options?.thumbnailOnly) return;

      // Vídeo sem capa: como esta app autentica por token (sem cookie), o
      // thumbnailLink do Drive costuma falhar, então geramos o frame no próprio
      // navegador a partir do arquivo. Baixa o vídeo uma vez e cacheia.
      try {
        const url = await coverLimiter(() => captureVideoFrameUrl(fileId));
        cacheUrl(url);
        return;
      } catch {
        // captura falhou (rede/codec) — reagenda algumas tentativas
      }
      if (!coverRetryScheduled.has(fileId)) {
        const attempt = coverRetries.get(fileId) ?? 0;
        const delay = VIDEO_THUMB_RETRY_DELAYS[attempt];
        if (delay !== undefined) {
          coverRetries.set(fileId, attempt + 1);
          coverRetryScheduled.add(fileId);
          setTimeout(() => {
            coverRetryScheduled.delete(fileId);
            if (!get().coverUrls[fileId]) void get().loadCover(fileId, options);
          }, delay);
        }
      }
    },
  };

  /** Grava (ou limpa) o id do evento do Google Agenda numa gravação. */
  function setRecordingEventId(id: string, eventId: string | undefined): Promise<void> {
    return mutateRecordings((recordings) =>
      recordings.map((rec) =>
        rec.id === id
          ? { ...rec, googleCalendarEventId: eventId, updatedAt: new Date().toISOString() }
          : rec,
      ),
    );
  }

  /**
   * Reconcilia o evento da gravação no Google Agenda com o estado local
   * (melhor-esforço): cria/atualiza enquanto a gravação está "planejada"; remove
   * quando ela é cancelada, excluída ou virou conteúdo. Falhas são ignoradas.
   */
  async function syncRecordingEvent(id: string): Promise<void> {
    const rec = get().recordings.find((r) => r.id === id);
    if (!rec) return;
    try {
      const active = !rec.deletedAt && rec.status === 'planned';
      if (!active) {
        if (rec.googleCalendarEventId) {
          await deleteRecordingEvent(rec.googleCalendarEventId);
          await setRecordingEventId(id, undefined);
        }
        return;
      }
      if (rec.googleCalendarEventId) {
        await updateRecordingEvent(rec.googleCalendarEventId, rec);
      } else {
        const eventId = await createRecordingEvent(rec);
        await setRecordingEventId(id, eventId);
      }
    } catch {
      // o Google Agenda é uma camada extra: falhar nele não afeta o estado local
    }
  }

  /** Anexa uma imagem ao fim do carrossel, lendo sempre o estado mais recente. */
  function appendCarouselImage(itemId: string, fileId: string): Promise<void> {
    return mutate((items) =>
      items.map((item) =>
        item.id === itemId
          ? touch({ ...item, carouselFileIds: [...(item.carouselFileIds ?? []), fileId] })
          : item,
      ),
    );
  }

  /** Sobe um arquivo para um item já existente, com tarefa de progresso. */
  async function runUpload(
    itemId: string,
    itemTitle: string,
    kind: UploadKind,
    file: File,
  ): Promise<void> {
    const { folders } = get();
    if (!folders) return;
    const parentId =
      kind === 'raw'
        ? folders.raw
        : kind === 'edited'
          ? folders.edited
          : kind === 'carousel'
            ? folders.carousel
            : folders.covers;

    const task: UploadTask = {
      id: crypto.randomUUID(),
      fileName: file.name,
      slot: kind,
      itemTitle,
      progress: 0,
    };
    set({ uploads: [...get().uploads, task] });

    const updateTask = (patch: Partial<UploadTask>) =>
      set({
        uploads: get().uploads.map((u) => (u.id === task.id ? { ...u, ...patch } : u)),
      });

    try {
      const fileId = await uploadFile(file, parentId, (p) => updateTask({ progress: p }));
      if (kind === 'carousel') {
        await appendCarouselImage(itemId, fileId);
        // pré-carrega a miniatura (a 1ª imagem vira capa na lista/cards)
        void get().loadCover(fileId);
      } else {
        const patch: Partial<ContentItem> = { [SLOT_FIELD[kind]]: fileId };
        if (kind === 'raw') patch.rawUploadedAt = new Date().toISOString();
        if (kind === 'edited') patch.editedUploadedAt = new Date().toISOString();
        await get().updateItem(itemId, patch);
        if (kind === 'cover') void get().loadCover(fileId);
      }
      // remove a tarefa concluída após breve pausa para a animação terminar
      setTimeout(() => set({ uploads: get().uploads.filter((u) => u.id !== task.id) }), 1500);
    } catch (error) {
      updateTask({ error: error instanceof Error ? error.message : String(error) });
    }
  }
});

/** Remove a extensão do nome do arquivo para virar título do conteúdo. */
function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '').trim() || name;
}
