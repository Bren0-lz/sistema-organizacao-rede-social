import { create } from 'zustand';
import {
  hasValidToken,
  signIn as authSignIn,
  signOut as authSignOut,
} from '../services/googleAuth';
import {
  deleteFile,
  ensureAppStructure,
  fetchThumbnailUrl,
  setSharedRootFolder,
  uploadFile,
  validateUpload,
} from '../services/drive';
import { loadDatabase, saveDatabase } from '../services/database';
import { createLimiter } from '../lib/concurrency';
import {
  isTrashExpired,
  newContentItem,
  type AppFolders,
  type ContentItem,
  type FileSlot,
  type Network,
  type NetworkStatus,
} from '../types';

/** Capas baixadas no máximo 4 por vez, para não saturar a rede. */
const coverLimiter = createLimiter(4);
/** Uploads em lote: no máximo 3 arquivos subindo ao mesmo tempo. */
const uploadLimiter = createLimiter(3);
/**
 * Teto do cache de capas em memória. Cada capa é um blob-URL criado com
 * `URL.createObjectURL`; sem limite + revogação, sessões longas (rolar por
 * centenas de itens) vazam memória indefinidamente.
 */
const MAX_COVER_CACHE = 120;

/** Revoga todos os blob-URLs de capas e devolve um mapa vazio. */
function revokeCovers(covers: Record<string, string>): void {
  for (const url of Object.values(covers)) URL.revokeObjectURL(url);
}

export interface UploadTask {
  id: string;
  fileName: string;
  slot: FileSlot;
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

  createItem(title: string, notes?: string): Promise<ContentItem>;
  updateItem(id: string, patch: Partial<ContentItem>): Promise<void>;
  /** Manda o item para a lixeira (soft delete). */
  deleteItem(id: string): Promise<void>;
  setNetwork(id: string, network: Network, status: Partial<NetworkStatus>): Promise<void>;

  /** Aplica o mesmo patch de rede a vários itens numa única escrita. */
  bulkSetNetwork(ids: string[], network: Network, patch: Partial<NetworkStatus>): Promise<void>;
  /** Manda vários itens para a lixeira de uma vez. */
  deleteItems(ids: string[]): Promise<void>;
  /** Tira itens da lixeira, devolvendo-os ao fluxo normal. */
  restoreItems(ids: string[]): Promise<void>;
  /** Exclui itens de vez (apaga também os arquivos no Drive). */
  purgeItems(ids: string[]): Promise<void>;

  uploadToItem(itemId: string, slot: FileSlot, file: File): Promise<void>;
  /** Cria um item por arquivo e enfileira os uploads (concorrência limitada). */
  bulkUploadAsItems(files: File[], slot: Extract<FileSlot, 'raw' | 'edited'>): Promise<void>;
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
    set({ items: saved });
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
      revokeCovers(get().coverUrls);
      set({ authStatus: 'signedOut', folders: undefined, items: [], coverUrls: {} });
    },

    async refresh() {
      const { folders } = get();
      if (!folders) return;
      const db = await loadDatabase(folders.dbFileId);
      set({ items: db.items });
    },

    async connectSharedFolder(folderIdOrUrl) {
      const id = await setSharedRootFolder(folderIdOrUrl);
      await connect(id);
    },

    async createItem(title, notes) {
      const item = newContentItem(title);
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
          [item.rawVideoFileId, item.editedVideoFileId, item.coverFileId]
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

    async loadCover(fileId) {
      if (get().coverUrls[fileId]) return;
      try {
        const url = await coverLimiter(() => fetchThumbnailUrl(fileId));
        // outra chamada concorrente pode ter resolvido a mesma capa primeiro
        const current = get().coverUrls;
        if (current[fileId]) {
          URL.revokeObjectURL(url);
          return;
        }
        const next = { ...current, [fileId]: url };
        // despeja as capas mais antigas (ordem de inserção) acima do teto,
        // revogando o blob-URL para liberar memória
        const keys = Object.keys(next);
        for (let i = 0; i < keys.length - MAX_COVER_CACHE; i++) {
          const evicted = keys[i];
          URL.revokeObjectURL(next[evicted]);
          delete next[evicted];
        }
        set({ coverUrls: next });
      } catch {
        // capa indisponível — o card mostra o placeholder
      }
    },
  };

  /** Sobe um arquivo para um item já existente, com tarefa de progresso. */
  async function runUpload(
    itemId: string,
    itemTitle: string,
    slot: FileSlot,
    file: File,
  ): Promise<void> {
    const { folders } = get();
    if (!folders) return;
    const parentId =
      slot === 'raw' ? folders.raw : slot === 'edited' ? folders.edited : folders.covers;

    const task: UploadTask = {
      id: crypto.randomUUID(),
      fileName: file.name,
      slot,
      itemTitle,
      progress: 0,
    };
    set({ uploads: [...get().uploads, task] });

    const updateTask = (patch: Partial<UploadTask>) =>
      set({
        uploads: get().uploads.map((u) => (u.id === task.id ? { ...u, ...patch } : u)),
      });

    try {
      validateUpload(file, slot);
      const fileId = await uploadFile(file, parentId, (p) => updateTask({ progress: p }));
      const patch: Partial<ContentItem> = { [SLOT_FIELD[slot]]: fileId };
      if (slot === 'raw') patch.rawUploadedAt = new Date().toISOString();
      if (slot === 'edited') patch.editedUploadedAt = new Date().toISOString();
      await get().updateItem(itemId, patch);
      if (slot === 'cover') void get().loadCover(fileId);
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
