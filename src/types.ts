export type Network = 'instagram' | 'tiktok' | 'youtube';

export const NETWORKS: Network[] = ['instagram', 'tiktok', 'youtube'];

export const NETWORK_LABELS: Record<Network, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

export type PostStatus = 'none' | 'scheduled' | 'posted';

export interface NetworkStatus {
  assigned: boolean;
  status: PostStatus;
  scheduledAt?: string;
  postedAt?: string;
  postUrl?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  rawVideoFileId?: string;
  editedVideoFileId?: string;
  coverFileId?: string;
  /** Quando o vídeo bruto foi anexado (opcional; itens antigos não têm). */
  rawUploadedAt?: string;
  /** Quando o vídeo editado foi anexado. */
  editedUploadedAt?: string;
  /** Quando o item foi mandado para a lixeira. Ausente = item ativo. */
  deletedAt?: string;
  networks: Record<Network, NetworkStatus>;
}

export interface Database {
  version: number;
  items: ContentItem[];
}

export type FileSlot = 'raw' | 'edited' | 'cover';

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  iconLink?: string;
}

export interface AppFolders {
  root: string;
  raw: string;
  edited: string;
  covers: string;
  dbFileId: string;
}

/** Dias que um item permanece na lixeira antes de ser excluído de vez. */
export const TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Quantos dias faltam até a exclusão definitiva (0 = expirado). */
export function trashDaysLeft(item: ContentItem): number {
  if (!item.deletedAt) return TRASH_RETENTION_DAYS;
  const elapsed = (Date.now() - new Date(item.deletedAt).getTime()) / DAY_MS;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsed));
}

/** Item na lixeira há mais de 30 dias, pronto para purga automática. */
export function isTrashExpired(item: ContentItem): boolean {
  return !!item.deletedAt && trashDaysLeft(item) <= 0;
}

export function emptyNetworkStatus(): NetworkStatus {
  return { assigned: false, status: 'none' };
}

export function newContentItem(title: string): ContentItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    networks: {
      instagram: emptyNetworkStatus(),
      tiktok: emptyNetworkStatus(),
      youtube: emptyNetworkStatus(),
    },
  };
}

/** Estágio do item no pipeline de produção. */
export type Stage = 'raw' | 'edited' | 'ready' | 'scheduled' | 'posted';

export const STAGE_ORDER: Record<Stage, number> = {
  raw: 0,
  edited: 1,
  ready: 2,
  scheduled: 3,
  posted: 4,
};

export const STAGES_SEQ: Stage[] = ['raw', 'edited', 'ready', 'scheduled', 'posted'];

export function itemStage(item: ContentItem): Stage {
  const states = NETWORKS.filter((n) => item.networks[n].assigned).map((n) => item.networks[n]);
  if (states.length > 0) {
    if (states.every((s) => s.status === 'posted')) return 'posted';
    // Só avança para "Programado" quando TODAS as redes têm data definida (ou já publicaram).
    // Se alguma rede ainda está sem data programada, o progresso fica em "Pronto".
    if (states.every((s) => s.status === 'posted' || (s.status === 'scheduled' && !!s.scheduledAt)))
      return 'scheduled';
    return 'ready';
  }
  if (item.editedVideoFileId) return 'edited';
  return 'raw';
}
