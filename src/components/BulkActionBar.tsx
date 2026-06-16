import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  NETWORK_LABELS,
  NETWORKS,
  type Network,
  type PostStatus,
} from '../types';
import { useStore } from '../store/useStore';
import { NetworkIcon } from './NetworkIcon';
import { Icon, type IconName } from './Icon';

interface Props {
  ids: string[];
  onClear: () => void;
}

const STATUS_OPTIONS: { status: PostStatus; icon: IconName; label: string }[] = [
  { status: 'none', icon: 'none', label: 'Sem data' },
  { status: 'scheduled', icon: 'calendar', label: 'Programado' },
  { status: 'posted', icon: 'check', label: 'Postado' },
];

export function BulkActionBar({ ids, onClear }: Props) {
  const bulkSetNetwork = useStore((s) => s.bulkSetNetwork);
  const deleteItems = useStore((s) => s.deleteItems);
  const [network, setNetwork] = useState<Network>('instagram');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const assign = () =>
    run(() => bulkSetNetwork(ids, network, { assigned: true }));

  const setStatus = (status: PostStatus) =>
    run(() =>
      bulkSetNetwork(ids, network, {
        assigned: true,
        status,
        ...(status === 'posted' ? { postedAt: new Date().toISOString() } : {}),
      }),
    );

  return (
    <AnimatePresence>
      {ids.length > 0 && (
        <motion.div
          className="bulk-bar"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        >
          <span className="bulk-count">{ids.length} selecionado(s)</span>

          <div className="bulk-net-pick">
            {NETWORKS.map((n) => (
              <button
                key={n}
                className={`chip ${network === n ? 'active' : ''}`}
                data-net={n}
                onClick={() => setNetwork(n)}
                title={NETWORK_LABELS[n]}
              >
                <NetworkIcon network={n} />
              </button>
            ))}
          </div>

          <button className="btn btn-ghost" disabled={busy} onClick={() => void assign()}>
            Atribuir
          </button>
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.status}
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void setStatus(o.status)}
            >
              <Icon name={o.icon} /> {o.label}
            </button>
          ))}

          {confirmDelete ? (
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await deleteItems(ids);
                  setConfirmDelete(false);
                  onClear();
                })
              }
            >
              Mover para lixeira
            </button>
          ) : (
            <button
              className="btn btn-ghost btn-danger"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Icon name="trash" /> Remover
            </button>
          )}

          <button className="icon-btn" onClick={onClear} title="Limpar seleção" style={{ marginLeft: 'auto' }}>
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
