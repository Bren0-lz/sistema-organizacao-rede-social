import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  coverFileIdFor,
  emptyNetworkStatus,
  hasScheduledTimeArrived,
  isAutoPostedFromSchedule,
  isTrashExpired,
  itemStage,
  itemType,
  newContentItem,
  newIdea,
  newRecording,
  thumbSourceFor,
  trashDaysLeft,
  type ContentItem,
  type ContentType,
  type Network,
  type NetworkStatus,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Cria um ContentItem mínimo com redes zeradas, sobrescrevendo o que vier. */
function makeItem(overrides: Partial<ContentItem> = {}): ContentItem {
  const base = newContentItem('Teste', overrides.type ?? 'video');
  return { ...base, ...overrides };
}

/** Atalho para montar um NetworkStatus atribuído. */
function ns(status: Partial<NetworkStatus>): NetworkStatus {
  return { ...emptyNetworkStatus(), assigned: true, ...status };
}

function withNetworks(item: ContentItem, nets: Partial<Record<Network, NetworkStatus>>): ContentItem {
  return { ...item, networks: { ...item.networks, ...nets } };
}

describe('itemStage', () => {
  it('vídeo sem versão editada e sem redes fica em "raw"', () => {
    expect(itemStage(makeItem())).toBe('raw');
  });

  it('vídeo com versão editada vai para "edited"', () => {
    expect(itemStage(makeItem({ editedVideoFileId: 'abc' }))).toBe('edited');
  });

  it('carrossel sem marcação fica em "raw" e marcado vai para "edited"', () => {
    expect(itemStage(makeItem({ type: 'carousel' }))).toBe('raw');
    expect(
      itemStage(makeItem({ type: 'carousel', carouselEditedAt: new Date().toISOString() })),
    ).toBe('edited');
  });

  it('com redes atribuídas mas sem data fica em "ready"', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'abc' }), {
      instagram: ns({ status: 'none' }),
    });
    expect(itemStage(item)).toBe('ready');
  });

  it('uma rede sem data trava o progresso em "ready" mesmo com outra programada', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'abc' }), {
      instagram: ns({ status: 'scheduled', scheduledAt: '2099-01-01T10:00:00' }),
      tiktok: ns({ status: 'none' }),
    });
    expect(itemStage(item)).toBe('ready');
  });

  it('todas as redes com data programada vão para "scheduled"', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'abc' }), {
      instagram: ns({ status: 'scheduled', scheduledAt: '2099-01-01T10:00:00' }),
      tiktok: ns({ status: 'scheduled', scheduledAt: '2099-02-01T10:00:00' }),
    });
    expect(itemStage(item)).toBe('scheduled');
  });

  it('mistura de postado e programado-com-data conta como "scheduled"', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'abc' }), {
      instagram: ns({ status: 'posted', postedAt: '2026-01-01T10:00:00' }),
      tiktok: ns({ status: 'scheduled', scheduledAt: '2099-02-01T10:00:00' }),
    });
    expect(itemStage(item)).toBe('scheduled');
  });

  it('todas as redes publicadas vão para "posted"', () => {
    const item = withNetworks(makeItem({ editedVideoFileId: 'abc' }), {
      instagram: ns({ status: 'posted', postedAt: '2026-01-01T10:00:00' }),
      tiktok: ns({ status: 'posted', postedAt: '2026-01-02T10:00:00' }),
    });
    expect(itemStage(item)).toBe('posted');
  });
});

describe('hasScheduledTimeArrived', () => {
  const now = new Date('2026-06-15T12:00:00').getTime();

  it('retorna true quando a hora programada já passou', () => {
    expect(hasScheduledTimeArrived(ns({ status: 'scheduled', scheduledAt: '2026-06-15T11:00:00' }), now)).toBe(true);
  });

  it('retorna false quando a hora programada ainda é no futuro', () => {
    expect(hasScheduledTimeArrived(ns({ status: 'scheduled', scheduledAt: '2026-06-15T13:00:00' }), now)).toBe(false);
  });

  it('retorna false quando o status não é "scheduled"', () => {
    expect(hasScheduledTimeArrived(ns({ status: 'none' }), now)).toBe(false);
  });

  it('retorna false quando não há scheduledAt', () => {
    expect(hasScheduledTimeArrived(ns({ status: 'scheduled' }), now)).toBe(false);
  });

  it('retorna false quando a data é inválida', () => {
    expect(hasScheduledTimeArrived(ns({ status: 'scheduled', scheduledAt: 'inválida' }), now)).toBe(false);
  });
});

describe('isAutoPostedFromSchedule', () => {
  it('delega para hasScheduledTimeArrived (independe da rede)', () => {
    const now = new Date('2026-06-15T12:00:00').getTime();
    const passada = ns({ status: 'scheduled', scheduledAt: '2026-06-15T11:00:00' });
    const futura = ns({ status: 'scheduled', scheduledAt: '2026-06-15T13:00:00' });
    expect(isAutoPostedFromSchedule('instagram', passada, now)).toBe(true);
    expect(isAutoPostedFromSchedule('youtube', futura, now)).toBe(false);
  });
});

describe('trashDaysLeft / isTrashExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('item ativo (sem deletedAt) tem 30 dias e não está expirado', () => {
    const item = makeItem();
    expect(trashDaysLeft(item)).toBe(30);
    expect(isTrashExpired(item)).toBe(false);
  });

  it('conta os dias restantes a partir de deletedAt', () => {
    const item = makeItem({ deletedAt: new Date(Date.now() - 5 * DAY_MS).toISOString() });
    expect(trashDaysLeft(item)).toBe(25);
    expect(isTrashExpired(item)).toBe(false);
  });

  it('item na lixeira há mais de 30 dias está expirado (0 dias)', () => {
    const item = makeItem({ deletedAt: new Date(Date.now() - 35 * DAY_MS).toISOString() });
    expect(trashDaysLeft(item)).toBe(0);
    expect(isTrashExpired(item)).toBe(true);
  });
});

describe('itemType', () => {
  it('trata item sem "type" como vídeo', () => {
    const item = makeItem();
    delete item.type;
    expect(itemType(item)).toBe('video');
  });

  it('respeita o type quando presente', () => {
    expect(itemType(makeItem({ type: 'carousel' }))).toBe('carousel');
  });
});

describe('coverFileIdFor', () => {
  it('no carrossel usa a primeira imagem', () => {
    const item = makeItem({ type: 'carousel', carouselFileIds: ['img1', 'img2'] });
    expect(coverFileIdFor(item)).toBe('img1');
  });

  it('no carrossel sem imagens retorna undefined', () => {
    expect(coverFileIdFor(makeItem({ type: 'carousel', carouselFileIds: [] }))).toBeUndefined();
  });

  it('no vídeo usa o coverFileId', () => {
    expect(coverFileIdFor(makeItem({ coverFileId: 'capa' }))).toBe('capa');
  });
});

describe('thumbSourceFor', () => {
  it('usa a capa quando ela existe (não marca como vídeo)', () => {
    const item = makeItem({ coverFileId: 'capa', rawVideoFileId: 'cru' });
    expect(thumbSourceFor(item)).toEqual({ fileId: 'capa', fromVideo: false });
  });

  it('sem capa, cai no vídeo editado como capa temporária', () => {
    const item = makeItem({ editedVideoFileId: 'editado', rawVideoFileId: 'cru' });
    expect(thumbSourceFor(item)).toEqual({ fileId: 'editado', fromVideo: true });
  });

  it('sem capa nem editado, cai no vídeo cru', () => {
    const item = makeItem({ rawVideoFileId: 'cru' });
    expect(thumbSourceFor(item)).toEqual({ fileId: 'cru', fromVideo: true });
  });

  it('vídeo sem nenhum arquivo retorna undefined', () => {
    expect(thumbSourceFor(makeItem())).toBeUndefined();
  });

  it('carrossel usa a 1ª imagem (não o frame de vídeo)', () => {
    const item = makeItem({ type: 'carousel', carouselFileIds: ['img1', 'img2'] });
    expect(thumbSourceFor(item)).toEqual({ fileId: 'img1', fromVideo: false });
  });

  it('carrossel sem imagens retorna undefined', () => {
    expect(thumbSourceFor(makeItem({ type: 'carousel', carouselFileIds: [] }))).toBeUndefined();
  });
});

describe('construtores (newContentItem / newRecording / newIdea)', () => {
  it('newContentItem gera id, timestamps e redes zeradas', () => {
    const item = newContentItem('Meu vídeo');
    expect(item.id).toBeTruthy();
    expect(item.title).toBe('Meu vídeo');
    expect(item.type).toBe('video');
    expect(item.createdAt).toBe(item.updatedAt);
    expect(() => new Date(item.createdAt).toISOString()).not.toThrow();
    for (const net of ['instagram', 'tiktok', 'youtube'] as Network[]) {
      expect(item.networks[net]).toEqual({ assigned: false, status: 'none' });
    }
  });

  it('newContentItem de carrossel começa com carouselFileIds vazio', () => {
    const item = newContentItem('Carrossel', 'carousel' as ContentType);
    expect(item.carouselFileIds).toEqual([]);
  });

  it('newContentItem gera ids diferentes a cada chamada', () => {
    expect(newContentItem('a').id).not.toBe(newContentItem('b').id);
  });

  it('newRecording começa como "planned" com a data informada', () => {
    const rec = newRecording('Gravação', '2026-07-01T15:00:00');
    expect(rec.status).toBe('planned');
    expect(rec.scheduledAt).toBe('2026-07-01T15:00:00');
    expect(rec.id).toBeTruthy();
  });

  it('newIdea cria uma ideia ativa (sem deletedAt)', () => {
    const idea = newIdea('Ideia solta');
    expect(idea.title).toBe('Ideia solta');
    expect(idea.deletedAt).toBeUndefined();
    expect(idea.id).toBeTruthy();
  });
});
