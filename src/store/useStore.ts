import { create } from 'zustand';
import {
  hasValidToken,
  signIn as authSignIn,
  signOut as authSignOut,
} from '../services/googleAuth';
import {
  ensureAppStructure,
  fetchBlobUrl,
  setSharedRootFolder,
  uploadFile,
} from '../services/drive';
import { loadDatabase, saveDatabase } from '../services/database';
import {
  newContentItem,
  type AppFolders,
  type ContentItem,
  type FileSlot,
  type Network,
  type NetworkStatus,
} from '../types';

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
  deleteItem(id: string): Promise<void>;
  setNetwork(id: string, network: Network, status: Partial<NetworkStatus>): Promise<void>;

  uploadToItem(itemId: string, slot: FileSlot, file: File): Promise<void>;
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
  async function persist(items: ContentItem[]): Promise<void> {
    const { folders } = get();
    if (!folders) return;
    const saved = await saveDatabase(folders.dbFileId, items);
    set({ items: saved });
  }

  async function connect(explicitRootId?: string): Promise<void> {
    set({ authStatus: 'connecting', errorMessage: undefined });
    try {
      const folders = await ensureAppStructure(explicitRootId);
      const db = await loadDatabase(folders.dbFileId);
      set({ authStatus: 'ready', folders, items: db.items });
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

    async createItem(title, notes) {
      const item = newContentItem(title);
      if (notes) item.notes = notes;
      await persist([item, ...get().items]);
      return item;
    },

    async updateItem(id, patch) {
      const items = get().items.map((item) =>
        item.id === id
          ? { ...item, ...patch, updatedAt: new Date().toISOString() }
          : item,
      );
      await persist(items);
    },

    async deleteItem(id) {
      await persist(get().items.filter((item) => item.id !== id));
    },

    async setNetwork(id, network, status) {
      const items = get().items.map((item) =>
        item.id === id
          ? {
              ...item,
              updatedAt: new Date().toISOString(),
              networks: {
                ...item.networks,
                [network]: { ...item.networks[network], ...status },
              },
            }
          : item,
      );
      await persist(items);
    },

    async uploadToItem(itemId, slot, file) {
      const { folders, items } = get();
      if (!folders) return;
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      const parentId =
        slot === 'raw' ? folders.raw : slot === 'edited' ? folders.edited : folders.covers;

      const task: UploadTask = {
        id: crypto.randomUUID(),
        fileName: file.name,
        slot,
        itemTitle: item.title,
        progress: 0,
      };
      set({ uploads: [...get().uploads, task] });

      const updateTask = (patch: Partial<UploadTask>) =>
        set({
          uploads: get().uploads.map((u) => (u.id === task.id ? { ...u, ...patch } : u)),
        });

      try {
        const fileId = await uploadFile(file, parentId, (p) => updateTask({ progress: p }));
        await get().updateItem(itemId, { [SLOT_FIELD[slot]]: fileId });
        if (slot === 'cover') void get().loadCover(fileId);
        // remove a tarefa concluída após breve pausa para a animação terminar
        setTimeout(
          () => set({ uploads: get().uploads.filter((u) => u.id !== task.id) }),
          1500,
        );
      } catch (error) {
        updateTask({ error: error instanceof Error ? error.message : String(error) });
      }
    },

    async loadCover(fileId) {
      if (get().coverUrls[fileId]) return;
      try {
        const url = await fetchBlobUrl(fileId);
        set({ coverUrls: { ...get().coverUrls, [fileId]: url } });
      } catch {
        // capa indisponível — o card mostra o placeholder
      }
    },
  };
});
