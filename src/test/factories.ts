import {
  newContentItem,
  newRecording,
  newIdea,
  type ContentItem,
  type Idea,
  type Network,
  type NetworkStatus,
  type Recording,
} from '../types';

/**
 * Fábricas de teste que reaproveitam os construtores reais de `types.ts` e
 * aplicam overrides rasos. Mantêm os objetos válidos por padrão, evitando os
 * `as unknown as` espalhados pelos testes.
 */

export function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return { ...newContentItem(overrides.title ?? 'Item de teste'), ...overrides };
}

export function makeRecording(overrides: Partial<Recording> = {}): Recording {
  const base = newRecording(
    overrides.title ?? 'Gravação de teste',
    overrides.scheduledAt ?? new Date().toISOString(),
  );
  return { ...base, ...overrides };
}

export function makeIdea(overrides: Partial<Idea> = {}): Idea {
  return { ...newIdea(overrides.title ?? 'Ideia de teste'), ...overrides };
}

/** Marca uma rede como atribuída e programada para o item dado. */
export function assignNetwork(
  item: ContentItem,
  network: Network,
  status: Partial<NetworkStatus>,
): ContentItem {
  return {
    ...item,
    networks: {
      ...item.networks,
      [network]: { assigned: true, status: 'none', ...status },
    },
  };
}
