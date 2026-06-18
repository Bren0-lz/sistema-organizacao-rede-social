import { getYoutubeAccessToken } from './googleAuth';

export type YouTubePrivacyStatus = 'public' | 'private' | 'unlisted';

const UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';
const DATA_API = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeScheduleInput {
  video: Blob;
  title: string;
  description?: string;
  publishAt?: string;
  privacyStatus?: YouTubePrivacyStatus;
  categoryId?: string;
  tags?: string[];
  madeForKids?: boolean;
  containsSyntheticMedia?: boolean;
  embeddable?: boolean;
  publicStatsViewable?: boolean;
  notifySubscribers?: boolean;
  thumbnail?: Blob;
  onProgress?: (fraction: number) => void;
}

export interface YouTubeScheduleResult {
  videoId: string;
  url: string;
}

export interface YouTubeMetadataInput {
  title: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  madeForKids?: boolean;
  containsSyntheticMedia?: boolean;
  embeddable?: boolean;
  publicStatsViewable?: boolean;
  privacyStatus?: YouTubePrivacyStatus;
}

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  customUrl?: string;
}

interface YouTubeVideoSnippet {
  title?: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
}

interface YouTubeVideoStatus {
  embeddable?: boolean;
  license?: string;
  privacyStatus?: string;
  publishAt?: string;
  publicStatsViewable?: boolean;
  selfDeclaredMadeForKids?: boolean;
  containsSyntheticMedia?: boolean;
}

interface YouTubeVideoResource {
  snippet?: YouTubeVideoSnippet;
  status?: YouTubeVideoStatus;
}

export async function uploadScheduledVideo({
  video,
  title,
  description,
  publishAt,
  privacyStatus = 'public',
  categoryId = '22',
  tags = [],
  madeForKids = false,
  containsSyntheticMedia = false,
  embeddable = true,
  publicStatsViewable = true,
  notifySubscribers = true,
  thumbnail,
  onProgress,
}: YouTubeScheduleInput): Promise<YouTubeScheduleResult> {
  const token = await getYoutubeAccessToken(true);
  const metadata = {
    snippet: {
      title,
      description: description ?? '',
      categoryId,
      ...(tags.length > 0 ? { tags } : {}),
    },
    status: {
      privacyStatus: publishAt ? 'private' : privacyStatus,
      ...(publishAt ? { publishAt } : {}),
      selfDeclaredMadeForKids: madeForKids,
      containsSyntheticMedia,
      embeddable,
      publicStatsViewable,
    },
  };

  const initRes = await fetch(
    `${UPLOAD_API}/videos?uploadType=resumable&part=snippet,status&notifySubscribers=${notifySubscribers}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': video.type || 'application/octet-stream',
        'X-Upload-Content-Length': String(video.size),
      },
      body: JSON.stringify(metadata),
    },
  );

  if (!initRes.ok) {
    const body = await initRes.text().catch(() => '');
    throw new Error(`YouTube API ${initRes.status}: ${body.slice(0, 300)}`);
  }

  const sessionUrl = initRes.headers.get('Location');
  if (!sessionUrl) throw new Error('YouTube nao retornou a URL da sessao de upload');

  const videoId = await uploadBlob(sessionUrl, video, onProgress);

  if (thumbnail) {
    await setThumbnail(videoId, thumbnail).catch(() => undefined);
  }

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

async function uploadBlob(
  sessionUrl: string,
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', sessionUrl);
    xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText) as { id?: string };
        if (!data.id) {
          reject(new Error('YouTube nao retornou o ID do video'));
          return;
        }
        onProgress?.(1);
        resolve(data.id);
      } else {
        reject(new Error(`Upload YouTube ${xhr.status}: ${xhr.responseText.slice(0, 300)}`));
      }
    };
    xhr.onerror = () => reject(new Error('Erro de rede durante o upload para o YouTube'));
    xhr.send(blob);
  });
}

async function setThumbnail(videoId: string, thumbnail: Blob): Promise<void> {
  const token = await getYoutubeAccessToken(true);
  const res = await fetch(
    `${UPLOAD_API}/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': thumbnail.type || 'image/jpeg',
      },
      body: thumbnail,
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Thumbnail YouTube ${res.status}: ${body.slice(0, 300)}`);
  }
}

export async function cancelYoutubePublication(videoId: string): Promise<void> {
  const token = await getYoutubeAccessToken(true);
  const current = await fetchYoutubeStatus(videoId, token);
  const status: YouTubeVideoStatus = {
    privacyStatus: 'private',
    ...(current.embeddable !== undefined ? { embeddable: current.embeddable } : {}),
    ...(current.license ? { license: current.license } : {}),
    ...(current.publicStatsViewable !== undefined
      ? { publicStatsViewable: current.publicStatsViewable }
      : {}),
    ...(current.selfDeclaredMadeForKids !== undefined
      ? { selfDeclaredMadeForKids: current.selfDeclaredMadeForKids }
      : {}),
    ...(current.containsSyntheticMedia !== undefined
      ? { containsSyntheticMedia: current.containsSyntheticMedia }
      : {}),
  };

  const res = await fetch(`${DATA_API}/videos?part=status`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ id: videoId, status }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cancelar YouTube ${res.status}: ${body.slice(0, 300)}`);
  }
}

export async function updateYoutubeVideoMetadata(
  videoId: string,
  input: YouTubeMetadataInput,
): Promise<void> {
  const token = await getYoutubeAccessToken(true);
  const current = await fetchYoutubeVideo(videoId, token, 'snippet,status');
  const currentSnippet = current.snippet ?? {};
  const currentStatus = current.status ?? {};
  const isScheduled = !!currentStatus.publishAt;
  const status: YouTubeVideoStatus = {
    privacyStatus: isScheduled
      ? 'private'
      : input.privacyStatus ?? currentStatus.privacyStatus ?? 'private',
    ...(isScheduled
      ? { publishAt: currentStatus.publishAt }
      : {}),
    ...(input.embeddable !== undefined ? { embeddable: input.embeddable } : {}),
    ...(currentStatus.license ? { license: currentStatus.license } : {}),
    ...(input.publicStatsViewable !== undefined
      ? { publicStatsViewable: input.publicStatsViewable }
      : {}),
    ...(input.madeForKids !== undefined ? { selfDeclaredMadeForKids: input.madeForKids } : {}),
    ...(input.containsSyntheticMedia !== undefined
      ? { containsSyntheticMedia: input.containsSyntheticMedia }
      : {}),
  };

  const snippet: YouTubeVideoSnippet = {
    title: input.title || currentSnippet.title || 'Video',
    description: input.description ?? currentSnippet.description ?? '',
    categoryId: input.categoryId ?? currentSnippet.categoryId ?? '22',
    ...(input.tags
      ? { tags: input.tags }
      : currentSnippet.tags
        ? { tags: currentSnippet.tags }
        : {}),
  };

  const res = await fetch(`${DATA_API}/videos?part=snippet,status`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ id: videoId, snippet, status }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Editar YouTube ${res.status}: ${body.slice(0, 300)}`);
  }
}

export async function deleteYoutubeVideo(videoId: string): Promise<void> {
  const token = await getYoutubeAccessToken(true);
  const res = await fetch(`${DATA_API}/videos?id=${encodeURIComponent(videoId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`Excluir YouTube ${res.status}: ${body.slice(0, 300)}`);
  }
}

export async function getCurrentYoutubeChannel(): Promise<YouTubeChannelInfo> {
  const token = await getYoutubeAccessToken(true, { forceAccountSelection: true });
  const res = await fetch(`${DATA_API}/channels?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Conta YouTube ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    items?: Array<{
      id?: string;
      snippet?: { title?: string; customUrl?: string };
    }>;
  };
  const channel = data.items?.[0];
  if (!channel?.id) {
    throw new Error('Esta conta Google nao possui um canal do YouTube disponivel.');
  }
  return {
    id: channel.id,
    title: channel.snippet?.title ?? 'Canal do YouTube',
    customUrl: channel.snippet?.customUrl,
  };
}

async function fetchYoutubeStatus(videoId: string, token: string): Promise<YouTubeVideoStatus> {
  const video = await fetchYoutubeVideo(videoId, token, 'status');
  return video.status ?? {};
}

async function fetchYoutubeVideo(
  videoId: string,
  token: string,
  part: string,
): Promise<YouTubeVideoResource> {
  const res = await fetch(`${DATA_API}/videos?part=${part}&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { items?: YouTubeVideoResource[] };
  const video = data.items?.[0];
  if (!video) throw new Error('Video do YouTube nao encontrado.');
  return video;
}
