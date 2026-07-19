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
  LOYALTY_CHURN_THRESHOLD,
  MANAGER_SLOTS,
  MEDIUM_UNLOCK_MONTHLY,
  MILESTONE_DEFS,
  MONTHLY_RENT,
  NIGHT_SPEED,
  OFFICE_EXPANSION_BASE,
  PALETTE_SIZE,
  PAYMENT_DELAY_DAYS_BY_TYPE,
  PO_LEAD_DAYS,
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
          Beim Bauen gilt die <b>Begehbarkeits-Regel</b>: Jedes Objekt braucht eine freie
          Nachbarseite und darf keinem Nachbarn die letzte nehmen – nichts einmauern.
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
          Im <b>Ausbau</b>-Fenster stecken die langfristigen Entscheidungen. <b>Investitionen</b>{' '}
          lösen je einen Engpass – ihre Wirkung siehst du sofort im Cockpit: <b>🚜 Gabelstapler</b>{' '}
          (Einlagern schneller), <b>🏭 Kommissionier-Station</b> (Herrichten schneller), <b>❄️ Kühlung</b>{' '}
          (längere Haltbarkeit, weniger Verderb), <b>🚚 eigener LKW</b> (niedrigere Logistikkosten).
          Statt „mehr Leute einstellen" fragst du dich: welchen Engpass löse ich womit?
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
          auf der beobachteten Nachfrage. Ein <b>Einkäufer</b> übernimmt das automatisch. Für akute
          Fehlmengen gibt es die <b>Express-Nachbestellung</b>: kommt in {EXPRESS_PO_LEAD_DAYS}{' '}
          Tagen, kostet aber +{pct(EXPRESS_RESTOCK_SURCHARGE)} Aufschlag.
        </p>
        <p>
          Zum Quartalswechsel kann der Lieferant die <b>Einkaufspreise erhöhen</b> – ein Einkäufer
          mit gutem Skill verhandelt einen Teil weg. Deine Marge schmilzt sonst schleichend:
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
              hält {d.spoilageDays} Tage
              {d.unlockWeek > 0 ? `, listbar ab Woche ${d.unlockWeek + 1} (${d.listingFee}€)` : ''}
            </span>
          ))}
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
          <b>Lagermitarbeiter</b> richten Ware her. <b>Key Account Manager</b> geben Betreuungs-Slots
          für mehr Kunden. <b>Vertriebsmitarbeiter</b> vergrößern deinen Markt und bringen so mehr
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
