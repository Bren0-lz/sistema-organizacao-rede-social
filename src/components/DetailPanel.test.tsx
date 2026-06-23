import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailPanel } from './DetailPanel';
import { useStore, resetStore } from '../test/renderWithStore';
import { makeItem } from '../test/factories';

describe('DetailPanel', () => {
  beforeEach(() => resetStore());

  it('mostra o título do item no campo editável', () => {
    render(<DetailPanel item={makeItem({ title: 'Meu conteúdo' })} onClose={() => {}} />);
    expect((screen.getByDisplayValue('Meu conteúdo') as HTMLInputElement).value).toBe(
      'Meu conteúdo',
    );
  });

  it('fecha ao clicar no botão Fechar', () => {
    const onClose = vi.fn();
    render(<DetailPanel item={makeItem()} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renomeia o item ao editar o título e sair do campo (blur)', () => {
    const update = vi.spyOn(useStore.getState(), 'updateItem').mockResolvedValue();
    const item = makeItem({ title: 'Antigo' });
    render(<DetailPanel item={item} onClose={() => {}} />);
    const input = screen.getByDisplayValue('Antigo');
    fireEvent.change(input, { target: { value: 'Novo título' } });
    fireEvent.blur(input);
    expect(update).toHaveBeenCalledWith(item.id, { title: 'Novo título' });
  });

  it('mostra as redes sociais para atribuir', () => {
    render(<DetailPanel item={makeItem()} onClose={() => {}} />);
    expect(screen.getByLabelText('Atribuir ao Instagram')).toBeInTheDocument();
  });
});
