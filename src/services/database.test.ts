import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadDatabase, mergeIdeas, mergeItems, mergeRecordings, saveDatabase } from './database';
import { readJsonFile, writeJsonFile } from './drive';
import type { ContentItem, Database, Idea, Recording } from '../types';

// Drive falso em memória para testar saveDatabase sem rede.
vi.mock('./drive', () => ({
  readJsonFile: vi.fn(),
  writeJsonFile: vi.fn(),
}));

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

describe('saveDatabase (anti-clobber)', () => {
  const mockRead = vi.mocked(readJsonFile);
  const mockWrite = vi.mocked(writeJsonFile);

  // Drive falso: a leitura devolve o conteúdo atual; a escrita o substitui.
  let store: Database;

  beforeEach(async () => {
    vi.clearAllMocks();
    store = { version: 1, writer: 'init', items: [], recordings: [], ideas: [] };
    mockRead.mockImplementation(async () => clone(store) as never);
    mockWrite.mockImplementation(async (_id: string, content: unknown) => {
      store = clone(content as Database);
    });
    // sincroniza o lastKnownVersion do módulo com o "remoto" inicial
    await loadDatabase('db');
  });

  it('sem concorrência: grava uma vez e retorna o estado local', async () => {
    const result = await saveDatabase('db', [item('a', '2026-01-01')], [], []);

    expect(result.items.map((i) => i.id)).toEqual(['a']);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(store.version).toBe(2);
  });

  it('clobber detectado: incorpora a escrita do outro membro e regrava', async () => {
    // logo após a 1ª escrita, outro membro sobrescreve com a SUA versão (item 'b')
    let writes = 0;
    mockWrite.mockImplementation(async (_id: string, content: unknown) => {
      store = clone(content as Database);
      writes += 1;
      if (writes === 1) {
        store = {
          version: store.version + 1,
          writer: 'outro-membro',
          items: [item('b', '2026-01-01')],
          recordings: [],
          ideas: [],
        };
      }
    });

    const result = await saveDatabase('db', [item('a', '2026-01-02')], [], []);

    // nossa edição ('a') e a do outro membro ('b') sobrevivem
    expect(result.items.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(store.items.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(mockWrite).toHaveBeenCalledTimes(2);
    expect(store.writer).not.toBe('outro-membro');
  });

  it('falha na releitura: grava mesmo assim sem lançar', async () => {
    mockRead.mockRejectedValue(new Error('rede'));

    const result = await saveDatabase('db', [item('a', '2026-01-01')], [], []);

    expect(result.items.map((i) => i.id)).toEqual(['a']);
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });
});
