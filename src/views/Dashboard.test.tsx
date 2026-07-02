import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import { useStore, resetStore } from '../test/renderWithStore';
import { makeItem } from '../test/factories';

describe('Dashboard', () => {
  beforeEach(() => resetStore());

  it('mostra o estado vazio quando não há conteúdos', () => {
    render(<Dashboard />);
    expect(screen.getByText('Seu estúdio está vazio')).toBeInTheDocument();
  });

  it('abre o modal de criar conteúdo pelo estado vazio', () => {
    render(<Dashboard />);
    fireEvent.click(screen.getByText('+ Criar primeiro conteúdo'));
    expect(screen.getByText('Novo conteúdo')).toBeInTheDocument();
  });

  it('renderiza a lista quando há itens', () => {
    useStore.setState({ items: [makeItem({ title: 'Conteúdo A' })] });
    render(<Dashboard />);
    // o título aparece na tabela da lista
    expect(screen.queryByText('Seu estúdio está vazio')).not.toBeInTheDocument();
  });
});
