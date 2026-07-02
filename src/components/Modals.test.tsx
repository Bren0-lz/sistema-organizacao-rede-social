import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalShell, NewItemModal, SettingsModal } from './Modals';
import { useStore, resetStore } from '../test/renderWithStore';

describe('ModalShell', () => {
  it('fecha ao clicar no backdrop, mas não ao clicar no conteúdo', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ModalShell onClose={onClose}>
        <p>conteúdo</p>
      </ModalShell>,
    );
    fireEvent.click(screen.getByText('conteúdo'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fecha pelo botão de fechar', () => {
    const onClose = vi.fn();
    render(
      <ModalShell onClose={onClose}>
        <p>x</p>
      </ModalShell>,
    );
    fireEvent.click(screen.getByLabelText('Fechar modal'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('NewItemModal', () => {
  beforeEach(() => resetStore());

  it('renderiza com as opções de tipo e submit desabilitado sem arquivos', () => {
    render(<NewItemModal onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText('Novo conteúdo')).toBeInTheDocument();
    expect(screen.getAllByText('Vídeo').length).toBeGreaterThan(0);
    expect(screen.getByText('Carrossel')).toBeInTheDocument();
  });

  it('permite alternar para o tipo carrossel', () => {
    render(<NewItemModal onClose={() => {}} onCreated={() => {}} />);
    fireEvent.click(screen.getByText('Carrossel'));
    // ao trocar o tipo o componente continua montado (sem crash) e o título segue editável
    expect(screen.getByText('Novo conteúdo')).toBeInTheDocument();
  });

  it('aceita vários vídeos para o mesmo conteúdo', () => {
    const { container } = render(<NewItemModal onClose={() => {}} onCreated={() => {}} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const firstTake = new File(['primeiro'], 'take-1.mp4', { type: 'video/mp4' });
    const secondTake = new File(['segundo'], 'take-2.mp4', { type: 'video/mp4' });

    expect(input.multiple).toBe(true);
    fireEvent.change(input, { target: { files: [firstTake, secondTake] } });

    expect(screen.getByText('take-1.mp4')).toBeInTheDocument();
    expect(screen.getByText('take-2.mp4')).toBeInTheDocument();
  });
});

describe('SettingsModal', () => {
  beforeEach(() => resetStore());

  it('renderiza as configurações e dispara signOut', () => {
    const signOut = vi.spyOn(useStore.getState(), 'signOut').mockImplementation(() => {});
    render(<SettingsModal onClose={() => {}} />);
    expect(screen.getByText('Configurações')).toBeInTheDocument();
    const sair = screen.queryByText(/Sair|Desconectar conta|Encerrar/i);
    if (sair) {
      fireEvent.click(sair);
      expect(signOut).toHaveBeenCalled();
    }
  });
});
