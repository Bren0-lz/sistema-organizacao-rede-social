import { describe, it, expect } from 'vitest';
import { buildJourney, formatWhen, miniTrail } from './journey';
import {
  emptyNetworkStatus,
  newContentItem,
  STAGE_ORDER,
  itemStage,
  type ContentItem,
  type Network,
  type NetworkStatus,
} from '../types';

function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  const base = newContentItem('Teste', overrides.type ?? 'video');
  return { ...base, ...overrides };
}

function ns(status: Partial<NetworkStatus>): NetworkStatus {
  return { ...emptyNetworkStatus(), assigned: true, ...status };
}

function withNetworks(item: ContentItem, nets: Partial<Record<Network, NetworkStatus>>): ContentItem {
  return { ...item, networks: { ...item.networks, ...nets } };
}

describe('formatWhen', () => {
  it('retorna undefined para entrada vazia ou inválida', () => {
    expect(formatWhen(undefined)).toBeUndefined();
    expect(formatWhen('não é data')).toBeUndefined();
  });

  it('formata ISO válido como "DD/MM às HH:MM"', () => {
    // Asserção por forma (não valor exato) para não depender do fuso da máquina.
    expect(formatWhen('2026-06-15T09:05:00')).toMatch(/^\d{2}\/\d{2} às \d{2}:\d{2}$/);
  });
});

describe('miniTrail', () => {
  it('marca o estágio atual como current e os seguintes como pending', () => {
    const trail = miniTrail(makeItem()); // estágio "raw"
    expect(trail).toHaveLength(5);
    expect(trail[0]).toEqual({ stage: 'raw', state: 'current' });
    expect(trail.slice(1).every((s) => s.state === 'pending')).toBe(true);
  });

  it('marca estágios anteriores como done quando o item está publicado', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'x' }), {
      instagram: ns({ status: 'posted', postedAt: '2026-01-01T10:00:00' }),
    });
    const trail = miniTrail(item);
    expect(itemStage(item)).toBe('posted');
    expect(trail.slice(0, 4).every((s) => s.state === 'done')).toBe(true);
    expect(trail[4]).toEqual({ stage: 'posted', state: 'current' });
  });
});

describe('buildJourney', () => {
  it('sem redes atribuídas marca unassigned e não gera ramos', () => {
    const j = buildJourney(makeItem());
    expect(j.unassigned).toBe(true);
    expect(j.branches).toHaveLength(0);
  });

  it('progress corresponde a STAGE_ORDER do estágio', () => {
    const item = makeItem({ editedVideoFileId: 'x' });
    const j = buildJourney(item);
    expect(j.stage).toBe('edited');
    expect(j.progress).toBe(STAGE_ORDER.edited);
  });

  it('vídeo usa o tronco com nó "raw" e 5 passos', () => {
    const j = buildJourney(makeItem());
    expect(j.steps).toHaveLength(5);
    expect(j.steps[0].key).toBe('raw');
  });

  it('carrossel usa o tronco com nó "images" e 5 passos', () => {
    const j = buildJourney(makeItem({ type: 'carousel', carouselFileIds: ['a'] }));
    expect(j.steps).toHaveLength(5);
    expect(j.steps[0].key).toBe('images');
  });

  it('ramo de rede publicada fica "done" com passo de publicação atual', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'x' }), {
      instagram: ns({ status: 'posted', postedAt: '2026-01-01T10:00:00', postUrl: 'http://x' }),
    });
    const branch = buildJourney(item).branches[0];
    expect(branch.network).toBe('instagram');
    expect(branch.state).toBe('done');
    expect(branch.steps[1].state).toBe('current');
    expect(branch.steps[1].title).toContain('Publicado');
    expect(branch.steps[1].url).toBe('http://x');
  });

  it('ramo programado para o futuro fica "current"', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'x' }), {
      instagram: ns({ status: 'scheduled', scheduledAt: '2099-01-01T10:00:00' }),
    });
    const branch = buildJourney(item).branches[0];
    expect(branch.state).toBe('current');
    expect(branch.steps[0].state).toBe('current');
  });

  it('ramo programado com horário já vencido conta como publicado (auto-post)', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'x' }), {
      instagram: ns({ status: 'scheduled', scheduledAt: '2000-01-01T10:00:00' }),
    });
    const branch = buildJourney(item).branches[0];
    expect(branch.state).toBe('done');
  });

  it('ramo de rede atribuída sem programação fica "pending"', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'x' }), {
      instagram: ns({ status: 'none' }),
    });
    const branch = buildJourney(item).branches[0];
    expect(branch.state).toBe('pending');
  });

  it('nó de publicação agrega quantas redes já publicaram', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'x' }), {
      instagram: ns({ status: 'posted', postedAt: '2026-01-01T10:00:00' }),
      tiktok: ns({ status: 'scheduled', scheduledAt: '2099-02-01T10:00:00' }),
    });
    const publish = buildJourney(item).steps.find((s) => s.key === 'publish');
    expect(publish?.detail).toBe('1 de 2 redes publicadas');
  });

  it('quando tudo foi publicado o nó final usa a última data de publicação', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'x' }), {
      instagram: ns({ status: 'posted', postedAt: '2026-01-01T10:00:00' }),
      tiktok: ns({ status: 'posted', postedAt: '2026-03-01T10:00:00' }),
    });
    const j = buildJourney(item);
    const complete = j.steps.find((s) => s.key === 'complete');
    expect(j.stage).toBe('posted');
    expect(complete?.state).toBe('current');
    expect(complete?.timestamp).toBe('2026-03-01T10:00:00');
  });
});
