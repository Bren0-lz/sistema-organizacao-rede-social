// Camada de acesso à API REST do Google Drive (v3).
// Responsável por: estrutura de pastas do app, uploads resumáveis com progresso,
// metadados/thumbnails e leitura/escrita do db.json.

import { getAccessToken } from './googleAuth';
import type { AppFolders, DriveFileInfo, FileSlot } from '../types';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const ROOT_FOLDER_NAME = 'Organizador de Conteúdo';
const DB_FILE_NAME = 'db.json';
const APP_TAG = { key: 'app', value: 'org-social' };
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const SLOT_FOLDER_NAMES: Record<FileSlot, string> = {
  raw: 'Vídeos Crus',
  edited: 'Vídeos Editados',
  cover: 'Capas',
};

const FOLDER_ID_KEY = 'org-social:rootFolderId';

async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const response = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Drive API ${response.status}: ${body.slice(0, 300)}`);
  }
  return response;
}

async function findByQuery(q: string): Promise<DriveFileInfo[]> {
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType,size,thumbnailLink,webViewLink,iconLink)',
    pageSize: '100',
    // inclui itens compartilhados com o usuário (pasta da equipe)
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  });
  const res = await driveFetch(`/files?${params}`);
  const data = (await res.json()) as { files: DriveFileInfo[] };
  return data.files;
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const res = await driveFetch('/files?supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: parentId ? [parentId] : undefined,
      appProperties: { [APP_TAG.key]: APP_TAG.value },
    }),
  });
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function findChild(parentId: string, name: string): Promise<DriveFileInfo | null> {
  const files = await findByQuery(
    `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`,
  );
  return files[0] ?? null;
}

/**
 * Localiza (ou cria) a estrutura de pastas do app no Drive.
 * Ordem de busca: ID salvo localmente → pasta marcada com appProperties
 * (inclui pastas compartilhadas pela equipe) → cria do zero.
 */
export async function ensureAppStructure(explicitRootId?: string): Promise<AppFolders> {
  let rootId = explicitRootId ?? localStorage.getItem(FOLDER_ID_KEY) ?? undefined;

  if (rootId) {
    // valida que a pasta ainda existe/está acessível
    try {
      await driveFetch(`/files/${rootId}?fields=id&supportsAllDrives=true`);
    } catch {
      rootId = undefined;
      localStorage.removeItem(FOLDER_ID_KEY);
    }
  }

  if (!rootId) {
    const existing = await findByQuery(
      `appProperties has { key='${APP_TAG.key}' and value='${APP_TAG.value}' } ` +
        `and mimeType = '${FOLDER_MIME}' and name = '${ROOT_FOLDER_NAME}' and trashed = false`,
    );
    rootId = existing[0]?.id;
  }

  if (!rootId) {
    rootId = await createFolder(ROOT_FOLDER_NAME);
  }
  localStorage.setItem(FOLDER_ID_KEY, rootId);

  const folders: Partial<Record<FileSlot, string>> = {};
  for (const slot of Object.keys(SLOT_FOLDER_NAMES) as FileSlot[]) {
    const name = SLOT_FOLDER_NAMES[slot];
    const found = await findChild(rootId, name);
    folders[slot] = found?.id ?? (await createFolder(name, rootId));
  }

  let dbFile = await findChild(rootId, DB_FILE_NAME);
  if (!dbFile) {
    const id = await createDbFile(rootId);
    dbFile = { id, name: DB_FILE_NAME, mimeType: 'application/json' };
  }

  return {
    root: rootId,
    raw: folders.raw!,
    edited: folders.edited!,
    covers: folders.cover!,
    dbFileId: dbFile.id,
  };
}

async function createDbFile(parentId: string): Promise<string> {
  const metadata = {
    name: DB_FILE_NAME,
    parents: [parentId],
    appProperties: { [APP_TAG.key]: APP_TAG.value },
  };
  const boundary = 'org-social-boundary';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${JSON.stringify({ version: 0, items: [] })}\r\n--${boundary}--`;
  const res = await driveFetch(
    `${UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function readJsonFile<T>(fileId: string): Promise<T> {
  const res = await driveFetch(`/files/${fileId}?alt=media&supportsAllDrives=true`);
  return (await res.json()) as T;
}

export async function writeJsonFile(fileId: string, content: unknown): Promise<void> {
  await driveFetch(`${UPLOAD_API}/files/${fileId}?uploadType=media&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
  });
}

export async function getFileInfo(fileId: string): Promise<DriveFileInfo> {
  const res = await driveFetch(
    `/files/${fileId}?fields=id,name,mimeType,size,thumbnailLink,webViewLink,iconLink&supportsAllDrives=true`,
  );
  return (await res.json()) as DriveFileInfo;
}

export async function deleteFile(fileId: string): Promise<void> {
  await driveFetch(`/files/${fileId}?supportsAllDrives=true`, { method: 'DELETE' });
}

/**
 * Upload resumável: inicia a sessão e envia o arquivo num único PUT via XHR
 * (XHR para ter onprogress, que o fetch não expõe no upload).
 */
export async function uploadFile(
  file: File,
  parentId: string,
  onProgress: (fraction: number) => void,
): Promise<string> {
  const token = await getAccessToken();

  const initRes = await fetch(
    `${UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': file.type || 'application/octet-stream',
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({
        name: file.name,
        parents: [parentId],
        appProperties: { [APP_TAG.key]: APP_TAG.value },
      }),
    },
  );
  if (!initRes.ok) {
    throw new Error(`Falha ao iniciar upload (${initRes.status})`);
  }
  const sessionUrl = initRes.headers.get('Location');
  if (!sessionUrl) throw new Error('Drive não retornou a URL da sessão de upload');

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sessionUrl);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText) as { id: string };
        onProgress(1);
        resolve(data.id);
      } else {
        reject(new Error(`Upload falhou (${xhr.status}): ${xhr.responseText.slice(0, 300)}`));
      }
    };
    xhr.onerror = () => reject(new Error('Erro de rede durante o upload'));
    xhr.send(file);
  });
}

/** URL de preview embutível do Drive (player de vídeo / visualizador de imagem). */
export function previewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/**
 * Baixa o conteúdo do arquivo como blob-URL autenticado — usado para exibir
 * capas, já que o thumbnailLink do Drive nem sempre aceita CORS/cookies.
 */
export async function fetchBlobUrl(fileId: string): Promise<string> {
  const res = await driveFetch(`/files/${fileId}?alt=media&supportsAllDrives=true`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Versão leve de {@link fetchBlobUrl} para capas: baixa o `thumbnailLink` do
 * Drive (poucos KB) em vez do arquivo cheio. Se o item não tiver thumbnail
 * disponível, cai de volta para o download completo.
 */
export async function fetchThumbnailUrl(fileId: string): Promise<string> {
  const info = await getFileInfo(fileId);
  if (info.thumbnailLink) {
    try {
      // pede um tamanho razoável de capa (=s400) em vez do default minúsculo
      const sized = info.thumbnailLink.replace(/=s\d+$/, '=s400');
      const res = await driveFetch(sized);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      // thumbnail indisponível/expirado — segue para o fallback abaixo
    }
  }
  return fetchBlobUrl(fileId);
}

export function setSharedRootFolder(folderIdOrUrl: string): string {
  // aceita tanto o ID puro quanto a URL https://drive.google.com/drive/folders/<id>
  const match = folderIdOrUrl.match(/folders\/([\w-]+)/);
  const id = match ? match[1] : folderIdOrUrl.trim();
  localStorage.setItem(FOLDER_ID_KEY, id);
  return id;
}

export function getRootFolderId(): string | null {
  return localStorage.getItem(FOLDER_ID_KEY);
}

export function rootFolderUrl(rootId: string): string {
  return `https://drive.google.com/drive/folders/${rootId}`;
}
