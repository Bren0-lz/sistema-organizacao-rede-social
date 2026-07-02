import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarView } from './CalendarView';
import { useStore, resetStore } from '../test/renderWithStore';
import { makeRecording } from '../test/factories';

describe('CalendarView', () => {
  beforeEach(() => resetStore());

  it('mostra o estado vazio da agenda sem gravações', () => {
    render(<CalendarView onOpenItem={() => {}} onRecorded={() => {}} />);
    expect(screen.getByText(/Nenhuma grava..o agendada/)).toBeInTheDocument();
  });

  it('lista uma gravação na agenda quando existe no store', () => {
    useStore.setState({
      recordings: [makeRecording({ title: 'Live mensal', scheduledAt: '2999-02-01T18:00:00Z' })],
    });
    render(<CalendarView onOpenItem={() => {}} onRecorded={() => {}} />);
    expect(screen.getByText('Live mensal')).toBeInTheDocument();
  });
});
