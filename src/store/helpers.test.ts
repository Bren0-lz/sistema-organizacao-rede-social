import { describe, it, expect, vi } from 'vitest';
import { markElapsedScheduledPosts, stripExtension, withTimeout } from './useStore';
import { newContentItem, type ContentItem, type NetworkStatus } from '../types';

// Os serviços têm efeitos de borda só quando chamados; ainda assim mockamos para
// que importar o store não puxe dependências de rede/SDK durante o teste.
// O store chama hasValidYoutubeToken() ao montar o estado inicial.
vi.mock('../services/googleAuth', () => ({ hasValidYoutubeToken: () => false }));
vi.mock('../services/drive', () => ({}));
vi.mock('../services/database', () => ({}));
vi.mock('../services/youtube', () => ({}));
vi.mock('../services/googleCalendar', () => ({}));

function assigned(status: Partial<NetworkStatus>): NetworkStatus {
  return { assigned: true, status: 'none', ...status };
}

function itemWith(networks: Partial<ContentItem['networks']>): ContentItem {
  const base = newContentItem('Teste');
  return { ...base, networks: { ...base.networks, ...networks } };
}

describe('stripExtension', () => {
  it('remove a extensão simples do nome do arquivo', () => {
    expect(stripExtension('clipe-final.mp4')).toBe('clipe-final');
  });

  it('remove só a última extensão e apara espaços', () => {
    expect(stripExtension('  meu.video.mov  ')).toBe('meu.video');
  });

  it('mantém o nome quando não há extensão', () => {
    expect(stripExtension('sem-extensao')).toBe('sem-extensao');
  });

  it('preserva pontos no meio de pastas e nomes ocultos', () => {
    expect(stripExtension('.gitignore')).toBe('.gitignore');
  });
});

describe('withTimeout', () => {
  it('resolve com o valor quando a promise termina antes do prazo', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'estourou')).resolves.toBe('ok');
  });

  it('propaga a rejeição original da promise', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('falha interna')), 50, 'estourou'),
    ).rejects.toThrow('falha interna');
  });

  it('rejeita com a mensagem de timeout quando a promise demora demais', async () => {
    vi.useFakeTimers();
    const lenta = new Promise((resolve) => setTimeout(resolve, 1000));
    const wrapped = withTimeout(lenta, 100, 'estourou o prazo');
    const assertion = expect(wrapped).rejects.toThrow('estourou o prazo');
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    vi.useRealTimers();
  });
});

describe('markElapsedScheduledPosts', () => {
  const past = '2026-01-01T00:00:00.000Z';
  const future = '2999-01-01T00:00:00.000Z';

  it('publica redes cuja hora programada já passou', () => {
    const item = itemWith({
      instagram: assigned({ status: 'scheduled', scheduledAt: past }),
    });
    const { items, changed } = markElapsedScheduledPosts([item]);
    expect(changed).toBe(true);
    expect(items[0].networks.instagram.status).toBe('posted');
    expect(items[0].networks.instagram.postedAt).toBe(past);
  });

  it('não mexe em redes programadas para o futuro', () => {
    const item = itemWith({
      instagram: assigned({ status: 'scheduled', scheduledAt: future }),
    });
    const { items, changed } = markElapsedScheduledPosts([item]);
    expect(changed).toBe(false);
    expect(items[0]).toBe(item);
    expect(items[0].networks.instagram.status).toBe('scheduled');
  });

  it('preserva postedAt já existente em vez de sobrescrever', () => {
    const jaPostado = '2025-12-31T00:00:00.000Z';
    const item = itemWith({
      instagram: assigned({ status: 'scheduled', scheduledAt: past, postedAt: jaPostado }),
    });
    const { items } = markElapsedScheduledPosts([item]);
    expect(items[0].networks.instagram.postedAt).toBe(jaPostado);
  });
});
