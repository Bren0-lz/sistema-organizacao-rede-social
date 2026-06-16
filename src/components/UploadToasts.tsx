import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';

const SLOT_LABEL = {
  raw: 'vídeo cru',
  edited: 'vídeo editado',
  cover: 'capa',
  carousel: 'imagem do carrossel',
} as const;

/** Acima deste número, mostra um único toast-resumo em vez de empilhar todos. */
const AGGREGATE_THRESHOLD = 4;

export function UploadToasts() {
  const uploads = useStore((s) => s.uploads);

  if (uploads.length > AGGREGATE_THRESHOLD) {
    const done = uploads.filter((u) => u.progress >= 1).length;
    const failed = uploads.filter((u) => u.error).length;
    const avg = uploads.reduce((sum, u) => sum + u.progress, 0) / uploads.length;
    return (
      <div className="uploads-stack">
        <motion.div
          className="upload-toast"
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          layout
        >
          <div className="upload-toast-title">
            <span className="upload-toast-label">
              <Icon name="upload" /> Subindo {done}/{uploads.length}
              {failed > 0 ? ` · ${failed} com erro` : ''}
            </span>
            <span className="pct">{Math.round(avg * 100)}%</span>
          </div>
          <div className="progress-track">
            <motion.div
              className="progress-bar"
              animate={{ width: `${avg * 100}%` }}
              transition={{ ease: 'easeOut', duration: 0.2 }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="uploads-stack">
      <AnimatePresence>
        {uploads.map((u) => (
          <motion.div
            key={u.id}
            className="upload-toast"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60, transition: { duration: 0.25 } }}
            layout
          >
            <div className="upload-toast-title">
              <span className="upload-toast-label">
                <Icon name={u.error ? 'warning' : u.progress >= 1 ? 'check' : 'upload'} />{' '}
                {SLOT_LABEL[u.slot]} — {u.itemTitle}
              </span>
              {!u.error && <span className="pct">{Math.round(u.progress * 100)}%</span>}
            </div>
            <div className="upload-toast-file">{u.fileName}</div>
            {u.error ? (
              <div className="upload-error">{u.error}</div>
            ) : (
              <div className="progress-track">
                <motion.div
                  className="progress-bar"
                  animate={{ width: `${u.progress * 100}%` }}
                  transition={{ ease: 'easeOut', duration: 0.2 }}
                />
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
