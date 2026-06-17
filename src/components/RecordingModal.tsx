import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';
import { ModalShell } from './Modals';
import type { Recording } from '../types';

/** Converte um ISO para o formato do <input type="datetime-local"> (hora local). */
function isoToLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  // desconta o fuso para que o valor exibido bata com a hora local do usuário
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Converte o valor do <input datetime-local> de volta para ISO. */
function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

export function RecordingModal({
  recording,
  onClose,
}: {
  /** Quando presente, o modal edita esta gravação; senão, cria uma nova. */
  recording?: Recording;
  onClose: () => void;
}) {
  const createRecording = useStore((s) => s.createRecording);
  const updateRecording = useStore((s) => s.updateRecording);

  const editing = !!recording;
  const [title, setTitle] = useState(recording?.title ?? '');
  const [when, setWhen] = useState(isoToLocalInput(recording?.scheduledAt));
  const [location, setLocation] = useState(recording?.location ?? '');
  const [script, setScript] = useState(recording?.script ?? '');
  const [busy, setBusy] = useState(false);

  const canSubmit = !!title.trim() && !!when && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const fields = {
        title: title.trim(),
        scheduledAt: localInputToIso(when),
        location: location.trim() || undefined,
        script: script.trim() || undefined,
      };
      if (editing) await updateRecording(recording.id, fields);
      else await createRecording(fields);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <h2>
        <Icon name="calendar" /> {editing ? 'Editar gravação' : 'Nova gravação'}
      </h2>
      <div className="form-grid">
        <div>
          <label className="form-label">Título</label>
          <input
            autoFocus
            placeholder="Ex.: Vlog do setup novo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Data e hora</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Local (opcional)</label>
          <input
            placeholder="Ex.: Estúdio, casa, parque…"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">Roteiro / ideia (opcional)</label>
          <textarea
            rows={4}
            placeholder="Roteiro, pauta, referências…"
            value={script}
            onChange={(e) => setScript(e.target.value)}
          />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={!canSubmit} onClick={() => void submit()}>
          {busy ? 'Salvando…' : editing ? 'Salvar' : 'Agendar gravação'}
        </button>
      </div>
    </ModalShell>
  );
}
