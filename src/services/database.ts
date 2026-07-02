// Persistência do banco de metadados (db.json) no Drive, com controle de
// versão otimista: antes de gravar, relê o remoto; se mudou desde a última
// leitura, faz merge por item (updatedAt mais recente vence) e grava o resultado.
//
// O arquivo é único e tem um único contador `version`, então cada gravação é
// atômica sobre as duas coleções (items e recordings): sempre escrevemos as
// duas juntas, senão uma escrita que conheça só uma delas apagaria a outra.

import { readJsonFile, writeJsonFile } from './drive';
import type { ContentItem, Database, Idea, Recording } from '../types';

let lastKnownVersion = 0;

export async function loadDatabase(dbFileId: string): Promise<Database> {
  const db = await readJsonFile<Database>(dbFileId);
  lastKnownVersion = db.version ?? 0;
  return {
    version: lastKnownVersion,
    items: db.items ?? [],
    recordings: db.recordings ?? [],
    ideas: db.ideas ?? [],
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

export function mergeIdeas(local: Idea[], remote: Idea[]): Idea[] {
  const byId = new Map<string, Idea>();
  for (const idea of remote) byId.set(idea.id, idea);
  for (const idea of local) {
    const other = byId.get(idea.id);
    if (!other || idea.updatedAt >= other.updatedAt) byId.set(idea.id, idea);
  }
  return [...byId.values()];
}

/** Limite de tentativas do laço de gravação com verificação (anti-clobber). */
const MAX_SAVE_ATTEMPTS = 4;

type SavePayload = { items: ContentItem[]; recordings: Recording[]; ideas: Idea[] };

/** Mescla as três coleções de um payload contra um snapshot remoto. */
function mergeWithRemote(local: SavePayload, remote: Partial<Database>): SavePayload {
  return {
    items: mergeItems(local.items, remote.items ?? []),
    recordings: mergeRecordings(local.recordings, remote.recordings ?? []),
    ideas: mergeIdeas(local.ideas, remote.ideas ?? []),
  };
}

/**
 * Grava itens, gravações e ideias no db.json (sempre as três coleções juntas).
 * Retorna o que foi efetivamente gravado (pode incluir alterações de outro
 * membro da equipe após merge).
 *
 * O Drive não oferece escrita condicional, então não dá para impedir que outro
 * membro sobrescreva nossa gravação. Para detectar isso, marcamos cada escrita
 * com um `writer` único e RELEMOS logo depois: se o `writer` lido não é o nosso,
 * alguém gravou por cima — incorporamos o estado dele (merge, com nossas mudanças
 * vencendo por `updatedAt`) e regravamos, em laço curto. A `version` sozinha não
 * basta porque dois clientes que leram a mesma versão gravam o mesmo número.
 *
 * Custo: uma leitura extra por gravação (read→write→read). Como os saves são
 * disparados por ação do usuário (baixa frequência), é aceitável.
 */
export async function saveDatabase(
  dbFileId: string,
  items: ContentItem[],
  recordings: Recording[],
  ideas: Idea[],
): Promise<SavePayload> {
  let payload: SavePayload = { items, recordings, ideas };

  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    // 1. relê e mescla se a versão remota avançou desde a última leitura conhecida
    try {
      const remote = await readJsonFile<Database>(dbFileId);
      if ((remote.version ?? 0) > lastKnownVersion) {
        payload = mergeWithRemote(payload, remote);
      }
      lastKnownVersion = Math.max(lastKnownVersion, remote.version ?? 0);
    } catch {
      // releitura indisponível (rede): grava o estado local sem verificação
      await writeDb(dbFileId, payload, crypto.randomUUID());
      return payload;
    }

    // 2. grava marcando a escrita com um nonce único
    const writer = crypto.randomUUID();
    await writeDb(dbFileId, payload, writer);

    // 3. relê e verifica se a NOSSA escrita venceu
    let check: Database;
    try {
      check = await readJsonFile<Database>(dbFileId);
    } catch {
      // não deu para verificar: assume melhor-esforço e segue
      return payload;
    }
    if (check.writer === writer) return payload;

    // alguém gravou por cima: incorpora o conteúdo dele e tenta de novo
    payload = mergeWithRemote(payload, check);
    lastKnownVersion = Math.max(lastKnownVersion, check.version ?? 0);
  }

  // esgotou as tentativas: a última escrita permanece (melhor-esforço)
  return payload;
}

/** Escreve o db.json com a próxima versão e o nonce de escritor informado. */
async function writeDb(dbFileId: string, payload: SavePayload, writer: string): Promise<void> {
  const db: Database = {
    version: lastKnownVersion + 1,
    writer,
    items: payload.items,
    recordings: payload.recordings,
    ideas: payload.ideas,
  };
  await writeJsonFile(dbFileId, db);
  lastKnownVersion = db.version;
}
