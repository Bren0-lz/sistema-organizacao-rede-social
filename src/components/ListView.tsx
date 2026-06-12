import { useEffect, useMemo, useState } from 'react';
import {
  itemStage,
  NETWORKS,
  type ContentItem,
  type Stage,
} from '../types';
import { useStore } from '../store/useStore';
import { useInView } from '../lib/concurrency';
import { NetworkIcon } from './NetworkIcon';

const STAGE_META: Record<Stage, { label: string; emoji: string; color: string }> = {
  raw: { label: 'Cru', emoji: '🎬', color: 'var(--st-raw)' },
  edited: { label: 'Editado', emoji: '✂️', color: 'var(--st-edited)' },
  ready: { label: 'Sem programação', emoji: '⬜', color: 'var(--st-ready)' },
  scheduled: { label: 'Programado', emoji: '📅', color: 'var(--st-scheduled)' },
  posted: { label: 'Postado', emoji: '✅', color: 'var(--st-posted)' },
};

const STAGE_ORDER: Record<Stage, number> = {
  raw: 0,
  edited: 1,
  ready: 2,
  scheduled: 3,
  posted: 4,
};

type SortKey = 'title' | 'updated' | 'stage';
type SortDir = 'asc' | 'desc';

interface Props {
  items: ContentItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  onOpen: (id: string) => void;
}

function LazyThumb({ fileId }: { fileId?: string }) {
  const coverUrls = useStore((s) => s.coverUrls);
  const loadCover = useStore((s) => s.loadCover);
  const { ref, inView } = useInView<HTMLDivElement>();
  const url = fileId ? coverUrls[fileId] : undefined;

  useEffect(() => {
    if (inView && fileId) void loadCover(fileId);
  }, [inView, fileId, loadCover]);

  return (
    <div className="row-thumb" ref={ref}>
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span className="row-thumb-ph">{fileId ? '⏳' : '🖼️'}</span>
      )}
    </div>
  );
}

export function ListView({ items, selected, onToggle, onToggleAll, onOpen }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      let cmp: number;
      if (sortKey === 'title') cmp = a.title.localeCompare(b.title);
      else if (sortKey === 'updated') cmp = a.updatedAt.localeCompare(b.updatedAt);
      else cmp = STAGE_ORDER[itemStage(a)] - STAGE_ORDER[itemStage(b)];
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [items, sortKey, sortDir]);

  const allIds = useMemo(() => sorted.map((i) => i.id), [sorted]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'title' ? 'asc' : 'desc');
    }
  };

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  return (
    <div className="list-wrap">
      <table className="list-table">
        <thead>
          <tr>
            <th className="col-check">
              <input
                type="checkbox"
                checked={allSelected}
                aria-label="Selecionar todos"
                onChange={(e) => onToggleAll(allIds, e.target.checked)}
              />
            </th>
            <th className="col-thumb"></th>
            <th className="col-title sortable" onClick={() => toggleSort('title')}>
              Título{arrow('title')}
            </th>
            <th className="col-nets">Redes</th>
            <th className="col-files">Arquivos</th>
            <th className="col-stage sortable" onClick={() => toggleSort('stage')}>
              Estágio{arrow('stage')}
            </th>
            <th className="col-date sortable" onClick={() => toggleSort('updated')}>
              Atualizado{arrow('updated')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const stage = itemStage(item);
            const meta = STAGE_META[stage];
            const isSel = selected.has(item.id);
            return (
              <tr
                key={item.id}
                className={isSel ? 'selected' : ''}
                onClick={() => onOpen(item.id)}
              >
                <td className="col-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSel}
                    aria-label={`Selecionar ${item.title}`}
                    onChange={() => onToggle(item.id)}
                  />
                </td>
                <td className="col-thumb">
                  <LazyThumb fileId={item.coverFileId} />
                </td>
                <td className="col-title">
                  <span className="row-title">{item.title}</span>
                </td>
                <td className="col-nets">
                  <div className="row-nets">
                    {NETWORKS.filter((n) => item.networks[n].assigned).map((n) => (
                      <span key={n} className="net-badge" data-status={item.networks[n].status}>
                        <NetworkIcon network={n} />
                      </span>
                    ))}
                  </div>
                </td>
                <td className="col-files">
                  <span className="file-pips" title="cru / editado / capa">
                    <span className={`pip ${item.rawVideoFileId ? 'on-raw' : ''}`} />
                    <span className={`pip ${item.editedVideoFileId ? 'on-edited' : ''}`} />
                    <span className={`pip ${item.coverFileId ? 'on-cover' : ''}`} />
                  </span>
                </td>
                <td className="col-stage">
                  <span className="stage-tag" style={{ color: meta.color }}>
                    {meta.emoji} {meta.label}
                  </span>
                </td>
                <td className="col-date">
                  {new Date(item.updatedAt).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length === 0 && <div className="list-empty">nada por aqui</div>}
    </div>
  );
}
