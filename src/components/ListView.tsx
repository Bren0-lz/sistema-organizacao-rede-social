import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import {
  isAutoPostedFromSchedule,
  itemStage,
  itemType,
  NETWORKS,
  STAGE_ORDER,
  thumbSourceFor,
  type ContentItem,
} from '../types';
import { useStore } from '../store/useStore';
import { formatDate } from '../lib/dates';
import { useInView } from '../lib/concurrency';
import { NetworkIcon } from './NetworkIcon';
import { StageIcon } from './StageIcon';
import { Icon } from './Icon';
import { RowTrail } from './RowTrail';
import { STAGE_COLORS, itemStageLabel } from '../lib/journey';

type SortKey = 'title' | 'updated' | 'stage';
type SortDir = 'asc' | 'desc';

/** Altura estimada de uma linha (px) — alimenta o virtualizador. */
const ROW_HEIGHT = 49;
/** Linhas extras renderizadas acima/abaixo da viewport, para o scroll não "piscar". */
const ROW_OVERSCAN = 8;

interface Props {
  items: ContentItem[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

function LazyThumb({
  fileId,
  fromVideo = false,
  isCarousel,
}: {
  fileId?: string;
  fromVideo?: boolean;
  isCarousel: boolean;
}) {
  // assina só a URL desta capa — não o mapa inteiro — senão cada capa que
  // carrega re-renderiza todas as linhas visíveis (o grande causador de travamento)
  const url = useStore((s) => (fileId ? s.coverUrls[fileId] : undefined));
  const loadCover = useStore((s) => s.loadCover);
  const { ref, inView } = useInView<HTMLDivElement>();

  useEffect(() => {
    if (inView && fileId) void loadCover(fileId, { thumbnailOnly: fromVideo });
  }, [inView, fileId, fromVideo, loadCover]);

  return (
    <div className="row-thumb" ref={ref} data-type={isCarousel ? 'carousel' : 'video'}>
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <span className="row-thumb-ph">
          <Icon name={!fromVideo && fileId ? 'hourglass' : isCarousel ? 'carousel' : 'video'} />
        </span>
      )}
      <span className="row-type-badge" title={isCarousel ? 'Carrossel' : 'Vídeo'} aria-hidden>
        <Icon name={isCarousel ? 'carousel' : 'video'} />
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
  onDelete,
}: {
  item: ContentItem;
  index: number;
  isSel: boolean;
  measureElement: (el: HTMLElement | null) => void;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const stage = itemStage(item);
  const isCarousel = itemType(item) === 'carousel';
  const thumb = thumbSourceFor(item);
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
        <LazyThumb fileId={thumb?.fileId} fromVideo={thumb?.fromVideo} isCarousel={isCarousel} />
      </td>
      <td className="col-title">
        <span className="row-title">{item.title}</span>
        <span className="row-title-tags">
          <span className="row-type" data-type={isCarousel ? 'carousel' : 'video'}>
            <Icon name={isCarousel ? 'carousel' : 'video'} /> {isCarousel ? 'Carrossel' : 'Vídeo'}
          </span>
          {isCarousel && item.carouselEditedAt && (
            <span className="row-edited-badge" title="Carrossel marcado como editado">
              <Icon name="check" /> editado
            </span>
          )}
          {(item.tags ?? []).map((tag) => (
            <span key={tag} className="row-tag">
              #{tag}
            </span>
          ))}
        </span>
      </td>
      <td className="col-nets">
        <div className="row-nets">
          {NETWORKS.filter((n) => item.networks[n].assigned).map((n) => (
            <span
              key={n}
              className="net-badge"
              data-status={
                isAutoPostedFromSchedule(n, item.networks[n]) ? 'posted' : item.networks[n].status
              }
            >
              <NetworkIcon network={n} />
            </span>
          ))}
        </div>
      </td>
      <td className="col-files">
        <RowTrail item={item} />
      </td>
      <td className="col-stage">
        <span className="stage-tag" style={{ color: STAGE_COLORS[stage] }}>
          <StageIcon stage={stage} /> {itemStageLabel(item)}
        </span>
      </td>
      <td className="col-date">{formatDate(item.updatedAt)}</td>
      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
        {confirming ? (
          <span className="row-delete-confirm">
            <button
              className="btn btn-danger btn-sm"
              title={`Mover ${item.title} para a lixeira`}
              onClick={() => {
                onDelete(item.id);
                setConfirming(false);
              }}
            >
              Lixeira
            </button>
            <button
              className="btn btn-ghost btn-sm"
              title="Cancelar"
              onClick={() => setConfirming(false)}
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            className="btn btn-ghost btn-sm row-delete-btn"
            aria-label={`Excluir ${item.title}`}
            title="Mover para a lixeira"
            onClick={() => setConfirming(true)}
          >
            <Icon name="trash" />
          </button>
        )}
      </td>
    </tr>
  );
});

export function ListView({ items, selected, onToggle, onToggleAll, onOpen, onDelete }: Props) {
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
    estimateSize: () => ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
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
            <th className="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr className="row-spacer" aria-hidden>
              <td colSpan={8} style={{ height: paddingTop }} />
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
                onDelete={onDelete}
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
