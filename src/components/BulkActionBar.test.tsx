import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BulkActionBar } from './BulkActionBar';
import { useStore, resetStore } from '../test/renderWithStore';

describe('BulkActionBar', () => {
  beforeEach(() => resetStore());
  afterEach(() => vi.restoreAllMocks());

  it('não renderiza nada sem itens selecionados', () => {
    const { container } = render(<BulkActionBar ids={[]} onClear={() => {}} />);
    expect(container.querySelector('.bulk-bar')).not.toBeInTheDocument();
  });

  it('mostra a contagem de selecionados', () => {
    render(<BulkActionBar ids={['a', 'b']} onClear={() => {}} />);
    expect(screen.getByText('2 selecionado(s)')).toBeInTheDocument();
  });

  it('"Atribuir" chama bulkSetNetwork com a rede ativa e os ids', async () => {
    const spy = vi.spyOn(useStore.getState(), 'bulkSetNetwork').mockResolvedValue();
    render(<BulkActionBar ids={['a', 'b']} onClear={() => {}} />);
    fireEvent.click(screen.getByText('Atribuir'));
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(['a', 'b'], 'instagram', { assigned: true }),
    );
  });

  it('remover exige confirmação antes de mover para a lixeira', async () => {
    const del = vi.spyOn(useStore.getState(), 'deleteItems').mockResolvedValue();
    const onClear = vi.fn();
    render(<BulkActionBar ids={['a']} onClear={onClear} />);

    fireEvent.click(screen.getByText('Remover'));
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Mover para lixeira'));
    await waitFor(() => expect(del).toHaveBeenCalledWith(['a']));
    await waitFor(() => expect(onClear).toHaveBeenCalled());
  });
});
