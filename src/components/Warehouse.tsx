import { useGame } from '../state/GameProvider';
import { PALETTE_SIZE } from '../game/constants';
import { inventoryTotal } from '../game/simulation';
import { dayOfWeek, hourOf } from '../game/util';
import type { GameState, Product } from '../game/types';
import { PRODUCT_COLOR } from './shared';

interface ShelfPallet {
  productId: Product['id'];
  emoji: string;
  name: string;
  qty: number;
  urgency: 'ok' | 'warn' | 'crit';
  ratio: number;
}

function buildShelfPallets(state: GameState): ShelfPallet[] {
  const result: ShelfPallet[] = [];
  for (const product of state.products) {
    const total = inventoryTotal(product);
    if (total <= 0) continue;
    // Soonest expiry drives the visual urgency for this product's pallets.
    const soonest = Math.min(...product.batches.map((b) => b.expiryDay));
    const daysLeft = soonest - state.totalDays;
    const ratio = Math.max(0, Math.min(1, daysLeft / product.spoilageDays));
    const urgency = ratio < 0.15 ? 'crit' : ratio < 0.35 ? 'warn' : 'ok';

    let remaining = total;
    while (remaining > 0) {
      const qty = Math.min(PALETTE_SIZE, remaining);
      result.push({
        productId: product.id,
        emoji: product.emoji,
        name: product.name,
        qty,
        urgency,
        ratio,
      });
      remaining -= qty;
    }
  }
  return result;
}

function truckPhase(state: GameState): 'away' | 'here' | 'leaving' {
  if (state.truckAnimUntil > state.totalDays) return 'leaving';
  const dow = dayOfWeek(state.totalDays);
  const hour = hourOf(state.totalDays);
  if (dow === 0 && hour >= 16.5 && hour < 18) return 'here';
  return 'away';
}

export function Warehouse() {
  const { state } = useGame();
  const shelf = buildShelfPallets(state);
  const totalSlots = state.warehouse.paletteSlotsTotal;
  const shown = shelf.slice(0, totalSlots);
  const overflow = shelf.length - shown.length;
  const emptySlots = Math.max(0, totalSlots - shown.length);

  const workers = state.employees.filter((e) => e.role === 'lager');
  const readyPalettes = state.palettes.filter((p) => p.status === 'ready');
  const phase = truckPhase(state);

  return (
    <div className="warehouse">
      {/* Shelf / storage */}
      <div className="wh-zone">
        <div className="zone-title">
          📦 Lager · Regal
          <span className="cap">
            {shelf.length} / {totalSlots} Plätze belegt{overflow > 0 ? ` · +${overflow} Überlauf` : ''}
          </span>
        </div>
        <div className="shelf-grid">
          {shown.map((p, i) => (
            <div
              key={i}
              className={`pallet${p.urgency === 'warn' ? ' exp-warn' : p.urgency === 'crit' ? ' exp-crit' : ''}`}
              style={{ ['--prod' as string]: PRODUCT_COLOR[p.productId] }}
              title={`${p.name}: ${p.qty} Einheiten`}
            >
              <span className="emoji">{p.emoji}</span>
              <span className="qty">{p.qty}</span>
              <span className="name">{p.name}</span>
              <span
                className={`exp-bar ${p.urgency}`}
                style={{ width: `${Math.round(p.ratio * 100)}%` }}
              />
            </div>
          ))}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div key={`e${i}`} className="slot">
              leer
            </div>
          ))}
        </div>
      </div>

      {/* Herrichtung / workers */}
      <div className="wh-zone">
        <div className="zone-title">
          🛠️ Herrichtung
          <span className="cap">{state.warehouse.herrichtungTables} Tisch</span>
        </div>
        <div className="workers">
          {workers.map((w) => {
            const busy = !!w.task;
            const pct = w.task ? Math.round((1 - w.task.remainingDays / w.task.totalDays) * 100) : 0;
            return (
              <div key={w.id} className={`worker${busy ? ' busy' : ''}`}>
                <div className="top">
                  <span className="avatar">👷</span>
                  <div>
                    <div className="wname">{w.name}</div>
                    <div className="wmeta">Skill {w.skill}</div>
                  </div>
                  <span className="status">{busy ? 'Arbeitet' : 'Frei'}</span>
                </div>
                {busy && (
                  <div className="progress">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {workers.length === 0 && <div className="empty">Keine Lagermitarbeiter.</div>}
        </div>
      </div>

      {/* Ramp / Abholzone + truck */}
      <div className="wh-zone">
        <div className="zone-title">
          🏗️ Abholzone · Rampe
          <span className="cap">
            {phase === 'here'
              ? 'Laster wartet…'
              : phase === 'leaving'
                ? 'Laster fährt ab'
                : 'Nächste Abholung: Mo 18:00'}
          </span>
        </div>
        <div className="ramp">
          <div className="ready-pallets">
            {readyPalettes.map((p) => {
              const cust = state.customers.find((c) => c.id === p.customerId);
              const prod = state.products.find((pr) => pr.id === p.productId);
              return (
                <div
                  key={p.id}
                  className="mini-pallet"
                  style={{ ['--prod' as string]: PRODUCT_COLOR[p.productId] }}
                  title={`${p.quantity}× ${prod?.name} für ${cust?.name}`}
                >
                  <div className="emoji">{prod?.emoji}</div>
                  <div>{p.quantity}×</div>
                  <div style={{ color: 'var(--text-dim)' }}>{cust?.emoji}</div>
                </div>
              );
            })}
            {readyPalettes.length === 0 && (
              <div className="empty" style={{ padding: 8 }}>
                Keine fertigen Paletten.
              </div>
            )}
          </div>
          <div className="truck-lane">
            <div className={`truck ${phase}`}>🚚</div>
          </div>
        </div>
      </div>
    </div>
  );
}
