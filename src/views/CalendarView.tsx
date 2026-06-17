import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { Icon } from '../components/Icon';
import { NetworkIcon } from '../components/NetworkIcon';
import { RecordingModal } from '../components/RecordingModal';
import { dayKey, dayKeyFromIso, monthMatrix, startOfToday } from '../lib/date';
import { NETWORKS, NETWORK_LABELS, type Network, type Recording } from '../types';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

type CalEvent =
  | { kind: 'recording'; key: string; iso: string; title: string; recording: Recording }
  | { kind: 'post'; key: string; iso: string; title: string; itemId: string; network: Network };

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initialIsoForDay(date: Date): string {
  const d = new Date(date);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

interface AgendaRowProps {
  recording: Recording;
  onEdit: (rec: Recording) => void;
  onRecorded: (itemId: string) => void;
}

function AgendaRow({ recording, onEdit, onRecorded }: AgendaRowProps) {
  const cancelRecording = useStore((s) => s.cancelRecording);
  const deleteRecording = useStore((s) => s.deleteRecording);
  const markRecordingAsRecorded = useStore((s) => s.markRecordingAsRecorded);
  const [busy, setBusy] = useState(false);

  const isPlanned = recording.status === 'planned';
  const overdue = isPlanned && new Date(recording.scheduledAt).getTime() < Date.now();

  const mark = async () => {
    setBusy(true);
    try {
      const itemId = await markRecordingAsRecorded(recording.id);
      if (itemId) onRecorded(itemId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      layout
      className={`agenda-row ${overdue ? 'overdue' : ''}`}
      data-status={recording.status}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <div className="agenda-row-main">
        <span className="agenda-when">
          <Icon name={overdue ? 'warning' : 'calendar'} /> {formatWhen(recording.scheduledAt)}
        </span>
        <span className="agenda-title">{recording.title}</span>
        {recording.location && <span className="agenda-loc">{recording.location}</span>}
        {recording.script && <span className="agenda-script">{recording.script}</span>}
      </div>
      <div className="agenda-row-actions">
        {isPlanned ? (
          <>
            <button
              className="btn btn-recorded btn-sm"
              disabled={busy}
              onClick={() => void mark()}
              title="Marcar como gravada e criar o conteudo"
            >
              <Icon name="video" /> {busy ? 'Gravando...' : 'Gravada'}
            </button>
            <button className="icon-btn nav-settings" onClick={() => onEdit(recording)} title="Editar">
              <Icon name="settings" size={16} />
            </button>
            <button
              className="icon-btn nav-trash"
              onClick={() => void cancelRecording(recording.id)}
              title="Cancelar gravacao"
            >
              x
            </button>
          </>
        ) : (
          <button
            className="icon-btn nav-trash"
            onClick={() => void deleteRecording(recording.id)}
            title="Excluir da agenda"
          >
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Section({
  title,
  color,
  list,
  onEdit,
  onRecorded,
}: {
  title: string;
  color?: string;
  list: Recording[];
  onEdit: (rec: Recording) => void;
  onRecorded: (itemId: string) => void;
}) {
  if (list.length === 0) return null;
  return (
    <section className="agenda-section">
      <div className="agenda-section-head">
        <span className="agenda-section-title" style={color ? { color } : undefined}>
          {title}
        </span>
        <span className="agenda-section-count">{list.length}</span>
      </div>
      <div className="agenda-list">
        <AnimatePresence mode="popLayout">
          {list.map((rec) => (
            <AgendaRow key={rec.id} recording={rec} onEdit={onEdit} onRecorded={onRecorded} />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

export function CalendarView({
  onOpenItem,
  onRecorded,
}: {
  onOpenItem: (itemId: string) => void;
  onRecorded: (itemId: string) => void;
}) {
  const recordings = useStore((s) => s.recordings);
  const items = useStore((s) => s.items);
  const [cursor, setCursor] = useState(() => new Date());
  const [editing, setEditing] = useState<Recording | null>(null);
  const [newScheduledAt, setNewScheduledAt] = useState<string | null>(null);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    const push = (key: string, ev: CalEvent) => {
      if (!key) return;
      const list = map.get(key);
      if (list) list.push(ev);
      else map.set(key, [ev]);
    };

    for (const rec of recordings) {
      if (rec.deletedAt || rec.status !== 'planned') continue;
      push(dayKeyFromIso(rec.scheduledAt), {
        kind: 'recording',
        key: rec.id,
        iso: rec.scheduledAt,
        title: rec.title,
        recording: rec,
      });
    }

    for (const item of items) {
      if (item.deletedAt) continue;
      for (const network of NETWORKS) {
        const ns = item.networks[network];
        if (ns.assigned && ns.status === 'scheduled' && ns.scheduledAt) {
          push(dayKeyFromIso(ns.scheduledAt), {
            kind: 'post',
            key: `${item.id}-${network}`,
            iso: ns.scheduledAt,
            title: item.title,
            itemId: item.id,
            network,
          });
        }
      }
    }

    for (const list of map.values()) list.sort((a, b) => a.iso.localeCompare(b.iso));
    return map;
  }, [recordings, items]);

  const groups = useMemo(() => {
    const active = recordings.filter((r) => !r.deletedAt);
    const today = startOfToday();
    const tomorrow = today + 24 * 60 * 60 * 1000;
    const now = Date.now();
    const byDate = (a: Recording, b: Recording) => a.scheduledAt.localeCompare(b.scheduledAt);

    const planned = active.filter((r) => r.status === 'planned');
    return {
      overdue: planned.filter((r) => new Date(r.scheduledAt).getTime() < now).sort(byDate),
      today: planned
        .filter((r) => {
          const t = new Date(r.scheduledAt).getTime();
          return t >= now && t < tomorrow;
        })
        .sort(byDate),
      upcoming: planned.filter((r) => new Date(r.scheduledAt).getTime() >= tomorrow).sort(byDate),
      recorded: active.filter((r) => r.status === 'recorded').sort((a, b) => byDate(b, a)),
      canceled: active.filter((r) => r.status === 'canceled').sort((a, b) => byDate(b, a)),
    };
  }, [recordings]);

  const weeks = useMemo(() => monthMatrix(cursor), [cursor]);
  const todayKey = dayKey(new Date(startOfToday()));
  const monthLabel = cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const isAgendaEmpty =
    groups.overdue.length === 0 &&
    groups.today.length === 0 &&
    groups.upcoming.length === 0 &&
    groups.recorded.length === 0 &&
    groups.canceled.length === 0;

  const move = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <main className="calendar">
      <div className="calendar-head">
        <h2 className="agenda-heading">
          <Icon name="calendar" /> Calend&aacute;rio e agenda
        </h2>
        <button className="btn btn-primary" onClick={() => setNewScheduledAt(new Date().toISOString())}>
          + Nova grava&ccedil;&atilde;o
        </button>
        <div className="calendar-nav">
          <button className="icon-btn" onClick={() => move(-1)} title="Mes anterior">
            {'<'}
          </button>
          <span className="calendar-month">{monthLabel}</span>
          <button className="icon-btn" onClick={() => move(1)} title="Proximo mes">
            {'>'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCursor(new Date())}>
            Hoje
          </button>
        </div>
      </div>

      <div className="calendar-legend">
        <span className="calendar-legend-item" data-kind="recording">
          <Icon name="video" /> grava&ccedil;&atilde;o
        </span>
        <span className="calendar-legend-item" data-kind="post">
          <Icon name="calendar" /> post programado
        </span>
      </div>

      <div className="calendar-agenda-layout">
        <div className="calendar-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="calendar-weekday">
              {w}
            </div>
          ))}
          {weeks.flat().map((date) => {
            const key = dayKey(date);
            const inMonth = date.getMonth() === cursor.getMonth();
            const dayEvents = eventsByDay.get(key) ?? [];
            return (
              <button
                key={key}
                type="button"
                className={`calendar-cell${inMonth ? '' : ' outside'}${key === todayKey ? ' today' : ''}`}
                onClick={() => setNewScheduledAt(initialIsoForDay(date))}
                title={`Agendar gravacao em ${date.toLocaleDateString('pt-BR')}`}
              >
                <span className="calendar-daynum">{date.getDate()}</span>
                <div className="calendar-events">
                  {dayEvents.map((ev) =>
                    ev.kind === 'recording' ? (
                      <span
                        key={ev.key}
                        className="calendar-event"
                        data-kind="recording"
                        title={`Gravacao ${timeLabel(ev.iso)} - ${ev.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(ev.recording);
                        }}
                      >
                        <Icon name="video" />
                        <span className="calendar-event-time">{timeLabel(ev.iso)}</span>
                        <span className="calendar-event-title">{ev.title}</span>
                      </span>
                    ) : (
                      <span
                        key={ev.key}
                        className="calendar-event"
                        data-kind="post"
                        data-net={ev.network}
                        title={`Post ${NETWORK_LABELS[ev.network]} ${timeLabel(ev.iso)} - ${ev.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenItem(ev.itemId);
                        }}
                      >
                        <NetworkIcon network={ev.network} />
                        <span className="calendar-event-time">{timeLabel(ev.iso)}</span>
                        <span className="calendar-event-title">{ev.title}</span>
                      </span>
                    ),
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <aside className="calendar-agenda">
          <div className="agenda-head calendar-agenda-head">
            <h2 className="agenda-heading">
              <Icon name="video" /> Agenda de grava&ccedil;&otilde;es
            </h2>
          </div>

          {isAgendaEmpty ? (
            <motion.div className="empty-state calendar-empty" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <h2>Nenhuma grava&ccedil;&atilde;o agendada</h2>
              <p>Clique em uma data do calend&aacute;rio ou use o bot&atilde;o Nova grava&ccedil;&atilde;o.</p>
              <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => setNewScheduledAt(new Date().toISOString())}>
                + Agendar primeira grava&ccedil;&atilde;o
              </button>
            </motion.div>
          ) : (
            <>
              <Section title="Atrasadas" color="var(--st-raw, #ff8d8d)" list={groups.overdue} onEdit={setEditing} onRecorded={onRecorded} />
              <Section title="Hoje" color="var(--st-ready)" list={groups.today} onEdit={setEditing} onRecorded={onRecorded} />
              <Section title="Proximas" list={groups.upcoming} onEdit={setEditing} onRecorded={onRecorded} />
              <Section title="Gravadas" list={groups.recorded} onEdit={setEditing} onRecorded={onRecorded} />
              <Section title="Canceladas" list={groups.canceled} onEdit={setEditing} onRecorded={onRecorded} />
            </>
          )}
        </aside>
      </div>

      <AnimatePresence>
        {editing && <RecordingModal key="cal-edit" recording={editing} onClose={() => setEditing(null)} />}
        {newScheduledAt && (
          <RecordingModal
            key="cal-new"
            initialScheduledAt={newScheduledAt}
            onClose={() => setNewScheduledAt(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
