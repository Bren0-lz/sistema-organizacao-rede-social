export type Network = 'instagram' | 'tiktok' | 'youtube';

export const NETWORKS: Network[] = ['instagram', 'tiktok', 'youtube'];

export const NETWORK_LABELS: Record<Network, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

export type PostStatus = 'none' | 'scheduled' | 'posted';
export type YouTubePrivacyStatus = 'public' | 'private' | 'unlisted';

/** Tipo de postagem: vídeo ou carrossel de imagens; ambos seguem cru→editado. */
export type ContentType = 'video' | 'carousel';

export interface NetworkStatus {
  assigned: boolean;
  status: PostStatus;
  scheduledAt?: string;
  postedAt?: string;
  postUrl?: string;
  /** Legenda/hashtags específicas desta rede. */
  caption?: string;
  youtubeVideoId?: string;
  youtubePrivacyStatus?: YouTubePrivacyStatus;
  youtubeUploadStatus?: 'idle' | 'uploading' | 'scheduled' | 'failed';
  youtubeUploadProgress?: number;
  youtubeUploadError?: string;
}

export interface ContentItem {
  id: string;
  title: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Tipo da postagem; ausente = 'video' (itens criados antes do carrossel). */
  type?: ContentType;
  /** Imagens do carrossel, em ordem de exibição. A 1ª é usada como capa. */
  carouselFileIds?: string[];
  rawVideoFileId?: string;
  editedVideoFileId?: string;
  coverFileId?: string;
  /** Quando o vídeo bruto foi anexado (opcional; itens antigos não têm). */
  rawUploadedAt?: string;
  /** Quando o vídeo editado foi anexado. */
  editedUploadedAt?: string;
  /** Quando o carrossel foi marcado como editado. Presença = estágio "editado". */
  carouselEditedAt?: string;
  /** Quando o item foi mandado para a lixeira. Ausente = item ativo. */
  deletedAt?: string;
  /** Tags livres para organização/filtro (ex.: "série X", "patrocinado"). */
  tags?: string[];
  networks: Record<Network, NetworkStatus>;
}

/** Estágio de uma gravação planejada na agenda. */
export type RecordingStatus = 'planned' | 'recorded' | 'canceled';

/**
 * Gravação planejada na agenda. Quando marcada como gravada, vira um
 * ContentItem (vídeo cru) no pipeline, vinculado por `linkedItemId`.
 */
export interface Recording {
  id: string;
  title: string;
  /** ISO com data + hora da gravação. */
  scheduledAt: string;
  /** Local da gravação (texto livre). */
  location?: string;
  /** Roteiro / ideia da gravação. */
  script?: string;
  status: RecordingStatus;
  /** ContentItem criado quando a gravação foi marcada como gravada. */
  linkedItemId?: string;
  /** Evento espelhado no Google Agenda (para atualizar/remover depois). */
  googleCalendarEventId?: string;
  createdAt: string;
  updatedAt: string;
  /** Soft delete; ausente = gravação ativa. */
  deletedAt?: string;
}

/**
 * Ideia solta, sem data: um rascunho no banco de ideias. Pode ser promovida a
 * uma gravação agendada ou a um ContentItem.
 */
export interface Idea {
  id: string;
  title: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Soft delete / promoção; ausente = ideia ativa. */
  deletedAt?: string;
}

export interface Database {
  version: number;
  /**
   * Identificador único da última escrita. Como o Drive não oferece escrita
   * condicional, `saveDatabase` relê após gravar e compara este campo para
   * detectar se outra escrita concorrente sobrescreveu a nossa. Ausente em bancos
   * antigos.
   */
  writer?: string;
  items: ContentItem[];
  recordings: Recording[];
  ideas: Idea[];
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
  carousel: string;
  dbFileId: string;
  configFileId: string;
}

/** Configuração do app guardada no Drive (config.json), compartilhável com a equipe. */
export interface AppConfig {
  /** Client ID OAuth usado só no fluxo do YouTube; vazio = usa o VITE_GOOGLE_CLIENT_ID. */
  youtubeClientId?: string;
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

export function hasScheduledTimeArrived(status: NetworkStatus, now = Date.now()): boolean {
  if (status.status !== 'scheduled' || !status.scheduledAt) return false;
  const scheduled = new Date(status.scheduledAt).getTime();
  return Number.isFinite(scheduled) && scheduled <= now;
}

export function isAutoPostedFromSchedule(
  network: Network,
  status: NetworkStatus,
  now = Date.now(),
): boolean {
  void network;
  return hasScheduledTimeArrived(status, now);
}

export function newContentItem(title: string, type: ContentType = 'video'): ContentItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    type,
    ...(type === 'carousel' ? { carouselFileIds: [] } : {}),
    createdAt: now,
    updatedAt: now,
    networks: {
      instagram: emptyNetworkStatus(),
      tiktok: emptyNetworkStatus(),
      youtube: emptyNetworkStatus(),
    },
  };
}

export function newRecording(title: string, scheduledAt: string): Recording {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    scheduledAt,
    status: 'planned',
    createdAt: now,
    updatedAt: now,
  };
}

export function newIdea(title: string): Idea {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
  };
}

/** Tipo da postagem, tratando itens antigos (sem `type`) como vídeo. */
export function itemType(item: ContentItem): ContentType {
  return item.type ?? 'video';
}

/**
 * FileId da miniatura a exibir: no carrossel é a 1ª imagem; no vídeo é a capa.
 */
export function coverFileIdFor(item: ContentItem): string | undefined {
  if (itemType(item) === 'carousel') return item.carouselFileIds?.[0];
  return item.coverFileId;
}

/** Origem da miniatura a exibir no card/lista. */
export interface ThumbSource {
  fileId: string;
  /**
   * `true` quando a miniatura vem do próprio arquivo de vídeo (capa temporária:
   * o frame que o Drive gera), e não de uma capa definida pelo usuário. Nesse
   * caso o carregador não deve baixar o vídeo inteiro como fallback.
   */
  fromVideo: boolean;
}

/**
 * Qual miniatura exibir e de onde ela vem. Igual a {@link coverFileIdFor}
 * quando há capa/1ª imagem; mas, para um vídeo ainda sem capa, cai no próprio
 * vídeo (editado de preferência, senão o cru) para usar o frame gerado pelo
 * Drive como capa provisória, evitando a tela preta.
 */
export function thumbSourceFor(item: ContentItem): ThumbSource | undefined {
  const cover = coverFileIdFor(item);
  if (cover) return { fileId: cover, fromVideo: false };
  if (itemType(item) === 'video') {
    const videoFileId = item.editedVideoFileId ?? item.rawVideoFileId;
    if (videoFileId) return { fileId: videoFileId, fromVideo: true };
  }
  return undefined;
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
  // Carrossel: "cru" enquanto não marcado; "editado" após o usuário marcar.
  if (itemType(item) === 'carousel') {
    return item.carouselEditedAt ? 'edited' : 'raw';
  }
  if (item.editedVideoFileId) return 'edited';
  return 'raw';
}
