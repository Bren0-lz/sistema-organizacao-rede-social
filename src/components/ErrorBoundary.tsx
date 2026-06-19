import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Captura exceções de render da árvore React e mostra uma mensagem legível em
 * vez de deixar o `#root` vazio (tela branca). Essencial no Safari do iPhone,
 * onde um crash silencioso é indistinguível de "página travada".
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // mantém no console para inspeção remota (Web Inspector no iPhone)
    console.error('Erro de render capturado pelo ErrorBoundary:', error, info);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="loading-screen" style={{ textTransform: 'none', letterSpacing: 0 }}>
        <div style={{ textAlign: 'center', maxWidth: 480, fontFamily: 'var(--font-body)', padding: 24 }}>
          <p style={{ color: '#ff8d8d' }}>Algo deu errado ao abrir o app.</p>
          <p style={{ color: 'var(--ink-dim)', fontSize: 13, wordBreak: 'break-word' }}>
            {error.message}
          </p>
          <button className="btn" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
