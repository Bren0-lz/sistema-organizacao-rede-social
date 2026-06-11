// Persistência do banco de metadados (db.json) no Drive, com controle de
// versão otimista: antes de gravar, relê o remoto; se mudou desde a última
// leitura, faz merge por item (updatedAt mais recente vence) e grava o resultado.

import { readJsonFile, writeJsonFile } from './drive';
import type { ContentItem, Database } from '../types';

let lastKnownVersion = 0;

export async function loadDatabase(dbFileId: string): Promise<Database> {
  const db = await readJsonFile<Database>(dbFileId);
  lastKnownVersion = db.version ?? 0;
  return { version: lastKnownVersion, items: db.items ?? [] };
}

function mergeItems(local: ContentItem[], remote: ContentItem[]): ContentItem[] {
  const byId = new Map<string, ContentItem>();
  for (const item of remote) byId.set(item.id, item);
  for (const item of local) {
    const other = byId.get(item.id);
    if (!other || item.updatedAt >= other.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

/**
 * Grava os itens no db.json. Retorna os itens efetivamente gravados
 * (podem incluir alterações de outro membro da equipe após merge).
 */
export async function saveDatabase(
  dbFileId: string,
  items: ContentItem[],
): Promise<ContentItem[]> {
  let toWrite = items;
  try {
    const remote = await readJsonFile<Database>(dbFileId);
    if ((remote.version ?? 0) > lastKnownVersion) {
      toWrite = mergeItems(items, remote.items ?? []);
    }
    lastKnownVersion = Math.max(lastKnownVersion, remote.version ?? 0);
  } catch {
    // se a releitura falhar, grava o estado local mesmo assim
  }
  const db: Database = { version: lastKnownVersion + 1, items: toWrite };
  await writeJsonFile(dbFileId, db);
  lastKnownVersion = db.version;
  return toWrite;
}
