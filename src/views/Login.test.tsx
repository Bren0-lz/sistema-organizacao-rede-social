import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Login } from './Login';
import { useStore, resetStore } from '../test/renderWithStore';

describe('Login', () => {
  beforeEach(() => resetStore());

  it('mostra o título e o botão de entrar', () => {
    render(<Login />);
    expect(screen.getByText('ESTÚDIO')).toBeInTheDocument();
    expect(screen.getByText('Entrar com Google')).toBeInTheDocument();
  });

  it('chama signIn ao clicar em entrar', () => {
    const signIn = vi.spyOn(useStore.getState(), 'signIn').mockResolvedValue();
    render(<Login />);
    fireEvent.click(screen.getByText('Entrar com Google'));
    expect(signIn).toHaveBeenCalled();
  });

  it('exibe a mensagem de erro quando presente no store', () => {
    useStore.setState({ errorMessage: 'Falha no login' });
    render(<Login />);
    expect(screen.getByText('Falha no login')).toBeInTheDocument();
  });
});
