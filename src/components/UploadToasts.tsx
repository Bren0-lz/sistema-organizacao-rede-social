import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/useStore';

const SLOT_LABEL = { raw: 'vídeo cru', edited: 'vídeo editado', cover: 'capa' } as const;

export function UploadToasts() {
  const uploads = useStore((s) => s.uploads);

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
              <span>
                {u.error ? '⚠️' : u.progress >= 1 ? '✅' : '⬆️'} {SLOT_LABEL[u.slot]} —{' '}
                {u.itemTitle}
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
