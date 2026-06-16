import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { getRootFolderId, rootFolderUrl } from '../services/drive';
import type { ContentType } from '../types';

const TYPE_OPTIONS: { type: ContentType; label: string }[] = [
  { type: 'video', label: '🎬 Vídeo' },
  { type: 'carousel', label: '🖼️ Carrossel' },
];

function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    // Backdrop sem animação de opacidade: animar opacidade com backdrop-filter
    // força o navegador a recalcular o blur de toda a página atrás a cada frame.
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        className="modal"
        initial={{ scale: 0.92, y: 18, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function NewItemModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const createItem = useStore((s) => s.createItem);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState<ContentType>('video');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const item = await createItem(title.trim(), notes.trim() || undefined, type);
      onCreated(item.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <h2>✨ Novo conteúdo</h2>
      <div className="form-grid">
        <div>
          <label className="form-label">Tipo de postagem</label>
          <div className="type-pick">
            {TYPE_OPTIONS.map((o) => (
              <button
                key={o.type}
                type="button"
                className={`status-tab ${type === o.type ? 'active' : ''}`}
                onClick={() => setType(o.type)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="form-label">Título</label>
          <input
            autoFocus
            placeholder="Ex.: Vlog do setup novo"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </div>
        <div>
          <label className="form-label">Notas (opcional)</label>
          <textarea
            rows={2}
            placeholder="Legenda, hashtags, ideias…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={!title.trim() || busy} onClick={() => void submit()}>
          {busy ? 'Criando…' : 'Criar e abrir'}
        </button>
      </div>
    </ModalShell>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const connectSharedFolder = useStore((s) => s.connectSharedFolder);
  const signOut = useStore((s) => s.signOut);
  const [folderInput, setFolderInput] = useState('');
  const [busy, setBusy] = useState(false);
  const rootId = getRootFolderId();

  return (
    <ModalShell onClose={onClose}>
      <h2>⚙️ Configurações</h2>
      <div className="form-grid">
        {rootId && (
          <div>
            <label className="form-label">Pasta do app no Drive</label>
            <p className="form-help" style={{ marginTop: 0 }}>
              <a
                href={rootFolderUrl(rootId)}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--st-ready)' }}
              >
                Abrir "Organizador de Conteúdo" no Drive ↗
              </a>
              <br />
              Para trabalhar em equipe, compartilhe essa pasta com os e-mails do time (permissão
              de editor) e peça para cada um colar o link dela aqui no app.
            </p>
          </div>
        )}
        <div>
          <label className="form-label">Conectar a uma pasta compartilhada</label>
          <input
            placeholder="Cole o link ou ID da pasta…"
            value={folderInput}
            onChange={(e) => setFolderInput(e.target.value)}
          />
          <p className="form-help">
            Use isto se outra pessoa da equipe criou a pasta e compartilhou com você.
          </p>
        </div>
      </div>
      <div className="modal-actions">
        <button
          className="btn btn-ghost btn-danger"
          style={{ marginRight: 'auto' }}
          onClick={() => {
            signOut();
            onClose();
          }}
        >
          Sair da conta
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Fechar
        </button>
        <button
          className="btn btn-primary"
          disabled={!folderInput.trim() || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await connectSharedFolder(folderInput.trim());
              onClose();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Conectando…' : 'Conectar'}
        </button>
      </div>
    </ModalShell>
  );
}
