import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createRecordingEvent,
  updateRecordingEvent,
  deleteRecordingEvent,
} from './googleCalendar';
import { getAccessToken } from './googleAuth';
import { newRecording, type Recording } from '../types';

vi.mock('./googleAuth', () => ({ getAccessToken: vi.fn() }));

const mockToken = vi.mocked(getAccessToken);

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function rec(overrides: Partial<Recording> = {}): Recording {
  return { ...newRecording('Entrevista', '2026-07-01T15:00:00Z'), ...overrides };
}

describe('googleCalendar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockToken.mockResolvedValue('token-abc');
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('createRecordingEvent', () => {
    it('faz POST com Bearer e corpo do evento, devolvendo o id', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'evt-1' }));
      const id = await createRecordingEvent(rec({ script: 'roteiro', location: 'Estúdio' }));

      expect(id).toBe('evt-1');
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('/calendars/primary/events');
      expect(init?.method).toBe('POST');
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
      const body = JSON.parse(init?.body as string);
      expect(body.summary).toBe('Gravar: Entrevista');
      expect(body.description).toBe('roteiro');
      expect(body.location).toBe('Estúdio');
      // fim = início + 1h
      expect(new Date(body.end.dateTime).getTime() - new Date(body.start.dateTime).getTime()).toBe(
        60 * 60 * 1000,
      );
    });

    it('lança quando a API responde com erro', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'x' }, 403));
      await expect(createRecordingEvent(rec())).rejects.toThrow(/Criar evento Google Agenda 403/);
    });

    it('lança quando a API não devolve id', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({}));
      await expect(createRecordingEvent(rec())).rejects.toThrow(/não retornou o id/);
    });
  });

  describe('updateRecordingEvent', () => {
    it('faz PATCH no evento pelo id', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 'evt-1' }));
      await updateRecordingEvent('evt 1', rec());
      const [url, init] = vi.mocked(fetch).mock.calls[0];
      expect(url).toContain('/events/evt%201');
      expect(init?.method).toBe('PATCH');
    });

    it('ignora silenciosamente 404/410 (evento já apagado)', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 404));
      await expect(updateRecordingEvent('evt-1', rec())).resolves.toBeUndefined();
    });

    it('lança em outros erros', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));
      await expect(updateRecordingEvent('evt-1', rec())).rejects.toThrow(/Atualizar evento/);
    });
  });

  describe('deleteRecordingEvent', () => {
    it('faz DELETE no evento pelo id', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 204));
      await deleteRecordingEvent('evt-1');
      const [, init] = vi.mocked(fetch).mock.calls[0];
      expect(init?.method).toBe('DELETE');
    });

    it('ignora 410 (já removido)', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 410));
      await expect(deleteRecordingEvent('evt-1')).resolves.toBeUndefined();
    });
  });
});
