import { motion } from 'framer-motion';
import { useStore } from '../store/useStore';

const blobs = [
  { size: 420, color: 'var(--tt-pink)', x: '-12%', y: '-18%', dur: 14 },
  { size: 360, color: 'var(--tt-cyan)', x: '78%', y: '8%', dur: 17 },
  { size: 380, color: 'var(--ig-c)', x: '30%', y: '72%', dur: 20 },
];

export function Login() {
  const signIn = useStore((s) => s.signIn);
  const errorMessage = useStore((s) => s.errorMessage);

  return (
    <div className="login">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="login-blob"
          style={{ width: b.size, height: b.size, background: b.color, left: b.x, top: b.y }}
          animate={{ x: [0, 50, -30, 0], y: [0, -40, 30, 0] }}
          transition={{ duration: b.dur, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <motion.p
          className="login-kicker"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          Seu pipeline de conteúdo
        </motion.p>
        <h1 className="login-title">ESTÚDIO</h1>
        <p className="login-sub">
          Vídeos crus, editados, capas e o status de cada post no Instagram, TikTok e YouTube —
          tudo num lugar só, guardado no seu Google Drive.
        </p>
        <motion.button
          className="btn btn-primary"
          style={{ fontSize: 16, padding: '14px 32px' }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => void signIn()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#fff"
              d="M21.35 11.1H12v2.96h5.35c-.5 2.36-2.47 3.7-5.35 3.7a5.76 5.76 0 1 1 0-11.52c1.47 0 2.8.53 3.84 1.4l2.2-2.2A8.97 8.97 0 0 0 12 3a9 9 0 1 0 0 18c5.2 0 8.95-3.66 8.95-8.82 0-.37-.04-.73-.1-1.08Z"
            />
          </svg>
          Entrar com Google
        </motion.button>
        {errorMessage && <div className="login-error">{errorMessage}</div>}
      </motion.div>
    </div>
  );
}
