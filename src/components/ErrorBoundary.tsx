import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: { message: string; fatal: boolean } | null;
}

function toMessage(value: unknown): string {
  if (value instanceof Error) return value.message || value.name;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Captura exceções de render da árvore React (erros "fatais" → recarregar) e
 * também erros globais assíncronos — `error` e `unhandledrejection` — que o
 * boundary normal NÃO pega (ex.: uma rejeição no fluxo de login disparado no
 * onClick). Mostra a mensagem na tela em vez de deixar o `#root` vazio: essencial
 * no Safari do iPhone, onde não há console acessível.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: { message: toMessage(error), fatal: true } };
  }

  componentDidMount(): void {
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onRejection);
  }

  componentWillUnmount(): void {
    window.removeEventListener('error', this.onWindowError);
    window.removeEventListener('unhandledrejection', this.onRejection);
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erro de render capturado pelo ErrorBoundary:', error, info);
  }

  private onWindowError = (event: ErrorEvent): void => {
    if (this.state.error?.fatal) return; // não sobrescreve um crash de render
    this.setState({ error: { message: toMessage(event.error ?? event.message), fatal: false } });
  };

  private onRejection = (event: PromiseRejectionEvent): void => {
    if (this.state.error?.fatal) return;
    this.setState({ error: { message: toMessage(event.reason), fatal: false } });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="loading-screen" style={{ textTransform: 'none', letterSpacing: 0 }}>
        <div style={{ textAlign: 'center', maxWidth: 480, fontFamily: 'var(--font-body)', padding: 24 }}>
          <p style={{ color: '#ff8d8d' }}>Algo deu errado.</p>
          <p style={{ color: 'var(--ink-dim)', fontSize: 13, wordBreak: 'break-word' }}>
            {error.message}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
            <button className="btn" onClick={() => window.location.reload()}>
              Recarregar
            </button>
            {!error.fatal && (
              <button className="btn" onClick={() => this.setState({ error: null })}>
                Fechar
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
