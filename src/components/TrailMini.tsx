import { memo } from 'react';
import { itemStage, type ContentItem } from '../types';
import { miniTrail, STAGE_LABELS } from '../lib/journey';
import { StageIcon } from './StageIcon';

export const TrailMini = memo(function TrailMini({ item }: { item: ContentItem }) {
  const dots = miniTrail(item);
  const stage = itemStage(item);
  const label = STAGE_LABELS[stage];
  return (
    <span
      className="trail-mini"
      title={`Progresso: ${label}`}
      aria-label={`Progresso: ${label}`}
    >
      {dots.map((d, i) => (
        <span key={d.stage} className="trail-mini-seg" data-stage={d.stage} data-state={d.state}>
          {i > 0 && <span className="trail-mini-line" data-filled={d.state !== 'pending'} />}
          <span className="trail-mini-dot">
            {d.state === 'done' && (
              <svg className="trail-mini-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M9.55 17.6 4.4 12.45a1 1 0 0 1 1.4-1.42l3.75 3.74 8.25-8.25a1 1 0 1 1 1.4 1.42l-9.65 9.66a1 1 0 0 1-1.4 0Z" />
              </svg>
            )}
            {d.state === 'current' && (
              <span className="trail-mini-glyph">
                <StageIcon stage={d.stage} />
              </span>
            )}
          </span>
        </span>
      ))}
    </span>
  );
});
