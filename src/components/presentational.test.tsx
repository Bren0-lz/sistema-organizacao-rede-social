import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NetworkIcon } from './NetworkIcon';
import { StageIcon } from './StageIcon';
import { Icon } from './Icon';
import { TrailMini } from './TrailMini';
import { RowTrail } from './RowTrail';
import { makeItem, assignNetwork } from '../test/factories';

describe('NetworkIcon', () => {
  it('renderiza um SVG para cada rede', () => {
    for (const net of ['instagram', 'tiktok', 'youtube'] as const) {
      const { container } = render(<NetworkIcon network={net} />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    }
  });
});

describe('StageIcon', () => {
  it('renderiza um SVG para um estágio conhecido', () => {
    const { container } = render(<StageIcon stage="raw" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('cai no ícone de check para um valor desconhecido', () => {
    const { container } = render(<StageIcon stage="check" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

describe('Icon', () => {
  it('aplica className e tamanho informados', () => {
    const { container } = render(<Icon name="trash" size={32} className="meu-icone" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('meu-icone');
    expect(svg).toHaveAttribute('width', '32');
  });
});

describe('TrailMini', () => {
  it('mostra o progresso atual no aria-label', () => {
    const { container } = render(<TrailMini item={makeItem()} />);
    expect(container.querySelector('.trail-mini')).toHaveAttribute(
      'aria-label',
      'Progresso: Vídeo bruto',
    );
  });
});

describe('RowTrail', () => {
  it('avisa quando não há redes definidas', () => {
    const { getByText } = render(<RowTrail item={makeItem()} />);
    expect(getByText('sem redes definidas')).toBeInTheDocument();
  });

  it('mostra uma pílula com a data programada da rede', () => {
    const item = assignNetwork(makeItem(), 'instagram', {
      status: 'scheduled',
      scheduledAt: '2999-06-15T12:10:00',
    });
    const { container } = render(<RowTrail item={item} />);
    const pill = container.querySelector('.row-net-pill');
    expect(pill).toHaveAttribute('data-kind', 'scheduled');
    expect(pill?.textContent).toMatch(/\d{2}\/\d{2} · \d{2}:\d{2}/);
  });
});
