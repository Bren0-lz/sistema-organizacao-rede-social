import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { trashDaysLeft, TRASH_RETENTION_DAYS, type ContentItem } from '../types';
import { useStore } from '../store/useStore';
import { Icon } from './Icon';

interface Props {
  items: ContentItem[];
}

export function TrashView({ items }: Props) {
  const restoreItems = useStore((s) => s.restoreItems);
  const purgeItems = useStore((s) => s.purgeItems);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'purge' | 'empty' | null>(null);

  // mais recentes na lixeira primeiro
  const sorted = useMemo(
    () => [...items].sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [items],
  );

  const ids = useMemo(() => [...selected], [selected]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      setSelected(new Set());
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  if (sorted.length === 0) {
    return (
      <motion.div
        className="empty-state"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2>Lixeira vazia</h2>
        <p>
          Conteúdos removidos ficam aqui por {TRASH_RETENTION_DAYS} dias antes de serem
          excluídos definitivamente.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="list-wrap">
      <div className="trash-banner">
        Itens na lixeira são excluídos de vez após {TRASH_RETENTION_DAYS} dias. Restaurar
        devolve o conteúdo ao fluxo normal.
      </div>

      <table className="list-table">
        <thead>
          <tr>
            <th className="col-check"></th>
            <th className="col-title">Título</th>
            <th className="col-date">Removido em</th>
            <th className="col-stage">Expira em</th>
            <th className="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence>
            {sorted.map((item) => {
              const isSel = selected.has(item.id);
              const left = trashDaysLeft(item);
              return (
                <tr key={item.id} className={isSel ? 'selected' : ''}>
                  <td className="col-check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSel}
                      aria-label={`Selecionar ${item.title}`}
                      onChange={() => toggle(item.id)}
                    />
                  </td>
                  <td className="col-title">
                    <span className="row-title">{item.title}</span>
                  </td>
                  <td className="col-date">
                    {item.deletedAt
                      ? new Date(item.deletedAt).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="col-stage">
                    <span className="stage-tag" style={{ color: left <= 5 ? '#ff6b6b' : undefined }}>
                      {left} dia{left === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      title={`Restaurar ${item.title}`}
                      onClick={() => void run(() => restoreItems([item.id]))}
                    >
                      <Icon name="restore" /> Restaurar
                    </button>
                  </td>
                </tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>

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

            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void run(() => restoreItems(ids))}
            >
              <Icon name="restore" /> Restaurar
            </button>

            {confirm === 'purge' ? (
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() => void run(() => purgeItems(ids))}
              >
                Excluir de vez (apaga do Drive)
              </button>
            ) : (
              <button
                className="btn btn-ghost btn-danger"
                disabled={busy}
                onClick={() => setConfirm('purge')}
              >
                <Icon name="trash" /> Excluir definitivamente
              </button>
            )}

            <button
              className="icon-btn"
              onClick={() => {
                setSelected(new Set());
                setConfirm(null);
              }}
              title="Limpar seleção"
              style={{ marginLeft: 'auto' }}
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
