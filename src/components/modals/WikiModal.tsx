import { useState, type ReactNode } from 'react';
import { Modal } from '../Modal';
import {
  BANKRUPTCY_CASH,
  CREDIT_INTEREST_RATE,
  CREDIT_LIMIT_FLOOR,
  CUSTOMER_LEAD_WEEKS,
  EXPANSION_CHANCE_PER_CUSTOMER,
  EXPANSION_MAX_PER_WEEK,
  DEMAND_COOLDOWN_WEEKS,
  DEMAND_ESCALATION_DELAY,
  DEMAND_MAX_LINES,
  DEMAND_MIN_CUSTOMER_WEEKS,
  DEMAND_MIN_LOYALTY,
  DEMAND_STAGE1_DEADLINE,
  DEMAND_STAGE2_DEADLINE,
  DESK_PRICE,
  EXPRESS_PO_LEAD_DAYS,
  EXPRESS_RESTOCK_SURCHARGE,
  HALL_EXPANSION_BASE,
  HIRE_WEEKS_UPFRONT,
  INBOUND_SLOT_PRICE,
  INQUIRY_EXPIRY_WEEKS,
  INQUIRY_PRICE_TIERS,
  LARGE_UNLOCK_MONTHLY,
  BRANCH_PRICE,
  BRANCH_RENT,
  BRANCH_UNLOCK_MONTHLY,
  REGIONAL_UNLOCK,
  REGIONAL_KAM_LARGE_SLOTS,
  REGIONAL_OFFICE_FOUND_COST,
  BUYER_PRODUCT_CAPACITY,
  COMPETITOR_DEFS,
  LOYALTY_CHURN_THRESHOLD,
  POACH_LOYALTY_CEILING,
  MANAGER_SLOTS,
  MEDIUM_UNLOCK_MONTHLY,
  MILESTONE_DEFS,
  MONTHLY_RENT,
  NIGHT_SPEED,
  OFFICE_EXPANSION_BASE,
  CARRY_CAPACITY,
  CARRY_CAPACITY_CART,
  PALETTE_SIZE,
  PAYMENT_DELAY_DAYS_BY_TYPE,
  PO_LEAD_DAYS,
  COOL_TILE_PRICE,
  NO_COOLING_SPOILAGE_MULT,
  PRODUCT_DEFS,
  PRODUCT_VOLUME_FACTOR,
  RENT_PER_EXPANSION,
  REPRICE_COOLDOWN_WEEKS,
  REPRICE_FAIL_LOYALTY_COST,
  REPRICE_STAR_CEILING_BONUS,
  REPRICE_SUCCESS_LOYALTY_COST,
  REPRICE_TOLERANCE,
  ROLE_LABEL,
  ROLE_SALARY,
  SHELF_PRICE,
  SHELF_SLOTS,
  SLOT_COST,
  TABLE_PRICE,
  TRUCK_COST_PER_PALLET,
  TRUCK_HOUR,
  WEEKS_PER_YEAR,
  WORK_END_HOUR,
  WORK_START_HOUR,
} from '../../game/constants';
import { euro } from '../../game/util';

/** One encyclopedia entry. `keywords` feed the search on top of the title —
 * the body itself is JSX and not searchable, so be generous with them. */
interface WikiEntry {
  icon: string;
  title: string;
  keywords: string;
  body: ReactNode;
}

const pct = (f: number) => `${Math.round(f * 100)} %`;

// All numbers come straight from the game constants, so the manual can never
// drift out of date when balancing changes.
const ENTRIES: WikiEntry[] = [
  {
    icon: '🎯',
    title: 'Spielziel & Jahresrhythmus',
    keywords: 'jahr bilanz meilensteine notizbuch onkel ziel woche 48',
    body: (
      <>
        <p>
          Du führst den Lebensmittel-Großhandel deines Onkels. Ein Spieljahr hat{' '}
          <b>{WEEKS_PER_YEAR} Wochen</b> (12 Monate × 4 Wochen); am Jahresende zieht die{' '}
          <b>Jahresbilanz</b> Fazit und vergleicht mit dem Vorjahr. Langfristige Ziele stehen in{' '}
          <b>Onkels Notizbuch</b> ({MILESTONE_DEFS.length} Meilensteine) – sie feiern deinen
          Fortschritt, erzwingen aber nichts.
        </p>
        <p>
          Verloren ist das Spiel nur bei <b>Insolvenz</b>: Fällt die Kasse unter{' '}
          {euro(BANKRUPTCY_CASH)}, ist Schluss.
        </p>
      </>
    ),
  },
  {
    icon: '📅',
    title: 'Wochenrhythmus & Uhrzeit',
    keywords: 'donnerstag samstag montag lkw laster nacht arbeitszeit truck zeit',
    body: (
      <>
        <p>
          <b>Donnerstag</b> kommen neue Kundenanfragen. <b>Samstag</b> öffnet das Bestellfenster –
          dann sind alle Bestellungen der Woche bekannt. Die Lieferung des Lieferanten kommt{' '}
          <b>Montag</b> ({PO_LEAD_DAYS} Tage Vorlauf). Der Abhol-LKW fährt <b>täglich um{' '}
          {TRUCK_HOUR}:00</b> und nimmt alle fertigen Paletten mit ({TRUCK_COST_PER_PALLET}€ je
          Palette Logistik).
        </p>
        <p>
          Gearbeitet wird von <b>{WORK_START_HOUR} bis {WORK_END_HOUR} Uhr</b> – nachts ruht das
          Lager und die Uhr läuft automatisch mit <b>×{NIGHT_SPEED}</b> schnell durch.
        </p>
      </>
    ),
  },
  {
    icon: '🤝',
    title: 'Kundengrößen & Freischaltung',
    keywords: 'klein mittel groß supermarkt zahlungsziel lieferzeit freischalten monatsumsatz 120 600',
    body: (
      <>
        <p>
          <b>Kleine Kunden</b> (Restaurants): Lieferzeit {CUSTOMER_LEAD_WEEKS.small} Woche, zahlen{' '}
          <b>bar bei Abholung</b>. <b>Mittlere</b> (Hotels/Kantinen): {CUSTOMER_LEAD_WEEKS.medium}{' '}
          Wochen Lieferzeit, Zahlungsziel {PAYMENT_DELAY_DAYS_BY_TYPE.medium} Tage.{' '}
          <b>Große</b> (Supermärkte): {CUSTOMER_LEAD_WEEKS.large} Wochen,{' '}
          {PAYMENT_DELAY_DAYS_BY_TYPE.large} Tage Zahlungsziel – mehr Umsatz, aber du gehst in
          Vorleistung.
        </p>
        <p>
          Mittlere Kunden fragen erst ab <b>{euro(MEDIUM_UNLOCK_MONTHLY)} Monatsumsatz</b> an
          (rollierende 4 Wochen), große ab <b>{euro(LARGE_UNLOCK_MONTHLY)}</b>.
        </p>
      </>
    ),
  },
  {
    icon: '📨',
    title: 'Anfragen & Wunschpreise',
    keywords: 'anfrage neukunde bestandskunde lowball gegenangebot chance annehmen ablehnen listung',
    body: (
      <>
        <p>
          Neue Anfragen sind unterschiedlich gut: ~{pct(INQUIRY_PRICE_TIERS[0].weight)} bieten{' '}
          {pct(INQUIRY_PRICE_TIERS[0].range[0])}–{pct(INQUIRY_PRICE_TIERS[0].range[1])} des
          Listen-VK, ~{pct(INQUIRY_PRICE_TIERS[1].weight)} liegen bei{' '}
          {pct(INQUIRY_PRICE_TIERS[1].range[0])}–{pct(INQUIRY_PRICE_TIERS[1].range[1])}, und ~
          {pct(INQUIRY_PRICE_TIERS[2].weight)} sind <b>Lowballs</b> (
          {pct(INQUIRY_PRICE_TIERS[2].range[0])}–{pct(INQUIRY_PRICE_TIERS[2].range[1])}). Wachstum
          verdient man durch <b>Auswahl</b>, nicht durch Annehmen um jeden Preis.
        </p>
        <p>
          <b>Annehmen</b> schließt sofort zum Wunschpreis ab. Ein <b>Gegenangebot</b> fordert mehr –
          je weiter über dem Wunsch, desto eher platzt der Deal. Unbeantwortete Anfragen verfallen
          nach {INQUIRY_EXPIRY_WEEKS} Wochen. Anfragen können auch <b>ungelistete Produkte</b>{' '}
          betreffen: Annehmen listet das Produkt automatisch (Gebühr wird fällig). Jede Anfrage ist
          klar als ✨ Neukunde oder 🔁 Bestandskunde markiert.
        </p>
        <p>
          Zu jeder Anfrage siehst du die <b>Marge zum Wunschpreis</b> (farbig gegen deine Zielmarge)
          – so erkennst du gute Angebote und Lowballs auf einen Blick, ohne selbst zu rechnen.
        </p>
        <p>
          <b>Jede Kundengröße hat ihren eigenen Markt.</b> Neukunden-Anfragen kommen pro Größe umso{' '}
          <b>seltener</b>, je mehr Kunden dieser Größe du schon hast (kleine sättigen früh: ~0,8/Woche
          am Anfang, bei ~17 kleinen ~0,4, bei 40+ ~0,2). Weil kleine und mittlere/große Kunden{' '}
          <b>getrennte</b> Märkte sind, verdrängt ein großer Stamm kleiner Kunden nicht die seltenen,
          wertvollen mittleren und großen Anfragen – die bleiben ein eigener Kanal. So bleibt die
          Kundenliste über Jahre überschaubar, während spät der Fokus auf größere Kunden wandert.
        </p>
        <p>
          Dafür melden sich <b>Bestandskunden häufiger</b> mit Erweiterungswünschen für weitere
          Produktgruppen (je {pct(EXPANSION_CHANCE_PER_CUSTOMER)} pro treuem Kunden und Woche, max.{' '}
          {EXPANSION_MAX_PER_WEEK}/Woche). Diese Wünsche sind unverbindlich – Ablehnen hat keine
          Folgen, anders als beim seltenen ⚠️ Ultimatum-Pfad. Willst du bewusst mehr Kunden gewinnen,
          stelle <b>Vertriebsmitarbeiter</b> ein – sie <b>vergrößern deinen Markt</b> (siehe Personal).
        </p>
      </>
    ),
  },
  {
    icon: '⚖️',
    title: 'Preisverhandlung im Vertrag',
    keywords: 'preis erhöhen verhandlung sperrfrist cooldown marge decke sterne salami vereinbart',
    body: (
      <>
        <p>
          Bestehende Vertragspreise (Kunden-Ansicht) zu <b>erhöhen ist eine Verhandlung</b>: Der
          Kunde kann ablehnen – dann bleibt der alte Preis und die Loyalität sinkt (−
          {REPRICE_FAIL_LOYALTY_COST}; bei Annahme −{REPRICE_SUCCESS_LOYALTY_COST}). Nach jedem
          Versuch ist die Linie <b>{REPRICE_COOLDOWN_WEEKS} Wochen gesperrt</b>.
        </p>
        <p>
          Bewertet wird gegen den zuletzt <b>vereinbarten</b> Preis (kleine Schritte summieren sich
          – Toleranz nur {pct(REPRICE_TOLERANCE)}). Die erreichbare Obergrenze hängt an deinen{' '}
          <b>Service-Sternen</b>: je Stern über 3 etwa +{pct(REPRICE_STAR_CEILING_BONUS)} über den
          Listen-VK – mit 5★ sind so ~45 % Marge drin, mit schwachem Service kaum der Listenpreis.
          Preissenkungen werden immer akzeptiert. Neue Kunden starten meist <b>unter</b> der
          Zielmarge: Marge verdient man sich über Service.
        </p>
      </>
    ),
  },
  {
    icon: '❤️',
    title: 'Loyalität & Service-Sterne',
    keywords: 'loyalität sterne bewertung kündigung vorwarnung verspätung zufrieden',
    body: (
      <>
        <p>
          <b>Loyalität</b> (0–100, je Kunde) steigt mit pünktlichen Lieferungen und erfüllten
          Wünschen, sinkt bei Verspätungen und Preiserhöhungen. Fällt sie unter{' '}
          <b>{LOYALTY_CHURN_THRESHOLD}</b>, warnt der Kunde („droht zu kündigen") – ab der
          Folgewoche kann er wirklich gehen. Erholung (Service, Rabatt) stoppt das.
        </p>
        <p>
          <b>Service-Sterne</b> (je Kunde 1–5, oben firmenweit gemittelt) sinken bei Verspätungen.
          Sie bestimmen die Verspätungs-Toleranz (bei zu vielen kündigt der Kunde), die{' '}
          <b>Verhandlungschancen</b> und die Preis-Obergrenze. Es gilt: erst zuverlässig liefern,
          dann Preise anheben.
        </p>
      </>
    ),
  },
  {
    icon: '🌍',
    title: 'Standorte & Konzern',
    keywords: 'standort süd filiale expansion region transfer konzern zweigstelle wein oliven standortleiter cockpit delegation delegieren automatisch führen',
    body: (
      <>
        <p>
          Ab {Math.round(BRANCH_UNLOCK_MONTHLY / 1000)}k € Monatsumsatz kannst du im 🏢{' '}
          <b>Ausbau</b> den <b>Standort Süd</b> eröffnen ({BRANCH_PRICE.toLocaleString('de-DE')}€ +{' '}
          {BRANCH_RENT.toLocaleString('de-DE')}€ Monatsmiete): eine eigene, ausbaubare Halle mit
          eigenem Lagerpersonal. Er erschließt die <b>Region Süd</b> — neue Kunden, die NUR von dort
          beliefert werden können. Die <b>Verwaltung</b> (Büro, KAMs, Einkäufer, Vertrieb) bleibt
          zentral im Hauptlager: ein Konzern, zwei Betriebe.
        </p>
        <p>
          <b>Regionalprodukte:</b> 🍷 Wein & 🫒 Oliven liefert der Lieferant NUR nach Süd, 🐟 Fisch
          NUR nach Nord. Will ein Kunde das Produkt der anderen Region, fährst du es per{' '}
          <b>🚚 Transfer</b> (auf der Konzern-Karte, ~1 Tag) vom Regal des einen in den Wareneingang
          des anderen Standorts — die Haltbarkeit reist mit. Deinen <b>eigenen Fuhrpark</b> baust du
          auf der Konzern-Karte aus <b>vier Fahrzeugklassen</b> (🚐 Transporter 5, 🚚 LKW 10,
          🚛 Sattelzug 20, Lastzug 30 Paletten) – je <b>Kaufpreis + Monatskosten</b> (Instandhaltung
          & Treibstoff). Die Gesamtkapazität fährt Transfer-Paletten günstig (darüber der teurere
          Fremd-Spediteur) und senkt die Abholkosten; die Fahrzeuge siehst du live auf der Karte.
          Baust du zusätzlich ein <b>📦 Verteilzentrum</b> (Konzern-Bauwerk auf der Konzern-Karte)
          und stellst einen <b>🚚 Logistikleiter</b> ein, laufen diese Transfers <b>automatisch</b>:
          Regionalprodukte & Großkunden werden lagerübergreifend beliefert, ohne dass du noch etwas
          verschieben musst. Jeder Standort hat
          sein eigenes Samstags-Bestellfenster; der Umschalter über der Halle wechselt die Ansicht.
          Vorsicht: Eröffnung + Personal + Warenaufbau summieren sich — wer zu früh expandiert,
          kann sich übernehmen.
        </p>
        <p>
          <b>🧑‍✈️ Standortleiter & Konzern-Karte:</b> Der 🗺️ <b>Konzern</b>-Button öffnet eine eigene
          <b>Karten-Ansicht</b>, die mit dir mitwächst: von der <b>Stadt</b> (deine Standorte Nord &
          Süd) zoomst du später auf <b>Deutschland</b> (Städte) und <b>Europa</b> (Länder). Klick auf
          einen Standort öffnet sein Panel – dort siehst du seine Kennzahlen (Kunden, Volumen, Personal,
          Service, Auslastung, Alarme), <b>betrittst</b> das echte Lager oder setzt einen{' '}
          <b>Standortleiter</b> ein. Der <b>führt den Standort dann selbst</b>: stellt Lagerkräfte nach
          Bedarf ein, baut Packtische/Regale/Kühlzone/Rampe aus und <b>trainiert die Crew</b> — alles
          automatisch im Hintergrund, auch wenn du gerade woanders bist. Für den <b>Nachschub sorgt
          weiterhin der Einkäufer</b> zentral, also gib einem delegierten Standort genügend
          Einkäufer-Kapazität. Auf der Stadt-Karte kannst du außerdem <b>Waren per Klick zwischen Nord
          & Süd transferieren</b> (laufende Transfers fahren als 🚚 auf der Route), und ab zwei
          Standorten kannst du (als bezahlten zweiten Schritt nach dem Standort-Kauf) ein{' '}
          <b>Regionalbüro Deutschland gründen</b> ({REGIONAL_OFFICE_FOUND_COST.toLocaleString('de-DE')}€,
          auf der 🗺️ Konzern-Karte). Seine Führungscrew schaltet danach <b>gestaffelt über eigene Hürden</b> frei –
          jede Rolle dann, wenn du den Engpass, den sie löst, gerade spürst: der <b>📣 Marketing-Manager</b>
          ist sofort da, <b>Kundenbetreuer</b> ab {REGIONAL_UNLOCK.KUNDENBETREUER_CUSTOMERS} Kunden am neuen
          Standort, <b>Einkaufsleiter</b> ab {REGIONAL_UNLOCK.EINKAUFSLEITER_PRODUCTS} Produktgruppen, der{' '}
          <b>🏬 Regional-KAM</b> (betreut die Großkunden) ab {Math.round(LARGE_UNLOCK_MONTHLY / 1000)}k €
          Monatsumsatz, der <b>Personalleiter</b> ab {REGIONAL_UNLOCK.PERSONALLEITER_HEADCOUNT} Mitarbeitern.
          So baust du den neuen Standort Schritt für Schritt zur eigenständigen Region aus. Eine{' '}
          <b>Konzernzentrale mit C-Level</b> kommt erst hinzu, wenn du ein <b>zweites Land</b> erschließt.
        </p>
        <p>
          <b>🏬 Großkunden (Landeskunden):</b> Supermarkt-Ketten werden aus der Einzel-Standort-Sicht
          herausgenommen und im <b>Regionalbüro</b> geführt: ein <b>Regional-KAM betreut bis zu{' '}
          {REGIONAL_KAM_LARGE_SLOTS} Großkunden</b>. Ohne Regional-KAM gibt es keine Großkunden – stelle
          ihn also ein, sobald die Ketten anklopfen.
        </p>
        <p>
          <b>📣 Ruf (Renown):</b> Jeder Standort baut mit <b>gutem Service</b> und vielen zufriedenen
          Kunden über die Zeit einen <b>Ruf</b> (0–100) auf – ein bekannter Name zieht schneller
          Neukunden an. Der Clou: ein <b>neu eröffneter Standort erbt einen Teil des Landes-Rufs</b> und
          <b>wächst dadurch schneller</b> als dein erster (der bei Null anfing). Der{' '}
          <b>📣 Marketing-Manager</b> im Regionalbüro <b>beschleunigt den Ruf-Aufbau</b> – am stärksten
          am jungen Standort („Kunden werden vor allem initial schneller aufmerksam"). Den Ruf siehst du
          in der 🗺️ Konzern-Ansicht.
        </p>
      </>
    ),
  },
  {
    icon: '📈',
    title: 'Markt & Konkurrenz',
    keywords: 'markt konkurrenz wettbewerber marktanteil ranking abwerben abwerbung umworben preiskampf',
    body: (
      <>
        <p>
          Du bist nicht allein: <b>{COMPETITOR_DEFS.length} KI-Wettbewerber</b> teilen sich mit dir
          den Markt. Dein <b>Marktanteil</b> (im 📈 <b>Markt</b>-Fenster) wächst mit jedem aktiven
          Kunden – große zählen mehr als kleine. Ein Blick ins Ranking zeigt, wo du stehst.
        </p>
        <p>
          Wettbewerber <b>werben Kunden ab</b> – aber nur <b>verwundbare</b>: Kunden mit niedriger
          Loyalität (unter {POACH_LOYALTY_CEILING}%) oder solche, denen du deutlich <b>über dem
          Listenpreis</b> verkaufst. Eine Abwerbung senkt die Loyalität und markiert den Kunden{' '}
          <b>🎯 umworben</b>; hält das an, rutscht er unter die Kündigungsschwelle und ist weg.
          Zufriedene, fair bepreiste Kunden sind <b>immun</b>. Gegenmittel: <b>pünktlich liefern</b>{' '}
          (Sterne + Loyalität), <b>faire Preise</b> und im Notfall ein <b>Rabatt</b>. Aggressive
          Wettbewerber (siehe Ranking) schlagen häufiger zu, je kleiner dein Anteil ist.
        </p>
      </>
    ),
  },
  {
    icon: '🙋',
    title: 'Kundenwünsche & Ultimaten',
    keywords: 'wunsch ultimatum abwanderung konkurrent frist countdown produktgruppe fordern',
    body: (
      <>
        <p>
          Treue Bestandskunden (Loyalität ≥ {DEMAND_MIN_LOYALTY}, seit ≥{' '}
          {DEMAND_MIN_CUSTOMER_WEEKS} Wochen Kunde, unter {DEMAND_MAX_LINES} Produktgruppen)
          wünschen sich mit der Zeit eine <b>weitere Produktgruppe</b> – Frist{' '}
          {DEMAND_STAGE1_DEADLINE[0]}–{DEMAND_STAGE1_DEADLINE[1]} Wochen. Annehmen bringt Umsatz
          und Loyalität.
        </p>
        <p>
          Ablehnen oder verstreichen lassen? Dann kommt das Thema nach{' '}
          {DEMAND_ESCALATION_DELAY[0]}–{DEMAND_ESCALATION_DELAY[1]} Wochen als{' '}
          <b>⚠️ ULTIMATUM</b> zurück ({DEMAND_STAGE2_DEADLINE[0]}–{DEMAND_STAGE2_DEADLINE[1]}{' '}
          Wochen Frist). Wer auch das ablehnt, verliert den Kunden <b>komplett</b> an die
          Konkurrenz – der verlorene Wochenumsatz wird beziffert. Es läuft höchstens{' '}
          <b>ein Vorgang</b> gleichzeitig, mit {DEMAND_COOLDOWN_WEEKS} Wochen Pause danach, und nie
          ohne doppelte Vorwarnung. Fristen laufen sichtbar in Anfragen- und Kunden-Ansicht mit.
        </p>
      </>
    ),
  },
  {
    icon: '🧑‍💼',
    title: 'KAM & Kunden-Slots',
    keywords: 'kam key account manager slots kapazität chef umverteilen betreuung',
    body: (
      <>
        <p>
          Jeder Manager (du als Chef + jeder KAM) betreut bis zu <b>{MANAGER_SLOTS} Slots</b>.
          Kunden belegen je nach Größe {SLOT_COST.small}/{SLOT_COST.medium}/{SLOT_COST.large}{' '}
          Slots (klein/mittel/groß) – und zwar bei <b>einem</b> Manager: 3+3 freie Slots bei zwei
          Managern reichen NICHT für einen großen Kunden. In der Kunden-Ansicht kannst du Kunden
          zwischen Managern umverteilen.
        </p>
        <p>
          Neue Kunden brauchen freie Slots; Erweiterungen bestehender Kunden (zusätzliche
          Produktlinien) nicht.
        </p>
      </>
    ),
  },
  {
    icon: '📦',
    title: 'Warenfluss im Lager',
    keywords: 'wareneingang einlagern regal herrichten tisch abholzone palette begehbar bauen',
    body: (
      <>
        <p>
          Lieferungen landen im <b>Wareneingang</b> (je Anlieferungsplatz {PALETTE_SIZE}{' '}
          Einheiten Puffer). Erst wenn Lagerkräfte die Ware in ein <b>Regal</b> eingelagert haben
          (je Regal {SHELF_SLOTS} Paletten = {SHELF_SLOTS * PALETTE_SIZE} Einheiten), ist sie für
          Aufträge verfügbar. Das <b>Herrichten</b> eines Auftrags braucht einen freien{' '}
          <b>Vorbereitungstisch</b> – Tische begrenzen, wie viele Aufträge parallel laufen.
          Fertige Paletten warten in der Abholzone auf den 18-Uhr-LKW.
        </p>
        <p>
          Beim Herrichten wird die Ware <b>physisch vom Regal zum Packtisch getragen</b>. Eine
          Kraft trägt max. <b>{CARRY_CAPACITY} Einheiten pro Weg</b> (mit{' '}
          <b>🛒 Kommissionierwagen {CARRY_CAPACITY_CART}</b>) – größere Aufträge brauchen mehrere
          Wege und dauern entsprechend länger. Der Wagen halbiert also die Wege UND packt schneller.
        </p>
        <p>
          <b>In welcher Reihenfolge werden Aufträge herrichtet?</b> Genau so, wie sie in der{' '}
          <b>Aufträge-Liste</b> rechts stehen: <b>verspätete zuerst</b>, dann nach{' '}
          <b>frühester Fälligkeit</b>, dann die ältesten. Wichtig für Großkunden: Reicht der
          Regal-Bestand für einen dringlichen Auftrag noch nicht, <b>reserviert</b> er den
          vorhandenen Bestand – kleinere Bestellungen desselben Produkts müssen warten, statt ihm
          die Ware wegzuschnappen. Die frei werdenden Kräfte lagern derweil Nachschub ein, sodass
          der große Auftrag <i>schneller</i> vollläuft, statt zu verhungern.
        </p>
        <p>
          Beim Bauen gilt die <b>Begehbarkeits-Regel</b>: Jedes Objekt braucht eine freie
          Nachbarseite und darf keinem Nachbarn die letzte nehmen – nichts einmauern. Mit dem{' '}
          <b>🧹 Abreißen</b>-Werkzeug entfernst du Regale, Tische und Arbeitsplätze wieder und
          bekommst die Hälfte des Preises zurück (nur wenn sie leer bzw. gerade nicht in Benutzung
          sind).
        </p>
      </>
    ),
  },
  {
    icon: '📊',
    title: 'Betriebs-Cockpit (Auslastung)',
    keywords: 'cockpit auslastung engpass personal lagerplatz slots liquidität warnung kapazität überlastet',
    body: (
      <>
        <p>
          Oben in der Halle zeigt das <b>Cockpit</b> vier Auslastungs-Anzeigen, damit du einen
          Engpass <i>kommen</i> siehst statt ihn plötzlich zu treffen:
        </p>
        <p>
          <b>👷 Personal</b> = wöchentlich anfallende Handling-Stunden (Herrichten {'&'} Einlagern)
          geteilt durch die Stunden, die deine Lagerkräfte leisten. Ab <b>75 %</b> gelb
          („bald einstellen"), ab <b>95 %</b> rot – dann stauen sich die Aufträge.
          <b> 📦 Lagerplatz</b> = belegte vs. verfügbare Regal-Einheiten.
          <b> 🤝 Kunden-Slots</b> = belegte vs. freie Betreuungs-Slots.
          <b> 💰 Liquidität</b> = Reserve (Kasse + freier Kredit) gegen die wöchentlichen Fixkosten.
        </p>
        <p>
          Wird eine Anzeige gelb/rot, erscheint darunter ein <b>Hinweis, was zu tun ist</b>. Ein
          Klick auf eine Anzeige öffnet direkt den passenden Bereich (Personal, Bauen, Kunden,
          Finanzen). Tipp: schulen macht Lagerkräfte schneller – das senkt die Personal-Auslastung
          genauso wie ein neuer Mitarbeiter.
        </p>
      </>
    ),
  },
  {
    icon: '🏢',
    title: 'Ausbau: Investitionen & Strategie',
    keywords: 'ausbau investition ausrüstung gabelstapler packstation kühlung lkw strategie spezialist discounter vollsortimenter',
    body: (
      <>
        <p>
          Im <b>Ausbau</b>-Fenster stecken die langfristigen Entscheidungen. Es gibt zwei Arten von
          Ausrüstung: <b>physische Geräte pro Mitarbeiter</b> – <b>🚜 Gabelstapler</b> (Einlagern)
          und <b>🛒 Kommissionierwagen</b> (Herrichten) – helfen je <b>einem</b> Mitarbeiter, der sie
          gerade benutzt, und sind in der Halle sichtbar. Für vollen Effekt brauchst du etwa so
          viele wie gleichzeitig arbeitende Lagerkräfte (du kaufst sie in Stückzahl). <b>Anlagen</b>{' '}
          wirken betriebsweit: <b>❄️ Kühltechnik</b> (längere Haltbarkeit für ALLE Ware – ersetzt
          aber KEINE Kühlregale für kühlpflichtige Ware). Alles wirkt sofort im Cockpit. Den
          eigenen <b>🚚 Fuhrpark</b> baust du separat auf der Konzern-Karte auf (siehe unten).
        </p>
        <p>
          Die <b>Firmen-Strategie</b> ist eine Ausrichtung mit echten Trade-offs: der{' '}
          <b>🐟 Frische-Spezialist</b> erzielt höhere Preise, aber die Ware verdirbt schneller; der{' '}
          <b>📦 Mengen-Discounter</b> bekommt größere Bestellmengen, dafür weniger Marge; der{' '}
          <b>🏬 Vollsortimenter</b> bleibt neutral. Ein Wechsel ist nur alle paar Wochen möglich –
          also eine Festlegung, kein Hin-und-Her.
        </p>
      </>
    ),
  },
  {
    icon: '📦',
    title: 'Großaufträge (Events)',
    keywords: 'großauftrag event einmalig premium deadline wette spitze',
    body: (
      <>
        <p>
          Gelegentlich bietet ein Bestandskunde einen <b>Großauftrag</b> an: eine große{' '}
          <b>einmalige</b> Lieferung nächste Woche zu einem <b>Premium-Preis</b>, aber mit knapper
          Frist. Das ist eine <b>Wette</b> – nimm ihn nur an, wenn du genug Bestand aufbauen und ihn
          rechtzeitig herrichten kannst. Lieferst du pünktlich, zahlt er richtig gut; verpasst du
          den Termin, zählt es wie eine normale Verspätung (Service leidet). Die Anfrage-Karte zeigt
          dir Bestand vs. benötigte Menge, damit du die Wette einschätzen kannst.
        </p>
      </>
    ),
  },
  {
    icon: '🛒',
    title: 'Einkauf, Express & Lieferant',
    keywords: 'bestellen einkäufer empfehlung express nachbestellen ek erhöhung quartal saison verhandeln',
    body: (
      <>
        <p>
          Samstags bestellst du für die nächste Woche (Lieferung Montag). Die Empfehlung basiert
          auf der beobachteten Nachfrage. Ein <b>Einkäufer</b> übernimmt das automatisch — aber
          jeder betreut <b>maximal {BUYER_PRODUCT_CAPACITY} Produktgruppen</b> (in
          Listungs-Reihenfolge): Ein breites Sortiment braucht mehrere Einkäufer, sonst bleiben
          Gruppen unbetreut (manuell bestellen, volle Preiserhöhungen). Für akute Fehlmengen gibt
          es die <b>Express-Nachbestellung</b>: kommt in {EXPRESS_PO_LEAD_DAYS}{' '}
          Tagen, kostet aber +{pct(EXPRESS_RESTOCK_SURCHARGE)} Aufschlag.
        </p>
        <p>
          Zum Quartalswechsel kann der Lieferant die <b>Einkaufspreise erhöhen</b> – ein Einkäufer
          mit gutem Skill verhandelt einen Teil weg (nur bei betreuten Gruppen). Deine Marge schmilzt sonst schleichend:
          Vertragspreise regelmäßig prüfen! Die Nachfrage schwankt außerdem <b>saisonal</b> je
          Produkt (Quartal oben in der Leiste).
        </p>
        <p>
          Im Einkauf-Fenster gibt es zwei Hebel: <b>📝 Lieferverträge</b> fixieren den Preis eines
          Produkts für einige Wochen (kleine Prämie) und schützen so vor Erhöhungen – ein Gewinn,
          wenn der Lieferant stärker anzieht als die Prämie. Und der <b>Mengenrabatt</b>: bestellst
          du viel von <b>einem</b> Produkt auf einmal, sinkt der Stückpreis stufenweise.
        </p>
      </>
    ),
  },
  {
    icon: '🧺',
    title: 'Produkte, Listung & Verderb',
    keywords: 'sortiment fisch fleisch gemüse haltbarkeit verderb listung gebühr freischalten',
    body: (
      <>
        <p>
          {PRODUCT_DEFS.map((d, i) => (
            <span key={d.id}>
              {i > 0 && ' · '}
              {d.emoji} <b>{d.name}</b>: EK {d.einkaufspreis}€, Listen-VK {d.verkaufspreis}€,
              hält {d.spoilageDays} Tage{d.requiresCooling ? ' ❄️' : ''}
              {d.unlockWeek > 0 ? `, listbar ab Woche ${d.unlockWeek + 1} (${d.listingFee}€)` : ''}
            </span>
          ))}
        </p>
        <p>
          <b>Späte Produktgruppen</b> (🧀 Käse, 🍎 Obst, 🧊 Tiefkühl, 🦞 Feinkost) schalten über Jahr
          1–2 frei – bewusst <b>bevor</b> man sie sich bequem leisten kann: höhere Margen, aber
          steigende <b>Listungsgebühren</b> (bis 45.000€). Wer sofort zugreift, kann sich übernehmen;
          wer wartet, wächst langsamer – deine Entscheidung.
        </p>
        <p>
          <b>❄️ Kühlkette:</b> Kühlpflichtige Gruppen (❄️-Markierung) lagern{' '}
          <b>ausschließlich in Kühlregalen</b> – Regale auf Kacheln, die im Bau-Modus als{' '}
          <b>Kühlbereich</b> markiert wurden ({COOL_TILE_PRICE}€ pro Kachel, auch nachträglich unter
          bestehenden Regalen). Umgekehrt lagert in Kühlregalen <b>nur</b> Kühlware – die Kapazität
          ist also fest aufgeteilt. Gibt es <b>kein</b> Kühlregal, steht kühlpflichtige Ware warm und
          verdirbt auf {Math.round(NO_COOLING_SPOILAGE_MULT * 100)}% der Haltbarkeit. Erst
          Kühlbereich + Regale bauen, dann listen und bevorraten.
        </p>
        <p>
          Abgelaufene Ware wird zum Einkaufswert abgeschrieben. Bei stornierten Aufträgen kommt
          bereits gepickte Ware mit <b>halber Resthaltbarkeit</b> zurück ins Regal. Produktbreite
          schaltet nicht nur Umsatz frei – Bestandskunden <b>fordern</b> sie irgendwann ein (siehe
          Kundenwünsche).
        </p>
        <p>
          <b>Menge statt Preis:</b> Günstige Produkte werden in größeren Wochenmengen bestellt
          (Fleisch ×{PRODUCT_VOLUME_FACTOR.fleisch}, Gemüse ×{PRODUCT_VOLUME_FACTOR.gemuese}{' '}
          gegenüber Fisch) – eine Gemüse-Linie bringt damit ähnlich viel Umsatz wie eine
          Fisch-Linie, braucht aber mehr Lager- und Herrichtungs-Kapazität.
        </p>
      </>
    ),
  },
  {
    icon: '💸',
    title: 'Finanzen: Miete, Kredit, Pleite',
    keywords: 'miete gehalt monatsende kredit zins limit insolvenz bankrott kasse',
    body: (
      <>
        <p>
          <b>Personal & Miete</b> werden am <b>Monatsende</b> gesammelt abgebucht (der Wochenreport
          grenzt sie vorher nur ab). Die Miete beträgt {euro(MONTHLY_RENT)} plus{' '}
          {euro(RENT_PER_EXPANSION)} je gebauter Erweiterung – Wachstum trägt laufende Kosten.
        </p>
        <p>
          Der <b>Kreditrahmen</b> wächst mit deinem Ø-Wochengewinn (mindestens{' '}
          {euro(CREDIT_LIMIT_FLOOR)}) und kostet {pct(CREDIT_INTEREST_RATE)} Zins pro Woche.
          Unter {euro(BANKRUPTCY_CASH)} Kasse ist das Spiel <b>verloren</b>.
        </p>
      </>
    ),
  },
  {
    icon: '👷',
    title: 'Personal & Ausbildung',
    keywords: 'einstellen lager einkäufer kam vertrieb sales akquise gehalt skill training schreibtisch vorkasse entlassen',
    body: (
      <>
        <p>
          {(['lager', 'kam', 'sales', 'einkaeufer'] as const).map((r, i) => (
            <span key={r}>
              {i > 0 && ' · '}
              <b>{ROLE_LABEL[r]}</b> {ROLE_SALARY[r]}€/Wo.
            </span>
          ))}
        </p>
        <p>
          <b>Lagermitarbeiter</b> richten Ware her. Jeder Kraft kannst du eine{' '}
          <b>Produkt-Priorität</b> geben (z. B. 🐟 Fisch) UND eine{' '}
          <b>Aufgaben-Priorität</b> (Einlagern vs. Herrichten): die bevorzugte Aufgabe/das bevorzugte
          Produkt übernimmt sie zuerst; gibt es davon gerade nichts, hilft sie überall aus – so
          kannst du z. B. ein Team fürs Einlagern und eines fürs Kommissionieren aufstellen, ganz
          ohne Leerlauf.{' '}
          <b>Key Account Manager</b> geben Betreuungs-Slots für mehr Kunden – neue Kunden füllen die
          Manager <b>nacheinander</b> (der vollste zuerst), sodass die übrigen ganze Slot-Blöcke für
          große Kunden freihalten. <b>Vertriebsmitarbeiter</b> vergrößern deinen Markt und bringen so mehr
          Neukunden-Anfragen (je mehr Reps und je höher ihr Skill, desto größer der Markt – mit
          abnehmendem Grenzertrag, weil dieselbe Sättigung greift; Spam lohnt nicht). Zum
          Abschließen brauchst du weiterhin freie KAM-Slots. <b>Einkäufer</b>{' '}
          bestellen automatisch nach und verhandeln Preiserhöhungen herunter. Im Personal-Fenster
          kannst du ihm einen <b>Bestell-Puffer</b> vorgeben (z. B. +5 %): So viel bestellt er{' '}
          zusätzlich zum Wochenbedarf als Sicherheitsreserve gegen Nachfragespitzen und Verderb –
          weniger Fehlmengen, aber mehr Lagerbestand. Ein <b>Klick aufs Büro</b> in der Halle
          öffnet das Personal-Fenster direkt.
        </p>
        <p>
          Einstellung kostet {HIRE_WEEKS_UPFRONT} Wochen Gehalt im Voraus. Büro-Rollen
          (KAM, Vertrieb, Einkäufer) brauchen einen freien <b>Schreibtisch</b>. Der <b>Skill</b>{' '}
          bestimmt Arbeitstempo, Verhandlungs- bzw. Akquise-Geschick und lässt sich per Training
          steigern. Beim Entlassen werden laufende Aufgaben sauber zurückgegeben.
        </p>
      </>
    ),
  },
  {
    icon: '🏗️',
    title: 'Bauen & Erweitern (Preise)',
    keywords: 'regal tisch schreibtisch anlieferung halle büro erweiterung preis kosten',
    body: (
      <>
        <p>
          Regal {euro(SHELF_PRICE)} · Vorbereitungstisch {euro(TABLE_PRICE)} · Schreibtisch{' '}
          {euro(DESK_PRICE)} · Anlieferungsplatz {euro(INBOUND_SLOT_PRICE)} ·
          Hallen-Erweiterung (2×2) ab {euro(HALL_EXPANSION_BASE)} · Büro-Erweiterung ab{' '}
          {euro(OFFICE_EXPANSION_BASE)} – Erweiterungen werden mit der Anzahl teurer und erhöhen
          die Monatsmiete um je {euro(RENT_PER_EXPANSION)}.
        </p>
        <p>
          Grün markierte Kacheln im Bau-Modus sind gültig; Erweiterungs-Blöcke docken an jede
          bestehende Kante an (auch in Ecken/L-Formen).
        </p>
      </>
    ),
  },
];

export function WikiModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q
    ? ENTRIES.filter((e) => `${e.title} ${e.keywords}`.toLowerCase().includes(q))
    : ENTRIES;

  return (
    <Modal title="Handbuch" icon="📖" onClose={onClose} wide>
      <p className="hint">
        Alle Spielregeln und Zahlen zum Nachschlagen – die Werte kommen direkt aus dem Spiel und
        sind immer aktuell. Viele Felder erklären sich zusätzlich beim Draufzeigen (Tooltip).
      </p>
      <input
        className="num-input"
        style={{ width: '100%', marginBottom: 12 }}
        type="text"
        placeholder={'Suchen… (z. B. „Ultimatum", „Kredit", „Marge")'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {shown.length === 0 && <div className="empty">Nichts gefunden – anderen Begriff probieren.</div>}
      <div className="rows">
        {shown.map((e) => (
          <div key={e.title} className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <div className="title" style={{ fontSize: 15 }}>
              {e.icon} {e.title}
            </div>
            <div className="sub" style={{ lineHeight: 1.55 }}>{e.body}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
