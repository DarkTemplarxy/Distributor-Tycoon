// Small shared presentational helpers used across the UI.

import { useState } from 'react';
import type { CustomerType, ProductId } from '../game/types';

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

// --- Customer-type filter (klein/mittel/groß) --------------------------------
// Display-only multi-toggle used wherever customer lists get long (customers
// modal, orders panel). Transient state — deliberately not saved.

const TYPE_FILTER_LABEL: Record<CustomerType, string> = {
  small: 'Klein',
  medium: 'Mittel',
  large: 'Groß',
};

export function useCustomerTypeFilter() {
  const [visible, setVisible] = useState<Record<CustomerType, boolean>>({
    small: true,
    medium: true,
    large: true,
  });
  const toggle = (t: CustomerType) => setVisible((v) => ({ ...v, [t]: !v[t] }));
  const matches = (t: CustomerType) => visible[t];
  return { visible, toggle, matches };
}

export function CustomerTypeFilter({
  filter,
  counts,
}: {
  filter: ReturnType<typeof useCustomerTypeFilter>;
  /** Optional per-type counts shown in the chips. */
  counts?: Partial<Record<CustomerType, number>>;
}) {
  return (
    <span className="type-filter" title="Kundengrößen ein-/ausblenden (nur Anzeige)">
      {(['small', 'medium', 'large'] as CustomerType[]).map((t) => (
        <button
          key={t}
          className={`type-chip${filter.visible[t] ? ' on' : ''}`}
          onClick={() => filter.toggle(t)}
        >
          {TYPE_FILTER_LABEL[t]}
          {counts?.[t] != null ? ` ${counts[t]}` : ''}
        </button>
      ))}
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
