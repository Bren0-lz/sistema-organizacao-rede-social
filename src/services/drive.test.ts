import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearFolderCache,
  ensureAppStructure,
  getRootFolderId,
  previewUrl,
  readJsonFile,
  rootFolderUrl,
  setSharedRootFolder,
  writeJsonFile,
} from './drive';
import { getAccessToken } from './googleAuth';
import type { AppFolders } from '../types';

vi.mock('./googleAuth', () => ({ getAccessToken: vi.fn() }));

const FOLDER_ID_KEY = 'org-social:rootFolderId';
const FOLDERS_KEY = 'org-social:folders:v1';

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () => new Blob([JSON.stringify(body)]),
  } as Response;
}

const fullFolders: AppFolders = {
  root: 'r',
  raw: 'raw',
  edited: 'ed',
  covers: 'cv',
  carousel: 'ca',
  dbFileId: 'db',
  configFileId: 'cfg',
};

describe('drive (funções puras / cache)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue('drive-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('previewUrl / rootFolderUrl', () => {
    it('monta a URL de preview do arquivo', () => {
      expect(previewUrl('abc')).toBe('https://drive.google.com/file/d/abc/preview');
    });
    it('monta a URL da pasta raiz', () => {
      expect(rootFolderUrl('xyz')).toBe('https://drive.google.com/drive/folders/xyz');
    });
  });

  describe('setSharedRootFolder', () => {
    function mockFolderInfo(id: string) {
      vi.mocked(fetch).mockResolvedValueOnce(
        okJson({ id, name: 'Pasta', mimeType: 'application/vnd.google-apps.folder' }),
      );
    }

    it('extrai o id de uma URL de pasta e o salva', async () => {
      mockFolderInfo('folder1234567');
      const id = await setSharedRootFolder(
        'https://drive.google.com/drive/folders/folder1234567?usp=sharing',
      );
      expect(id).toBe('folder1234567');
      expect(getRootFolderId()).toBe('folder1234567');
    });

    it('aceita o id puro (aparando espaços)', async () => {
      mockFolderInfo('plain-id-123');
      await expect(setSharedRootFolder('  plain-id-123  ')).resolves.toBe('plain-id-123');
      expect(localStorage.getItem(FOLDER_ID_KEY)).toBe('plain-id-123');
    });

    it('rejeita quando o alvo não é uma pasta e não persiste nada', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        okJson({ id: 'file-id-video', name: 'Arquivo', mimeType: 'video/mp4' }),
      );
      await expect(setSharedRootFolder('file-id-video')).rejects.toThrow(/não para uma pasta/);
      expect(localStorage.getItem(FOLDER_ID_KEY)).toBeNull();
    });
  });

  describe('clearFolderCache', () => {
    it('remove os dois caches do localStorage', () => {
      localStorage.setItem(FOLDER_ID_KEY, 'r');
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(fullFolders));
      clearFolderCache();
      expect(localStorage.getItem(FOLDER_ID_KEY)).toBeNull();
      expect(localStorage.getItem(FOLDERS_KEY)).toBeNull();
    });
  });

  describe('ensureAppStructure (caminho cacheado)', () => {
    it('retorna a estrutura cacheada sem chamar a rede', async () => {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(fullFolders));
      const folders = await ensureAppStructure();
      expect(folders).toEqual(fullFolders);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('ignora cache incompleto e parte para a descoberta', async () => {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify({ root: 'r' }));
      // sem rootId salvo → busca por appProperties, acha a raiz, lista filhos completos
      vi.mocked(fetch)
        .mockResolvedValueOnce(okJson({ files: [{ id: 'root-1', name: 'raiz' }] })) // findByQuery raiz
        .mockResolvedValueOnce(
          okJson({
            files: [
              { id: 'raw', name: 'Vídeos Crus' },
              { id: 'ed', name: 'Vídeos Editados' },
              { id: 'cv', name: 'Capas' },
              { id: 'ca', name: 'Imagens de Carrossel' },
              { id: 'db', name: 'db.json' },
              { id: 'cfg', name: 'config.json' },
            ],
          }),
        );
      const folders = await ensureAppStructure();
      expect(folders.root).toBe('root-1');
      expect(folders.dbFileId).toBe('db');
      expect(localStorage.getItem(FOLDERS_KEY)).toContain('root-1');
    });
  });

  describe('readJsonFile / writeJsonFile', () => {
    it('lê o JSON do arquivo via alt=media', async () => {
      vi.mocked(fetch).mockResolvedValue(okJson({ version: 3, items: [] }));
      const data = await readJsonFile<{ version: number }>('db');
      expect(data.version).toBe(3);
      expect(vi.mocked(fetch).mock.calls[0][0]).toContain('alt=media');
    });

    it('grava com PATCH uploadType=media e Bearer', async () => {
      vi.mocked(fetch).mockResolvedValue(okJson({}));
      await writeJsonFile('db', { version: 4 });
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('uploadType=media');
      expect(init?.method).toBe('PATCH');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer drive-token');
    });

    it('propaga erro da Drive API', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'boom',
      } as Response);
      await expect(readJsonFile('db')).rejects.toThrow(/Drive API 500/);
    });
  });
});
