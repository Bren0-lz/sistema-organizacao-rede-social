import { useEffect, useRef, useState, type DragEvent } from 'react';
import { motion } from 'framer-motion';
import {
  itemType,
  NETWORK_LABELS,
  NETWORKS,
  type ContentItem,
  type FileSlot,
  type Network,
  type NetworkStatus,
} from '../types';
import { useStore } from '../store/useStore';
import { useMediaQuery } from '../lib/useMediaQuery';
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

// Miniatura de uma imagem do carrossel: baixa a thumbnail sob demanda.
function CarouselThumb({ fileId }: { fileId: string }) {
  const url = useStore((s) => s.coverUrls[fileId]);
  const loadCover = useStore((s) => s.loadCover);

  useEffect(() => {
    void loadCover(fileId);
  }, [fileId, loadCover]);

  return url ? (
    <img src={url} alt="" loading="lazy" />
  ) : (
    <span className="carousel-thumb-ph">⏳</span>
  );
}

// Editor do carrossel: grade ordenada de imagens (a 1ª é a capa) + adicionar/remover.
// A ordem da grade é a ordem de exibição no carrossel: arraste as imagens (ou use
// as setas) para reordenar; a 1ª posição é sempre a capa.
function CarouselEditor({ item }: { item: ContentItem }) {
  const addCarouselImages = useStore((s) => s.addCarouselImages);
  const removeCarouselImage = useStore((s) => s.removeCarouselImage);
  const reorderCarousel = useStore((s) => s.reorderCarousel);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const ids = item.carouselFileIds ?? [];

  const addFiles = (files: FileList | null) => {
    if (files && files.length > 0) void addCarouselImages(item.id, Array.from(files));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    void reorderCarousel(item.id, from, to);
  };

  return (
    <div className="carousel-editor">
      <div className="carousel-grid">
        {ids.map((fileId, i) => (
          <div
            key={fileId}
            className={`carousel-cell${dragIndex === i ? ' dragging' : ''}${
              overIndex === i && dragIndex !== i ? ' drag-target' : ''
            }`}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              if (overIndex !== i) setOverIndex(i);
            }}
            onDrop={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              if (dragIndex !== i) move(dragIndex, i);
              setDragIndex(null);
              setOverIndex(null);
            }}
          >
            <CarouselThumb fileId={fileId} />
            <span
              className="carousel-handle"
              title="Arraste para reordenar"
              draggable
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
            >
              ⠿
            </span>
            <span className="carousel-order">{i + 1}</span>
            {i === 0 && <span className="carousel-cover-tag">capa</span>}
            <div className="carousel-move">
              <button
                className="carousel-move-btn"
                title="Mover para trás"
                disabled={i === 0}
                onClick={() => move(i, i - 1)}
              >
                ‹
              </button>
              <button
                className="carousel-move-btn"
                title="Mover para frente"
                disabled={i === ids.length - 1}
                onClick={() => move(i, i + 1)}
              >
                ›
              </button>
            </div>
            <button
              className="carousel-remove"
              title="Remover imagem"
              onClick={() => void removeCarouselImage(item.id, fileId)}
            >
              ✕
            </button>
          </div>
        ))}

        <button
          type="button"
          className={`carousel-add ${dragOver ? 'drag-over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <span className="carousel-add-icon">＋</span>
          <span>adicionar imagens</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// Preview do vídeo sob demanda: mostra um poster (capa, se houver) com botão ▶.
// O iframe pesado do Drive só monta após o clique, mantendo a abertura do drawer fluida.
function VideoPreview({ item, fileId }: { item: ContentItem; fileId: string }) {
  const coverUrl = useStore((s) =>
    item.coverFileId ? s.coverUrls[item.coverFileId] : undefined,
  );
  const loadCover = useStore((s) => s.loadCover);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing && item.coverFileId) void loadCover(item.coverFileId);
  }, [playing, item.coverFileId, loadCover]);

  if (playing) {
    return (
      <iframe
        className="drawer-preview"
        src={previewUrl(fileId)}
        title="Preview do vídeo"
        allow="autoplay"
        loading="lazy"
      />
    );
  }

  return (
    <div
      className="drawer-preview-poster"
      style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      onClick={() => setPlaying(true)}
      role="button"
      tabIndex={0}
      aria-label="Carregar preview do vídeo"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') setPlaying(true);
      }}
    >
      <span className="drawer-preview-play">▶</span>
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

          {network === 'youtube' && <YouTubeScheduler item={item} state={state} />}
        </motion.div>
      )}
    </div>
  );
}

function YouTubeScheduler({ item, state }: { item: ContentItem; state: NetworkStatus }) {
  const uploadAndScheduleYoutube = useStore((s) => s.uploadAndScheduleYoutube);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const busy = state.youtubeUploadStatus === 'uploading';
  const selectedVideoFileId = item.editedVideoFileId ?? item.rawVideoFileId;
  const selectedVideoLabel = item.editedVideoFileId ? 'editado' : item.rawVideoFileId ? 'cru' : null;
  const canSchedule = !!selectedVideoFileId && !!state.scheduledAt && !busy;
  const buttonLabel = busy
    ? 'Enviando...'
    : !selectedVideoFileId
      ? 'Anexe um video'
      : !state.scheduledAt
        ? 'Escolha uma data'
        : state.youtubeVideoId
          ? 'Reenviar/agendar de novo'
          : 'Enviar e agendar';

  const submit = async () => {
    if (!state.scheduledAt) {
      setError('Defina uma data em Programado antes de enviar ao YouTube.');
      return;
    }
    setError(null);
    try {
      await uploadAndScheduleYoutube(item.id, {
        title: title.trim() || item.title,
        description: description.trim() || undefined,
        publishAt: state.scheduledAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="youtube-box">
      <div className="youtube-box-head">
        <span>Upload e agendamento no YouTube</span>
        {state.youtubeVideoId && (
          <a href={state.postUrl} target="_blank" rel="noreferrer">
            abrir video
          </a>
        )}
      </div>
      <p className="youtube-help">
        Usa o video selecionado no Drive. Quando houver video editado, ele tem prioridade; caso
        contrario, o video cru sera enviado. O YouTube exige que o upload agendado seja privado ate
        a data de publicacao.
      </p>
      <div className="youtube-fields">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titulo no YouTube"
        />
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descricao do video"
        />
      </div>
      {selectedVideoLabel && (
        <p className="youtube-help">Video selecionado: {selectedVideoLabel}.</p>
      )}
      {!selectedVideoFileId && (
        <p className="youtube-warning">Anexe um video cru ou editado para liberar o agendamento.</p>
      )}
      {!state.scheduledAt && (
        <p className="youtube-warning">Marque o status como Programado e escolha uma data.</p>
      )}
      {busy && (
        <div className="youtube-progress">
          <div className="youtube-progress-title">
            <span>Enviando para o YouTube</span>
            <span>{Math.round((state.youtubeUploadProgress ?? 0) * 100)}%</span>
          </div>
          <div className="progress-track">
            <motion.div
              className="progress-bar"
              animate={{ width: `${(state.youtubeUploadProgress ?? 0) * 100}%` }}
              transition={{ ease: 'easeOut', duration: 0.2 }}
            />
          </div>
        </div>
      )}
      {(error || state.youtubeUploadError) && (
        <p className="youtube-error">{error ?? state.youtubeUploadError}</p>
      )}
      {state.youtubeUploadStatus === 'scheduled' && state.youtubeVideoId && (
        <p className="youtube-success">Video enviado e agendado no YouTube.</p>
      )}
      <button
        className="btn btn-primary youtube-action"
        disabled={!canSchedule}
        onClick={() => void submit()}
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export function DetailPanel({ item, onClose }: Props) {
  const updateItem = useStore((s) => s.updateItem);
  const deleteItem = useStore((s) => s.deleteItem);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // no mobile o painel sobe de baixo (bottom-sheet); no desktop desliza da direita
  const isMobile = useMediaQuery('(max-width: 768px)');
  const hidden = isMobile ? { y: '100%' } : { x: '100%' };

  const isCarousel = itemType(item) === 'carousel';
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
        initial={hidden}
        animate={{ x: 0, y: 0 }}
        exit={hidden}
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
          <h3>{isCarousel ? 'Jornada do carrossel' : 'Jornada do vídeo'}</h3>
          <JourneyTrail item={item} />
        </section>

        <section className="drawer-section">
          <h3>{isCarousel ? 'Imagens do carrossel' : 'Arquivos'}</h3>
          {isCarousel ? (
            <CarouselEditor item={item} />
          ) : (
            <>
              <div className="slots">
                {(['raw', 'edited', 'cover'] as const).map((slot) => (
                  <FileSlotBox key={slot} item={item} slot={slot} />
                ))}
              </div>
              {videoToPreview && <VideoPreview item={item} fileId={videoToPreview} />}
            </>
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
                Mandar para a lixeira? Fica lá 30 dias antes da exclusão definitiva.
              </span>
              <button
                className="btn btn-danger"
                onClick={() => {
                  void deleteItem(item.id);
                  onClose();
                }}
              >
                Mover para lixeira
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-danger" onClick={() => setConfirmDelete(true)}>
              🗑 Mover para lixeira
            </button>
          )}
        </section>
      </motion.aside>
    </>
  );
}
