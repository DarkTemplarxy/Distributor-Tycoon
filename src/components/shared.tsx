// Small shared presentational helpers used across the UI.

import type { ProductId } from '../game/types';

export const PRODUCT_COLOR: Record<ProductId, string> = {
  fisch: 'var(--fisch)',
  fleisch: 'var(--fleisch)',
  gemuese: 'var(--gemuese)',
};

export function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="stars" title={`${value.toFixed(1)} / 5`}>
      {'★'.repeat(Math.max(0, Math.min(5, full)))}
      <span style={{ color: 'var(--text-faint)' }}>{'★'.repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

export function ProductChip({
  id,
  emoji,
  name,
}: {
  id: ProductId;
  emoji: string;
  name: string;
}) {
  return (
    <span className="chip-prod" style={{ ['--prod' as string]: PRODUCT_COLOR[id] }}>
      <span>{emoji}</span>
      <span>{name}</span>
    </span>
  );
}
