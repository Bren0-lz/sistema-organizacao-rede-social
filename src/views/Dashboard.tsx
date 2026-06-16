import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
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

export function Dashboard() {
  const items = useStore((s) => s.items);
  const refresh = useStore((s) => s.refresh);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [showTrash, setShowTrash] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // separa itens ativos dos que estão na lixeira
  const active = useMemo(() => items.filter((i) => !i.deletedAt), [items]);
  const trashed = useMemo(() => items.filter((i) => i.deletedAt), [items]);

  // filtro de texto (título/notas), aplicado às duas visões
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (i) =>
        i.title.toLowerCase().includes(q) || (i.notes ?? '').toLowerCase().includes(q),
    );
  }, [active, query]);

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

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          ESTÚDIO
        </div>

        <input
          className="search-input"
          type="search"
          placeholder="Buscar por título ou nota…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="view-toggle hide-mobile">
          <button
            className={`view-btn ${view === 'board' ? 'active' : ''}`}
            onClick={() => setView('board')}
            title="Quadro"
          >
            ▦ Quadro
          </button>
          <button
            className={`view-btn ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
            title="Lista"
          >
            ☰ Lista
          </button>
        </div>

        <div className="topbar-spacer" />
        <button
          className="icon-btn"
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
          className={`icon-btn hide-mobile ${showTrash ? 'active' : ''}`}
          title="Lixeira"
          onClick={() => setShowTrash((v) => !v)}
        >
          <Icon name="trash" size={18} />
          {trashed.length > 0 ? ` ${trashed.length}` : ''}
        </button>
        <button className="icon-btn" title="Configurações" onClick={() => setShowSettings(true)}>
          <Icon name="settings" size={18} />
        </button>
        <button className="btn btn-ghost hide-mobile" onClick={() => setShowBulk(true)}>
          <Icon name="upload" /> Subir em lote
        </button>
        <button className="btn btn-primary hide-mobile" onClick={() => setShowNew(true)}>
          + Novo conteúdo
        </button>
      </header>

      {showTrash ? (
        <TrashView items={trashed} />
      ) : (
      <>
      <nav className="filters">
        <button
          className={`chip ${filter === 'all' ? 'active' : ''}`}
          data-net="all"
          onClick={() => setFilter('all')}
        >
          ✦ Tudo
        </button>
        {STAGE_FILTERS.map(({ filter: f, icon, label }) => (
          <button
            key={f}
            className={`chip ${filter === f ? 'active' : ''}`}
            data-net={f}
            onClick={() => setFilter(f)}
          >
            <Icon name={icon} /> {label}
          </button>
        ))}
        {NETWORKS.map((n) => (
          <button
            key={n}
            className={`chip ${filter === n ? 'active' : ''}`}
            data-net={n}
            onClick={() => setFilter(n)}
          >
            <NetworkIcon network={n} />
            {NETWORK_LABELS[n]}
          </button>
        ))}
      </nav>

      {active.length === 0 ? (
        <motion.div
          className="empty-state"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2>Seu estúdio está vazio</h2>
          <p>Crie o primeiro conteúdo e suba o vídeo cru, o editado e a capa.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
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
        />
      ) : (
        <main className="board">
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
                  <AnimatePresence mode="popLayout">
                    {list.map((item) => (
                      <ContentCard key={item.id} item={item} onOpen={setOpenItemId} />
                    ))}
                  </AnimatePresence>
                  {list.length === 0 && <div className="column-empty">nada por aqui</div>}
                </div>
              </motion.section>
            );
          })}
        </main>
      )}
      </>
      )}

      {!showTrash && <BulkActionBar ids={[...selected]} onClear={clearSelection} />}

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
          className={`mobile-nav-btn ${!showTrash && view === 'board' ? 'active' : ''}`}
          onClick={() => {
            setShowTrash(false);
            setView('board');
          }}
        >
          <span className="mobile-nav-icon">▦</span>
          Quadro
        </button>
        <button
          className={`mobile-nav-btn ${!showTrash && view === 'list' ? 'active' : ''}`}
          onClick={() => {
            setShowTrash(false);
            setView('list');
          }}
        >
          <span className="mobile-nav-icon">☰</span>
          Lista
        </button>
        <button className="mobile-nav-btn" onClick={() => setShowBulk(true)}>
          <span className="mobile-nav-icon"><Icon name="upload" /></span>
          Subir
        </button>
        <button
          className={`mobile-nav-btn ${showTrash ? 'active' : ''}`}
          onClick={() => setShowTrash((v) => !v)}
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
