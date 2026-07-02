# Agenda de gravações — Design

Data: 2026-06-17

## Objetivo

Nova página "Agenda de gravações" para planejar gravações de conteúdo antes de
elas entrarem no pipeline de produção. Uma gravação planejada, quando marcada
como gravada, vira um `ContentItem` (vídeo cru) e abre direto o upload do vídeo
bruto.

## Contexto do projeto

- React + Zustand + framer-motion, em português.
- Sem router: navegação por estado dentro de `Dashboard` (ex.: `showTrash`).
- Banco de dados é um único `db.json` no Google Drive, com controle de versão
  otimista (`version` + merge por `updatedAt`). Ver `src/services/database.ts`.

## 1. Modelo de dados

Em `src/types.ts`:

```ts
export type RecordingStatus = 'planned' | 'recorded' | 'canceled';

export interface Recording {
  id: string;
  title: string;
  scheduledAt: string;   // ISO com data + hora
  location?: string;     // local da gravação
  script?: string;       // roteiro / ideia (texto longo)
  status: RecordingStatus;
  linkedItemId?: string; // ContentItem criado quando marcada como gravada
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;    // soft delete (opcional)
}
```

`Database` ganha `recordings: Recording[]`. Na carga usa-se `db.recordings ?? []`,
então `db.json` antigo continua válido sem migração.

Helper `newRecording(title, scheduledAt)` no padrão de `newContentItem`.

## 2. Persistência no Drive (ponto crítico)

O banco é um arquivo único com um único contador `version`. Toda gravação tem
que ser atômica sobre as duas coleções (`items` e `recordings`), senão uma
escrita que conheça só uma delas apagaria a outra.

- `loadDatabase` devolve `{ version, items, recordings }`.
- `saveDatabase(dbFileId, items, recordings)` recebe e grava **as duas coleções
  juntas**, sempre. No conflito de versão, faz merge independente:
  `mergeItems` + novo `mergeRecordings` (mesmo critério: `updatedAt` mais
  recente vence). Grava `{ version+1, items, recordings }`.
- No store (`useStore.ts`), o mutex `persist` passa a ler `get().items` e
  `get().recordings` e a mandar ambos a cada escrita. Toda alteração — de item
  ou de gravação — persiste o par completo.
- `mergeItems` reutilizado; `mergeRecordings` é análogo.

O `version` continua único para o arquivo; o merge por coleção resolve edições
concorrentes da equipe.

### Store: estado e ações

- Estado novo: `recordings: Recording[]`.
- `createRecording(input)`, `updateRecording(id, patch)`, `deleteRecording(id)`
  (soft delete), `cancelRecording(id)`.
- `markRecordingAsRecorded(id)`: ver seção 3.
- `mutate` é generalizado (ou ganha um par) para aplicar updaters tanto a
  `items` quanto a `recordings`, sempre persistindo o par completo.

## 3. Transição "gravada → conteúdo"

`markRecordingAsRecorded(recordingId)`:

1. Cria um `ContentItem` (vídeo cru) via `newContentItem`, herdando `title` e
   usando `script` como `notes`.
2. Persiste numa única escrita: novo item entra em `items` e a gravação vira
   `status: 'recorded'` + `linkedItemId` apontando para o item.
3. Retorna o `id` do item criado. A view abre o upload do vídeo cru desse item,
   reaproveitando o caminho existente (`DetailPanel` / `uploadToItem(itemId,
   'raw', file)`).

Regras:
- Cancelar uma gravação já gravada não apaga o `ContentItem` (ele já vive no
  pipeline).
- Editar gravação só enquanto `planned`.

## 4. View — RecordingAgenda

Novo `src/views/RecordingAgenda.tsx` + `RecordingModal` em `src/components/`
(padrão de `NewItemModal`). Lista agrupada por data:

- **Atrasadas** — `planned` com `scheduledAt` no passado (destaque de alerta).
- **Hoje** — `planned` agendadas para hoje.
- **Próximas** — `planned` futuras, ordem crescente.
- **Gravadas** / **Canceladas** — seções de histórico ao fim.

Cada linha: título, data/hora, local, trecho do roteiro, e ações — marcar como
gravada, editar, cancelar, excluir. Botão "+ Nova gravação" abre o
`RecordingModal`. Reaproveita classes do `index.css` para manter identidade
visual.

## 5. Navegação

Estado novo em `Dashboard`: alternância `studio | agenda` (padrão do
`showTrash`). Botão "Agenda" na topbar (desktop) e item na nav inferior
(mobile). Ao abrir a agenda, esconde board/lista do estúdio.

## Fora de escopo

- Calendário mensal (escolhido lista por data).
- Notificações/lembretes.
- Arquivo separado no Drive para gravações.
