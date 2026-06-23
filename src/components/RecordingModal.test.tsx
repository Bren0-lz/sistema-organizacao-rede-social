import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecordingModal } from './RecordingModal';
import { useStore, resetStore } from '../test/renderWithStore';
import { makeRecording } from '../test/factories';

/** Os <label> do modal não usam htmlFor; localizamos os inputs pelo tipo/placeholder. */
function dateInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="datetime-local"]') as HTMLInputElement;
}

describe('RecordingModal', () => {
  beforeEach(() => resetStore());

  it('cria uma gravação ao preencher título e data', async () => {
    const create = vi
      .spyOn(useStore.getState(), 'createRecording')
      .mockResolvedValue(makeRecording());
    const onClose = vi.fn();
    const { container } = render(<RecordingModal onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText(/Vlog do setup novo/), {
      target: { value: 'Nova gravação' },
    });
    fireEvent.change(dateInput(container), { target: { value: '2026-07-01T15:00' } });
    fireEvent.click(screen.getByText('Agendar gravação'));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].title).toBe('Nova gravação');
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('o botão fica desabilitado sem título', () => {
    render(<RecordingModal onClose={() => {}} />);
    expect(screen.getByText('Agendar gravação')).toBeDisabled();
  });

  it('usa onSubmitOverride quando fornecido (ex.: converter ideia)', async () => {
    const override = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <RecordingModal
        initialTitle="Da ideia"
        heading="Promover ideia"
        onSubmitOverride={override}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Promover ideia')).toBeInTheDocument();
    fireEvent.change(dateInput(container), { target: { value: '2026-07-01T15:00' } });
    fireEvent.click(screen.getByText('Agendar gravação'));
    await waitFor(() => expect(override).toHaveBeenCalled());
  });
});
