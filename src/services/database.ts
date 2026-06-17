// Persistência do banco de metadados (db.json) no Drive, com controle de
// versão otimista: antes de gravar, relê o remoto; se mudou desde a última
// leitura, faz merge por item (updatedAt mais recente vence) e grava o resultado.
//
// O arquivo é único e tem um único contador `version`, então cada gravação é
// atômica sobre as duas coleções (items e recordings): sempre escrevemos as
// duas juntas, senão uma escrita que conheça só uma delas apagaria a outra.

import { readJsonFile, writeJsonFile } from './drive';
import type { ContentItem, Database, Recording } from '../types';

let lastKnownVersion = 0;

export async function loadDatabase(dbFileId: string): Promise<Database> {
  const db = await readJsonFile<Database>(dbFileId);
  lastKnownVersion = db.version ?? 0;
  return {
    version: lastKnownVersion,
    items: db.items ?? [],
    recordings: db.recordings ?? [],
  };
}

export function mergeItems(local: ContentItem[], remote: ContentItem[]): ContentItem[] {
  const byId = new Map<string, ContentItem>();
  for (const item of remote) byId.set(item.id, item);
  for (const item of local) {
    const other = byId.get(item.id);
    if (!other || item.updatedAt >= other.updatedAt) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function mergeRecordings(local: Recording[], remote: Recording[]): Recording[] {
  const byId = new Map<string, Recording>();
  for (const rec of remote) byId.set(rec.id, rec);
  for (const rec of local) {
    const other = byId.get(rec.id);
    if (!other || rec.updatedAt >= other.updatedAt) byId.set(rec.id, rec);
  }
  return [...byId.values()];
}

/**
 * Grava itens e gravações no db.json (sempre as duas coleções juntas). Retorna
 * o que foi efetivamente gravado (pode incluir alterações de outro membro da
 * equipe após merge).
 */
export async function saveDatabase(
  dbFileId: string,
  items: ContentItem[],
  recordings: Recording[],
): Promise<{ items: ContentItem[]; recordings: Recording[] }> {
  let itemsToWrite = items;
  let recordingsToWrite = recordings;
  try {
    const remote = await readJsonFile<Database>(dbFileId);
    if ((remote.version ?? 0) > lastKnownVersion) {
      itemsToWrite = mergeItems(items, remote.items ?? []);
      recordingsToWrite = mergeRecordings(recordings, remote.recordings ?? []);
    }
    lastKnownVersion = Math.max(lastKnownVersion, remote.version ?? 0);
  } catch {
    // se a releitura falhar, grava o estado local mesmo assim
  }
  const db: Database = {
    version: lastKnownVersion + 1,
    items: itemsToWrite,
    recordings: recordingsToWrite,
  };
  await writeJsonFile(dbFileId, db);
  lastKnownVersion = db.version;
  return { items: itemsToWrite, recordings: recordingsToWrite };
}
