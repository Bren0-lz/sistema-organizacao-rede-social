import { itemStage, type ContentItem } from '../types';
import { miniTrail, STAGE_LABELS } from '../lib/journey';

export function TrailMini({ item }: { item: ContentItem }) {
  const dots = miniTrail(item);
  const label = STAGE_LABELS[itemStage(item)];
  return (
    <span
      className="trail-mini"
      title={`Progresso: ${label}`}
      aria-label={`Progresso: ${label}`}
    >
      {dots.map((d, i) => (
        <span key={d.stage} className="trail-mini-seg" data-stage={d.stage} data-state={d.state}>
          {i > 0 && <span className="trail-mini-line" data-filled={d.state !== 'pending'} />}
          <span className="trail-mini-dot" />
        </span>
      ))}
    </span>
  );
}
