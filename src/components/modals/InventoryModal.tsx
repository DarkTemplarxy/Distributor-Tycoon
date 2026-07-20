import { Modal } from '../Modal';
import { useGame } from '../../state/GameProvider';
import { branchOpen, incomingPO, inboundStock, shelfStock } from '../../game/simulation';
import { transferStock } from '../../game/actions';
import { PALETTE_SIZE, SITE_META } from '../../game/constants';
import { prodColor } from '../shared';

export function InventoryModal({ onClose }: { onClose: () => void }) {
  const { state, mutate } = useGame();
  const hasBranch = branchOpen(state);

  return (
    <Modal title="Inventar & Verderblichkeit" icon="📦" onClose={onClose} wide>
      <p className="hint">
        Jede Charge verfällt am angegebenen Tag. Rot = kritisch. Verdorbene Ware ist Totalverlust.
      </p>
      <div className="rows">
        {state.products.map((product) => {
          const shelf = shelfStock(product);
          const inbound = inboundStock(product);
          const incoming = incomingPO(state, product.id);
          const batches = [...product.batches].sort((a, b) => a.expiryDay - b.expiryDay);
          return (
            <div
              key={product.id}
              className="row"
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24 }}>{product.emoji}</span>
                <div className="grow">
                  <div className="title">{product.name}</div>
                  <div className="sub">
                    Haltbarkeit {product.spoilageDays} Tage · EK {product.einkaufspreis}€ · VK{' '}
                    {product.verkaufspreis}€
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="title" style={{ color: prodColor(product.id) }}>
                    {shelf} Stk <span className="sub">im Regal</span>
                  </div>
                  <div className="sub">
                    {hasBranch && (
                      <>
                        🏭 {shelfStock(product, 'hq')} · 🏗️ Süd {shelfStock(product, 'sued')} ·{' '}
                      </>
                    )}
                    {inbound > 0 && <>📥 {inbound} im Wareneingang · </>}
                    {incoming > 0 ? `+${incoming} unterwegs` : inbound === 0 ? 'nichts unterwegs' : ''}
                  </div>
                </div>
              </div>

              {hasBranch && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="sub" style={{ minWidth: 100 }}>🚚 Transfer (1 Palette):</span>
                  {([['hq', 'sued'], ['sued', 'hq']] as const).map(([from, to]) => (
                    <button
                      key={from}
                      className="btn small ghost"
                      disabled={shelfStock(product, from) < PALETTE_SIZE}
                      title={`${PALETTE_SIZE}× vom Regal ${SITE_META[from].short} in den Wareneingang ${SITE_META[to].short} fahren (Kosten je Palette, ~1 Tag).`}
                      onClick={() =>
                        mutate((s) => transferStock(s, product.id, PALETTE_SIZE, from, to))
                      }
                    >
                      {SITE_META[from].short} → {SITE_META[to].short}
                    </button>
                  ))}
                  {(state.transfers ?? []).filter((t) => t.productId === product.id).length > 0 && (
                    <span className="pill">
                      🚚 {(state.transfers ?? []).filter((t) => t.productId === product.id).reduce((a, t) => a + t.quantity, 0)} unterwegs
                    </span>
                  )}
                </div>
              )}

              {batches.length === 0 && <div className="empty" style={{ padding: 6 }}>Kein Bestand.</div>}
              {batches.map((b) => {
                const daysLeft = Math.max(0, b.expiryDay - state.totalDays);
                const ratio = Math.max(0, Math.min(1, daysLeft / product.spoilageDays));
                const cls = ratio < 0.15 ? 'crit' : ratio < 0.35 ? 'warn' : 'ok';
                return (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      style={{ width: 104, fontVariantNumeric: 'tabular-nums' }}
                      title={`${b.location === 'inbound' ? 'Im Wareneingang' : 'Im Regal'} · ${SITE_META[b.siteId ?? 'hq'].name}`}
                    >
                      {b.location === 'inbound' ? '📥' : '🗄️'} {b.quantity}×
                      {hasBranch && <span className="sub"> {SITE_META[b.siteId ?? 'hq'].short}</span>}
                    </span>
                    <div className="progress" style={{ flex: 1, marginTop: 0 }}>
                      <span
                        className={cls}
                        style={{
                          width: `${Math.round(ratio * 100)}%`,
                          background:
                            cls === 'crit'
                              ? 'var(--bad)'
                              : cls === 'warn'
                                ? 'var(--warn)'
                                : 'var(--good)',
                        }}
                      />
                    </div>
                    <span
                      className={`pill ${cls === 'crit' ? 'bad' : cls === 'warn' ? 'warn' : 'good'}`}
                      style={{ width: 92, textAlign: 'center' }}
                    >
                      {daysLeft.toFixed(1)} Tage
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
