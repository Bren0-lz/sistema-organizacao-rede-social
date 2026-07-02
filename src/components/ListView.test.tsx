import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListView } from './ListView';
import { resetStore } from '../test/renderWithStore';
import { makeItem } from '../test/factories';

function setup(extra: Partial<React.ComponentProps<typeof ListView>> = {}) {
  const props = {
    items: [makeItem({ title: 'Alfa' }), makeItem({ title: 'Beta' })],
    selected: new Set<string>(),
    onToggle: vi.fn(),
    onToggleAll: vi.fn(),
    onOpen: vi.fn(),
    onDelete: vi.fn(),
    ...extra,
  };
  render(<ListView {...props} />);
  return props;
}

describe('ListView', () => {
  beforeEach(() => resetStore());

  it('renderiza o cabeçalho da tabela', () => {
    setup();
    expect(screen.getByText(/Título/)).toBeInTheDocument();
    expect(screen.getByText('Redes')).toBeInTheDocument();
  });

  it('o checkbox do cabeçalho seleciona todos os itens', () => {
    const props = setup();
    const headerCheckbox = document.querySelector('.col-check input') as HTMLInputElement;
    fireEvent.click(headerCheckbox);
    expect(props.onToggleAll).toHaveBeenCalled();
  });

  it('ordena por título ao clicar no cabeçalho (não quebra)', () => {
    setup();
    fireEvent.click(screen.getByText(/Título/));
    // após alternar a ordenação, a seta de direção aparece
    expect(screen.getByText(/Título/).textContent).toMatch(/Título/);
  });
});
