import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UploadToasts } from './UploadToasts';
import { useStore, resetStore } from '../test/renderWithStore';

function upload(over: Partial<ReturnType<typeof base>> = {}) {
  return { ...base(), ...over };
}
function base() {
  return {
    id: crypto.randomUUID(),
    fileName: 'clipe.mp4',
    slot: 'raw' as const,
    itemTitle: 'Meu vídeo',
    progress: 0.5,
  };
}

describe('UploadToasts', () => {
  beforeEach(() => resetStore());

  it('não mostra toasts quando não há uploads', () => {
    const { container } = render(<UploadToasts />);
    expect(container.querySelector('.upload-toast')).not.toBeInTheDocument();
  });

  it('mostra um toast por upload abaixo do limite de agregação', () => {
    useStore.setState({ uploads: [upload({ itemTitle: 'Vídeo A' })] });
    render(<UploadToasts />);
    expect(screen.getByText(/Vídeo A/)).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('mostra um toast-resumo quando há muitos uploads', () => {
    useStore.setState({
      uploads: Array.from({ length: 5 }, (_, i) => upload({ itemTitle: `V${i}`, progress: 1 })),
    });
    render(<UploadToasts />);
    expect(screen.getByText(/Subindo 5\/5/)).toBeInTheDocument();
  });

  it('exibe a mensagem de erro do upload', () => {
    useStore.setState({ uploads: [upload({ error: 'falha de rede' })] });
    render(<UploadToasts />);
    expect(screen.getByText('falha de rede')).toBeInTheDocument();
  });
});
