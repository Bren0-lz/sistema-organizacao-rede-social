import { describe, it, expect, vi, beforeEach } from 'vitest';

// Todos os serviços são mockados: sem rede. Como o estado de teste não tem
// `folders`, a persistência (persist) retorna cedo e só exercitamos a lógica
// otimista de estado das actions.
vi.mock('../services/googleAuth', () => ({
  hasValidYoutubeToken: () => false,
}));
vi.mock('../services/drive', () => ({}));
vi.mock('../services/database', () => ({}));
vi.mock('../services/youtube', () => ({}));
vi.mock('../services/googleCalendar', () => ({
  // rejeita para que syncRecordingEvent caia no catch e não mexa no estado.
  createRecordingEvent: vi.fn().mockRejectedValue(new Error('sem rede')),
  updateRecordingEvent: vi.fn().mockRejectedValue(new Error('sem rede')),
  deleteRecordingEvent: vi.fn().mockRejectedValue(new Error('sem rede')),
}));

import { useStore } from './useStore';

const initial = useStore.getState();

beforeEach(() => {
  // zera as coleções entre testes (mantém as actions do store)
  useStore.setState({ ...initial, items: [], recordings: [], ideas: [], folders: undefined });
});

describe('createItem / updateItem / deleteItem', () => {
  it('cria um item no topo da lista', async () => {
    const item = await useStore.getState().createItem('Novo vídeo', 'anotação');
    const { items } = useStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(item.id);
    expect(items[0].title).toBe('Novo vídeo');
    expect(items[0].notes).toBe('anotação');
  });

  it('atualiza um item existente e renova updatedAt', async () => {
    const item = await useStore.getState().createItem('Original');
    const before = useStore.getState().items[0].updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await useStore.getState().updateItem(item.id, { title: 'Editado' });
    const updated = useStore.getState().items[0];
    expect(updated.title).toBe('Editado');
    expect(updated.updatedAt >= before).toBe(true);
  });

  it('deleteItem faz soft delete (marca deletedAt, não remove da lista)', async () => {
    const item = await useStore.getState().createItem('Para lixeira');
    await useStore.getState().deleteItem(item.id);
    const stored = useStore.getState().items[0];
    expect(stored.deletedAt).toBeTruthy();
  });
});

describe('setNetwork / bulkSetNetwork', () => {
  it('atribui e programa uma rede de um item', async () => {
    const item = await useStore.getState().createItem('Com rede');
    await useStore.getState().setNetwork(item.id, 'instagram', {
      assigned: true,
      status: 'scheduled',
      scheduledAt: '2999-01-01T00:00:00Z',
    });
    const net = useStore.getState().items[0].networks.instagram;
    expect(net.assigned).toBe(true);
    expect(net.status).toBe('scheduled');
  });

  it('bulkSetNetwork aplica o mesmo patch a vários itens', async () => {
    const a = await useStore.getState().createItem('A');
    const b = await useStore.getState().createItem('B');
    await useStore.getState().bulkSetNetwork([a.id, b.id], 'tiktok', { assigned: true });
    const items = useStore.getState().items;
    expect(items.every((i) => i.networks.tiktok.assigned)).toBe(true);
  });
});

describe('ideas', () => {
  it('cria, atualiza e remove (soft) uma ideia', async () => {
    const idea = await useStore.getState().createIdea('Ideia 1', 'nota');
    expect(useStore.getState().ideas[0].title).toBe('Ideia 1');

    await useStore.getState().updateIdea(idea.id, { title: 'Ideia editada' });
    expect(useStore.getState().ideas[0].title).toBe('Ideia editada');

    await useStore.getState().deleteIdea(idea.id);
    expect(useStore.getState().ideas[0].deletedAt).toBeTruthy();
  });

  it('convertIdeaToItem cria um item e marca a ideia como removida', async () => {
    const idea = await useStore.getState().createIdea('Virar conteúdo');
    const itemId = await useStore.getState().convertIdeaToItem(idea.id);
    expect(itemId).toBeTruthy();
    expect(useStore.getState().items.some((i) => i.id === itemId)).toBe(true);
    expect(useStore.getState().ideas[0].deletedAt).toBeTruthy();
  });
});

describe('recordings', () => {
  it('cria uma gravação planejada', async () => {
    const rec = await useStore.getState().createRecording({
      title: 'Gravar entrevista',
      scheduledAt: '2026-07-01T15:00:00Z',
    });
    const stored = useStore.getState().recordings[0];
    expect(stored.id).toBe(rec.id);
    expect(stored.status).toBe('planned');
  });

  it('markRecordingAsRecorded cria um item vinculado e marca como gravada', async () => {
    const rec = await useStore.getState().createRecording({
      title: 'Vlog',
      scheduledAt: '2026-07-01T15:00:00Z',
      script: 'roteiro do vlog',
    });
    const itemId = await useStore.getState().markRecordingAsRecorded(rec.id);
    expect(itemId).toBeTruthy();
    const item = useStore.getState().items.find((i) => i.id === itemId);
    expect(item?.notes).toBe('roteiro do vlog');
    const updated = useStore.getState().recordings.find((r) => r.id === rec.id);
    expect(updated?.status).toBe('recorded');
    expect(updated?.linkedItemId).toBe(itemId);
  });

  it('não regrava uma gravação que não está planejada', async () => {
    const rec = await useStore.getState().createRecording({
      title: 'X',
      scheduledAt: '2026-07-01T15:00:00Z',
    });
    await useStore.getState().cancelRecording(rec.id);
    const result = await useStore.getState().markRecordingAsRecorded(rec.id);
    expect(result).toBeUndefined();
  });
});

describe('reconcileScheduledPosts', () => {
  it('publica redes com horário vencido', async () => {
    const item = await useStore.getState().createItem('Agendado no passado');
    await useStore.getState().setNetwork(item.id, 'instagram', {
      assigned: true,
      status: 'scheduled',
      scheduledAt: '2000-01-01T00:00:00Z',
    });
    await useStore.getState().reconcileScheduledPosts();
    expect(useStore.getState().items[0].networks.instagram.status).toBe('posted');
  });
});
