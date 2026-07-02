import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkUploadModal } from './BulkUploadModal';
import { resetStore } from '../test/renderWithStore';

describe('BulkUploadModal', () => {
  beforeEach(() => resetStore());

  it('renderiza as opções de destino (crus / editados)', () => {
    render(<BulkUploadModal onClose={() => {}} />);
    expect(screen.getByText('Vídeos crus')).toBeInTheDocument();
    expect(screen.getByText('Vídeos editados')).toBeInTheDocument();
  });

  it('fecha ao clicar no backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(<BulkUploadModal onClose={onClose} />);
    fireEvent.click(container.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalled();
  });
});
