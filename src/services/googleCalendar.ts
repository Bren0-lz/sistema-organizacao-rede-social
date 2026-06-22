// Espelha uma gravação agendada como um evento no Google Agenda (calendário
// "primary" do usuário). O Google passa a ser a camada de lembrete/notificação:
// o evento leva um aviso (popup 30 min antes) que dispara mesmo com o app
// fechado. Usa o mesmo padrão de fetch+Bearer do serviço do YouTube.

import { getAccessToken } from './googleAuth';
import type { Recording } from '../types';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** Duração padrão de uma gravação no calendário (1h), já que só guardamos o início. */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

interface CalendarEventResource {
  id?: string;
}

/** Monta o corpo do evento a partir da gravação (início = scheduledAt, fim = +1h). */
function eventBody(rec: Recording): Record<string, unknown> {
  const start = new Date(rec.scheduledAt);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  return {
    summary: `Gravar: ${rec.title}`,
    ...(rec.script ? { description: rec.script } : {}),
    ...(rec.location ? { location: rec.location } : {}),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    },
  };
}

async function parseError(res: Response, action: string): Promise<never> {
  const body = await res.text().catch(() => '');
  throw new Error(`${action} Google Agenda ${res.status}: ${body.slice(0, 300)}`);
}

/** Cria o evento da gravação e retorna o id do evento criado. */
export async function createRecordingEvent(rec: Recording): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch(CALENDAR_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(eventBody(rec)),
  });
  if (!res.ok) await parseError(res, 'Criar evento');
  const data = (await res.json()) as CalendarEventResource;
  if (!data.id) throw new Error('Google Agenda não retornou o id do evento.');
  return data.id;
}

/** Atualiza o evento existente com os dados atuais da gravação. */
export async function updateRecordingEvent(eventId: string, rec: Recording): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${CALENDAR_API}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(eventBody(rec)),
  });
  // 404/410: o evento já não existe (apagado pelo usuário) — nada a fazer.
  if (!res.ok && res.status !== 404 && res.status !== 410) await parseError(res, 'Atualizar evento');
}

/** Remove o evento do calendário. Ignora se já não existe. */
export async function deleteRecordingEvent(eventId: string): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(`${CALENDAR_API}/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) await parseError(res, 'Remover evento');
}
