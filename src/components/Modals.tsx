import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { getRootFolderId, rootFolderUrl } from '../services/drive';
import { Icon, type IconName } from './Icon';
import type { ContentType, FileSlot } from '../types';

const TYPE_OPTIONS: { type: ContentType; icon: IconName; label: string }[] = [
  { type: 'video', icon: 'video', label: 'Vídeo' },
  { type: 'carousel', icon: 'carousel', label: 'Carrossel' },
];

type VideoSlot = Extract<FileSlot, 'raw' | 'edited'>;

const VIDEO_SLOT_OPTIONS: { slot: VideoSlot; icon: IconName; label: string }[] = [
  { slot: 'raw', icon: 'video', label: 'Vídeo cru' },
  { slot: 'edited', icon: 'scissors', label: 'Vídeo editado' },
];

function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    // Backdrop escuro e estático para abrir rápido sem recalcular blur no fundo.
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div
        className="modal"
        initial={{ scale: 0.98, y: 6, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.98, y: 4, opacity: 0 }}
        transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
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
  const uploadToItem = useStore((s) => s.uploadToItem);
  const addCarouselImages = useStore((s) => s.addCarouselImages);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [type, setType] = useState<ContentType>('video');
  const [videoSlot, setVideoSlot] = useState<VideoSlot>('raw');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isVideo = type === 'video';
  const accept = isVideo ? 'video/*' : 'image/*';

  // troca de tipo: zera os arquivos (vídeo aceita só 1; carrossel aceita imagens)
  const changeType = (next: ContentType) => {
    if (next === type) return;
    setType(next);
    setFiles([]);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list).filter((f) =>
      f.type.startsWith(isVideo ? 'video/' : 'image/'),
    );
    if (picked.length === 0) return;
    // vídeo: mantém só o último arquivo escolhido; carrossel: acumula
    setFiles((prev) => (isVideo ? picked.slice(-1) : [...prev, ...picked]));
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const canSubmit = !!title.trim() && files.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const item = await createItem(title.trim(), notes.trim() || undefined, type);
      // dispara os uploads em segundo plano (progresso aparece nos toasts/cards)
      if (isVideo) void uploadToItem(item.id, videoSlot, files[0]);
      else void addCarouselImages(item.id, files);
      onCreated(item.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <h2><Icon name="sparkles" /> Novo conteúdo</h2>
      <div className="form-grid">
        <div>
          <label className="form-label">Tipo de postagem</label>
          <div className="type-pick">
            {TYPE_OPTIONS.map((o) => (
              <button
                key={o.type}
                type="button"
                className={`status-tab ${type === o.type ? 'active' : ''}`}
                onClick={() => changeType(o.type)}
              >
                <Icon name={o.icon} /> {o.label}
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

        {isVideo && (
          <div>
            <label className="form-label">Etapa do vídeo</label>
            <div className="type-pick">
              {VIDEO_SLOT_OPTIONS.map((o) => (
                <button
                  key={o.slot}
                  type="button"
                  className={`status-tab ${videoSlot === o.slot ? 'active' : ''}`}
                  onClick={() => setVideoSlot(o.slot)}
                >
                  <Icon name={o.icon} /> {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="form-label">{isVideo ? 'Vídeo' : 'Imagens do carrossel'}</label>
          <div
            className={`bulk-drop ${dragOver ? 'drag-over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <span className="bulk-drop-icon"><Icon name="upload" /></span>
            <span>
              {isVideo
                ? 'Arraste o vídeo aqui ou clique para escolher'
                : 'Arraste as imagens aqui ou clique para escolher'}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              multiple={!isVideo}
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {files.length > 0 && (
            <ul className="bulk-file-list">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <span className="bulk-file-name">{f.name}</span>
                  <span className="bulk-file-size">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button className="icon-btn" onClick={() => removeFile(i)} title="Remover">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
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
        <button className="btn btn-primary" disabled={!canSubmit} onClick={() => void submit()}>
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
      <h2><Icon name="settings" /> Configurações</h2>
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
