import { motion } from 'framer-motion';
import type { ContentItem, Stage } from '../types';
import { buildJourney, formatWhen, type TrailStep } from '../lib/journey';
import { StageIcon } from './StageIcon';
import { NetworkIcon } from './NetworkIcon';

/** Ícone do nó por passo do tronco (o estado 'done' troca por check). */
function iconFor(key: TrailStep['key']): Stage | 'check' | 'flag' {
  switch (key) {
    case 'raw':
      return 'raw';
    case 'edited':
      return 'edited';
    case 'ready':
      return 'ready';
    case 'publish':
      return 'scheduled';
    case 'complete':
      return 'flag';
  }
}

export function JourneyTrail({ item }: { item: ContentItem }) {
  const j = buildJourney(item);
  return (
    <div className="journey" role="list" aria-label={j.ariaSummary}>
      {j.steps.map((step, i) => (
        <motion.div
          key={step.key}
          role="listitem"
          className="journey-step"
          data-stage={step.stage}
          data-state={step.state}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.07, duration: 0.3 }}
        >
          <div className="journey-rail">
            <span className="journey-node">
              <StageIcon stage={step.state === 'done' ? 'check' : iconFor(step.key)} />
            </span>
            {i < j.steps.length - 1 && (
              <span className="journey-line">
                <motion.span
                  className="journey-line-fill"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: step.state === 'done' ? 1 : 0 }}
                  transition={{ duration: 0.45, delay: i * 0.07 }}
                />
              </span>
            )}
          </div>
          <div className="journey-info">
            <span className="journey-title">{step.title}</span>
            {step.detail && (
              <span className="journey-detail" data-warning={step.warning}>
                {step.detail}
              </span>
            )}
            {step.timestamp && (
              <time className="journey-when" dateTime={step.timestamp}>
                {formatWhen(step.timestamp)}
              </time>
            )}
            {step.key === 'publish' && (
              <div className="journey-branches">
                {j.unassigned && (
                  <div className="journey-branch-empty">
                    Nenhuma rede selecionada — ative abaixo em "Redes sociais"
                  </div>
                )}
                {j.branches.map((b) => (
                  <div
                    key={b.network}
                    className="journey-branch"
                    data-net={b.network}
                    data-state={b.state}
                    title={b.statusLine}
                  >
                    <span className="journey-branch-net">
                      <NetworkIcon network={b.network} />
                      {b.label}
                    </span>
                    <span className="journey-branch-steps">
                      {b.steps.map((s, k) => (
                        <span key={s.key} className="journey-substep" data-state={s.state}>
                          <span className="journey-subnode" />
                          {k === 0 && (
                            <span className="journey-subline" data-filled={s.state === 'done'} />
                          )}
                        </span>
                      ))}
                    </span>
                    <span className="journey-branch-text">
                      {b.steps.find((s) => s.state === 'current')?.title ?? b.steps[0].title}
                      {b.steps[1].url && (
                        <a
                          href={b.steps[1].url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          ver post ↗
                        </a>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      ))}
      <div className="journey-legend" aria-hidden>
        <span data-state="done">concluído</span>
        <span data-state="current">em andamento</span>
        <span data-state="pending">pendente</span>
      </div>
    </div>
  );
}
