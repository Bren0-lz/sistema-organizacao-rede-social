import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrashView } from './TrashView';
import { resetStore } from '../test/renderWithStore';
import { makeItem } from '../test/factories';

describe('TrashView', () => {
  beforeEach(() => resetStore());

  it('mostra o estado vazio quando não há itens', () => {
    render(<TrashView items={[]} />);
    expect(screen.getByText('Lixeira vazia')).toBeInTheDocument();
  });

  it('lista os itens da lixeira com aviso de retenção', () => {
    const item = makeItem({ title: 'Excluído', deletedAt: new Date().toISOString() });
    render(<TrashView items={[item]} />);
    expect(screen.getByText('Excluído')).toBeInTheDocument();
    expect(screen.getByText(/excluídos de vez após 30 dias/)).toBeInTheDocument();
  });
});
