import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  itemStage,
  NETWORK_LABELS,
  NETWORKS,
  type ContentItem,
  type Network,
  type Stage,
} from '../types';
import { useStore } from '../store/useStore';
import { ContentCard } from '../components/ContentCard';
import { ListView } from '../components/ListView';
import { BulkActionBar } from '../components/BulkActionBar';
import { DetailPanel } from '../components/DetailPanel';
import { NewItemModal, SettingsModal } from '../components/Modals';
import { BulkUploadModal } from '../components/BulkUploadModal';
import { UploadToasts } from '../components/UploadToasts';
import { NetworkIcon } from '../components/NetworkIcon';
import { StageIcon } from '../components/StageIcon';
import { STAGE_COLORS, STAGE_LABELS } from '../lib/journey';

type Filter = 'all' | 'raw' | 'edited' | Network;
type ViewMode = 'board' | 'list';

const STAGE_FILTERS: { filter: 'raw' | 'edited'; label: string }[] = [
  { filter: 'raw', label: '🎬 Vídeos crus' },
  { filter: 'edited', label: '✂️ Vídeos editados' },
];

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

export function Dashboard() {
  const items = useStore((s) => s.items);
  const refresh = useStore((s) => s.refresh);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('list');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // filtro de texto (título/notas), aplicado às duas visões
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) || (i.notes ?? '').toLowerCase().includes(q),
    );
  }, [items, query]);

  const byStage = useMemo(() => {
    const map = new Map<Stage, ContentItem[]>(STAGES.map(({ stage }) => [stage, []]));
    for (const item of searched) {
      let stage: Stage | null;
      if (filter === 'all') stage = itemStage(item);
      else if (filter === 'raw' || filter === 'edited')
        stage = itemStage(item) === filter ? filter : null;
      else stage = stageForNetwork(item, filter);
      if (stage) map.get(stage)!.push(item);
    }
    // programados primeiro por data mais próxima; demais por atualização recente
    for (const [stage, list] of map) {
      list.sort((a, b) =>
        stage === 'scheduled'
          ? (a.networks.instagram.scheduledAt ?? a.updatedAt).localeCompare(
              b.networks.instagram.scheduledAt ?? b.updatedAt,
            )
          : b.updatedAt.localeCompare(a.updatedAt),
      );
    }
    return map;
  }, [searched, filter]);

  // na visão lista, o filtro de rede vira só "atribuído àquela rede"
  const listItems = useMemo(() => {
    if (filter === 'all') return searched;
    if (filter === 'raw' || filter === 'edited')
      return searched.filter((i) => itemStage(i) === filter);
    return searched.filter((i) => i.networks[filter].assigned);
  }, [searched, filter]);

  const openItem = openItemId ? items.find((i) => i.id === openItemId) : undefined;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (ids: string[], select: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const clearSelection = () => setSelected(new Set());

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

        <div className="view-toggle">
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
        <button className="icon-btn" title="Configurações" onClick={() => setShowSettings(true)}>
          ⚙
        </button>
        <button className="btn btn-ghost" onClick={() => setShowBulk(true)}>
          📤 Subir em lote
        </button>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + Novo conteúdo
        </button>
      </header>

      <nav className="filters">
        <button
          className={`chip ${filter === 'all' ? 'active' : ''}`}
          data-net="all"
          onClick={() => setFilter('all')}
        >
          ✦ Tudo
        </button>
        {STAGE_FILTERS.map(({ filter: f, label }) => (
          <button
            key={f}
            className={`chip ${filter === f ? 'active' : ''}`}
            data-net={f}
            onClick={() => setFilter(f)}
          >
            {label}
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

      {items.length === 0 ? (
        <motion.div
          className="empty-state"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2>Seu estúdio está vazio 🎬</h2>
          <p>Crie o primeiro conteúdo e suba o vídeo cru, o editado e a capa.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>
              + Criar primeiro conteúdo
            </button>
            <button className="btn btn-ghost" onClick={() => setShowBulk(true)}>
              📤 Subir em lote
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
            if (filter === 'all') return true;
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

      <BulkActionBar ids={[...selected]} onClear={clearSelection} />

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
    </div>
  );
}
