import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('explodiu no render');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza os filhos quando não há erro', () => {
    render(
      <ErrorBoundary>
        <p>conteúdo normal</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('conteúdo normal')).toBeInTheDocument();
  });

  it('mostra a mensagem ao capturar um erro de render (sem botão Fechar)', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Algo deu errado.')).toBeInTheDocument();
    expect(screen.getByText('explodiu no render')).toBeInTheDocument();
    expect(screen.queryByText('Fechar')).not.toBeInTheDocument();
    expect(screen.getByText('Recarregar')).toBeInTheDocument();
  });

  it('captura rejeições não tratadas e permite fechar o aviso', () => {
    render(
      <ErrorBoundary>
        <p>app</p>
      </ErrorBoundary>,
    );
    act(() => {
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: new Error('promessa falhou') });
      window.dispatchEvent(event);
    });
    expect(screen.getByText('promessa falhou')).toBeInTheDocument();
    // erro não-fatal mostra o botão Fechar, que volta a renderizar os filhos
    fireEvent.click(screen.getByText('Fechar'));
    expect(screen.getByText('app')).toBeInTheDocument();
  });
});
