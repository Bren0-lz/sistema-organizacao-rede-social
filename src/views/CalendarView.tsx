import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import { Icon } from '../components/Icon';
import { NetworkIcon } from '../components/NetworkIcon';
import { RecordingModal } from '../components/RecordingModal';
import { dayKey, dayKeyFromIso, monthMatrix, startOfToday } from '../lib/date';
import { NETWORKS, NETWORK_LABELS, type Network, type Recording } from '../types';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Evento desenhado numa célula do calendário. */
type CalEvent =
  | { kind: 'recording'; key: string; iso: string; title: string; recording: Recording }
  | { kind: 'post'; key: string; iso: string; title: string; itemId: string; network: Network };

function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function CalendarView({ onOpenItem }: { onOpenItem: (itemId: string) => void }) {
  const recordings = useStore((s) => s.recordings);
  const items = useStore((s) => s.items);
  const [cursor, setCursor] = useState(() => new Date());
  const [editing, setEditing] = useState<Recording | null>(null);

  // agrupa gravações planejadas + posts programados por dia (YYYY-MM-DD)
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

    // ordena os eventos de cada dia por horário
    for (const list of map.values()) list.sort((a, b) => a.iso.localeCompare(b.iso));
    return map;
  }, [recordings, items]);

  const weeks = useMemo(() => monthMatrix(cursor), [cursor]);
  const todayKey = dayKey(new Date(startOfToday()));
  const monthLabel = cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const move = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  return (
    <main className="calendar">
      <div className="calendar-head">
        <h2 className="agenda-heading">
          <Icon name="calendar" /> Calendário
        </h2>
        <div className="calendar-nav">
          <button className="icon-btn" onClick={() => move(-1)} title="Mês anterior">
            ‹
          </button>
          <span className="calendar-month">{monthLabel}</span>
          <button className="icon-btn" onClick={() => move(1)} title="Próximo mês">
            ›
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setCursor(new Date())}>
            Hoje
          </button>
        </div>
      </div>

      <div className="calendar-legend">
        <span className="calendar-legend-item" data-kind="recording">
          <Icon name="video" /> gravação
        </span>
        <span className="calendar-legend-item" data-kind="post">
          <Icon name="calendar" /> post programado
        </span>
      </div>

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
            <div
              key={key}
              className={`calendar-cell${inMonth ? '' : ' outside'}${key === todayKey ? ' today' : ''}`}
            >
              <span className="calendar-daynum">{date.getDate()}</span>
              <div className="calendar-events">
                {dayEvents.map((ev) =>
                  ev.kind === 'recording' ? (
                    <button
                      key={ev.key}
                      className="calendar-event"
                      data-kind="recording"
                      title={`Gravação ${timeLabel(ev.iso)} — ${ev.title}`}
                      onClick={() => setEditing(ev.recording)}
                    >
                      <Icon name="video" />
                      <span className="calendar-event-time">{timeLabel(ev.iso)}</span>
                      <span className="calendar-event-title">{ev.title}</span>
                    </button>
                  ) : (
                    <button
                      key={ev.key}
                      className="calendar-event"
                      data-kind="post"
                      data-net={ev.network}
                      title={`Post ${NETWORK_LABELS[ev.network]} ${timeLabel(ev.iso)} — ${ev.title}`}
                      onClick={() => onOpenItem(ev.itemId)}
                    >
                      <NetworkIcon network={ev.network} />
                      <span className="calendar-event-time">{timeLabel(ev.iso)}</span>
                      <span className="calendar-event-title">{ev.title}</span>
                    </button>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {editing && (
          <RecordingModal key="cal-edit" recording={editing} onClose={() => setEditing(null)} />
        )}
      </AnimatePresence>
    </main>
  );
}
