import { type WheelEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  coverFileIdFor,
  itemStage,
  itemType,
  NETWORK_LABELS,
  NETWORKS,
  type ContentItem,
  type Network,
  type Stage,
} from '../types';
import { useStore } from '../store/useStore';
import { ContentCard } from '../components/ContentCard';
import { ListView } from '../components/ListView';
import { TrashView } from '../components/TrashView';
import { CalendarView } from './CalendarView';
import { IdeasView } from './IdeasView';
import { BulkActionBar } from '../components/BulkActionBar';
import { DetailPanel } from '../components/DetailPanel';
import { NewItemModal, SettingsModal } from '../components/Modals';
import { BulkUploadModal } from '../components/BulkUploadModal';
import { UploadToasts } from '../components/UploadToasts';
import { NetworkIcon } from '../components/NetworkIcon';
import { StageIcon } from '../components/StageIcon';
import { Icon, type IconName } from '../components/Icon';
import { STAGE_COLORS, STAGE_LABELS } from '../lib/journey';

type CarouselFilter = 'carousel' | 'carousel-raw' | 'carousel-ready';
type Filter = 'all' | 'raw' | 'edited' | CarouselFilter | Network;
type ViewMode = 'board' | 'list';

const STAGE_FILTERS: {
  filter: 'raw' | 'edited' | CarouselFilter;
  icon: IconName;
  label: string;
}[] = [
  { filter: 'raw', icon: 'video', label: 'Vídeos crus' },
  { filter: 'edited', icon: 'scissors', label: 'Vídeos editados' },
  { filter: 'carousel', icon: 'carousel', label: 'Carrosséis' },
  { filter: 'carousel-raw', icon: 'carousel', label: 'Carrosséis crus' },
  { filter: 'carousel-ready', icon: 'check', label: 'Carrosséis prontos' },
];

/** Um item passa pelo filtro de carrossel (geral, cru ou pronto para postar)? */
function matchesCarouselFilter(item: ContentItem, filter: CarouselFilter): boolean {
  if (itemType(item) !== 'carousel') return false;
  if (filter === 'carousel-raw') return !item.carouselEditedAt;
  if (filter === 'carousel-ready') return !!item.carouselEditedAt;
  return true;
}

type MissingFilter = 'cover' | 'edited';

/** Item está sem a "etapa final" (vídeo editado ou carrossel marcado como editado)? */
function isMissingEdited(item: ContentItem): boolean {
  return itemType(item) === 'carousel' ? !item.carouselEditedAt : !item.editedVideoFileId;
}

/** Item passa pelo filtro de "arquivo faltando" selecionado? */
function matchesMissing(item: ContentItem, missing: MissingFilter): boolean {
  return missing === 'cover' ? !coverFileIdFor(item) : isMissingEdited(item);
}

const STAGES: { stage: Stage; title: string; color: string }[] = [
  { stage: 'raw', title: STAGE_LABELS.raw, color: STAGE_COLORS.raw },
  { stage: 'edited', title: STAGE_LABELS.edited, color: STAGE_COLORS.edited },
  { stage: 'ready', title: STAGE_LABELS.ready, color: STAGE_COLORS.ready },
  { stage: 'scheduled', title: STAGE_LABELS.scheduled, color: STAGE_COLORS.scheduled },
  { stage: 'posted', title: STAGE_LABELS.posted, color: STAGE_COLORS.posted },
];

/** Estágio do item sob a ótica de UMA rede específica. */
function stageForNetwork(item: ContentItem, network: Network): Stage | null {
  const ns = item.networks[network];
  if (!ns.assigned) return null;
  if (ns.status === 'posted') return 'posted';
  if (ns.status === 'scheduled') return 'scheduled';
  return 'ready';
}

function nextScheduledAt(item: ContentItem): string {
  const dates = NETWORKS.map((network) => item.networks[network])
    .filter((status) => status.assigned && status.status === 'scheduled' && status.scheduledAt)
    .map((status) => status.scheduledAt!);
  return dates.sort()[0] ?? item.updatedAt;
}

function BoardColumn({
  stage,
  title,
  color,
  list,
  columnIndex,
  onOpen,
}: {
  stage: Stage;
  title: string;
  color: string;
  list: ContentItem[];
  columnIndex: number;
  onOpen: (id: string) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const lastWheelAt = useRef(0);

  const hasItems = list.length > 0;
  const canNavigate = list.length > 1;
  const currentIndex = hasItems ? Math.min(activeIndex, list.length - 1) : 0;
  const activeItem = hasItems ? list[currentIndex] : undefined;

  useEffect(() => {
    setActiveIndex((current) => (list.length === 0 ? 0 : Math.min(current, list.length - 1)));
  }, [list.length]);

  const goTo = useCallback(
    (direction: 1 | -1) => {
      if (!canNavigate) return;
      setActiveIndex((current) => (current + direction + list.length) % list.length);
    },
    [canNavigate, list.length],
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!canNavigate || Math.abs(event.deltaY) < 18) return;

      const now = Date.now();
      if (now - lastWheelAt.current < 420) {
        event.preventDefault();
        return;
      }

      lastWheelAt.current = now;
      event.preventDefault();
      goTo(event.deltaY > 0 ? 1 : -1);
    },
    [canNavigate, goTo],
  );

  return (
    <motion.section
      key={stage}
      className="column"
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: columnIndex * 0.06, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="column-head">
        <span className="column-glow" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
        <span className="column-title" style={{ color }}>
          <StageIcon stage={stage} /> {title}
        </span>
        <span className="column-count">{list.length}</span>
      </div>

      <div className="column-cards">
        {activeItem ? (
          <>
            <div className="column-card-window" onWheel={handleWheel}>
              <AnimatePresence mode="wait">
                <ContentCard key={activeItem.id} item={activeItem} onOpen={onOpen} />
              </AnimatePresence>
            </div>

            <div className="column-pager" aria-label={`Navegacao de ${title}`}>
              <button
                className="column-nav-btn"
                type="button"
                onClick={() => goTo(-1)}
                disabled={!canNavigate}
                title="Conteudo anterior"
                aria-label="Conteudo anterior"
              >
                <Icon name="chevronLeft" />
              </button>
              <span className="column-position">
                {currentIndex + 1} / {list.length}
              </span>
              <button
                className="column-nav-btn"
                type="button"
                onClick={() => goTo(1)}
                disabled={!canNavigate}
                title="Proximo conteudo"
                aria-label="Proximo conteudo"
              >
                <Icon name="chevronRight" />
              </button>
            </div>
          </>
        ) : (
          <div className="column-empty">nada por aqui</div>
        )}
      </div>
    </motion.section>
  );
}

export function Dashboard() {
  const items = useStore((s) => s.items);
  const refresh = useStore((s) => s.refresh);
  const deleteItem = useStore((s) => s.deleteItem);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [showTrash, setShowTrash] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showIdeas, setShowIdeas] = useState(false);
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [missingFilter, setMissingFilter] = useState<MissingFilter | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const boardRef = useRef<HTMLElement>(null);

  // separa itens ativos dos que estão na lixeira
  const active = useMemo(() => items.filter((i) => !i.deletedAt), [items]);
  const trashed = useMemo(() => items.filter((i) => i.deletedAt), [items]);

  // todas as tags em uso, para montar os chips de filtro
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const i of active) for (const t of i.tags ?? []) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [active]);

  // filtros transversais (texto/tag/arquivo faltando/data), aplicados às duas visões
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    // limites de data em epoch ms (dateTo inclui o dia inteiro)
    const fromMs = dateFrom ? new Date(`${dateFrom}T00:00`).getTime() : undefined;
    const toMs = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : undefined;
    return active.filter((i) => {
      if (q && !(i.title.toLowerCase().includes(q) || (i.notes ?? '').toLowerCase().includes(q)))
        return false;
      if (tagFilter && !(i.tags ?? []).includes(tagFilter)) return false;
      if (missingFilter && !matchesMissing(i, missingFilter)) return false;
      if (fromMs !== undefined || toMs !== undefined) {
        const updated = new Date(i.updatedAt).getTime();
        if (fromMs !== undefined && updated < fromMs) return false;
        if (toMs !== undefined && updated > toMs) return false;
      }
      return true;
    });
  }, [active, query, tagFilter, missingFilter, dateFrom, dateTo]);

  const activeSecondaryCount =
    (filter !== 'all' ? 1 : 0) +
    (missingFilter ? 1 : 0) +
    (tagFilter ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0);

  const byStage = useMemo(() => {
    const map = new Map<Stage, ContentItem[]>(STAGES.map(({ stage }) => [stage, []]));
    for (const item of searched) {
      let stage: Stage | null;
      if (filter === 'all') stage = itemStage(item);
      else if (filter === 'carousel' || filter === 'carousel-raw' || filter === 'carousel-ready')
        stage = matchesCarouselFilter(item, filter) ? itemStage(item) : null;
      else if (filter === 'raw' || filter === 'edited')
        stage = itemStage(item) === filter ? filter : null;
      else stage = stageForNetwork(item, filter);
      if (stage) map.get(stage)!.push(item);
    }
    // programados primeiro por data mais próxima; demais por atualização recente
    for (const [stage, list] of map) {
      list.sort((a, b) =>
        stage === 'scheduled'
          ? nextScheduledAt(a).localeCompare(nextScheduledAt(b))
          : b.updatedAt.localeCompare(a.updatedAt),
      );
    }
    return map;
  }, [searched, filter]);

  // O CSS consegue igualar colunas na mesma linha do grid. Aqui propagamos a
  // altura da maior coluna para as linhas seguintes (ex.: "Publicado").
  useLayoutEffect(() => {
    if (view !== 'board') return;

    const board = boardRef.current;
    if (!board) return;

    const syncColumnHeight = () => {
      board.style.removeProperty('--board-column-min-height');
      const columns = Array.from(board.querySelectorAll<HTMLElement>('.column'));
      const maxHeight = Math.max(0, ...columns.map((column) => column.getBoundingClientRect().height));
      board.style.setProperty('--board-column-min-height', `${Math.ceil(maxHeight)}px`);
    };

    const frame = requestAnimationFrame(syncColumnHeight);
    window.addEventListener('resize', syncColumnHeight);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', syncColumnHeight);
      board.style.removeProperty('--board-column-min-height');
    };
  }, [view, byStage]);

  // na visão lista, o filtro de rede vira só "atribuído àquela rede"
  const listItems = useMemo(() => {
    if (filter === 'all') return searched;
    if (filter === 'carousel' || filter === 'carousel-raw' || filter === 'carousel-ready')
      return searched.filter((i) => matchesCarouselFilter(i, filter));
    if (filter === 'raw' || filter === 'edited')
      return searched.filter((i) => itemStage(i) === filter);
    return searched.filter((i) => i.networks[filter].assigned);
  }, [searched, filter]);

  const openItem = openItemId ? items.find((i) => i.id === openItemId) : undefined;

  // callbacks estáveis para que as linhas memoizadas (ListRow) não re-renderizem
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // alguma "seção" (não-quadro/lista) está aberta?
  const inSection = showTrash || showCalendar || showIdeas;
  // fecha todas as seções de uma vez (usado na navegação mobile)
  const closeSections = useCallback(() => {
    setShowTrash(false);
    setShowCalendar(false);
    setShowIdeas(false);
  }, []);
  const goHome = useCallback(() => {
    closeSections();
    setView('list');
    setFilter('all');
    setQuery('');
    setTagFilter(null);
    setMissingFilter(null);
    setDateFrom('');
    setDateTo('');
    setShowFilters(false);
    setSelected(new Set());
    setOpenItemId(null);
    setShowNew(false);
    setShowBulk(false);
    setShowSettings(false);
  }, [closeSections]);

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand brand-home" type="button" onClick={goHome} aria-label="Ir para a página inicial">
          <span className="brand-dot" />
          ESTÚDIO
        </button>

        <input
          className="search-input"
          type="search"
          placeholder="Buscar por título ou nota…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="view-toggle hide-mobile">
          <button
            className={`view-btn ${!inSection && view === 'board' ? 'active' : ''}`}
            onClick={() => {
              closeSections();
              setView('board');
            }}
            title="Quadro"
          >
            ▦ Quadro
          </button>
          <button
            className={`view-btn ${!inSection && view === 'list' ? 'active' : ''}`}
            onClick={() => {
              closeSections();
              setView('list');
            }}
            title="Lista"
          >
            ☰ Lista
          </button>
        </div>

        <div className="topbar-spacer" />
        <button
          className={`btn btn-ghost nav-calendar hide-mobile ${showCalendar ? 'active' : ''}`}
          title="Calendário"
          onClick={() => {
            setShowTrash(false);
            setShowIdeas(false);
            setShowCalendar((v) => !v);
          }}
        >
          <Icon name="calendar" /> Agenda
        </button>
        <button
          className={`btn btn-ghost nav-ideas hide-mobile ${showIdeas ? 'active' : ''}`}
          title="Banco de ideias"
          onClick={() => {
            setShowTrash(false);
            setShowCalendar(false);
            setShowIdeas((v) => !v);
          }}
        >
          <Icon name="sparkles" /> Ideias
        </button>

        <div className="topbar-spacer" />
        <button
          className="icon-btn nav-refresh"
          title="Sincronizar com o Drive"
          onClick={async () => {
            setRefreshing(true);
            try {
              await refresh();
            } finally {
              setRefreshing(false);
            }
          }}
        >
          <motion.span
            animate={refreshing ? { rotate: 360 } : {}}
            transition={refreshing ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : {}}
            style={{ display: 'inline-block' }}
          >
            ↻
          </motion.span>
        </button>
        <button
          className={`icon-btn nav-trash hide-mobile ${showTrash ? 'active' : ''}`}
          title="Lixeira"
          onClick={() => {
            setShowCalendar(false);
            setShowIdeas(false);
            setShowTrash((v) => !v);
          }}
        >
          <Icon name="trash" size={18} />
          {trashed.length > 0 ? ` ${trashed.length}` : ''}
        </button>
        <button className="icon-btn nav-settings" title="Configurações" onClick={() => setShowSettings(true)}>
          <Icon name="settings" size={18} />
        </button>
        <button className="btn btn-ghost nav-bulk hide-mobile" onClick={() => setShowBulk(true)}>
          <Icon name="upload" /> Subir em lote
        </button>
        <button className="btn btn-primary hide-mobile" onClick={() => setShowNew(true)}>
          + Novo conteúdo
        </button>
      </header>

      {showCalendar ? (
        <CalendarView
          onOpenItem={setOpenItemId}
          onRecorded={(itemId) => {
            setShowCalendar(false);
            setOpenItemId(itemId);
          }}
        />
      ) : showIdeas ? (
        <IdeasView
          onCreated={(itemId) => {
            setShowIdeas(false);
            setOpenItemId(itemId);
          }}
        />
      ) : showTrash ? (
        <TrashView items={trashed} />
      ) : (
      <>
      <nav className="filters filters-secondary">
        <div className="filters-menu">
          <button
            className={`chip ${filter === 'all' ? 'active' : ''}`}
            data-net="all"
            onClick={() => setFilter('all')}
          >
            ✦ Tudo
          </button>
          <button
            className={`chip ${activeSecondaryCount > 0 ? 'active' : ''} ${showFilters ? 'open' : ''}`}
            data-net="all"
            onClick={() => setShowFilters((s) => !s)}
          >
            <Icon name="filter" /> Filtros
            {activeSecondaryCount > 0 && (
              <span className="filters-badge">{activeSecondaryCount}</span>
            )}
          </button>

          <AnimatePresence>
            {showFilters && (
              <>
                <div
                  className="filters-backdrop"
                  onClick={() => setShowFilters(false)}
                />
                <motion.div
                  className="filters-pop"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  <div className="filters-pop-section">
                    <span className="filters-pop-label">Tipo</span>
                    <div className="filters-pop-row">
                      {STAGE_FILTERS.map(({ filter: f, icon, label }) => (
                        <button
                          key={f}
                          className={`chip ${filter === f ? 'active' : ''}`}
                          data-net={f}
                          onClick={() => setFilter((cur) => (cur === f ? 'all' : f))}
                        >
                          <Icon name={icon} /> {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="filters-pop-section">
                    <span className="filters-pop-label">Rede</span>
                    <div className="filters-pop-row">
                      {NETWORKS.map((n) => (
                        <button
                          key={n}
                          className={`chip ${filter === n ? 'active' : ''}`}
                          data-net={n}
                          onClick={() => setFilter((cur) => (cur === n ? 'all' : n))}
                        >
                          <NetworkIcon network={n} />
                          {NETWORK_LABELS[n]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="filters-pop-section">
                    <span className="filters-pop-label">Pendências</span>
                    <div className="filters-pop-row">
                      <button
                        className={`chip ${missingFilter === 'cover' ? 'active' : ''}`}
                        onClick={() =>
                          setMissingFilter((m) => (m === 'cover' ? null : 'cover'))
                        }
                      >
                        <Icon name="carousel" /> Sem capa
                      </button>
                      <button
                        className={`chip ${missingFilter === 'edited' ? 'active' : ''}`}
                        onClick={() =>
                          setMissingFilter((m) => (m === 'edited' ? null : 'edited'))
                        }
                      >
                        <Icon name="scissors" /> Sem editado
                      </button>
                    </div>
                  </div>

                  {allTags.length > 0 && (
                    <div className="filters-pop-section">
                      <span className="filters-pop-label">Tags</span>
                      <div className="filters-pop-row">
                        {allTags.map((tag) => (
                          <button
                            key={tag}
                            className={`chip chip-tag ${tagFilter === tag ? 'active' : ''}`}
                            onClick={() =>
                              setTagFilter((t) => (t === tag ? null : tag))
                            }
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="filters-pop-section">
                    <span className="filters-pop-label">Período</span>
                    <span className="filter-dates">
                      <Icon name="calendar" />
                      <span className="filter-date-label">De</span>
                      <input
                        type="date"
                        aria-label="Atualizado de"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                      />
                      <span className="filter-date-label">até</span>
                      <input
                        type="date"
                        aria-label="Atualizado até"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                      />
                    </span>
                  </div>

                  {activeSecondaryCount > 0 && (
                    <button
                      className="btn btn-ghost filters-clear"
                      onClick={() => {
                        setFilter('all');
                        setMissingFilter(null);
                        setTagFilter(null);
                        setDateFrom('');
                        setDateTo('');
                      }}
                    >
                      Limpar filtros
                    </button>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {active.length === 0 ? (
        <motion.div
          className="empty-state"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2>Seu estúdio está vazio</h2>
          <p>Crie o primeiro conteúdo e suba o vídeo cru, o editado e a capa.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>
              + Criar primeiro conteúdo
            </button>
            <button className="btn btn-ghost" onClick={() => setShowBulk(true)}>
              <Icon name="upload" /> Subir em lote
            </button>
          </div>
        </motion.div>
      ) : view === 'list' ? (
        <ListView
          items={listItems}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onOpen={setOpenItemId}
          onDelete={(id) => void deleteItem(id)}
        />
      ) : (
        <main ref={boardRef} className="board">
          {STAGES.filter(({ stage }) => {
            if (filter === 'raw') return stage === 'raw';
            if (filter === 'edited') return stage === 'edited';
            if (
              filter === 'all' ||
              filter === 'carousel' ||
              filter === 'carousel-raw' ||
              filter === 'carousel-ready'
            )
              return true;
            return stage !== 'raw' && stage !== 'edited';
          }).map(({ stage, title, color }, columnIndex) => {
            const list = byStage.get(stage) ?? [];
            return (
              <BoardColumn
                key={stage}
                stage={stage}
                title={title}
                color={color}
                list={list}
                columnIndex={columnIndex}
                onOpen={setOpenItemId}
              />
            );
          })}
        </main>
      )}
      </>
      )}

      {!showTrash && !showCalendar && !showIdeas && (
        <BulkActionBar ids={[...selected]} onClear={clearSelection} />
      )}

      <AnimatePresence>
        {openItem && <DetailPanel key="drawer" item={openItem} onClose={() => setOpenItemId(null)} />}
        {showNew && (
          <NewItemModal
            key="new"
            onClose={() => setShowNew(false)}
            onCreated={(id) => {
              setShowNew(false);
              setOpenItemId(id);
            }}
          />
        )}
        {showBulk && <BulkUploadModal key="bulk" onClose={() => setShowBulk(false)} />}
        {showSettings && <SettingsModal key="settings" onClose={() => setShowSettings(false)} />}
      </AnimatePresence>

      <UploadToasts />

      {/* navegação inferior — só aparece no mobile (controlada por CSS) */}
      <nav className="mobile-nav">
        <button
          className={`mobile-nav-btn ${!inSection && view === 'board' ? 'active' : ''}`}
          onClick={() => {
            closeSections();
            setView('board');
          }}
        >
          <span className="mobile-nav-icon">▦</span>
          Quadro
        </button>
        <button
          className={`mobile-nav-btn ${!inSection && view === 'list' ? 'active' : ''}`}
          onClick={() => {
            closeSections();
            setView('list');
          }}
        >
          <span className="mobile-nav-icon">☰</span>
          Lista
        </button>
        <button
          className={`mobile-nav-btn ${showCalendar ? 'active' : ''}`}
          onClick={() => {
            closeSections();
            setShowCalendar((v) => !v);
          }}
        >
          <span className="mobile-nav-icon"><Icon name="calendar" /></span>
          Calendário
        </button>
        <button
          className={`mobile-nav-btn ${showIdeas ? 'active' : ''}`}
          onClick={() => {
            closeSections();
            setShowIdeas((v) => !v);
          }}
        >
          <span className="mobile-nav-icon"><Icon name="sparkles" /></span>
          Ideias
        </button>
        <button
          className={`mobile-nav-btn ${showTrash ? 'active' : ''}`}
          onClick={() => {
            closeSections();
            setShowTrash((v) => !v);
          }}
        >
          <span className="mobile-nav-icon">
            <Icon name="trash" />
            {trashed.length > 0 ? ` ${trashed.length}` : ''}
          </span>
          Lixeira
        </button>
      </nav>

      {/* botão flutuante de criação — só aparece no mobile (controlado por CSS) */}
      <button className="fab" onClick={() => setShowNew(true)} aria-label="Novo conteúdo">
        +
      </button>
    </div>
  );
}
