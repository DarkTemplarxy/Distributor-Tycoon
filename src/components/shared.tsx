// Small shared presentational helpers used across the UI.

import { useState, type ReactNode } from 'react';
import { groupOfArticle, PRODUCT_DEFS, type ProductDef } from '../game/constants';
import type { CustomerType, Product, ProductId } from '../game/types';

export const PRODUCT_COLOR: Record<ProductId, string> = {
  fisch: 'var(--fisch)',
  fleisch: 'var(--fleisch)',
  gemuese: 'var(--gemuese)',
  kaese: 'var(--kaese)',
  obst: 'var(--obst)',
  tiefkuehl: 'var(--tiefkuehl)',
  delikatess: 'var(--delikatess)',
  wein: 'var(--wein)',
  oliven: 'var(--oliven)',
};

/** Farbe eines Artikels ODER einer Gruppe (Artikel erben die Kategorie-Farbe der
 * Gruppe). Phase B2: Auftrags-/Lager-Keys sind Artikel — hier auf die Gruppe abbilden. */
export function prodColor(id: string): string {
  return PRODUCT_COLOR[(groupOfArticle(id) ?? id) as ProductId] ?? 'var(--text-dim)';
}

/** Gelistete Artikel nach Kategorie (Gruppe) gebündelt, in Katalog-Reihenfolge —
 * die Grundlage für die gruppierte Artikel-Darstellung (Phase B3). */
export function groupedProducts(products: Product[]): { def: ProductDef; items: Product[] }[] {
  return PRODUCT_DEFS.map((def) => ({ def, items: products.filter((p) => p.groupId === def.id) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Aufklappbarer Kategorie-Abschnitt: Kopfzeile (Emoji + Name + optionale rechte Info)
 * über den Artikeln der Gruppe. So bleibt eine lange Artikel-Liste navigierbar. */
export function CategorySection({
  def,
  right,
  defaultOpen = true,
  children,
}: {
  def: ProductDef;
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="cat-section">
      <button className="cat-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="cat-caret">{open ? '▾' : '▸'}</span>
        <span style={{ fontSize: 17 }}>{def.emoji}</span>
        <span className="cat-title" style={{ color: PRODUCT_COLOR[def.id] }}>
          {def.name}
        </span>
        {right != null && <span className="cat-right">{right}</span>}
      </button>
      {open && <div className="cat-body">{children}</div>}
    </div>
  );
}

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
