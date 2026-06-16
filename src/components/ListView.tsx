import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import {
  coverFileIdFor,
  itemStage,
  itemType,
  NETWORKS,
  STAGE_ORDER,
  type ContentItem,
} from '../types';
import { useStore } from '../store/useStore';
import { useInView } from '../lib/concurrency';
import { NetworkIcon } from './NetworkIcon';
import { StageIcon } from './StageIcon';
import { TrailMini } from './TrailMini';
import { STAGE_COLORS, STAGE_LABELS } from '../lib/journey';

type SortKey = 'title' | 'updated' | 'stage';
type SortDir = 'asc' | 'desc';

interface Props {
  items: ContentItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  onOpen: (id: string) => void;
}

function LazyThumb({ fileId, isCarousel }: { fileId?: string; isCarousel: boolean }) {
  // assina só a URL desta capa — não o mapa inteiro — senão cada capa que
  // carrega re-renderiza todas as linhas visíveis (o grande causador de travamento)
  const url = useStore((s) => (fileId ? s.coverUrls[fileId] : undefined));
  const loadCover = useStore((s) => s.loadCover);
  const { ref, inView } = useInView<HTMLDivElement>();

  useEffect(() => {
    if (inView && fileId) void loadCover(fileId);
  }, [inView, fileId, loadCover]);

  return (
    <div className="row-thumb" ref={ref} data-type={isCarousel ? 'carousel' : 'video'}>
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span className="row-thumb-ph">{fileId ? '⏳' : isCarousel ? '🖼️' : '🎬'}</span>
      )}
      <span className="row-type-badge" title={isCarousel ? 'Carrossel' : 'Vídeo'} aria-hidden>
        {isCarousel ? '🖼️' : '🎬'}
      </span>
    </div>
  );
}

/**
 * Linha memoizada: só re-renderiza quando o próprio item, sua seleção ou as
 * callbacks mudam. Sem isso, qualquer mudança na ListView (ordenar, selecionar
 * uma linha, rolar) re-renderiza todas as linhas visíveis.
 */
const ListRow = memo(function ListRow({
  item,
  index,
  isSel,
  measureElement,
  onToggle,
  onOpen,
}: {
  item: ContentItem;
  index: number;
  isSel: boolean;
  measureElement: (el: HTMLElement | null) => void;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const stage = itemStage(item);
  const isCarousel = itemType(item) === 'carousel';
  return (
    <tr
      data-index={index}
      ref={measureElement}
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
        <LazyThumb fileId={coverFileIdFor(item)} isCarousel={isCarousel} />
      </td>
      <td className="col-title">
        <span className="row-title">{item.title}</span>
        <span className="row-type" data-type={isCarousel ? 'carousel' : 'video'}>
          {isCarousel ? '🖼️ Carrossel' : '🎬 Vídeo'}
        </span>
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
        <TrailMini item={item} />
      </td>
      <td className="col-stage">
        <span className="stage-tag" style={{ color: STAGE_COLORS[stage] }}>
          <StageIcon stage={stage} /> {STAGE_LABELS[stage]}
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
});

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

  // virtualização: renderiza só as linhas visíveis. O scroll é o da janela
  // (a página inteira rola), então usamos o window virtualizer com scrollMargin
  // igual ao deslocamento da tabela no topo do documento.
  const listRef = useRef<HTMLDivElement>(null);
  const [listTop, setListTop] = useState(0);

  // mede o deslocamento da tabela (muda se topbar/filtros mudarem de altura,
  // ou no resize da janela) — fora do render, como exige o react-hooks/refs
  useLayoutEffect(() => {
    const measure = () => setListTop(listRef.current?.offsetTop ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const rowVirtualizer = useWindowVirtualizer({
    count: sorted.length,
    estimateSize: () => 49,
    overscan: 8,
    scrollMargin: listTop,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const scrollMargin = rowVirtualizer.options.scrollMargin;
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMargin : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1].end - scrollMargin)
      : 0;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'title' ? 'asc' : 'desc');
    }
  };

  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  return (
    <div className="list-wrap" ref={listRef}>
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
            <th className="col-files">Progresso</th>
            <th className="col-stage sortable" onClick={() => toggleSort('stage')}>
              Estágio{arrow('stage')}
            </th>
            <th className="col-date sortable" onClick={() => toggleSort('updated')}>
              Atualizado{arrow('updated')}
            </th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr className="row-spacer" aria-hidden>
              <td colSpan={7} style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const item = sorted[virtualRow.index];
            return (
              <ListRow
                key={item.id}
                item={item}
                index={virtualRow.index}
                isSel={selected.has(item.id)}
                measureElement={rowVirtualizer.measureElement}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            );
          })}
          {paddingBottom > 0 && (
            <tr className="row-spacer" aria-hidden>
              <td colSpan={7} style={{ height: paddingBottom }} />
            </tr>
          )}
        </tbody>
      </table>
      {sorted.length === 0 && <div className="list-empty">nada por aqui</div>}
    </div>
  );
}
