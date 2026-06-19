import { describe, it, expect } from 'vitest';
import { mergeIdeas, mergeItems, mergeRecordings } from './database';
import type { ContentItem, Idea, Recording } from '../types';

// As três funções de merge compartilham a mesma regra: união por id, e em
// conflito vence o updatedAt mais recente (empate → versão local). Só os campos
// id/updatedAt importam para a lógica, então usamos objetos mínimos.
const item = (id: string, updatedAt: string, title = id): ContentItem =>
  ({ id, updatedAt, title }) as unknown as ContentItem;
const rec = (id: string, updatedAt: string, title = id): Recording =>
  ({ id, updatedAt, title }) as unknown as Recording;
const idea = (id: string, updatedAt: string, title = id): Idea =>
  ({ id, updatedAt, title }) as unknown as Idea;

describe('mergeItems', () => {
  it('mantém itens que existem só de um lado', () => {
    const merged = mergeItems([item('a', '2026-01-01')], [item('b', '2026-01-01')]);
    expect(merged.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('em conflito, o updatedAt mais recente vence (local mais novo)', () => {
    const merged = mergeItems(
      [item('a', '2026-01-02', 'local')],
      [item('a', '2026-01-01', 'remoto')],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('local');
  });

  it('em conflito, o remoto mais recente vence', () => {
    const merged = mergeItems(
      [item('a', '2026-01-01', 'local')],
      [item('a', '2026-01-02', 'remoto')],
    );
    expect(merged[0].title).toBe('remoto');
  });

  it('em empate de updatedAt, a versão local vence', () => {
    const merged = mergeItems(
      [item('a', '2026-01-01', 'local')],
      [item('a', '2026-01-01', 'remoto')],
    );
    expect(merged[0].title).toBe('local');
  });
});

describe('mergeRecordings', () => {
  it('une por id e mantém o mais recente em conflito', () => {
    const merged = mergeRecordings(
      [rec('a', '2026-01-03', 'local'), rec('b', '2026-01-01')],
      [rec('a', '2026-01-01', 'remoto'), rec('c', '2026-01-01')],
    );
    expect(merged.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
    expect(merged.find((r) => r.id === 'a')?.title).toBe('local');
  });
});

describe('mergeIdeas', () => {
  it('une por id e mantém o mais recente em conflito', () => {
    const merged = mergeIdeas(
      [idea('a', '2026-01-01', 'local')],
      [idea('a', '2026-01-05', 'remoto'), idea('b', '2026-01-01')],
    );
    expect(merged.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(merged.find((i) => i.id === 'a')?.title).toBe('remoto');
  });
});
