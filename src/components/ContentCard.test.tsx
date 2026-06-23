import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContentCard } from './ContentCard';
import { resetStore } from '../test/renderWithStore';
import { makeItem, assignNetwork } from '../test/factories';

describe('ContentCard', () => {
  beforeEach(() => resetStore());

  it('mostra o título e o estágio do item', () => {
    render(<ContentCard item={makeItem({ title: 'Meu vídeo' })} onOpen={() => {}} />);
    expect(screen.getByText('Meu vídeo')).toBeInTheDocument();
    expect(screen.getByText('Vídeo bruto')).toBeInTheDocument();
  });

  it('chama onOpen com o id ao clicar no card', () => {
    const onOpen = vi.fn();
    const item = makeItem({ title: 'Abrir' });
    render(<ContentCard item={item} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('Abrir'));
    expect(onOpen).toHaveBeenCalledWith(item.id);
  });

  it('exibe um badge por rede atribuída com o status correto', () => {
    const item = assignNetwork(makeItem(), 'instagram', {
      status: 'scheduled',
      scheduledAt: '2999-01-01T00:00:00Z',
    });
    render(<ContentCard item={item} onOpen={() => {}} />);
    expect(screen.getByText('programado')).toBeInTheDocument();
  });

  it('marca o badge de tipo como Carrossel para itens de carrossel', () => {
    render(<ContentCard item={makeItem({ type: 'carousel' })} onOpen={() => {}} />);
    expect(screen.getAllByText('Carrossel').length).toBeGreaterThan(0);
  });
});
