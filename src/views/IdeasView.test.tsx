import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IdeasView } from './IdeasView';
import { useStore, resetStore } from '../test/renderWithStore';
import { makeIdea } from '../test/factories';

describe('IdeasView', () => {
  beforeEach(() => resetStore());

  it('mostra o estado vazio quando não há ideias', () => {
    render(<IdeasView onCreated={() => {}} />);
    expect(screen.getByText('Nenhuma ideia ainda')).toBeInTheDocument();
  });

  it('lista as ideias ativas do store', () => {
    useStore.setState({ ideas: [makeIdea({ title: 'Ideia de vídeo' })] });
    render(<IdeasView onCreated={() => {}} />);
    expect(screen.getByText('Ideia de vídeo')).toBeInTheDocument();
  });

  it('abre o modal de nova ideia', () => {
    render(<IdeasView onCreated={() => {}} />);
    fireEvent.click(screen.getByText('+ Nova ideia'));
    expect(screen.getByText('Nova ideia')).toBeInTheDocument();
  });

  it('não exibe ideias removidas (soft delete)', () => {
    useStore.setState({
      ideas: [makeIdea({ title: 'Removida', deletedAt: new Date().toISOString() })],
    });
    render(<IdeasView onCreated={() => {}} />);
    expect(screen.queryByText('Removida')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma ideia ainda')).toBeInTheDocument();
  });
});
