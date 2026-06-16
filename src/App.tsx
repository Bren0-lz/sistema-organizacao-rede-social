import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { Login } from './views/Login';
import { Dashboard } from './views/Dashboard';

export default function App() {
  const authStatus = useStore((s) => s.authStatus);
  const errorMessage = useStore((s) => s.errorMessage);
  const init = useStore((s) => s.init);
  const signOut = useStore((s) => s.signOut);
  const reconcileScheduledPosts = useStore((s) => s.reconcileScheduledPosts);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (authStatus !== 'ready') return;
    void reconcileScheduledPosts();
    const id = window.setInterval(() => {
      void reconcileScheduledPosts();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [authStatus, reconcileScheduledPosts]);

  switch (authStatus) {
    case 'checking':
    case 'connecting':
      return <div className="loading-screen">conectando ao drive…</div>;
    case 'ready':
      return <Dashboard />;
    case 'error':
      return (
        <div className="loading-screen" style={{ textTransform: 'none', letterSpacing: 0 }}>
          <div style={{ textAlign: 'center', maxWidth: 480, fontFamily: 'var(--font-body)' }}>
            <p style={{ color: '#ff8d8d' }}>{errorMessage}</p>
            <button className="btn" onClick={signOut}>
              Voltar ao login
            </button>
          </div>
        </div>
      );
    default:
      return <Login />;
  }
}
