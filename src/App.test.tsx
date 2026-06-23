import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { useStore, resetStore } from './test/renderWithStore';

describe('App (roteamento por authStatus)', () => {
  beforeEach(() => {
    resetStore();
    // neutraliza os efeitos de boot (init/reconcile) para isolar o roteamento
    useStore.setState({
      init: vi.fn().mockResolvedValue(undefined),
      reconcileScheduledPosts: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('mostra a tela de carregamento enquanto verifica a sessão', () => {
    useStore.setState({ authStatus: 'checking' });
    render(<App />);
    expect(screen.getByText('conectando ao drive…')).toBeInTheDocument();
  });

  it('mostra o login quando deslogado', () => {
    useStore.setState({ authStatus: 'signedOut' });
    render(<App />);
    expect(screen.getByText('Entrar com Google')).toBeInTheDocument();
  });

  it('mostra o dashboard quando pronto', () => {
    useStore.setState({ authStatus: 'ready', items: [] });
    render(<App />);
    expect(screen.getByText('Seu estúdio está vazio')).toBeInTheDocument();
  });

  it('mostra o erro com botão de voltar ao login', () => {
    useStore.setState({ authStatus: 'error', errorMessage: 'Falha ao conectar' });
    render(<App />);
    expect(screen.getByText('Falha ao conectar')).toBeInTheDocument();
    expect(screen.getByText('Voltar ao login')).toBeInTheDocument();
  });
});
