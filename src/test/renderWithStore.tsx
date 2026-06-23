import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { useStore } from '../store/useStore';
import type { ContentItem, Idea, Recording } from '../types';

// Snapshot dos dados zerados, capturado na 1ª carga do módulo, para restaurar o
// store entre testes sem recriar a instância (o create() roda só uma vez).
const EMPTY = {
  items: [] as ContentItem[],
  recordings: [] as Recording[],
  ideas: [] as Idea[],
  uploads: [],
  coverUrls: {},
  authStatus: 'ready' as const,
  youtubeAuthStatus: 'disconnected' as const,
};

/** Restaura o estado de dados do store ao padrão vazio. Use no beforeEach. */
export function resetStore(seed: Partial<typeof EMPTY> = {}): void {
  useStore.setState({ ...EMPTY, ...seed });
}

/** Render padrão da Testing Library; o store é global, então basta resetá-lo. */
export function renderWithStore(ui: ReactElement) {
  return render(ui);
}

export { useStore };
