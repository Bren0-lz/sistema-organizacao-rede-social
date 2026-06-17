import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { Icon } from '../components/Icon';
import { RecordingModal } from '../components/RecordingModal';
import type { Recording } from '../types';

/** Início do dia de hoje (00:00 local) em epoch ms. */
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface RowProps {
  recording: Recording;
  onEdit: (rec: Recording) => void;
  onRecorded: (itemId: string) => void;
}

function AgendaRow({ recording, onEdit, onRecorded }: RowProps) {
  const cancelRecording = useStore((s) => s.cancelRecording);
  const deleteRecording = useStore((s) => s.deleteRecording);
  const markRecordingAsRecorded = useStore((s) => s.markRecordingAsRecorded);
  const [busy, setBusy] = useState(false);

  const isPlanned = recording.status === 'planned';
  const overdue = isPlanned && new Date(recording.scheduledAt).getTime() < startOfToday();

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
        {recording.location && <span className="agenda-loc">📍 {recording.location}</span>}
        {recording.script && <span className="agenda-script">{recording.script}</span>}
      </div>
      <div className="agenda-row-actions">
        {isPlanned ? (
          <>
            <button
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void mark()}
              title="Marcar como gravada e criar o conteúdo"
            >
              <Icon name="video" /> {busy ? 'Gravando…' : 'Gravada'}
            </button>
            <button className="icon-btn" onClick={() => onEdit(recording)} title="Editar">
              <Icon name="settings" size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={() => void cancelRecording(recording.id)}
              title="Cancelar gravação"
            >
              ✕
            </button>
          </>
        ) : (
          <button
            className="icon-btn"
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

export function RecordingAgenda({ onRecorded }: { onRecorded: (itemId: string) => void }) {
  const recordings = useStore((s) => s.recordings);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Recording | null>(null);

  const groups = useMemo(() => {
    const active = recordings.filter((r) => !r.deletedAt);
    const today = startOfToday();
    const tomorrow = today + 24 * 60 * 60 * 1000;
    const byDate = (a: Recording, b: Recording) => a.scheduledAt.localeCompare(b.scheduledAt);

    const planned = active.filter((r) => r.status === 'planned');
    return {
      overdue: planned
        .filter((r) => new Date(r.scheduledAt).getTime() < today)
        .sort(byDate),
      today: planned
        .filter((r) => {
          const t = new Date(r.scheduledAt).getTime();
          return t >= today && t < tomorrow;
        })
        .sort(byDate),
      upcoming: planned
        .filter((r) => new Date(r.scheduledAt).getTime() >= tomorrow)
        .sort(byDate),
      recorded: active.filter((r) => r.status === 'recorded').sort((a, b) => byDate(b, a)),
      canceled: active.filter((r) => r.status === 'canceled').sort((a, b) => byDate(b, a)),
    };
  }, [recordings]);

  const isEmpty =
    groups.overdue.length === 0 &&
    groups.today.length === 0 &&
    groups.upcoming.length === 0 &&
    groups.recorded.length === 0 &&
    groups.canceled.length === 0;

  return (
    <main className="agenda">
      <div className="agenda-head">
        <h2 className="agenda-heading">
          <Icon name="calendar" /> Agenda de gravações
        </h2>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + Nova gravação
        </button>
      </div>

      {isEmpty ? (
        <motion.div className="empty-state" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h2>Nenhuma gravação agendada</h2>
          <p>Planeje suas próximas gravações: data, local e roteiro. Ao gravar, viram conteúdo no estúdio.</p>
          <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => setShowNew(true)}>
            + Agendar primeira gravação
          </button>
        </motion.div>
      ) : (
        <>
          <Section title="⚠ Atrasadas" color="var(--st-raw, #ff8d8d)" list={groups.overdue} onEdit={setEditing} onRecorded={onRecorded} />
          <Section title="Hoje" color="var(--st-ready)" list={groups.today} onEdit={setEditing} onRecorded={onRecorded} />
          <Section title="Próximas" list={groups.upcoming} onEdit={setEditing} onRecorded={onRecorded} />
          <Section title="Gravadas" list={groups.recorded} onEdit={setEditing} onRecorded={onRecorded} />
          <Section title="Canceladas" list={groups.canceled} onEdit={setEditing} onRecorded={onRecorded} />
        </>
      )}

      <AnimatePresence>
        {showNew && <RecordingModal key="new-rec" onClose={() => setShowNew(false)} />}
        {editing && (
          <RecordingModal key="edit-rec" recording={editing} onClose={() => setEditing(null)} />
        )}
      </AnimatePresence>
    </main>
  );
}
