import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  coverFileIdFor,
  isAutoPostedFromSchedule,
  itemStage,
  itemType,
  NETWORKS,
  type ContentItem,
} from '../types';
import { useStore } from '../store/useStore';
import { useInView } from '../lib/concurrency';
import { NetworkIcon } from './NetworkIcon';
import { TrailMini } from './TrailMini';
import { STAGE_LABELS } from '../lib/journey';

interface Props {
  item: ContentItem;
  onOpen: (id: string) => void;
}

export function ContentCard({ item, onOpen }: Props) {
  // assina só a URL desta capa — não o mapa inteiro — para que o carregamento
  // de uma capa não re-renderize todos os cards visíveis
  const coverFileId = coverFileIdFor(item);
  const coverUrl = useStore((s) => (coverFileId ? s.coverUrls[coverFileId] : undefined));
  const loadCover = useStore((s) => s.loadCover);
  const { ref, inView } = useInView<HTMLElement>();

  const stage = itemStage(item);
  const isCarousel = itemType(item) === 'carousel';

  useEffect(() => {
    // só baixa a capa quando o card entra na viewport
    if (inView && coverFileId) void loadCover(coverFileId);
  }, [inView, coverFileId, loadCover]);

  return (
    <motion.article
      ref={ref}
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
            {coverFileId ? '⏳' : isCarousel ? '🖼️' : '🎬'}
          </div>
        )}
        <span className="card-type-badge" title={isCarousel ? 'Carrossel' : 'Vídeo'}>
          {isCarousel ? '🖼️ Carrossel' : '🎬 Vídeo'}
        </span>
      </div>
      <div className="card-body">
        <div className="card-title">{item.title}</div>
        <div className="card-meta">
          {NETWORKS.filter((n) => item.networks[n].assigned).map((n) => (
            <span
              key={n}
              className="net-badge"
              data-status={
                isAutoPostedFromSchedule(n, item.networks[n]) ? 'posted' : item.networks[n].status
              }
            >
              <NetworkIcon network={n} />
              {item.networks[n].status === 'posted' ||
              isAutoPostedFromSchedule(n, item.networks[n])
                ? 'postado'
                : item.networks[n].status === 'scheduled'
                  ? 'programado'
                  : 'pendente'}
            </span>
          ))}
        </div>
        <div className="card-trail">
          <TrailMini item={item} />
          <span className="card-trail-label" data-stage={stage}>
            {STAGE_LABELS[stage]}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
