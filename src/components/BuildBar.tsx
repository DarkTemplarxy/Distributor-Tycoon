import { useGame } from '../state/GameProvider';
import {
  COOL_TILE_PRICE,
  DESK_PRICE,
  INBOUND_SLOT_PRICE,
  RENT_PER_EXPANSION,
  SHELF_PRICE,
  TABLE_PRICE,
  hallExpansionPrice,
  officeExpansionPrice,
} from '../game/constants';
import { availableCredit } from '../game/simulation';
import { euro } from '../game/util';
import type { BuildTool } from './IsometricWarehouse';
import type { SiteId } from '../game/types';

const TOOLS: { id: BuildTool; icon: string; label: string; hint: string }[] = [
  { id: 'shelf', icon: '🧱', label: 'Regal', hint: '+4 Palettenplätze' },
  { id: 'table', icon: '🔧', label: 'Tisch', hint: 'mehr paralleles Herrichten' },
  { id: 'inbound', icon: '📥', label: 'Anlieferung', hint: 'Wareneingang +1 Platz' },
  { id: 'expand', icon: '🏗️', label: 'Erweiterung', hint: `+4 Kacheln (rechts/hinten) · Miete +${RENT_PER_EXPANSION} €/Monat` },
  { id: 'desk', icon: '🪑', label: 'Arbeitsplatz', hint: 'Sitzplatz für 1 Büro-Mitarbeiter' },
  { id: 'officeExpand', icon: '🏢', label: 'Bürogebiet', hint: `+4 Bürokacheln (links) · Miete +${RENT_PER_EXPANSION} €/Monat` },
  { id: 'cool', icon: '❄️', label: 'Kühlbereich', hint: 'Lager-Kachel markieren: Regale darauf werden Kühlregale – NUR dort lagert kühlpflichtige Ware (Käse, Tiefkühl, Feinkost), und dort lagert nichts anderes.' },
];

export function BuildBar({
  tool,
  onSelect,
  onExit,
  site = 'hq',
}: {
  tool: BuildTool | null;
  onSelect: (t: BuildTool | null) => void;
  onExit: () => void;
  /** Aktiver Standort — am Standort Süd gibt es kein Büro (Verwaltung zentral). */
  site?: SiteId;
}) {
  const { state } = useGame();
  const budget = state.cash + availableCredit(state);
  const tools = TOOLS.filter((t) => site === 'hq' || (t.id !== 'desk' && t.id !== 'officeExpand'));
  const priceOf = (id: BuildTool) =>
    id === 'shelf'
      ? SHELF_PRICE
      : id === 'table'
        ? TABLE_PRICE
        : id === 'inbound'
          ? INBOUND_SLOT_PRICE
          : id === 'desk'
            ? DESK_PRICE
            : id === 'cool'
              ? COOL_TILE_PRICE
              : id === 'officeExpand'
                ? officeExpansionPrice(state.warehouse.officeExpansions)
                : hallExpansionPrice(state.warehouse.expansions);

  return (
    <div
      style={{
        position: 'absolute',
        top: 10,
        left: 10,
        right: 10,
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: '8px 10px',
        borderRadius: 10,
        background: 'rgba(12,18,24,0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 14, marginRight: 4 }}>🏗️ Bau-Modus</span>
      {tools.map((t) => {
        const price = priceOf(t.id);
        const active = tool === t.id;
        const afford = budget >= price;
        return (
          <button
            key={t.id}
            title={t.hint}
            onClick={() => onSelect(active ? null : t.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              minWidth: 92,
              padding: '5px 8px',
              borderRadius: 8,
              cursor: 'pointer',
              color: afford ? 'var(--text)' : 'var(--text-faint)',
              background: active ? 'rgba(90,210,120,0.22)' : 'rgba(255,255,255,0.05)',
              border: active ? '1px solid var(--good)' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span style={{ fontSize: 15 }}>
              {t.icon} {t.label}
            </span>
            <span style={{ fontSize: 12, color: afford ? 'var(--text-dim)' : 'var(--bad)' }}>{euro(price)}</span>
          </button>
        );
      })}
      <button
        title="Abreißen: Regal/Tisch/Arbeitsplatz/Kühlbereich-Markierung anklicken – 50 % des Preises zurück."
        onClick={() => onSelect(tool === 'demolish' ? null : 'demolish')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          minWidth: 92,
          padding: '5px 8px',
          borderRadius: 8,
          cursor: 'pointer',
          color: 'var(--text)',
          background: tool === 'demolish' ? 'rgba(240,109,109,0.24)' : 'rgba(255,255,255,0.05)',
          border: tool === 'demolish' ? '1px solid var(--bad)' : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span style={{ fontSize: 15 }}>🧹 Abreißen</span>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>50 % zurück</span>
      </button>
      <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 'auto' }}>
        {tool === 'demolish'
          ? 'Rot markiertes Objekt anklicken zum Abreißen'
          : tool
            ? 'Grüne Kachel anklicken zum Platzieren'
            : 'Werkzeug wählen'}
      </span>
      <button className="btn small" onClick={onExit}>
        Fertig
      </button>
    </div>
  );
}
