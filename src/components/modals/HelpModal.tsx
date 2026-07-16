import { Modal } from '../Modal';

/** A single rule line in the help screen. */
function Rule({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
      <span style={{ fontSize: 22, lineHeight: 1.1 }}>{icon}</span>
      <div className="grow">
        <div className="title" style={{ fontSize: 13 }}>{title}</div>
        <div className="sub">{children}</div>
      </div>
    </div>
  );
}

/**
 * The help / rules screen. Shown automatically once the tutorial finishes and
 * reachable any time from the ❔ button in the top bar. Summarises every core
 * rule so the player has a single place to look things up.
 */
export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Hilfe & Spielregeln" icon="❔" onClose={onClose} wide>
      <p className="hint">
        Dein Ziel: das Geschäft deines Onkels durch 12 Monate bringen. Hier die wichtigsten
        Regeln auf einen Blick.
      </p>

      <div className="rows">
        <Rule icon="🧾" title="Kundenbestellungen">
          Kunden bestellen <b>wöchentlich</b> (Tag variiert). Halte die Lieferfrist bis zur
          angegebenen Woche ein – zu viele Verspätungen, und ein Kunde kündigt.
        </Rule>
        <Rule icon="👷" title="Ware herrichten">
          Deine Lagermitarbeiter machen bestellte Paletten fertig. Im Spiel läuft das nach dem
          Tutorial <b>automatisch</b> (Auto-Herrichten oben umschaltbar).
        </Rule>
        <Rule icon="🕕" title="Arbeitstag 6–20 Uhr">
          Mitarbeiter arbeiten nur zwischen <b>6:00 und 20:00 Uhr</b>. Nachts ruht die Arbeit –
          angefangene Herrichtungen laufen am nächsten Morgen weiter. Die Nacht läuft automatisch
          im <b>Schnellvorlauf (×16)</b>.
        </Rule>
        <Rule icon="🚚" title="Abholung durch den LKW">
          Der LKW kommt <b>täglich um 18:00</b> und holt fertige Paletten ab. Eine Bestellung
          wird immer <b>komplett</b> abgeholt – alle Artikel eines Kunden gehen zusammen raus.
        </Rule>
        <Rule icon="💵" title="Zahlung">
          <b>Kleine</b> Kunden zahlen <b>bar sofort</b> bei Abholung, <b>mittlere</b> nach{' '}
          <b>1 Woche</b>, <b>große</b> nach <b>2 Wochen</b>. Größer werden heißt: in Vorleistung
          gehen.
        </Rule>
        <Rule icon="🛒" title="Einkauf">
          Einmal pro Woche (Samstag) bestellst du Ware nach – oder ein <b>Einkäufer</b> macht das
          automatisch. Die Lieferung kommt <b>nächsten Montag</b> in den Wareneingang und wird
          eingelagert.
        </Rule>
        <Rule icon="🏗️" title="Lager ausbauen">
          Über <b>Bauen</b> erweiterst du Regale, Vorbereitungstische, Anlieferung und die Halle –
          für mehr Lagerplatz und schnelleres paralleles Herrichten.
        </Rule>
        <Rule icon="💸" title="Kosten">
          <b>Personal & Miete</b> werden am <b>Monatsende</b> gesammelt abgebucht; der Wochenreport
          stellt sie vorher nur anteilig zurück.
        </Rule>
        <Rule icon="📨" title="Wachstum">
          Über <b>Anfragen</b> gewinnst du neue Kunden – annehmen zum Wunschpreis oder ein
          Gegenangebot für mehr Marge machen.
        </Rule>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button className="btn primary" onClick={onClose}>
          Verstanden
        </button>
      </div>
    </Modal>
  );
}
