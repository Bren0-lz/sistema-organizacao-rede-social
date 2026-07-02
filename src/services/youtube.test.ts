import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cancelYoutubePublication,
  deleteYoutubeVideo,
  getCurrentYoutubeChannel,
  getYoutubeVideoStatistics,
  updateYoutubeVideoMetadata,
  uploadScheduledVideo,
} from './youtube';
import { getYoutubeAccessToken } from './googleAuth';

vi.mock('./googleAuth', () => ({ getYoutubeAccessToken: vi.fn() }));

const mockToken = vi.mocked(getYoutubeAccessToken);

function res(body: unknown, init: { ok?: boolean; status?: number; location?: string } = {}): Response {
  const status = init.status ?? 200;
  const headers = new Map<string, string>();
  if (init.location) headers.set('Location', init.location);
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    headers: { get: (k: string) => headers.get(k) ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

/** Stub mínimo de XMLHttpRequest para o upload resumable (uploadBlob). */
function installXhr(opts: { status?: number; responseText?: string; fail?: boolean } = {}) {
  class FakeXHR {
    status = opts.status ?? 200;
    responseText = opts.responseText ?? JSON.stringify({ id: 'vid-1' });
    upload: { onprogress?: (e: ProgressEventInit) => void } = {};
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    open = vi.fn();
    setRequestHeader = vi.fn();
    send = vi.fn(() => {
      queueMicrotask(() => {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
        if (opts.fail) this.onerror?.();
        else this.onload?.();
      });
    });
  }
  vi.stubGlobal('XMLHttpRequest', FakeXHR as unknown as typeof XMLHttpRequest);
}

describe('youtube', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockToken.mockResolvedValue('yt-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('uploadScheduledVideo', () => {
    it('inicia sessão resumable e sobe o vídeo, retornando id e url', async () => {
      vi.mocked(fetch).mockResolvedValue(res({}, { location: 'https://upload/session' }));
      installXhr({ responseText: JSON.stringify({ id: 'vid-1' }) });
      const onProgress = vi.fn();

      const result = await uploadScheduledVideo({
        video: new Blob(['x'], { type: 'video/mp4' }),
        title: 'Meu vídeo',
        onProgress,
      });

      expect(result).toEqual({ videoId: 'vid-1', url: 'https://www.youtube.com/watch?v=vid-1' });
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('uploadType=resumable');
      const meta = JSON.parse(init?.body as string);
      expect(meta.snippet.title).toBe('Meu vídeo');
      expect(onProgress).toHaveBeenCalledWith(1);
    });

    it('agenda como "private" com publishAt quando informado', async () => {
      vi.mocked(fetch).mockResolvedValue(res({}, { location: 'https://upload/session' }));
      installXhr();
      await uploadScheduledVideo({
        video: new Blob(['x'], { type: 'video/mp4' }),
        title: 'Agendado',
        publishAt: '2026-07-01T10:00:00Z',
      });
      const meta = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
      expect(meta.status.privacyStatus).toBe('private');
      expect(meta.status.publishAt).toBe('2026-07-01T10:00:00Z');
    });

    it('lança quando a iniciação da sessão falha', async () => {
      vi.mocked(fetch).mockResolvedValue(res('erro', { status: 400 }));
      await expect(
        uploadScheduledVideo({ video: new Blob(['x']), title: 't' }),
      ).rejects.toThrow(/YouTube API 400/);
    });

    it('lança quando não vem a URL da sessão', async () => {
      vi.mocked(fetch).mockResolvedValue(res({}));
      await expect(
        uploadScheduledVideo({ video: new Blob(['x']), title: 't' }),
      ).rejects.toThrow(/URL da sessao/);
    });
  });

  describe('getCurrentYoutubeChannel', () => {
    it('retorna o primeiro canal do usuário', async () => {
      vi.mocked(fetch).mockResolvedValue(
        res({ items: [{ id: 'ch-1', snippet: { title: 'Meu Canal', customUrl: '@meucanal' } }] }),
      );
      const ch = await getCurrentYoutubeChannel();
      expect(ch).toEqual({ id: 'ch-1', title: 'Meu Canal', customUrl: '@meucanal' });
    });

    it('lança quando a conta não tem canal', async () => {
      vi.mocked(fetch).mockResolvedValue(res({ items: [] }));
      await expect(getCurrentYoutubeChannel()).rejects.toThrow(/nao possui um canal/);
    });
  });

  describe('getYoutubeVideoStatistics', () => {
    it('normaliza os contadores de texto para número', async () => {
      vi.mocked(fetch).mockResolvedValue(
        res({ items: [{ statistics: { viewCount: '120', likeCount: '7' } }] }),
      );
      const stats = await getYoutubeVideoStatistics('vid-1');
      expect(stats).toEqual({ viewCount: 120, likeCount: 7, commentCount: undefined });
    });

    it('usa 0 de views quando ausente', async () => {
      vi.mocked(fetch).mockResolvedValue(res({ items: [{ statistics: {} }] }));
      const stats = await getYoutubeVideoStatistics('vid-1');
      expect(stats.viewCount).toBe(0);
    });
  });

  describe('cancelYoutubePublication', () => {
    it('lê o status atual e regrava como private', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(res({ items: [{ status: { embeddable: true } }] })) // fetchYoutubeStatus
        .mockResolvedValueOnce(res({})); // PUT
      await cancelYoutubePublication('vid-1');
      const putBody = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string);
      expect(putBody.status.privacyStatus).toBe('private');
      expect(putBody.status.embeddable).toBe(true);
    });
  });

  describe('updateYoutubeVideoMetadata', () => {
    it('mantém publishAt e força private quando o vídeo está agendado', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          res({ items: [{ snippet: { title: 'antigo' }, status: { publishAt: '2026-07-01T10:00:00Z' } }] }),
        )
        .mockResolvedValueOnce(res({}));
      await updateYoutubeVideoMetadata('vid-1', { title: 'novo' });
      const body = JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string);
      expect(body.snippet.title).toBe('novo');
      expect(body.status.privacyStatus).toBe('private');
      expect(body.status.publishAt).toBe('2026-07-01T10:00:00Z');
    });
  });

  describe('deleteYoutubeVideo', () => {
    it('faz DELETE pelo id', async () => {
      vi.mocked(fetch).mockResolvedValue(res({}, { status: 204 }));
      await deleteYoutubeVideo('vid-1');
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('id=vid-1');
      expect(init?.method).toBe('DELETE');
    });

    it('ignora 404 (vídeo já removido)', async () => {
      vi.mocked(fetch).mockResolvedValue(res('x', { status: 404 }));
      await expect(deleteYoutubeVideo('vid-1')).resolves.toBeUndefined();
    });
  });
});
