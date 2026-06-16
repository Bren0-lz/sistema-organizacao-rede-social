import { memo } from 'react';
import { itemStage, NETWORKS, type ContentItem } from '../types';
import { formatWhen, miniTrail, STAGE_LABELS } from '../lib/journey';
import { StageIcon } from './StageIcon';
import { NetworkIcon } from './NetworkIcon';

/**
 * Progresso da linha na lista: o tronco compartilhado (bruto → editado → pronto)
 * uma vez só e, depois dele, um ramo por rede atribuída com o seu próprio estado
 * (programado / publicado) e a data/hora em destaque quando programado.
 */
export const RowTrail = memo(function RowTrail({ item }: { item: ContentItem }) {
  const stage = itemStage(item);
  // tronco: só os estágios anteriores à publicação (sem scheduled/posted)
  const trunk = miniTrail(item).filter(
    (d) => d.stage !== 'scheduled' && d.stage !== 'posted',
  );
  const assigned = NETWORKS.filter((n) => item.networks[n].assigned);

  return (
    <div className="row-trail" title={`Progresso: ${STAGE_LABELS[stage]}`}>
      <span className="trail-mini row-trail-trunk" aria-hidden>
        {trunk.map((d, i) => (
          <span
            key={d.stage}
            className="trail-mini-seg"
            data-stage={d.stage}
            data-state={d.state}
          >
            {i > 0 && (
              <span className="trail-mini-line" data-filled={d.state !== 'pending'} />
            )}
            <span className="trail-mini-dot">
              {d.state === 'done' && (
                <svg
                  className="trail-mini-glyph"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
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

      {assigned.length === 0 ? (
        <span className="row-branch-empty">sem redes definidas</span>
      ) : (
        <div className="row-branches">
          {assigned.map((n) => {
            const ns = item.networks[n];
            const scheduledOn = ns.status === 'scheduled';
            const posted = ns.status === 'posted';
            const when = formatWhen(scheduledOn ? ns.scheduledAt : ns.postedAt);
            // estado do ramo p/ colorir os 2 pontinhos (programado → publicado)
            const branchState = posted ? 'done' : scheduledOn ? 'current' : 'pending';

            let pillKind: 'scheduled' | 'posted' | 'pending' | 'warning';
            let pillText: string;
            if (posted) {
              pillKind = 'posted';
              pillText = when ? `✓ ${when}` : '✓ Publicado';
            } else if (scheduledOn) {
              pillKind = when ? 'scheduled' : 'warning';
              pillText = when ? `📅 ${when}` : 'definir data';
            } else {
              pillKind = 'pending';
              pillText = 'aguardando data';
            }

            return (
              <div
                key={n}
                className="row-branch"
                data-net={n}
                data-state={branchState}
                title={`${STAGE_LABELS[posted ? 'posted' : scheduledOn ? 'scheduled' : 'ready']}${
                  when ? ` — ${when}` : ''
                }`}
              >
                <span className="row-branch-net">
                  <NetworkIcon network={n} />
                </span>
                <span className="row-branch-dots" data-state={branchState} aria-hidden>
                  <span className="row-branch-dot" data-on={posted || scheduledOn} />
                  <span className="row-branch-line" data-filled={posted} />
                  <span className="row-branch-dot" data-on={posted} />
                </span>
                <span className="row-branch-pill" data-kind={pillKind}>
                  {pillText}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
