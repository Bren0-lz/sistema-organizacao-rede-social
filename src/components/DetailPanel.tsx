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
import { Icon, type IconName } from './Icon';
import { JourneyTrail } from './JourneyTrail';

interface Props {
  item: ContentItem;
  onClose: () => void;
}

const SLOT_META: Record<FileSlot, { icon: IconName; label: string; accept: string }> = {
  raw: { icon: 'video', label: 'Vídeo cru', accept: 'video/*' },
  edited: { icon: 'scissors', label: 'Editado', accept: 'video/*' },
  cover: { icon: 'carousel', label: 'Capa', accept: 'image/*' },
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isoToLocalInputValue(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return (
    [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join('-') +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}

function localInputValueToIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const YOUTUBE_CATEGORY_OPTIONS = [
  { id: '1', label: 'Filme e animacao' },
  { id: '2', label: 'Autos e veiculos' },
  { id: '10', label: 'Musica' },
  { id: '15', label: 'Animais' },
  { id: '17', label: 'Esportes' },
  { id: '19', label: 'Viagens e eventos' },
  { id: '20', label: 'Games' },
  { id: '22', label: 'Pessoas e blogs' },
  { id: '23', label: 'Comedia' },
  { id: '24', label: 'Entretenimento' },
  { id: '25', label: 'Noticias e politica' },
  { id: '26', label: 'Como fazer e estilo' },
  { id: '27', label: 'Educacao' },
  { id: '28', label: 'Ciencia e tecnologia' },
  { id: '29', label: 'Sem fins lucrativos' },
];

function parseTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

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
      <span className="slot-icon">
        <Icon name={fileId ? 'check' : meta.icon} />
      </span>
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
    <span className="carousel-thumb-ph">
      <Icon name="hourglass" />
    </span>
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
                {status === 'none' ? (
                  <>
                    <Icon name="none" /> Sem data
                  </>
                ) : status === 'scheduled' ? (
                  <>
                    <Icon name="calendar" /> Programado
                  </>
                ) : (
                  <>
                    <Icon name="check" /> Postado
                  </>
                )}
              </button>
            ))}
          </div>

          {state.status === 'scheduled' && (
            <div className="field-row">
              <label>Data:</label>
              <input
                type="datetime-local"
                value={isoToLocalInputValue(state.scheduledAt)}
                onChange={(e) =>
                  void setNetwork(item.id, network, {
                    scheduledAt: localInputValueToIso(e.target.value),
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
                  value={isoToLocalInputValue(state.postedAt)}
                  onChange={(e) =>
                    void setNetwork(item.id, network, {
                      postedAt: localInputValueToIso(e.target.value),
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
  const updateYoutubePublication = useStore((s) => s.updateYoutubePublication);
  const cancelYoutubePublication = useStore((s) => s.cancelYoutubePublication);
  const deleteYoutubePublication = useStore((s) => s.deleteYoutubePublication);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.notes ?? '');
  const [categoryId, setCategoryId] = useState('22');
  const [tagsText, setTagsText] = useState('');
  const [madeForKids, setMadeForKids] = useState(false);
  const [containsSyntheticMedia, setContainsSyntheticMedia] = useState(false);
  const [embeddable, setEmbeddable] = useState(true);
  const [publicStatsViewable, setPublicStatsViewable] = useState(true);
  const [notifySubscribers, setNotifySubscribers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [youtubeAction, setYoutubeAction] = useState<'save' | 'cancel' | 'delete' | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [confirmYoutubeDelete, setConfirmYoutubeDelete] = useState(false);
  const uploading = state.youtubeUploadStatus === 'uploading';
  const busy = uploading || youtubeAction !== null;
  const selectedVideoFileId = item.editedVideoFileId ?? item.rawVideoFileId;
  const selectedVideoLabel = item.editedVideoFileId ? 'editado' : item.rawVideoFileId ? 'cru' : null;
  const canSchedule = !!selectedVideoFileId && !!state.scheduledAt && !busy;
  const hasYoutubeVideo = !!state.youtubeVideoId;
  const canSaveMetadata = hasYoutubeVideo && !busy;
  const scheduleTime = state.scheduledAt ? new Date(state.scheduledAt).getTime() : Number.NaN;
  const scheduleHasPassed = Number.isFinite(scheduleTime) && scheduleTime <= Date.now();
  const cancelLabel = scheduleHasPassed ? 'Tornar privado no YouTube' : 'Cancelar agendamento';
  const buttonLabel = busy
    ? youtubeAction === 'save'
      ? 'Salvando...'
      : youtubeAction === 'cancel'
      ? 'Cancelando...'
      : youtubeAction === 'delete'
        ? 'Excluindo...'
        : 'Enviando...'
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
        categoryId,
        tags: parseTags(tagsText),
        madeForKids,
        containsSyntheticMedia,
        embeddable,
        publicStatsViewable,
        notifySubscribers,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const saveMetadataOnYoutube = async () => {
    if (!state.youtubeVideoId) return;
    setError(null);
    setSaveOk(false);
    setYoutubeAction('save');
    try {
      await updateYoutubePublication(item.id, {
        title: title.trim() || item.title,
        description: description.trim() || undefined,
        categoryId,
        tags: parseTags(tagsText),
        madeForKids,
        containsSyntheticMedia,
        embeddable,
        publicStatsViewable,
      });
      setSaveOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setYoutubeAction(null);
    }
  };

  const cancelOnYoutube = async () => {
    if (!state.youtubeVideoId) return;
    setError(null);
    setYoutubeAction('cancel');
    try {
      await cancelYoutubePublication(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setYoutubeAction(null);
    }
  };

  const deleteOnYoutube = async () => {
    if (!state.youtubeVideoId) return;
    setError(null);
    setYoutubeAction('delete');
    try {
      await deleteYoutubePublication(item.id);
      setConfirmYoutubeDelete(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setYoutubeAction(null);
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
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {YOUTUBE_CATEGORY_OPTIONS.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
        <input
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="Tags separadas por virgula"
        />
        <div className="youtube-options">
          <label className="youtube-check">
            <input
              type="checkbox"
              checked={madeForKids}
              onChange={(e) => setMadeForKids(e.target.checked)}
            />
            Feito para criancas
          </label>
          <label className="youtube-check">
            <input
              type="checkbox"
              checked={containsSyntheticMedia}
              onChange={(e) => setContainsSyntheticMedia(e.target.checked)}
            />
            Contem midia sintetica/IA
          </label>
          <label className="youtube-check">
            <input
              type="checkbox"
              checked={embeddable}
              onChange={(e) => setEmbeddable(e.target.checked)}
            />
            Permitir incorporacao
          </label>
          <label className="youtube-check">
            <input
              type="checkbox"
              checked={publicStatsViewable}
              onChange={(e) => setPublicStatsViewable(e.target.checked)}
            />
            Mostrar estatisticas publicas
          </label>
          <label className="youtube-check">
            <input
              type="checkbox"
              checked={notifySubscribers}
              onChange={(e) => setNotifySubscribers(e.target.checked)}
            />
            Notificar inscritos
          </label>
        </div>
      </div>
      {selectedVideoLabel && (
        <p className="youtube-help">Video selecionado: {selectedVideoLabel}.</p>
      )}
      {!selectedVideoFileId && (
        <p className="youtube-warning">Anexe um video cru ou editado para liberar o agendamento.</p>
      )}
      {!state.scheduledAt && !hasYoutubeVideo && (
        <p className="youtube-warning">Marque o status como Programado e escolha uma data.</p>
      )}
      {uploading && (
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
      {saveOk && <p className="youtube-success">Alteracoes salvas no YouTube.</p>}
      {hasYoutubeVideo && (
        <button
          className="btn btn-primary youtube-action"
          disabled={!canSaveMetadata}
          onClick={() => void saveMetadataOnYoutube()}
        >
          {youtubeAction === 'save' ? 'Salvando...' : 'Salvar alteracoes no YouTube'}
        </button>
      )}
      {hasYoutubeVideo && (
        <div className="youtube-manage-actions">
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void cancelOnYoutube()}
          >
            {cancelLabel}
          </button>
          {confirmYoutubeDelete ? (
            <>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() => void deleteOnYoutube()}
              >
                Confirmar exclusao
              </button>
              <button
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setConfirmYoutubeDelete(false)}
              >
                Manter video
              </button>
            </>
          ) : (
            <button
              className="btn btn-ghost btn-danger"
              disabled={busy}
              onClick={() => setConfirmYoutubeDelete(true)}
            >
              Excluir do YouTube
            </button>
          )}
        </div>
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
              <Icon name="trash" /> Mover para lixeira
            </button>
          )}
        </section>
      </motion.aside>
    </>
  );
}
