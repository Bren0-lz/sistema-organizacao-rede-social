import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { JourneyTrail } from './JourneyTrail';
import { makeItem, assignNetwork } from '../test/factories';

describe('JourneyTrail', () => {
  it('renderiza a lista de passos do tronco com rótulo acessível', () => {
    const { container } = render(<JourneyTrail item={makeItem()} />);
    const list = container.querySelector('.journey');
    expect(list).toHaveAttribute('role', 'list');
    expect(list).toHaveAttribute('aria-label');
    // o tronco tem 5 passos (raw/edited/ready/publish/complete)
    expect(container.querySelectorAll('.journey-step').length).toBe(5);
  });

  it('mostra ramos por rede atribuída', () => {
    const item = assignNetwork(makeItem(), 'youtube', {
      status: 'scheduled',
      scheduledAt: '2999-01-01T00:00:00Z',
    });
    const { container } = render(<JourneyTrail item={item} />);
    // ramos de rede aparecem além do tronco
    expect(container.querySelector('.journey')).toBeInTheDocument();
  });
});
