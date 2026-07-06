// Camada de acesso à API REST do Google Drive (v3).
// Responsável por: estrutura de pastas do app, uploads resumáveis com progresso,
// metadados/thumbnails e leitura/escrita do db.json.

import { getAccessToken } from './googleAuth';
import type { AppFolders, DriveFileInfo, FileSlot } from '../types';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const ROOT_FOLDER_NAME = 'Organizador de Conteúdo';
const DB_FILE_NAME = 'db.json';
const CONFIG_FILE_NAME = 'config.json';
const APP_TAG = { key: 'app', value: 'org-social' };
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const SLOT_FOLDER_NAMES: Record<FileSlot, string> = {
  raw: 'Vídeos Crus',
  edited: 'Vídeos Editados',
  cover: 'Capas',
};

const CAROUSEL_FOLDER_NAME = 'Imagens de Carrossel';

const FOLDER_ID_KEY = 'org-social:rootFolderId';
// Estrutura de pastas completa (todos os IDs), para pular a redescoberta ao reabrir.
const FOLDERS_KEY = 'org-social:folders:v1';

// O Safari pode indisponibilizar o localStorage em alguns contextos de
// privacidade. Isso não deve impedir a abertura do app após o OAuth.
function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A pasta será localizada novamente na próxima abertura.
  }
}

function removeLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nada para limpar quando o armazenamento não está disponível.
  }
}

function readCachedFolders(): AppFolders | null {
  const raw = readLocalStorage(FOLDERS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AppFolders>;
    if (
      parsed.root &&
      parsed.raw &&
      parsed.edited &&
      parsed.covers &&
      parsed.carousel &&
      parsed.dbFileId &&
      parsed.configFileId
    ) {
      return parsed as AppFolders;
    }
  } catch {
    // cache corrompido: será reconstruído na descoberta normal
  }
  return null;
}

/**
 * Invalida o cache da estrutura de pastas. Chamado quando uma leitura posterior
 * (db.json/config.json) falha — sinal de que algum ID cacheado ficou obsoleto
 * (ex.: alguém moveu/recriou uma pasta compartilhada). A próxima conexão
 * redescobre tudo do zero.
 */
export function clearFolderCache(): void {
  removeLocalStorage(FOLDERS_KEY);
  removeLocalStorage(FOLDER_ID_KEY);
}

/** Teto de tamanho por upload (5 GB) — evita travar a rede com arquivos absurdos. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;
/** Timeout das requisições de capa, para não deixar o card preso em "carregando". */
const COVER_FETCH_TIMEOUT_MS = 15_000;
/** IDs de pasta do Drive são strings longas de [A-Za-z0-9_-]. */
const DRIVE_ID_RE = /^[\w-]{10,}$/;

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

/**
 * Localiza (ou cria) a estrutura de pastas do app no Drive.
 * Ordem de busca: ID salvo localmente → pasta marcada com appProperties
 * (inclui pastas compartilhadas pela equipe) → cria do zero.
 */
export async function ensureAppStructure(explicitRootId?: string): Promise<AppFolders> {
  // Caminho "reabrir": a estrutura inteira já é conhecida, então pulamos toda a
  // descoberta. Só vale quando o usuário não está apontando explicitamente para
  // outra pasta; se algum ID cacheado estiver obsoleto, a leitura seguinte falha
  // e o store chama clearFolderCache() para reconstruir.
  if (!explicitRootId) {
    const cached = readCachedFolders();
    if (cached) return cached;
  }

  let rootId = explicitRootId ?? readLocalStorage(FOLDER_ID_KEY) ?? undefined;

  if (rootId) {
    // valida que a pasta ainda existe/está acessível
    try {
      await driveFetch(`/files/${rootId}?fields=id&supportsAllDrives=true`);
    } catch {
      rootId = undefined;
      removeLocalStorage(FOLDER_ID_KEY);
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
  writeLocalStorage(FOLDER_ID_KEY, rootId);

  // Uma única listagem dos filhos da raiz substitui as 6 buscas sequenciais.
  const children = await findByQuery(`'${rootId}' in parents and trashed = false`);
  const byName = new Map<string, DriveFileInfo>();
  for (const child of children) byName.set(child.name, child);

  // Cada item necessário vem do mapa; o que faltar é criado em paralelo.
  const [raw, edited, covers, carousel, dbFileId, configFileId] = await Promise.all([
    byName.get(SLOT_FOLDER_NAMES.raw)?.id ?? createFolder(SLOT_FOLDER_NAMES.raw, rootId),
    byName.get(SLOT_FOLDER_NAMES.edited)?.id ?? createFolder(SLOT_FOLDER_NAMES.edited, rootId),
    byName.get(SLOT_FOLDER_NAMES.cover)?.id ?? createFolder(SLOT_FOLDER_NAMES.cover, rootId),
    byName.get(CAROUSEL_FOLDER_NAME)?.id ?? createFolder(CAROUSEL_FOLDER_NAME, rootId),
    byName.get(DB_FILE_NAME)?.id ?? createJsonFile(rootId, DB_FILE_NAME, { version: 0, items: [] }),
    byName.get(CONFIG_FILE_NAME)?.id ?? createJsonFile(rootId, CONFIG_FILE_NAME, {}),
  ]);

  const folders: AppFolders = {
    root: rootId,
    raw,
    edited,
    covers,
    carousel,
    dbFileId,
    configFileId,
  };
  writeLocalStorage(FOLDERS_KEY, JSON.stringify(folders));
  return folders;
}

async function createJsonFile(parentId: string, name: string, initial: unknown): Promise<string> {
  const metadata = {
    name,
    parents: [parentId],
    appProperties: { [APP_TAG.key]: APP_TAG.value },
  };
  const boundary = 'org-social-boundary';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${JSON.stringify(initial)}\r\n--${boundary}--`;
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
/**
 * Valida um arquivo antes de subir: tamanho dentro do teto e tipo coerente com
 * o slot (vídeo para crus/editados, imagem para capas). O `accept` do input só
 * filtra a UI; isto barra arquivos colados/arrastados de tipo errado.
 */
export function validateUpload(file: File, slot: FileSlot): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    const gb = (file.size / 1024 / 1024 / 1024).toFixed(1);
    throw new Error(`Arquivo muito grande (${gb} GB). O limite por upload é 5 GB.`);
  }
  const expected = slot === 'cover' ? 'image/' : 'video/';
  if (file.type && !file.type.startsWith(expected)) {
    const kind = slot === 'cover' ? 'uma imagem' : 'um vídeo';
    throw new Error(`Tipo de arquivo inválido para "${SLOT_FOLDER_NAMES[slot]}": envie ${kind}.`);
  }
}

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
  const res = await driveFetch(`/files/${fileId}?alt=media&supportsAllDrives=true`, {
    signal: AbortSignal.timeout(COVER_FETCH_TIMEOUT_MS),
  });
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchFileBlob(fileId: string): Promise<Blob> {
  const res = await driveFetch(`/files/${fileId}?alt=media&supportsAllDrives=true`);
  return res.blob();
}

/**
 * Baixa o arquivo para o computador do usuário, usando o nome original do Drive.
 * Cria um link temporário e dispara o clique programaticamente.
 */
export async function downloadFile(fileId: string, fallbackName?: string): Promise<void> {
  const [blob, info] = await Promise.all([
    fetchFileBlob(fileId),
    getFileInfo(fileId).catch(() => null),
  ]);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = info?.name ?? fallbackName ?? fileId;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Versão leve de {@link fetchBlobUrl} para capas: baixa o `thumbnailLink` do
 * Drive (poucos KB) em vez do arquivo cheio. Se o item não tiver thumbnail
 * disponível, cai de volta para o download completo.
 *
 * `allowFullDownload: false` desliga esse fallback — usado quando o fileId é um
 * vídeo (capa temporária pelo frame do Drive): baixar o vídeo inteiro seria
 * pesado e um `<img>` nem o exibiria. Sem thumbnail, apenas lança e o card
 * mantém o placeholder.
 */
export async function fetchThumbnailUrl(
  fileId: string,
  options: { allowFullDownload?: boolean } = {},
): Promise<string> {
  const { allowFullDownload = true } = options;
  const info = await getFileInfo(fileId);
  if (info.thumbnailLink) {
    try {
      // pede um tamanho razoável de capa (=s400) em vez do default minúsculo
      const sized = info.thumbnailLink.replace(/=s\d+$/, '=s400');
      const res = await driveFetch(sized, {
        signal: AbortSignal.timeout(COVER_FETCH_TIMEOUT_MS),
      });
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch {
      // thumbnail indisponível/expirado — segue para o fallback abaixo
    }
  }
  if (!allowFullDownload) {
    throw new Error('Miniatura do vídeo ainda não disponível no Drive.');
  }
  return fetchBlobUrl(fileId);
}

/**
 * Gera uma capa provisória de um vídeo no próprio navegador: baixa o arquivo
 * (autenticado, o mesmo caminho usado para reproduzir), desenha um frame em um
 * `<canvas>` e devolve um blob-URL da imagem (lado máximo de 480px).
 *
 * Usado como fallback quando o Drive não disponibiliza um thumbnail utilizável
 * para o vídeo — caso desta app, que autentica por token (sem cookie de sessão),
 * então o `thumbnailLink` do Drive costuma falhar por CORS/cookies. Baixa o
 * vídeo inteiro uma vez; o resultado é cacheado por quem chama.
 */
export async function captureVideoFrameUrl(fileId: string): Promise<string> {
  const blob = await fetchFileBlob(fileId);
  const srcUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = srcUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Tempo esgotado ao capturar o frame do vídeo.')),
        10000,
      );
      video.onloadedmetadata = () => {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        // evita o frame inicial (costuma ser preto): 1s ou metade do vídeo
        video.currentTime = duration > 0 ? Math.min(duration / 2, 1) : 0.1;
      };
      video.onseeked = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error('Não foi possível decodificar o vídeo.'));
      };
    });

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error('Vídeo sem dimensões para capturar.');
    const scale = Math.min(1, 480 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível.');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const frame = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.8),
    );
    if (!frame) throw new Error('Falha ao gerar a imagem do frame.');
    return URL.createObjectURL(frame);
  } finally {
    video.onloadedmetadata = null;
    video.onseeked = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(srcUrl);
  }
}

/** Extrai o ID da pasta de uma URL do Drive ou usa a string como ID. */
function parseFolderId(folderIdOrUrl: string): string {
  // aceita tanto o ID puro quanto a URL https://drive.google.com/drive/folders/<id>
  const match = folderIdOrUrl.match(/folders\/([\w-]+)/);
  return match ? match[1] : folderIdOrUrl.trim();
}

/**
 * Valida que o ID/URL aponta para uma pasta acessível e só então o persiste.
 * Antes, qualquer string era gravada no localStorage e só falhava depois, de
 * forma silenciosa (caía na criação de uma pasta nova).
 */
export async function setSharedRootFolder(folderIdOrUrl: string): Promise<string> {
  const id = parseFolderId(folderIdOrUrl);
  if (!DRIVE_ID_RE.test(id)) {
    throw new Error(
      'Link ou ID inválido. Cole o link da pasta no Drive (…/folders/ID) ou o próprio ID.',
    );
  }
  let info: DriveFileInfo;
  try {
    info = await getFileInfo(id);
  } catch {
    throw new Error(
      'Não foi possível acessar essa pasta. Confira o link e se ela foi compartilhada com a sua conta.',
    );
  }
  if (info.mimeType !== FOLDER_MIME) {
    throw new Error('Esse link aponta para um arquivo, não para uma pasta do Drive.');
  }
  writeLocalStorage(FOLDER_ID_KEY, id);
  return id;
}

export function getRootFolderId(): string | null {
  return readLocalStorage(FOLDER_ID_KEY);
}

export function rootFolderUrl(rootId: string): string {
  return `https://drive.google.com/drive/folders/${rootId}`;
}
