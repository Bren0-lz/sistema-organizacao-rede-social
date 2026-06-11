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
import { DetailPanel } from '../components/DetailPanel';
import { NewItemModal, SettingsModal } from '../components/Modals';
import { UploadToasts } from '../components/UploadToasts';
import { NetworkIcon } from '../components/NetworkIcon';

type Filter = 'all' | Network;

const STAGES: { stage: Stage; title: string; emoji: string; color: string }[] = [
  { stage: 'raw', title: 'Crus', emoji: '🎬', color: 'var(--st-raw)' },
  { stage: 'edited', title: 'Editados', emoji: '✂️', color: 'var(--st-edited)' },
  { stage: 'ready', title: 'Sem programação', emoji: '⬜', color: 'var(--st-ready)' },
  { stage: 'scheduled', title: 'Programados', emoji: '📅', color: 'var(--st-scheduled)' },
  { stage: 'posted', title: 'Postados', emoji: '✅', color: 'var(--st-posted)' },
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
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const byStage = useMemo(() => {
    const map = new Map<Stage, ContentItem[]>(STAGES.map(({ stage }) => [stage, []]));
    for (const item of items) {
      const stage = filter === 'all' ? itemStage(item) : stageForNetwork(item, filter);
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
  }, [items, filter]);

  const openItem = openItemId ? items.find((i) => i.id === openItemId) : undefined;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
          ESTÚDIO
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
          <button
            className="btn btn-primary"
            style={{ marginTop: 18 }}
            onClick={() => setShowNew(true)}
          >
            + Criar primeiro conteúdo
          </button>
        </motion.div>
      ) : (
        <main className="board">
          {STAGES.filter(
            ({ stage }) => filter === 'all' || (stage !== 'raw' && stage !== 'edited'),
          ).map(({ stage, title, emoji, color }, columnIndex) => {
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
                    {emoji} {title}
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
        {showSettings && <SettingsModal key="settings" onClose={() => setShowSettings(false)} />}
      </AnimatePresence>

      <UploadToasts />
    </div>
  );
}
