import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { NETWORKS, type ContentItem } from '../types';
import { useStore } from '../store/useStore';
import { NetworkIcon } from './NetworkIcon';

interface Props {
  item: ContentItem;
  onOpen: (id: string) => void;
}

export function ContentCard({ item, onOpen }: Props) {
  const coverUrls = useStore((s) => s.coverUrls);
  const loadCover = useStore((s) => s.loadCover);

  const coverUrl = item.coverFileId ? coverUrls[item.coverFileId] : undefined;

  useEffect(() => {
    if (item.coverFileId) void loadCover(item.coverFileId);
  }, [item.coverFileId, loadCover]);

  return (
    <motion.article
      layout
      layoutId={item.id}
      className="card"
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      whileHover={{ y: -3 }}
      onClick={() => onOpen(item.id)}
    >
      <div className="card-cover">
        {coverUrl ? (
          <img src={coverUrl} alt={`Capa de ${item.title}`} />
        ) : (
          <div className="card-cover-placeholder">
            {item.coverFileId ? '⏳' : '🖼️'}
          </div>
        )}
      </div>
      <div className="card-body">
        <div className="card-title">{item.title}</div>
        <div className="card-meta">
          {NETWORKS.filter((n) => item.networks[n].assigned).map((n) => (
            <span key={n} className="net-badge" data-status={item.networks[n].status}>
              <NetworkIcon network={n} />
              {item.networks[n].status === 'posted'
                ? 'postado'
                : item.networks[n].status === 'scheduled'
                  ? 'programado'
                  : 'pendente'}
            </span>
          ))}
          <span className="file-pips" title="Arquivos: cru / editado / capa">
            <span className={`pip ${item.rawVideoFileId ? 'on-raw' : ''}`} />
            <span className={`pip ${item.editedVideoFileId ? 'on-edited' : ''}`} />
            <span className={`pip ${item.coverFileId ? 'on-cover' : ''}`} />
          </span>
        </div>
      </div>
    </motion.article>
  );
}
