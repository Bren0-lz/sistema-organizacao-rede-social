import { useRef, useState, type DragEvent } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { Icon, type IconName } from './Icon';

type BulkSlot = 'raw' | 'edited';

const SLOT_META: Record<BulkSlot, { icon: IconName; label: string }> = {
  raw: { icon: 'video', label: 'Vídeos crus' },
  edited: { icon: 'scissors', label: 'Vídeos editados' },
};

export function BulkUploadModal({ onClose }: { onClose: () => void }) {
  const bulkUploadAsItems = useStore((s) => s.bulkUploadAsItems);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [slot, setSlot] = useState<BulkSlot>('raw');
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const videos = Array.from(list).filter((f) => f.type.startsWith('video/'));
    setFiles((prev) => [...prev, ...videos]);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const remove = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const start = async () => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    try {
      // fecha já: o progresso continua nos toasts e nos cards
      void bulkUploadAsItems(files, slot);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    // Backdrop escuro e estático para abrir rápido sem recalcular blur no fundo.
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className="modal modal-wide"
        initial={{ scale: 0.92, y: 18, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2><Icon name="upload" /> Subir em lote</h2>
        <p className="form-help" style={{ marginTop: 0 }}>
          Cada vídeo vira um conteúdo novo, com o título tirado do nome do arquivo. Você pode
          ajustar título, capa e redes depois.
        </p>

        <div className="bulk-slot-pick">
          {(Object.keys(SLOT_META) as BulkSlot[]).map((s) => (
            <button
              key={s}
              className={`status-tab ${slot === s ? 'active' : ''}`}
              onClick={() => setSlot(s)}
            >
              <Icon name={SLOT_META[s].icon} /> {SLOT_META[s].label}
            </button>
          ))}
        </div>

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
          <span>Arraste vários vídeos aqui ou clique para escolher</span>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
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
                <button className="icon-btn" onClick={() => remove(i)} title="Remover">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button className="btn btn-modal-close" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            disabled={files.length === 0 || busy}
            onClick={() => void start()}
          >
            {busy ? 'Iniciando…' : `Subir ${files.length || ''} vídeo(s)`}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
