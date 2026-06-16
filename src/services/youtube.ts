import { getAccessToken } from './googleAuth';

const UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';
const DATA_API = 'https://www.googleapis.com/youtube/v3';

export interface YouTubeScheduleInput {
  video: Blob;
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
  thumbnail?: Blob;
  onProgress?: (fraction: number) => void;
}

export interface YouTubeScheduleResult {
  videoId: string;
  url: string;
}

interface YouTubeVideoStatus {
  embeddable?: boolean;
  license?: string;
  privacyStatus?: string;
  publicStatsViewable?: boolean;
  selfDeclaredMadeForKids?: boolean;
  containsSyntheticMedia?: boolean;
}

export async function uploadScheduledVideo({
  video,
  title,
  description,
  publishAt,
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
  const token = await getAccessToken(true);
  const metadata = {
    snippet: {
      title,
      description: description ?? '',
      categoryId,
      ...(tags.length > 0 ? { tags } : {}),
    },
    status: {
      privacyStatus: 'private',
      publishAt,
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
  const token = await getAccessToken(true);
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
  const token = await getAccessToken(true);
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

export async function deleteYoutubeVideo(videoId: string): Promise<void> {
  const token = await getAccessToken(true);
  const res = await fetch(`${DATA_API}/videos?id=${encodeURIComponent(videoId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`Excluir YouTube ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function fetchYoutubeStatus(videoId: string, token: string): Promise<YouTubeVideoStatus> {
  const res = await fetch(`${DATA_API}/videos?part=status&id=${encodeURIComponent(videoId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { items?: Array<{ status?: YouTubeVideoStatus }> };
  const video = data.items?.[0];
  if (!video) throw new Error('Video do YouTube nao encontrado.');
  return video.status ?? {};
}
