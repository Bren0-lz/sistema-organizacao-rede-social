import { memo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  isAutoPostedFromSchedule,
  itemStage,
  itemType,
  NETWORKS,
  thumbSourceFor,
  type ContentItem,
} from '../types';
import { useStore } from '../store/useStore';
import { useInView } from '../lib/concurrency';
import { NetworkIcon } from './NetworkIcon';
import { Icon } from './Icon';
import { TrailMini } from './TrailMini';
import { itemStageLabel } from '../lib/journey';

interface Props {
  item: ContentItem;
  onOpen: (id: string) => void;
}

export const ContentCard = memo(function ContentCard({ item, onOpen }: Props) {
  // assina só a URL desta capa — não o mapa inteiro — para que o carregamento
  // de uma capa não re-renderize todos os cards visíveis. Sem capa, um vídeo
  // cai no frame que o Drive gera dele (capa temporária).
  const thumb = thumbSourceFor(item);
  const coverFileId = thumb?.fileId;
  const fromVideo = thumb?.fromVideo ?? false;
  const coverUrl = useStore((s) => (coverFileId ? s.coverUrls[coverFileId] : undefined));
  const loadCover = useStore((s) => s.loadCover);
  const { ref, inView } = useInView<HTMLElement>();

  const stage = itemStage(item);
  const isCarousel = itemType(item) === 'carousel';

  useEffect(() => {
    // só baixa a capa quando o card entra na viewport
    if (inView && coverFileId) void loadCover(coverFileId, { thumbnailOnly: fromVideo });
  }, [inView, coverFileId, fromVideo, loadCover]);

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
            <Icon
              name={!fromVideo && coverFileId ? 'hourglass' : isCarousel ? 'carousel' : 'video'}
            />
          </div>
        )}
        <span className="card-type-badge" title={isCarousel ? 'Carrossel' : 'Vídeo'}>
          <Icon name={isCarousel ? 'carousel' : 'video'} /> {isCarousel ? 'Carrossel' : 'Vídeo'}
        </span>
        {isCarousel && item.carouselEditedAt && (
          <span className="card-edited-badge" title="Carrossel marcado como editado">
            <Icon name="check" /> editado
          </span>
        )}
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
            {itemStageLabel(item)}
          </span>
        </div>
      </div>
    </motion.article>
  );
});
