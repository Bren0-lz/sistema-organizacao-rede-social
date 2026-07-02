import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { Icon } from '../components/Icon';
import { ModalShell } from '../components/Modals';
import { RecordingModal } from '../components/RecordingModal';
import type { Idea } from '../types';

// Modal simples de criar/editar ideia (só título + notas, sem data).
function IdeaModal({ idea, onClose }: { idea?: Idea; onClose: () => void }) {
  const createIdea = useStore((s) => s.createIdea);
  const updateIdea = useStore((s) => s.updateIdea);
  const editing = !!idea;
  const [title, setTitle] = useState(idea?.title ?? '');
  const [notes, setNotes] = useState(idea?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const canSubmit = !!title.trim() && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (editing) await updateIdea(idea.id, { title: title.trim(), notes: notes.trim() || undefined });
      else await createIdea(title.trim(), notes.trim() || undefined);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <h2>
        <Icon name="sparkles" /> {editing ? 'Editar ideia' : 'Nova ideia'}
      </h2>
      <div className="form-grid">
        <div>
          <label className="form-label">Título</label>
          <input
            autoFocus
            placeholder="Ex.: Tutorial de café coado"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>
        <div>
          <label className="form-label">Notas (opcional)</label>
          <textarea
            rows={4}
            placeholder="Pauta, referências, ganchos…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={!canSubmit} onClick={() => void submit()}>
          {busy ? 'Salvando…' : editing ? 'Salvar' : 'Salvar ideia'}
        </button>
      </div>
    </ModalShell>
  );
}

function IdeaCard({
  idea,
  onEdit,
  onSchedule,
  onCreated,
}: {
  idea: Idea;
  onEdit: (idea: Idea) => void;
  onSchedule: (idea: Idea) => void;
  onCreated: (itemId: string) => void;
}) {
  const deleteIdea = useStore((s) => s.deleteIdea);
  const convertIdeaToItem = useStore((s) => s.convertIdeaToItem);
  const [busy, setBusy] = useState(false);

  const createContent = async () => {
    setBusy(true);
    try {
      const itemId = await convertIdeaToItem(idea.id);
      if (itemId) onCreated(itemId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      layout
      className="idea-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <div className="idea-card-main">
        <span className="idea-title">{idea.title}</span>
        {idea.notes && <span className="idea-notes">{idea.notes}</span>}
      </div>
      <div className="idea-card-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onSchedule(idea)} title="Agendar gravação">
          <Icon name="calendar" /> Agendar gravação
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() => void createContent()}
          title="Criar conteúdo no estúdio"
        >
          <Icon name="sparkles" /> {busy ? 'Criando…' : 'Criar conteúdo'}
        </button>
        <button className="icon-btn nav-settings" onClick={() => onEdit(idea)} title="Editar">
          <Icon name="settings" size={16} />
        </button>
        <button
          className="icon-btn nav-trash"
          onClick={() => void deleteIdea(idea.id)}
          title="Excluir ideia"
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
    </motion.div>
  );
}

export function IdeasView({ onCreated }: { onCreated: (itemId: string) => void }) {
  const ideas = useStore((s) => s.ideas);
  const convertIdeaToRecording = useStore((s) => s.convertIdeaToRecording);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Idea | null>(null);
  const [scheduling, setScheduling] = useState<Idea | null>(null);

  const active = useMemo(
    () =>
      ideas
        .filter((i) => !i.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [ideas],
  );

  return (
    <main className="ideas">
      <div className="agenda-head">
        <h2 className="agenda-heading">
          <Icon name="sparkles" /> Banco de ideias
        </h2>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + Nova ideia
        </button>
      </div>

      {active.length === 0 ? (
        <motion.div className="empty-state" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h2>Nenhuma ideia ainda</h2>
          <p>Guarde aqui pautas e ganchos sem data. Quando quiser, vire gravação ou conteúdo.</p>
          <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => setShowNew(true)}>
            + Anotar primeira ideia
          </button>
        </motion.div>
      ) : (
        <div className="idea-list">
          <AnimatePresence mode="popLayout">
            {active.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onEdit={setEditing}
                onSchedule={setScheduling}
                onCreated={onCreated}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showNew && <IdeaModal key="new-idea" onClose={() => setShowNew(false)} />}
        {editing && <IdeaModal key="edit-idea" idea={editing} onClose={() => setEditing(null)} />}
        {scheduling && (
          <RecordingModal
            key="schedule-idea"
            heading="Agendar gravação da ideia"
            initialTitle={scheduling.title}
            initialScript={scheduling.notes}
            onSubmitOverride={async (fields) => {
              await convertIdeaToRecording(scheduling.id, {
                scheduledAt: fields.scheduledAt,
                location: fields.location,
                script: fields.script,
              });
            }}
            onClose={() => setScheduling(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
