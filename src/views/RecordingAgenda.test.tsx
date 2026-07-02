import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecordingAgenda } from './RecordingAgenda';
import { useStore, resetStore } from '../test/renderWithStore';
import { makeRecording } from '../test/factories';

describe('RecordingAgenda', () => {
  beforeEach(() => resetStore());

  it('mostra o estado vazio sem gravações', () => {
    render(<RecordingAgenda onRecorded={() => {}} />);
    expect(screen.getByText('Nenhuma gravação agendada')).toBeInTheDocument();
  });

  it('lista uma gravação futura na seção "Próximas"', () => {
    useStore.setState({
      recordings: [makeRecording({ title: 'Podcast', scheduledAt: '2999-01-01T10:00:00Z' })],
    });
    render(<RecordingAgenda onRecorded={() => {}} />);
    expect(screen.getByText('Podcast')).toBeInTheDocument();
    expect(screen.getByText('Próximas')).toBeInTheDocument();
  });

  it('abre o modal de nova gravação', () => {
    render(<RecordingAgenda onRecorded={() => {}} />);
    fireEvent.click(screen.getByText('+ Nova gravação'));
    expect(screen.getByText('Nova gravação')).toBeInTheDocument();
  });
});
