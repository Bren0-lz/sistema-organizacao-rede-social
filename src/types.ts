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

export function itemStage(item: ContentItem): Stage {
  const statuses = NETWORKS.filter((n) => item.networks[n].assigned).map(
    (n) => item.networks[n].status,
  );
  if (statuses.length > 0) {
    if (statuses.every((s) => s === 'posted')) return 'posted';
    if (statuses.some((s) => s === 'scheduled' || s === 'posted')) return 'scheduled';
    return 'ready';
  }
  if (item.editedVideoFileId) return 'edited';
  return 'raw';
}
