import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
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

const POSTER_MAX_WIDTH = 960;

/**
 * O Safari no iOS não exibe automaticamente o primeiro frame de um vídeo local
 * como capa. Extraímos um frame para usá-lo no atributo `poster` do player.
 */
async function createVideoPoster(file: File): Promise<string | undefined> {
  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = sourceUrl;

  const waitFor = (event: 'loadedmetadata' | 'seeked') => new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`Tempo esgotado ao ${event}`)), 4000);
    video.addEventListener(event, () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
    video.addEventListener('error', () => {
      window.clearTimeout(timeout);
      reject(new Error('Não foi possível carregar o vídeo para gerar a capa'));
    }, { once: true });
  });

  try {
    video.load();
    await waitFor('loadedmetadata');
    video.currentTime = Math.min(0.1, Math.max(0, video.duration - 0.01));
    await waitFor('seeked');

    if (!video.videoWidth || !video.videoHeight) return undefined;
    const width = Math.min(video.videoWidth, POSTER_MAX_WIDTH);
    const height = Math.round((width / video.videoWidth) * video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    // A prévia normal ainda funciona em navegadores que não permitirem extrair o frame.
    return undefined;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

const VIDEO_SLOT_OPTIONS: { slot: VideoSlot; icon: IconName; label: string }[] = [
  { slot: 'raw', icon: 'video', label: 'Vídeo cru' },
  { slot: 'edited', icon: 'scissors', label: 'Vídeo editado' },
];

export function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    // Backdrop escuro e estático para abrir rápido sem recalcular blur no fundo.
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        className="modal"
        initial={{ scale: 0.98, y: 6, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.98, y: 4, opacity: 0 }}
        transition={{ duration: 0.14, ease: [0.2, 0.8, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar modal">
          ×
        </button>
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
  const addRawVideos = useStore((s) => s.addRawVideos);
  const addEditedVideos = useStore((s) => s.addEditedVideos);
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
  const selectedVideo = isVideo ? files[0] : undefined;
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [videoPosterUrl, setVideoPosterUrl] = useState('');
  const [carouselPreviewUrls, setCarouselPreviewUrls] = useState<string[]>([]);

  // Object-URL é um side-effect que exige revoke no cleanup; guardar a URL gerada
  // em estado a partir do efeito é o padrão recomendado (useMemo poderia vazar, pois
  // o React pode descartar o memo sem rodar cleanup).
  useEffect(() => {
    if (!selectedVideo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa o preview ao remover o vídeo
      setVideoPreviewUrl('');
      return;
    }

    const url = URL.createObjectURL(selectedVideo);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedVideo]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reseta o poster antes de gerar o novo
    setVideoPosterUrl('');

    if (!selectedVideo) return;

    void createVideoPoster(selectedVideo).then((posterUrl) => {
      if (!cancelled && posterUrl) setVideoPosterUrl(posterUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [selectedVideo]);

  useEffect(() => {
    if (isVideo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- carrossel não se aplica a vídeo
      setCarouselPreviewUrls([]);
      return;
    }

    const urls = files.map((file) => URL.createObjectURL(file));
    setCarouselPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files, isVideo]);

  // Trocar de tipo zera os arquivos para não misturar vídeos e imagens.
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
    // Tanto os takes de vídeo quanto as imagens do carrossel podem ser adicionados
    // em seleções sucessivas ao mesmo conteúdo.
    setFiles((prev) => [...prev, ...picked]);
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
      if (isVideo) void (videoSlot === 'raw' ? addRawVideos : addEditedVideos)(item.id, files);
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
          <label className="form-label">{isVideo ? 'Vídeos do conteúdo' : 'Imagens do carrossel'}</label>
          <div
            className={`bulk-drop ${videoPreviewUrl ? 'has-preview' : ''} ${dragOver ? 'drag-over' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            {videoPreviewUrl && (
              <div className="video-file-preview">
                <video
                  src={videoPreviewUrl}
                  poster={videoPosterUrl || undefined}
                  preload="metadata"
                  controls
                  playsInline
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="video-file-preview-info">
                  <span className="video-file-preview-title">
                    <Icon name="video" /> {selectedVideo?.name}
                  </span>
                  <span>Clique fora dos controles para trocar</span>
                </div>
              </div>
            )}
            <span className="bulk-drop-icon"><Icon name="upload" /></span>
            <span>
              {isVideo
                ? 'Arraste os vídeos aqui ou clique para escolher'
                : 'Arraste as imagens aqui ou clique para escolher'}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          {!isVideo && carouselPreviewUrls.length > 0 && (
            <div className="carousel-file-preview-grid">
              {files.map((file, i) => (
                <div className="carousel-file-preview" key={`${file.name}-${file.lastModified}-${i}`}>
                  <img src={carouselPreviewUrls[i]} alt={file.name} />
                  <span className="carousel-order">{i + 1}</span>
                  {i === 0 && <span className="carousel-cover-tag">capa</span>}
                  <button
                    type="button"
                    className="carousel-remove"
                    onClick={() => removeFile(i)}
                    title="Remover"
                  >
                    ×
                  </button>
                  <div className="carousel-file-preview-info">
                    <span className="carousel-file-preview-name">{file.name}</span>
                    <span className="carousel-file-preview-size">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {isVideo && files.length > 0 && (
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
        <button className="btn btn-modal-close" onClick={onClose}>
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
  const connectYoutube = useStore((s) => s.connectYoutube);
  const disconnectYoutube = useStore((s) => s.disconnectYoutube);
  const saveYoutubeClientId = useStore((s) => s.saveYoutubeClientId);
  const signOut = useStore((s) => s.signOut);
<<<<<<< HEAD
  const [folderInput, setFolderInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
=======
  const youtubeAuthStatus = useStore((s) => s.youtubeAuthStatus);
  const youtubeAccount = useStore((s) => s.youtubeAccount);
  const youtubeErrorMessage = useStore((s) => s.youtubeErrorMessage);
  const youtubeClientId = useStore((s) => s.youtubeClientId);
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [clientIdInput, setClientIdInput] = useState(youtubeClientId ?? '');
  const [clientIdBusy, setClientIdBusy] = useState(false);
  const [prevYoutubeClientId, setPrevYoutubeClientId] = useState(youtubeClientId);
>>>>>>> 08bd6e7193f0e8f32a6d01ae28c173420a7666c0
  const rootId = getRootFolderId();

  // O config.json do Drive carrega de forma assíncrona (e muda ao salvar): mantém o
  // campo em sincronia com o valor do store ajustando o estado durante o render
  // (padrão recomendado do React, sem effect).
  if (youtubeClientId !== prevYoutubeClientId) {
    setPrevYoutubeClientId(youtubeClientId);
    setClientIdInput(youtubeClientId ?? '');
  }

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
              de editor).
            </p>
          </div>
        )}
        <div>
          <label className="form-label">Client ID do YouTube (OAuth)</label>
          <input
            placeholder="000000-xxxx.apps.googleusercontent.com"
            value={clientIdInput}
            onChange={(e) => setClientIdInput(e.target.value)}
          />
          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
            <button
              className="btn btn-client-save"
              disabled={clientIdBusy || clientIdInput.trim() === (youtubeClientId ?? '')}
              onClick={async () => {
                setClientIdBusy(true);
                try {
                  await saveYoutubeClientId(clientIdInput);
                } finally {
                  setClientIdBusy(false);
                }
              }}
            >
              {clientIdBusy ? 'Salvando…' : 'Salvar Client ID'}
            </button>
          </div>
          <p className="form-help">
            Deixe vazio para publicar com a conta/projeto padrão do app. Para usar outra conta,
            crie um Client ID OAuth (tipo "Web") no Google Cloud, autorize a origem deste site e
            cole o ID aqui. Ao salvar um novo ID será preciso reconectar a conta abaixo.
          </p>
        </div>
        <div>
          <label className="form-label">Conta do YouTube</label>
          <p className="form-help" style={{ marginTop: 0 }}>
            {youtubeAccount
              ? `Conectado ao canal "${youtubeAccount.title}".`
              : 'Nenhuma conta do YouTube conectada. O Drive continua usando a conta principal.'}
            {youtubeAccount?.customUrl ? (
              <>
                <br />
                {youtubeAccount.customUrl}
              </>
            ) : null}
          </p>
          {youtubeErrorMessage && (
            <p className="youtube-error" style={{ marginBottom: 10 }}>
              {youtubeErrorMessage}
            </p>
          )}
          <div className="modal-actions" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
            <button
              className="btn btn-primary"
              disabled={youtubeBusy || youtubeAuthStatus === 'connecting'}
              onClick={async () => {
                setYoutubeBusy(true);
                try {
                  await connectYoutube();
                } catch {
                  // A mensagem ja fica no estado global e aparece abaixo.
                } finally {
                  setYoutubeBusy(false);
                }
              }}
            >
              {youtubeBusy || youtubeAuthStatus === 'connecting'
                ? 'Conectando...'
                : youtubeAccount
                  ? 'Trocar conta do YouTube'
                  : 'Conectar YouTube'}
            </button>
            {youtubeAccount && (
              <button className="btn btn-ghost" disabled={youtubeBusy} onClick={disconnectYoutube}>
                Desconectar
              </button>
            )}
          </div>
          <p className="form-help">
            Publicacoes, edicoes e exclusoes no YouTube usam somente essa conta. Videos ja enviados
            por outra conta podem nao aceitar alteracoes depois da troca.
          </p>
          {error && (
            <p className="form-help" role="alert" style={{ color: 'var(--st-raw, #e5484d)' }}>
              {error}
            </p>
          )}
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
        <button className="btn btn-modal-close" onClick={onClose}>
          Fechar
        </button>
<<<<<<< HEAD
        <button
          className="btn btn-primary"
          disabled={!folderInput.trim() || busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await connectSharedFolder(folderInput.trim());
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Conectando…' : 'Conectar'}
        </button>
=======
>>>>>>> 08bd6e7193f0e8f32a6d01ae28c173420a7666c0
      </div>
    </ModalShell>
  );
}
