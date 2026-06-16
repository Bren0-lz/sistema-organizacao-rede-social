import { create } from 'zustand';
import {
  hasValidToken,
  signIn as authSignIn,
  signOut as authSignOut,
} from '../services/googleAuth';
import {
  deleteFile,
  ensureAppStructure,
  fetchFileBlob,
  fetchThumbnailUrl,
  setSharedRootFolder,
  uploadFile,
} from '../services/drive';
import { loadDatabase, mergeItems, saveDatabase } from '../services/database';
import {
  cancelYoutubePublication as cancelYoutubePublicationApi,
  deleteYoutubeVideo as deleteYoutubeVideoApi,
  uploadScheduledVideo,
  updateYoutubeVideoMetadata,
  type YouTubeMetadataInput,
} from '../services/youtube';
import { createLimiter } from '../lib/concurrency';
import {
  isTrashExpired,
  newContentItem,
  type AppFolders,
  type ContentItem,
  type ContentType,
  type FileSlot,
  type Network,
  type NetworkStatus,
} from '../types';

/** Capas baixadas no máximo 4 por vez, para não saturar a rede. */
const coverLimiter = createLimiter(4);
/** Uploads em lote: no máximo 3 arquivos subindo ao mesmo tempo. */
const uploadLimiter = createLimiter(3);

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
  errorMessage?: string;
  folders?: AppFolders;
  items: ContentItem[];
  uploads: UploadTask[];
  /** cache de blob-URLs das capas, por fileId */
  coverUrls: Record<string, string>;

  init(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): void;
  refresh(): Promise<void>;
  connectSharedFolder(folderIdOrUrl: string): Promise<void>;

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
      publishAt: string;
      categoryId?: string;
      tags?: string[];
      madeForKids?: boolean;
      containsSyntheticMedia?: boolean;
      embeddable?: boolean;
      publicStatsViewable?: boolean;
      notifySubscribers?: boolean;
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
  loadCover(fileId: string): Promise<void>;
}

const SLOT_FIELD: Record<FileSlot, keyof Pick<
  ContentItem,
  'rawVideoFileId' | 'editedVideoFileId' | 'coverFileId'
>> = {
  raw: 'rawVideoFileId',
  edited: 'editedVideoFileId',
  cover: 'coverFileId',
};

export const useStore = create<AppState>((set, get) => {
  // Mutex de persistência: encadeia as gravações para que nunca rodem
  // concorrentes. Cada `mutate` lê o estado MAIS RECENTE (depois da gravação
  // anterior) antes de aplicar seu patch — sem isso, dois uploads que terminam
  // juntos leem o mesmo snapshot e um sobrescreve o fileId do outro.
  let chain: Promise<void> = Promise.resolve();

  async function persist(items: ContentItem[]): Promise<void> {
    const { folders } = get();
    if (!folders) return;
    const saved = await saveDatabase(folders.dbFileId, items);
    // Reconcilia contra o estado VIVO (não contra o snapshot que mandamos
    // gravar): se uma edição otimista mais recente aconteceu enquanto esta
    // gravação rodava, ela vence (updatedAt maior) e não é revertida. O
    // `saved` ainda traz mudanças de outros membros da equipe.
    set({ items: mergeItems(get().items, saved) });
  }

  /**
   * Aplica `updater` ao estado atual e persiste, serializado pelo mutex.
   *
   * O patch é refletido no estado local IMEDIATAMENTE (update otimista) para
   * que a UI responda na hora — sem esperar o round-trip de gravação no Drive.
   * A persistência (releitura + merge + escrita remota) roda em segundo plano,
   * encadeada pelo mutex, e reconcilia o estado quando termina.
   */
  function mutate(updater: (items: ContentItem[]) => ContentItem[]): Promise<void> {
    const next = updater(get().items);
    set({ items: next });
    const run = chain.then(() => persist(next));
    // mantém a cadeia viva mesmo se uma gravação falhar
    chain = run.catch(() => {});
    return run;
  }

  const touch = (item: ContentItem): ContentItem => ({
    ...item,
    updatedAt: new Date().toISOString(),
  });

  async function connect(explicitRootId?: string): Promise<void> {
    set({ authStatus: 'connecting', errorMessage: undefined });
    try {
      const folders = await ensureAppStructure(explicitRootId);
      const db = await loadDatabase(folders.dbFileId);
      set({ authStatus: 'ready', folders, items: db.items });
      // limpa itens que já passaram dos 30 dias na lixeira
      const expired = db.items.filter(isTrashExpired).map((i) => i.id);
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
    items: [],
    uploads: [],
    coverUrls: {},

    async init() {
      if (hasValidToken()) {
        await connect();
      } else {
        set({ authStatus: 'signedOut' });
      }
    },

    async signIn() {
      try {
        await authSignIn();
        await connect();
      } catch (error) {
        set({
          authStatus: 'signedOut',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    },

    signOut() {
      authSignOut();
      set({ authStatus: 'signedOut', folders: undefined, items: [], coverUrls: {} });
    },

    async refresh() {
      const { folders } = get();
      if (!folders) return;
      const db = await loadDatabase(folders.dbFileId);
      set({ items: db.items });
    },

    async connectSharedFolder(folderIdOrUrl) {
      const id = setSharedRootFolder(folderIdOrUrl);
      await connect(id);
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
      if (!item.editedVideoFileId && !item.rawVideoFileId) {
        throw new Error('Anexe ou selecione um video antes de agendar no YouTube.');
      }
      if (new Date(input.publishAt).getTime() <= Date.now()) {
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
                    status: 'scheduled',
                    scheduledAt: input.publishAt,
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
          onProgress: setProgress,
        });

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
                      status: 'posted',
                      scheduledAt: input.publishAt,
                      postedAt: input.publishAt,
                      postUrl: result.url,
                      youtubeVideoId: result.videoId,
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
                    youtubeUploadError: undefined,
                  },
                },
              })
            : current,
        ),
      );
    },

    async cancelYoutubePublication(id) {
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
      // apaga os arquivos do Drive em paralelo, ignorando os que já sumiram
      await Promise.all(
        targets.flatMap((item) =>
          [
            item.rawVideoFileId,
            item.editedVideoFileId,
            item.coverFileId,
            ...(item.carouselFileIds ?? []),
          ]
            .filter((id): id is string => !!id)
            .map((fileId) => deleteFile(fileId).catch(() => {})),
        ),
      );
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

    async loadCover(fileId) {
      if (get().coverUrls[fileId]) return;
      try {
        const url = await coverLimiter(() => fetchThumbnailUrl(fileId));
        set({ coverUrls: { ...get().coverUrls, [fileId]: url } });
      } catch {
        // capa indisponível — o card mostra o placeholder
      }
    },
  };

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
