import { useRef, useState, type DragEvent } from 'react';
import { motion } from 'framer-motion';
import {
  NETWORK_LABELS,
  NETWORKS,
  type ContentItem,
  type FileSlot,
  type Network,
} from '../types';
import { useStore } from '../store/useStore';
import { previewUrl } from '../services/drive';
import { NetworkIcon } from './NetworkIcon';
import { JourneyTrail } from './JourneyTrail';

interface Props {
  item: ContentItem;
  onClose: () => void;
}

const SLOT_META: Record<FileSlot, { icon: string; label: string; accept: string }> = {
  raw: { icon: '🎬', label: 'Vídeo cru', accept: 'video/*' },
  edited: { icon: '✂️', label: 'Editado', accept: 'video/*' },
  cover: { icon: '🖼️', label: 'Capa', accept: 'image/*' },
};

function FileSlotBox({ item, slot }: { item: ContentItem; slot: FileSlot }) {
  const uploadToItem = useStore((s) => s.uploadToItem);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileId =
    slot === 'raw'
      ? item.rawVideoFileId
      : slot === 'edited'
        ? item.editedVideoFileId
        : item.coverFileId;
  const meta = SLOT_META[slot];

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void uploadToItem(item.id, slot, file);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`slot ${fileId ? 'filled' : ''} ${dragOver ? 'drag-over' : ''}`}
      data-slot={slot}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <span className="slot-icon">{fileId ? '✅' : meta.icon}</span>
      <span className="slot-label">{meta.label}</span>
      <span className="slot-hint">
        {fileId ? 'clique para substituir' : 'arraste ou clique'}
      </span>
      {fileId && (
        <span className="slot-actions">
          <a
            className="slot-link"
            href={`https://drive.google.com/file/d/${fileId}/view`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            abrir no Drive ↗
          </a>
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={meta.accept}
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function NetworkRow({ item, network }: { item: ContentItem; network: Network }) {
  const setNetwork = useStore((s) => s.setNetwork);
  const state = item.networks[network];

  return (
    <div className="net-row" data-net={network} data-assigned={state.assigned}>
      <div className="net-row-head">
        <span className="net-name">
          <NetworkIcon network={network} />
          {NETWORK_LABELS[network]}
        </span>
        <button
          className="switch"
          data-on={state.assigned}
          aria-label={`Atribuir ao ${NETWORK_LABELS[network]}`}
          onClick={() =>
            void setNetwork(item.id, network, {
              assigned: !state.assigned,
              ...(state.assigned ? { status: 'none' as const } : {}),
            })
          }
        />
      </div>

      {state.assigned && (
        <motion.div
          className="net-row-body"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.25 }}
        >
          <div className="status-tabs">
            {(['none', 'scheduled', 'posted'] as const).map((status) => (
              <button
                key={status}
                className={`status-tab ${state.status === status ? 'active' : ''}`}
                data-status={status}
                onClick={() =>
                  void setNetwork(item.id, network, {
                    status,
                    ...(status === 'posted' && !state.postedAt
                      ? { postedAt: new Date().toISOString() }
                      : {}),
                  })
                }
              >
                {status === 'none'
                  ? '⬜ Sem data'
                  : status === 'scheduled'
                    ? '📅 Programado'
                    : '✅ Postado'}
              </button>
            ))}
          </div>

          {state.status === 'scheduled' && (
            <div className="field-row">
              <label>Data:</label>
              <input
                type="datetime-local"
                value={state.scheduledAt?.slice(0, 16) ?? ''}
                onChange={(e) =>
                  void setNetwork(item.id, network, {
                    scheduledAt: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : undefined,
                  })
                }
              />
            </div>
          )}

          {state.status === 'posted' && (
            <>
              <div className="field-row">
                <label>Postado em:</label>
                <input
                  type="datetime-local"
                  value={state.postedAt?.slice(0, 16) ?? ''}
                  onChange={(e) =>
                    void setNetwork(item.id, network, {
                      postedAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : undefined,
                    })
                  }
                />
              </div>
              <div className="field-row">
                <label>Link do post:</label>
                <input
                  type="url"
                  placeholder="https://…"
                  defaultValue={state.postUrl ?? ''}
                  onBlur={(e) =>
                    void setNetwork(item.id, network, { postUrl: e.target.value || undefined })
                  }
                />
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}

export function DetailPanel({ item, onClose }: Props) {
  const updateItem = useStore((s) => s.updateItem);
  const deleteItem = useStore((s) => s.deleteItem);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const videoToPreview = item.editedVideoFileId ?? item.rawVideoFileId;

  return (
    <>
      <motion.div
        className="drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="drawer"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 36 }}
      >
        <div className="drawer-head">
          <input
            className="drawer-title-input"
            defaultValue={item.title}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (title && title !== item.title) void updateItem(item.id, { title });
            }}
          />
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Fechar"
            style={{ marginLeft: 'auto' }}
          >
            ✕
          </button>
        </div>

        <section className="drawer-section">
          <h3>Jornada do vídeo</h3>
          <JourneyTrail item={item} />
        </section>

        <section className="drawer-section">
          <h3>Arquivos</h3>
          <div className="slots">
            {(['raw', 'edited', 'cover'] as const).map((slot) => (
              <FileSlotBox key={slot} item={item} slot={slot} />
            ))}
          </div>
          {videoToPreview && (
            <iframe
              className="drawer-preview"
              src={previewUrl(videoToPreview)}
              title="Preview do vídeo"
              allow="autoplay"
            />
          )}
        </section>

        <section className="drawer-section">
          <h3>Redes sociais</h3>
          <div className="net-rows">
            {NETWORKS.map((n) => (
              <NetworkRow key={n} item={item} network={n} />
            ))}
          </div>
        </section>

        <section className="drawer-section">
          <h3>Notas</h3>
          <textarea
            rows={3}
            placeholder="Ideias de legenda, hashtags, observações…"
            defaultValue={item.notes ?? ''}
            onBlur={(e) => void updateItem(item.id, { notes: e.target.value || undefined })}
          />
        </section>

        <section className="drawer-section">
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>
                Remover este conteúdo? (os arquivos continuam no Drive)
              </span>
              <button
                className="btn btn-danger"
                onClick={() => {
                  void deleteItem(item.id);
                  onClose();
                }}
              >
                Remover
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-danger" onClick={() => setConfirmDelete(true)}>
              🗑 Remover conteúdo
            </button>
          )}
        </section>
      </motion.aside>
    </>
  );
}
