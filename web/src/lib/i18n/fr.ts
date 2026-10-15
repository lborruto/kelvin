import type { Day, EnergyGroup } from '$lib/api/types';
import { intFor, listFor, own, pluralFor, type ApiParams } from './rules';

const NB = '\u00a0';
// Plan 12: a pilot-wire heater's levels and a towel dryer's actions (action labels)
const LEVEL_FR: Record<string, string> = {
  comfort: 'confort',
  'comfort-1': 'confort −1',
  'comfort-2': 'confort −2',
  eco: 'éco',
  frostprotection: 'hors-gel',
  off: 'arrêt'
};
const DRYER_FR: Record<string, string> = { boost: 'boost', drying: 'séchage', stop: 'fin du boost ou du séchage' };
const int = intFor('fr');
const plural = pluralFor('fr');
const list = listFor('fr');

const DAY_LOWER: Record<Day, string> = {
  monday: 'lundi',
  tuesday: 'mardi',
  wednesday: 'mercredi',
  thursday: 'jeudi',
  friday: 'vendredi',
  saturday: 'samedi',
  sunday: 'dimanche'
};
const dayLower = (d: unknown) => own(DAY_LOWER, d) ?? String(d);
const SUBJECT: Record<string, string> = { manual: 'La consigne', comfort: 'La température confort', eco: 'L’abaissement éco' };
const subject = (k: unknown) => own(SUBJECT, k) ?? String(k);
const MODE_NAME: Record<string, string> = { off: 'Arrêt', manual: 'Manuel', program: 'Programme', other: 'Autre', mixed: 'Mixte' };
const KIND: Record<string, string> = { manual: 'consigne', comfort: 'confort', eco: 'abaissement éco' };
/** A number as the backend writes it in a label (Python `{:g}` with a comma): 19,5 — 12. */
const num = (v: unknown) => String(v).replace('.', ',');
/** A bound as the backend writes it in `temp_range` (decimal comma, true minus). */
const bound = (v: unknown) => num(v).replace(/^-/, '−');
/** Why a command could not be sent (the pending's reason_code, backend gateway_error_code). */
const REASON: Record<string, string> = {
  quota: 'limite de requêtes Cozytouch atteinte',
  auth: 'Cozytouch refuse la connexion',
  network: 'Cozytouch injoignable',
  unknown: 'erreur inconnue'
};

/** The French dictionary, source of truth for keys and signatures (en.ts is typed from it).
 * Rules: one message per sentence; values arrive already formatted (fmtTemp, fmtKwh…); a sentence
 * with a link or <strong> returns parts; never resolve a message at module scope. */
export const fr = {
  common: {
    cancel: 'Annuler',
    retry: 'Réessayer',
    dismiss: 'Ignorer',
    close: 'Fermer',
    colon: `${NB}: `
  },
  error: {
    network: 'Kelvin est injoignable.',
    unexpected: 'Erreur inattendue.',
    server: 'Le serveur Kelvin a rencontré une erreur.'
  },
  ago: {
    justNow: 'à l’instant',
    minutes: (n: number) => `il y a ${int(n)}${NB}min`,
    hours: (n: number) => `il y a ${int(n)}${NB}h`,
    on: (dateTime: string) => `le ${dateTime}`
  },
  pending: {
    failed: 'Échec de la commande.',
    lost: 'Commande non confirmée (connexion perdue).',
    unknownResult: 'Résultat inconnu (connexion perdue) — vérifiez.',
    sending: 'Envoi…',
    confirmed: 'Confirmé',
    unconfirmed: 'Pas encore confirmé',
    announceUnconfirmed: (label: string) => `${label} — pas encore confirmé par Cozytouch`,
    announceSending: (label: string) => `${label} — envoi…`,
    announceConfirmed: (label: string) => `${label} — confirmé`,
    unknownToast: (label: string) => `${label}${NB}: résultat inconnu — vérifiez.`,
    cannotRetry: `Impossible de réessayer ici${NB}: refaites l’action.`
  },
  banner: {
    reconnecting: 'Reconnexion à Kelvin…',
    passwordChanged: `Mot de passe Cozytouch modifié${NB}: reconnectez-vous`,
    unreachable: 'Cozytouch injoignable',
    unreachableSince: (ago: string) => `Cozytouch injoignable — données ${ago}`,
    signInAgain: 'Se reconnecter'
  },
  override: {
    restoring: 'Rétablissement…',
    boost: (temp: string, until: string) => `Forcé ${temp} → ${until}`,
    away: (temp: string) => `Absence ${temp}`
  },
  mode: { off: 'Arrêt', manual: 'Manuel', program: 'Programme', other: 'Autre', mixed: 'Mixte' },
  modeSwitch: {
    programShort: 'Prog.',
    pending: (name: string) => `${name} (en attente)`
  },
  level: { comfort: 'Confort', eco: 'Éco', frostprotection: 'Hors-gel', off: 'Repos', mixed: 'Mixte' },
  stepper: {
    decrease: (label: string) => `Diminuer ${label}`,
    increase: (label: string) => `Augmenter ${label}`,
    announce: (label: string, value: string) => `${label}${NB}: ${value}`
  },
  nav: {
    rooms: 'Pièces',
    schedule: 'Programme',
    energy: 'Énergie',
    home: 'Maison',
    label: 'Navigation principale',
    skip: 'Aller au contenu'
  },
  houseActions: {
    allOff: 'Tout éteindre',
    allProgram: 'Tout remettre en programme',
    away: 'Absence…',
    confirmTitle: `Tout éteindre${NB}?`,
    confirmBody: 'Les radiateurs passent à l’arrêt. Vous pourrez les remettre en programme depuis Maison.'
  },
  page: {
    title: (name: string) => `${name} · Kelvin`,
    notFound: 'Page introuvable.',
    notFoundTitle: 'Page introuvable',
    errorTitle: 'Erreur',
    error: 'Une erreur est survenue.',
    backToRooms: 'Retour aux pièces'
  },
  rooms: {
    count: (n: number) => `${int(n)} ${plural(n, { one: 'pièce', other: 'pièces' })}`,
    heating: (n: number) => `${int(n)} en chauffe`,
    awayActive: 'Absence en cours'
  },
  room: {
    presence: (v: string) => `Présence${NB}: ${v}`,
    presenceDetected: 'détectée',
    presenceNone: 'aucune',
    heatingNow: 'En chauffe',
    duty: (pct: string) => `chauffe ${pct} sur 24${NB}h`,
    dutyHint: 'Part du temps où les radiateurs ont chauffé ces dernières 24 heures, pondérée par leur puissance (relevés toutes les 5 minutes).',
    title: 'Pièce',
    windowOpen: 'Fenêtre ouverte',
    off: 'Arrêté',
    todayLabel: (name: string) => `${name}, température d’aujourd’hui`,
    details: 'Détails',
    setpoint: 'Consigne',
    comfort: 'Confort',
    eco: 'Abaissement éco',
    mixedMean: 'Mixte (moyenne)',
    mixedMode: 'Mixte — les radiateurs n’ont pas le même mode',
    notFound: 'Pièce introuvable.',
    radiatorCount: (n: number) => `${int(n)} ${plural(n, { one: 'radiateur', other: 'radiateurs' })}`,
    programsDiffer: 'Programmes différents selon les radiateurs',
    controls: 'Commande',
    modeLabel: 'Mode de la pièce',
    boostTitle: 'Forcer temporairement',
    boostActive: (temp: string, until: string) => `Forcé à ${temp} jusqu’à ${until}.`,
    cancelBoost: 'Annuler le forçage',
    boostTemp: 'Température forcée',
    duration: 'Durée',
    boost: 'Forcer',
    history: 'Historique',
    range: 'Période',
    historyLabel: (name: string, range: string) => `${name}, température sur ${range}`,
    radiators: 'Radiateurs'
  },
  range: { day: `24${NB}h`, week: `7${NB}j`, month: `30${NB}j` },
  radiator: {
    default: 'Radiateur',
    facts: (model: string, watts: number | null) => (watts ? `${model} · ${watts}${NB}W` : model),
    nameLabel: 'Nom du radiateur',
    rename: 'Renommer',
    setpointActive: 'Consigne active',
    energyTotal: 'Consommation totale',
    setpointLabel: (title: string) => `Consigne ${title}`,
    windowDetection: 'Détection de fenêtre ouverte',
    presenceDetection: 'Détection de présence',
    nightLight: 'Veilleuse',
    brightness: 'Intensité',
    brightnessLabel: 'Intensité de la veilleuse',
    identify: 'Faire clignoter'
  },
  days: {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche'
  },
  daysShort: { monday: 'Lun', tuesday: 'Mar', wednesday: 'Mer', thursday: 'Jeu', friday: 'Ven', saturday: 'Sam', sunday: 'Dim' },
  program: {
    lockedMidnight: `Fin à minuit${NB}: modifiez ce jour dans l’app Cozytouch`,
    lockedUnrecognised: `Plage non reconnue${NB}: modifiez ce jour dans l’app Cozytouch`,
    midnightCap: 'Une fin à minuit n’est pas encore prise en charge.',
    unknownDayLabel: (day: string) => `${day}${NB}: plages non reconnues`,
    changedElsewhere: 'Programme modifié ailleurs',
    changedElsewhereDays: (days: string) => `Modifié dans l’app Cozytouch ou sur un autre appareil${NB}: ${days}. Rechargez pour voir la version actuelle, ou remplacez-la par vos modifications.`,
    reload: 'Recharger',
    replaceAnyway: 'Remplacer quand même',
    noRooms: 'Aucun radiateur de cette maison n’a de programme que Kelvin sait modifier. Les autres suivent leur propre programme ou l’application du fabricant.',
    nextTomorrow: (time: string, level: string) => `demain ${time} → ${level}`,
    nextOn: (day: Day, time: string, level: string) => `${DAY_LOWER[day]} ${time} → ${level}`,
    dayError: {
      tooMany: '3 plages confort au maximum.',
      endBeforeStart: 'Une plage doit finir après son début.',
      overlap: 'Des plages se chevauchent.'
    },
    ecoAllDay: 'éco toute la journée',
    blockHint: `Flèches${NB}: déplacer de 15${NB}min. Suppr${NB}: retirer la plage.`,
    slotRole: 'plage',
    slotStart: (day: string, n: number) => `${day}, plage ${n}, début`,
    slotEnd: (day: string, n: number) => `${day}, plage ${n}, fin`,
    removeSlot: (n: number, day: string) => `Supprimer la plage ${n} du ${day}`,
    addSlot: (day: string) => `Ajouter une plage le ${day}`,
    addShort: 'Plage',
    discard: `Abandonner les modifications non envoyées${NB}?`,
    sending: 'Envoi en cours…',
    daysChanged: (n: number) => `${int(n)} ${plural(n, { one: 'jour modifié', other: 'jours modifiés' })}`,
    noDaysChanged: 'Aucun jour modifié',
    otherRooms: (n: number) => `${int(n)} ${plural(n, { one: 'autre pièce', other: 'autres pièces' })}`,
    noSlots: 'aucune plage (éco)',
    roomPicker: 'Pièce',
    noRadiator: `Cette pièce n’a aucun radiateur${NB}: pas de programme à régler.`,
    mismatch: `Les radiateurs de cette pièce n’ont pas le même programme${NB}; l’envoi les alignera sur celui-ci.`,
    legend: () => ({
      before: 'Plages ',
      comfort: 'confort',
      middle: ` (3 par jour au plus)${NB}; le reste du temps est en `,
      eco: 'éco',
      after: '. Touchez ou cliquez la barre pour ajouter une plage, glissez-la pour la déplacer, tirez ses bords pour l’ajuster.'
    }),
    today: 'Aujourd’hui',
    previewLabel: (name: string) => `${name}, température d’aujourd’hui et plages de ce programme`,
    copy: 'Copier',
    copyFrom: 'Du',
    copyTo: 'vers',
    alsoSend: 'Envoyer aussi à',
    changes: 'Modifications',
    changeBefore: (segs: string) => `(avant${NB}: ${segs})`,
    staleHint: 'Modifiez puis Envoyer.',
    undo: 'Annuler',
    send: 'Envoyer'
  },
  strip: {
    windowRun: (a: string, b: string) => `Fenêtre ouverte (signalée par le radiateur) ${a}–${b}`,
    presenceRun: (a: string, b: string) => `Présence signalée ${a}–${b}`,
    sampled: `relevé toutes les 5${NB}min`,
    windowCount: (n: number) => `fenêtre ouverte ${int(n)} fois`,
    presenceCount: (n: number) => `présence signalée ${int(n)} fois`,
    legendWindow: 'Fenêtre ouverte',
    legendPresence: 'Présence',
    range: (min: string, max: string) => `de ${min} à ${max}`,
    last: (t: string) => `dernière mesure ${t}`,
    none: 'pas encore de mesure',
    setpoint: (t: string) => `consigne ${t}`,
    program: (comfort: string, eco: string) => `confort ${comfort}, éco ${eco}`,
    pendingSetpoint: (t: string) => `consigne demandée ${t}, en attente`,
    pendingComfort: (t: string) => `confort demandé ${t}, en attente`,
    summary: (parts: string[]) => `${parts.join(`${NB}; `)}.`
  },
  energy: {
    views: { day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année' },
    week: (n: number, range: string) => `Semaine ${n} · ${range}`,
    weekSpoken: (n: number) => `semaine ${n}`,
    weekShort: (n: number) => `S${n}`,
    dayBefore: 'la veille',
    weekBefore: 'la semaine précédente',
    span: (a: string, b: string) => `du${NB}${a}${NB}au${NB}${b}`
  },
  inspector: {
    home: 'Maison',
    hc: 'Heures creuses',
    hp: 'Heures pleines',
    hcShare: 'dont HC',
    radiators: 'Radiateurs',
    rest: 'Reste de la maison',
    radShare: 'Part des radiateurs',
    cost: 'Coût estimé',
    energy: 'dont énergie',
    subscription: 'dont abonnement',
    prices: 'Prix appliqués',
    avgPrice: 'Prix moyen',
    periodShare: 'Part de la période',
    perDay: 'Moyenne par jour',
    quality: 'Qualité',
    since: (day: string) => `depuis le ${day}${NB}: `,
    noLinkyDay: 'Aucune donnée Linky pour ce jour',
    costUnknown: `aucune donnée Linky${NB}: énergie inconnue`,
    noLinkyPeriod: 'Aucune donnée Linky pour cette période',
    missing: (n: number) => `${int(n)} ${plural(n, { one: 'jour manquant', other: 'jours manquants' })}`,
    notCounted: (n: number) => `énergie de ${int(n)} ${plural(n, { one: 'jour manquant', other: 'jours manquants' })} non comptée`,
    estimatedSplit: `courbe absente${NB}: HC/HP estimés`,
    coverage: (pct: string) => `radiateurs${NB}: couverture ${pct}`,
    retro: (day: string) => `prix du ${day} appliqué aux jours antérieurs`,
    radToday: 'jour en cours, compté une fois terminé',
    radNone: 'aucun relevé de radiateur',
    radUntilYesterday: `radiateurs${NB}: jusqu’à hier`,
    radMeasured: (k: number, n: number) =>
      `${int(k)} sur ${int(n)} ${plural(n, { one: 'radiateur mesuré', other: 'radiateurs mesurés' })}`,
    est: 'est.',
    kwhWord: 'kilowattheures',
    eurWord: 'euros',
    radiatorsSpoken: 'radiateurs',
    noData: 'aucune donnée Linky',
    power: 'Puissance moyenne',
    energyWh: 'Énergie',
    rate: 'Tarif',
    price: 'Prix',
    halfCost: 'Coût',
    restShort: 'Reste',
    restNegative: `Radiateurs au-dessus du compteur${NB}: écart de mesure`,
    noPrice: 'aucun tarif pour cette demi-heure',
    /** The Courbe's readout names the room its temperature is from. */
    temperature: (room: string | null | undefined) => (room ? `Température (${room})` : 'Température'),
    setpoint: 'consigne',
    offpeak: 'Heures creuses',
    peak: 'Heures pleines',
    partial: (pct: number) => `HC ${pct}${NB}%`,
    summer: '(heure d’été)',
    winter: '(heure d’hiver)',
    /** « HC 0,2068 · HP 0,2700 €/kWh »: a price row's rates, already labelled and formatted. */
    rates: (items: [string, string][]) => `${items.map(([l, v]) => `${l} ${v}`).join(' · ')}${NB}€/kWh`,
    /** Between the lines of a multi-line value in the hidden table (price rows). */
    lineSep: `${NB}; `,
    rateLabels: {
      base: 'Base', hc: 'HC', hp: 'HP', blue_hc: 'Bleu HC', blue_hp: 'Bleu HP', white_hc: 'Blanc HC', white_hp: 'Blanc HP',
      red_hc: 'Rouge HC', red_hp: 'Rouge HP'
    } as Record<string, string>
  },
  roomInfo: {
    title: 'Infos',
    model: 'Modèle',
    power: 'Puissance',
    watts: (w: number) => `${w}${NB}W`,
    signal: 'Niveau de signal',
    rssi: (v: number) => `RSSI ${v}`,
    rssiHint: `Valeur brute rapportée par le radiateur${NB}; échelle non vérifiée.`,
    reachability: 'Connexion',
    reachable: 'Joignable',
    unreachable: 'Injoignable',
    unreachableSince: (t: string) => `Injoignable depuis ${t}`,
    unreachableChip: 'Injoignable',
    lastSignal: 'Dernier signal'
  },
  roomFigures: {
    title: (range: string) => `Énergie sur ${range}`,
    kwh: 'Consommation',
    eur: 'Coût (énergie)',
    eurHint: 'Énergie seulement, hors abonnement, à vos prix heures creuses et heures pleines.',
    hours: 'Heures de chauffe',
    hoursHint: 'Équivalent pleine puissance.',
    noTariff: 'Renseignez le tarif',
    est: 'est.',
    estHint: `Estimation${NB}: une partie de l’énergie est répartie entre deux relevés du compteur.`,
    partial: (pct: string) => `relevé sur ${pct} de la période`
  },
  roomEnergy: {
    noRoom: 'Sans pièce',
    removed: 'Radiateur retiré',
    roomFrom: (k: number, n: number, day: string) =>
      `${int(k)} ${plural(k, { one: 'radiateur', other: 'radiateurs' })} sur ${int(n)} ${plural(k, { one: 'enregistré', other: 'enregistrés' })} à partir du ${day}`,
    roomPartial: (k: number, n: number) =>
      `${int(k)} ${plural(k, { one: 'radiateur', other: 'radiateurs' })} sur ${int(n)} ${plural(k, { one: 'enregistré', other: 'enregistrés' })} en partie`,
    radFrom: (day: string) => `enregistré à partir du ${day}`,
    radPartial: (pct: string) => `couverture ${pct}`,
    none: 'aucun relevé sur la période',
    // The backend gives no mean °C, setpoint or heating hours below 50 % sample coverage.
    stats: 'moins de la moitié de la période mesurée',
    statsOf: (k: number, n: number) =>
      `moyenne de ${int(k)} ${plural(k, { one: 'radiateur', other: 'radiateurs' })} sur ${int(n)} (${n - k > 1 ? 'les autres' : 'l’autre'}${NB}: moins de la moitié de la période mesurée)`
  },
  hero: {
    estimate: 'estimation',
    details: 'Détail de la période',
    radiatorsFigure: (kwh: string) => `Radiateurs ${kwh}`,
    hcFigure: (kwh: string) => `HC ${kwh}`,
    hpFigure: (kwh: string) => `HP ${kwh}`,
    breakdown: (energy: string, sub: string) => `Énergie ${energy} + abonnement ${sub}`,
    compare: (change: string, prev: string, n: number) =>
      `${change} de consommation par rapport à ${prev}, sur ${int(n)} ${plural(n, { one: 'jour comparable', other: 'jours comparables' })}`,
    missing: (n: number) => `Données partielles${NB}: ${int(n)} ${plural(n, { one: 'jour manquant', other: 'jours manquants' })}.`,
    notCounted: 'L’énergie de ces jours n’est pas comptée dans le coût.',
    split: (n: number) =>
      `Répartition heures creuses / pleines estimée pour ${int(n)} ${plural(n, { one: 'jour sans courbe complète', other: 'jours sans courbe complète' })}.`,
    interpolated: `Radiateurs${NB}: énergie répartie sur une interruption de l’enregistrement (est.).`,
    retro: (day: string) => `Prix du ${day} appliqué aux jours antérieurs.`,
    sameLength: 'la même durée juste avant',
    // « jusqu’à hier » only for a running period: a closed one counts all its days.
    radPartial: (pct: string, running: boolean) => `Radiateurs${NB}: couverture ${pct}, somme partielle${running ? ' (jusqu’à hier)' : ''}.`,
    radNone: `Radiateurs${NB}: aucun relevé sur cette période.`,
    noData: 'Aucune donnée pour cette période.',
    tariffLink: 'Renseignez le tarif',
    tariffTail: ' pour voir le coût.'
  },
  periodNav: { group: 'Période affichée', prev: 'Période précédente', next: 'Période suivante', latest: 'Dernier jour' },
  bars: { empty: 'Pas encore de données.', period: 'Période', bars: (label: string) => `Barres du graphique${NB}: ${label}` },
  chartInspector: { est: 'est.', estNote: `est.${NB}: valeur estimée, détail dans`, quality: 'Qualité des données' },
  compare: {
    title: 'Comparaisons',
    previous: 'Période précédente',
    sameLength: 'la même durée juste avant',
    lastYear: 'Même période l’an dernier',
    avg4: {
      day: 'Moyenne des 4 derniers jours',
      week: 'Moyenne des 4 dernières semaines',
      month: 'Moyenne des 4 derniers mois',
      year: 'Moyenne des 4 dernières années'
    },
    range: (a: string, b: string) => `${a} – ${b}`,
    pairs: (n: number) => `sur ${int(n)} ${plural(n, { one: 'jour comparable', other: 'jours comparables' })}`,
    perDay: (cur: string, prev: string) => `${cur} par jour contre ${prev}`,
    fewer: (n: number) => `sur ${int(n)} ${plural(n, { one: 'période comparable', other: 'périodes comparables' })}`,
    // Why a row reads « — ».
    nothing: 'aucun jour relevé à comparer',
    tooFew: (n: number, of: number) =>
      `${int(n)} ${plural(n, { one: 'jour comparable', other: 'jours comparables' })} sur ${int(of)}${NB}: pas de comparaison`,
    zero: (view: EnergyGroup) => `rien de consommé ${view === 'day' ? 'ce jour-là' : 'sur cette période'}${NB}: pas de comparaison`,
    noUnits: {
      day: 'aucun des 4 derniers jours n’est comparable',
      week: 'aucune des 4 dernières semaines n’est comparable',
      month: 'aucun des 4 derniers mois n’est comparable',
      year: 'aucune des 4 dernières années n’est comparable'
    },
    zeroBefore: 'rien de consommé sur les périodes précédentes',
    basis: 'Seuls les jours relevés des deux côtés comptent.',
    energyOnly: ' Le coût compare l’énergie seule, hors abonnement.'
  },
  hcHp: {
    title: 'Heures creuses / pleines',
    tariffLink: 'Renseignez le tarif',
    tariffTail: ' pour voir la répartition.',
    share: 'Part en heures creuses',
    slots: (pct: string) => `vos heures creuses durent ${pct} de la journée`,
    none: 'Aucune consommation Linky sur la période.',
    noSlots: 'Le tarif n’a pas d’heures creuses.',
    avg: 'Prix moyen payé',
    perKwh: 'Chaque kWh passé d’HP en HC',
    slider: 'Part de vos heures pleines déplacée en heures creuses',
    valueText: (pct: number) => `${pct}${NB}%`,
    result: (pct: number, kwh: string, eur: string) =>
      `Si ${pct}${NB}% de vos HP (${kwh}) étaient en HC${NB}: ${eur}, à consommation identique.`,
    formula: (pct: number, hp: string, delta: string, eur: string) => `${pct}${NB}% × ${hp} × ${delta} = ${eur}`,
    caveat: 'Calcul sur vos prix et votre consommation, pas une économie garantie.'
  },
  heatingPanel: {
    title: 'Chauffage',
    sentence: 'de la consommation de la maison vient des radiateurs',
    days: (n: number, of: number) => ` (${int(n)} ${plural(n, { one: 'jour', other: 'jours' })} sur ${int(of)})`,
    parts: (rad: string, rest: string) => `${rad} radiateurs · ${rest} reste`,
    cost: (eur: string) => `Coût du chauffage ≈${NB}${eur} (énergie, hors abonnement)`,
    noCost: 'Coût du chauffage — (aucun relevé de radiateur sur la période)',
    noTariff: 'Coût du chauffage — (pas de tarif renseigné)',
    // « jusqu’à hier » only for a running period: a closed one counts all its days.
    unmeasured: (running: boolean) => `Aucun jour de radiateur mesuré en entier${running ? ' (jusqu’à hier)' : ''}${NB}: somme partielle.`,
    partial: (pct: string, running: boolean) =>
      `Radiateurs mesurés sur ${pct} des jours${running ? ' (jusqu’à hier)' : ''}${NB}: somme partielle.`,
    running: `Période en cours${NB}: radiateurs comptés jusqu’à hier.`,
    est: 'est.',
    inconsistent: `Les radiateurs dépassent le compteur${NB}: données incohérentes.`,
    none: 'Aucun jour couvert à la fois par le Linky et par tous les radiateurs.'
  },
  power: {
    title: 'Puissance',
    // Linky's curve is half-hour means: the highest one, never an instantaneous peak.
    peak: `Pointe moyenne sur 30${NB}min`,
    range: (a: string, b: string) => `${a}–${b}`,
    instant: 'la pointe instantanée peut être plus élevée',
    kva: (kva: number) => `abonnement ${kva}${NB}kVA`,
    share: (pct: string) => `${pct} de la puissance souscrite (moyenne 30${NB}min)`,
    pf: 'kVA ≈ kW, facteur de puissance supposé 1',
    base: 'Talon (veille)',
    night: (w: string) => `minimum de nuit (00:00–06:00)${NB}: ${w}`,
    p10: (w: string) => `10${NB}% des demi-heures sont sous ${w}`,
    floorDay: (kwh: string, eur: string | null) => `consommation de fond ≈${NB}${kwh}${eur ? ` (≈${NB}${eur})` : ''}`,
    floorWeek: (kwh: string) => `consommation de fond ≈${NB}${kwh} par jour`,
    days: (n: number) => `sur ${int(n)} ${plural(n, { one: 'jour de courbe complète', other: 'jours de courbe complète' })}`,
    noDay: 'Pas de courbe complète ce jour-là.',
    noWeek: 'Pas de courbe complète cette semaine.',
    failed: 'Courbe du jour indisponible.'
  },
  projection: {
    title: 'Projection',
    /** Always shown: the projection follows the latest Linky day, not the period on screen. */
    covers: 'Mois en cours et 365 prochains jours',
    month: (month: string) => `${month}, mois complet`,
    measured: (v: string) => `dont ${v} mesurés`,
    filled: (n: number) => `${int(n)} ${plural(n, { one: 'jour manquant estimé', other: 'jours manquants estimés' })}`,
    rolling: '365 prochains jours',
    range: (a: string, b: string) => `${a} – ${b}`,
    approx: (v: string) => `≈${NB}${v}`,
    estimate: 'Estimation, au rythme récent et aux prix d’aujourd’hui.',
    how: 'Comment c’est calculé',
    // The backend's formula (report.py `_projection`), step by step.
    base: (v: string, to: string | null) =>
      `Base${NB}: ${v} par jour, moyenne des jours relevés parmi les 30 jours ${to ? `jusqu’au ${to}` : 'les plus récents'} (7 au moins)`,
    method: {
      linear: 'appliquée telle quelle à chaque jour à venir (trop peu de jours relevés l’an dernier pour l’ajuster par mois)',
      seasonal: 'ajustée chaque mois selon le même mois de l’an dernier, rapporté aux mêmes 30 jours de l’an dernier',
      mixed: 'ajustée selon le même mois de l’an dernier quand il est connu, telle quelle sinon'
    },
    price: (p: string, d: string) => `Prix moyen ${p}${NB}: prix du ${d} pondérés par votre part d’heures creuses sur ces 30 jours`,
    monthHow: `Mois en cours${NB}: jours mesurés, plus la base pour chaque jour restant ou manquant`,
    subscription: `Abonnement compris${NB}: au tarif de chaque jour pour les jours mesurés, au tarif d’aujourd’hui pour les jours à venir.`,
    none: 'Pas encore assez de jours relevés pour une projection.',
    late: (d: string) => `Relevés Linky en retard (dernier jour le ${d})${NB}: pas de projection.`,
    monthsCaption: 'Projection des 12 prochains mois (estimation)',
    monthCol: 'Mois',
    value: 'Estimation'
  },
  quality: {
    title: 'Qualité des données',
    rows: { linky: 'Linky journalier', curve: 'Courbe', radiators: 'Radiateurs' },
    period: 'Période',
    mark: { full: 'complet', partial: 'partiel', missing: 'manquant', none: '—' },
    partialPct: (pct: string) => `partiel (${pct})`,
    partialNone: 'partiel (aucun jour entier mesuré)',
    legend: { full: 'complet', partial: 'partiel', missing: 'manquant' },
    curveSince: (d: string) => `Courbe disponible depuis le ${d}`,
    radiatorsSince: (d: string) => `Radiateurs enregistrés depuis le ${d}`,
    linkySince: (d: string) => `Linky depuis le ${d}`,
    estimated: (n: number, share: string, method: string) => `Jours HC/HP estimés${NB}: ${int(n)} (part de repli ${share}, méthode${NB}: ${method})`,
    gap: (pct: string) => `Écart moyen courbe / relevé${NB}: ${pct}`,
    retro: (n: number) => `Prix du premier tarif appliqué à ${int(n)} ${plural(n, { one: 'jour antérieur', other: 'jours antérieurs' })}`,
    est: `«${NB}est.${NB}» marque une estimation${NB}: répartition HC/HP sans courbe complète, énergie des radiateurs répartie entre deux relevés, projection.`,
    method: {
      curve: 'courbe', fallback_window: '±15 jours', fallback_month: 'même mois', fallback_all: 'tout l’historique',
      slots: 'durée des heures creuses', mixed: 'mixte'
    }
  },
  curve: {
    empty: 'Pas de courbe pour ce jour.',
    scrub: 'Parcourir la courbe, demi-heure par demi-heure',
    idle: 'Survolez ou touchez la courbe',
    idleKeys: ', ou utilisez les flèches',
    idleShort: 'aucune demi-heure choisie',
    hour: 'Heure',
    est: 'est.',
    radiators: 'Radiateurs',
    kva: (kva: number) => `Puissance souscrite (${kva}${NB}kVA)`,
    kvaOff: (kva: number, wh: string) => `Puissance souscrite (${kva}${NB}kVA, soit ${wh} par demi-heure) hors de l’échelle du graphique.`
  },
  curvePanel: {
    heading: (d: string) => `Courbe du ${d}`,
    chart: (d: string) => `Consommation par demi-heure le ${d}`,
    prev: 'Jour précédent',
    next: 'Jour suivant',
    retry: 'Réessayer',
    noLinky: 'pas de données Linky pour ce jour',
    emptyWhy: (why: string) => `Pas de courbe pour ce jour${NB}: ${why}.`,
    beforeHistory: (d: string) => `antérieure à l’historique de courbe (depuis le ${d})`,
    beforeCounted: (d: string) => `antérieure au premier jour compté (depuis le ${d})`,
    quota: 'pas encore récupérée (quota)',
    reconcile: (curve: string, daily: string, gap: string) => `Courbe ${curve} · relevé journalier ${daily} (écart ${gap})`,
    curveOnly: (curve: string) => `Courbe ${curve}`,
    split: (hc: string, hp: string) => `HC ${hc} · HP ${hp}, d’après le relevé journalier`,
    est: 'est.',
    incomplete: (n: number, of: number) => `Courbe incomplète (${n}/${of} demi-heures)`,
    boundary: `≈${NB}: une heure creuse commence ou finit dans cette demi-heure${NB}; sa part y est estimée au prorata.`
  },
  roomDay: {
    empty: 'Pas de relevé pour cette pièce ce jour-là.',
    scrub: 'Parcourir la journée de la pièce, demi-heure par demi-heure',
    idle: 'Survolez ou touchez le graphique',
    idleKeys: ', ou utilisez les flèches',
    idleShort: 'aucune demi-heure choisie',
    hour: 'Heure',
    radiators: 'Radiateurs',
    radiatorsCol: 'Radiateurs de la pièce',
    temperature: 'Température',
    setpoint: 'Consigne',
    wh: 'Wh',
    degrees: '°C',
    /** `by_room[room]` is null: a radiator of the room that existed then has no figure (the sum would be partial). */
    unknown: 'radiateur sans relevé',
    /** The room is absent from `by_room`: none of its radiators was recording yet. */
    absent: 'pas de radiateur relevé à cette heure',
    /** Fewer than half the 5-min samples of the half-hour (`roomInterval`). */
    fewSamples: 'pas assez de relevés',
    withWhy: (why: string) => `— (${why})`,
    spoken: (when: string, wh: string, t: string, s: string) => `${when}, radiateurs ${wh}, température ${t}, consigne ${s}`
  },
  roomDayPanel: {
    title: 'Température et chauffe',
    room: 'Pièce',
    day: (d: string) => `le ${d}`,
    chart: (room: string, d: string) => `Radiateurs, température et consigne · ${room} · ${d}`,
    noRooms: 'Aucune pièce avec un radiateur.',
    beforeCounted: (d: string) => `Pas de données pour ce jour${NB}: antérieur au premier jour compté (depuis le ${d}).`,
    noCurve: `Pas de courbe Linky pour ce jour${NB}: les demi-heures de la pièce sont celles de la courbe.`,
    retry: 'Réessayer'
  },
  roomsEnergy: {
    title: 'Par pièce et par radiateur',
    day: (d: string) => `le ${d}`,
    room: 'Pièce',
    kwh: 'kWh',
    share: 'Part',
    hc: 'HC (kWh)',
    hp: 'HP (kWh)',
    eur: '€',
    temp: 'Moy. °C',
    setpoint: 'Consigne moy. (°C)',
    hours: 'Heures de chauffe (h)',
    hcShort: 'HC',
    hpShort: 'HP',
    eurShort: 'Coût (énergie)',
    setpointShort: 'Consigne moy.',
    hoursShort: 'Heures de chauffe',
    radiators: (n: number) => `Radiateurs (${n})`,
    partial: 'partiel',
    noRadiator: 'aucun radiateur enregistré',
    statsWhy: (why: string) => `°C, consigne et chauffe${NB}: ${why}`,
    est: 'est.',
    hoursNote: `Heures de chauffe${NB}: équivalent pleine puissance, par radiateur (moyenne des radiateurs pour une pièce).`,
    eurNote: `Coût${NB}: énergie seule, hors abonnement.`,
    estNote: `est.${NB}: énergie répartie entre deux relevés des radiateurs.`,
    empty: 'Aucun radiateur enregistré sur la période.'
  },
  exportPanel: {
    title: 'Exporter',
    period: 'Exporter la période (CSV)',
    curve: (d: string) => `Exporter la courbe du ${d} (CSV)`,
    rooms: 'Exporter par pièce (CSV)',
    format:
      `Fichiers CSV${NB}: séparateur point-virgule, décimales avec une virgule, dates ISO avec leur fuseau, cellule vide quand une valeur manque. Les chiffres de la page, avec toutes leurs décimales.`
  },
  energyData: { reportFailed: 'Impossible de charger la consommation.', dayFailed: 'Impossible de charger la courbe.' },
  energyPage: {
    views: 'Période',
    unit: { day: 'jour', week: 'semaine', month: 'mois', year: 'année' },
    houseTitle: 'Consommation de la maison',
    houseChart: (unit: string) => `Consommation de la maison par ${unit}`,
    radTitle: 'Consommation des radiateurs',
    radChart: (unit: string) => `Consommation des radiateurs par ${unit}`,
    hc: 'Heures creuses',
    hp: 'Heures pleines',
    home: 'Maison',
    radiators: 'Radiateurs',
    linkySince: (d: string) => `Historique Linky depuis le ${d}.`,
    drillMonth: (month: string) => `Voir ${month}`,
    drillDay: 'Voir ce jour',
    drillCurve: (d: string) => `Voir la courbe du ${d}`,
    curveShown: (d: string) => `Courbe du ${d}`,
    retry: 'Réessayer',
    failedPeriod: (period: string, error: string) => `${period}${NB}: ${error}`,
    fresh: (d: string) => `Linky${NB}: données jusqu’au ${d}`,
    connect: 'Reliez le compteur Linky pour voir la consommation de toute la maison et son coût.',
    settings: 'Réglages',
    renew: 'Renouveler le jeton',
    statusFailed: 'État du Linky indisponible.',
    never: `Linky relié${NB}: première synchronisation en attente.`,
    quota: `Historique en cours de récupération${NB}: la suite arrive demain.`,
    throttledAt: (t: string) => `Enedis limite les requêtes${NB}: nouvel essai à ${t}.`,
    throttled: `Enedis limite les requêtes${NB}: nouvel essai plus tard.`,
    auth: 'MyElectricalData refuse le jeton Linky.',
    syncFailed: 'Synchronisation Linky en échec.',
    counters: 'Compteurs des radiateurs',
    radiator: 'Radiateur',
    room: 'Pièce',
    lifetime: 'Depuis l’installation (kWh)',
    register1: 'Registre 1 (kWh)',
    register2: 'Registre 2 (kWh)'
  },
  away: {
    title: 'Absence',
    lead: 'Tous les radiateurs passent à une température réduite, puis reprennent leur réglage à la date choisie.',
    until: 'Jusqu’au',
    parisTime: '(heure de Paris)',
    temperature: 'Température',
    tempLabel: 'Température d’absence',
    start: 'Activer l’absence'
  },
  home: {
    active: 'En cours',
    kind: { boost: 'Forçage', away: 'Absence' },
    wholeHome: 'Toute la maison',
    restoring: 'Rétablissement en cours…',
    until: (dateTime: string) => `jusqu’au ${dateTime}`,
    cancelLabel: (kind: string, rooms: string) => `Annuler ${kind} — ${rooms}`,
    none: 'Aucun forçage ni absence.',
    tariff: 'Tarif',
    tariffLoadFailed: 'Impossible de charger le tarif.',
    linkyLoadFailed: 'Impossible de charger l’état du Linky.',
    logoutFailed: 'Déconnexion impossible. Réessayez.'
  },
  alerts: {
    title: 'Alertes',
    none: 'Aucune alerte.',
    loadError: 'Impossible de charger les alertes.',
    dismissLabel: (text: string) => `Masquer${NB}: ${text}`,
    priceChange: (when: string) => `Si votre offre suit le tarif réglementé, les prix changent le ${when}${NB}: ajoutez les nouveaux prix.`,
    addPrices: 'Ajouter les prix',
    consentExpiring: (when: string) => `Le consentement Enedis expire le ${when}${NB}: renouvelez-le sur MyElectricalData.`,
    consentExpired: (when: string) => `Le consentement Enedis a expiré le ${when}${NB}: renouvelez-le sur MyElectricalData.`,
    unreachableSince: (where: string, time: string) => `${where}${NB}: radiateur injoignable depuis ${time}.`,
    unreachableLong: (where: string) => `${where}${NB}: radiateur injoignable depuis plus de 30${NB}min.`,
    commandFailed: (time: string, label: string, error: string) => `Commande non aboutie à ${time}${NB}: ${label} — ${error}`,
    linkyStalled: (day: string, days: number) => `Linky${NB}: pas de nouvelle donnée depuis le ${day} (${int(days)}${NB}jours).`
  },
  sessions: {
    title: 'Appareils connectés',
    intro: 'Les navigateurs connectés à Kelvin avec le compte de la maison.',
    unknownBrowser: 'Navigateur inconnu',
    thisDevice: 'cet appareil',
    lastActive: (ago: string) => `dernière activité ${ago}`,
    created: (when: string) => `connecté le ${when}`,
    signOut: 'Déconnecter',
    signOutLabel: (device: string) => `Déconnecter ${device}`,
    signOutOthers: 'Déconnecter les autres appareils',
    confirmTitle: `Déconnecter les autres appareils${NB}?`,
    confirmBody: 'Ils devront se reconnecter avec le compte Cozytouch de la maison. Cet appareil reste connecté.',
    revoked: (n: number) => `${int(n)} ${plural(n, { one: 'appareil déconnecté', other: 'appareils déconnectés' })}.`,
    loadError: 'Impossible de charger les appareils connectés.',
    retry: 'Réessayer'
  },
  settings: {
    title: 'Réglages',
    account: 'Compte',
    signOut: 'Se déconnecter',
    connected: 'Connecté',
    unreachable: 'Injoignable',
    lastSync: (ago: string) => `dernière synchro ${ago}`,
    theme: 'Thème',
    themes: { system: 'Système', dark: 'Sombre', light: 'Clair' },
    language: 'Langue'
  },
  tariff: {
    invalidAmounts: 'Saisissez des montants valides (ex. 0,2068).',
    dateMissing: 'Choisissez une date.',
    prefilled: (kva: string, slots: string[]) =>
      `Prérempli d’après votre contrat Enedis (${kva}${NB}kVA, heures creuses ${list(slots)}). Ajoutez vos prix TTC.`,
    kva: 'Puissance souscrite',
    subscription: 'Abonnement (€/mois)',
    hcPrice: 'Prix heures creuses (€/kWh)',
    hpPrice: 'Prix heures pleines (€/kWh)',
    validFrom: 'Applicable à partir du',
    offPeak: 'Heures creuses',
    slotStart: (n: number) => `Début de la plage ${n}`,
    slotEnd: (n: number) => `Fin de la plage ${n}`,
    removeLabel: (n: number) => `Retirer la plage ${n}`,
    remove: 'Retirer',
    add: 'Ajouter une plage',
    saved: 'Tarif enregistré.',
    saving: 'Enregistrement…',
    save: 'Enregistrer le tarif',
    history: 'Historique des prix',
    since: 'Depuis',
    colHc: 'HC (€/kWh)',
    colHp: 'HP (€/kWh)'
  },
  linky: {
    off: 'Non relié.',
    never: 'Relié · première synchronisation en attente.',
    ok: (day: string | null) => (day ? `Relié · données jusqu’au ${day}` : 'Relié'),
    quota: (day: string | null) =>
      `Relié${day ? ` · données jusqu’au ${day}` : ''} · historique en cours de récupération, la suite arrive demain`,
    throttledAt: (day: string | null, time: string) =>
      `Relié${day ? ` · données jusqu’au ${day}` : ''} · Enedis limite les requêtes, nouvel essai à ${time}`,
    throttledLater: (day: string | null) =>
      `Relié${day ? ` · données jusqu’au ${day}` : ''} · Enedis limite les requêtes, nouvel essai plus tard`,
    sync: (ago: string) => `synchro ${ago}`,
    simulator: `Simulateur${NB}: Linky de démonstration.`,
    consent: (date: string) => `Consentement Enedis valable jusqu’au ${date}`,
    calls: (n: number, budget: number) =>
      `${int(n)} ${plural(n, { one: 'appel', other: 'appels' })} sur ${int(budget)} aujourd’hui`,
    pdl: 'PDL (point de livraison)',
    token: 'Jeton MyElectricalData',
    tokenPlaceholder: 'Enregistré',
    keepToken: 'Laissez vide pour garder le jeton.',
    testing: 'Test en cours…',
    saveTest: 'Enregistrer et tester',
    help: () => ({
      before: 'Le PDL figure sur la facture (14 chiffres). Le jeton s’obtient sur',
      after: 'après l’accord Enedis.'
    })
  },
  login: {
    title: 'Connexion',
    lead: 'Utilisez le compte Cozytouch de la maison.',
    leadServer: (name: string) => `Utilisez le compte ${name} de la maison.`,
    reauth: 'Reconnectez-vous avec le compte Cozytouch.',
    password: 'Mot de passe',
    busy: 'Connexion…',
    submit: 'Se connecter',
    emptyFields: 'Saisissez l’email et le mot de passe Cozytouch.',
    simulator: `Simulateur${NB}: demo@kelvin.local · kelvin`
  },
  devices: {
    byCurrentPlacement: 'Pièces selon la répartition actuelle des radiateurs.',
    title: 'Pièces et appareils',
    intro: `Lu et écrit dans votre installation Cozytouch${NB}: ce que vous changez ici change aussi dans l’application Cozytouch.`,
    open: 'Gérer les pièces et appareils',
    homeText: `Créer, renommer et supprimer des pièces, déplacer un radiateur, et l’état de chaque appareil.`,
    radiatorCount: (n: number) => (n === 1 ? '1 radiateur' : `${n} radiateurs`),
    deviceCount: (n: number) => (n === 1 ? '1 appareil' : `${n} appareils`),
    emptyRoom: 'Pièce vide',
    bridges: 'Pont et box Cozytouch',
    role: {
      heater: 'Chauffage',
      temperature: 'Sonde de température',
      window: 'Contact de fenêtre',
      occupancy: 'Détecteur de présence',
      energy: 'Compteur d’énergie',
      light: 'Veilleuse',
      bridge: 'Pont Cozytouch',
      box: 'Box Cozytouch',
      wifi: 'Wi-Fi',
      other: 'Appareil'
    },
    reachable: 'Joignable',
    unreachable: 'Injoignable',
    reachUnknownLabel: 'Connexion inconnue',
    lastSignal: (ago: string) => `Dernier signal${NB}: ${ago}`,
    lastSignalNone: `Dernier signal${NB}: —`,
    details: 'Détails',
    detailsOf: (name: string) => `Détails de ${name}`,
    loadFailed: 'Impossible de charger les appareils.',
    reload: 'Réessayer',
    newRoom: 'Nouvelle pièce',
    newRoomField: 'Nom de la nouvelle pièce',
    create: 'Créer',
    rename: 'Renommer',
    roomField: 'Nom de la pièce',
    radiatorField: 'Nom du radiateur',
    save: 'Enregistrer',
    deleteRoom: 'Supprimer la pièce',
    deleteTitle: (name: string) => `Supprimer ${name}${NB}?`,
    deleteBody: `La pièce est supprimée dans Cozytouch. «${NB}Annuler${NB}», juste après, la recrée avec le même nom.`,
    moveTo: 'Déplacer vers…',
    moveTitle: (name: string) => `Déplacer ${name} vers…`,
    moveBody: 'Ses six appareils changent de pièce dans Cozytouch, le chauffage en dernier.',
    moveLegend: 'Pièce de destination',
    move: 'Déplacer',
    syncedAgo: (ago: string) => `Synchronisé avec Cozytouch ${ago}`,
    neverSynced: 'Pas encore synchronisé avec Cozytouch',
    budget: (used: number, limit: number) => `Lectures complètes${NB}: ${used} sur ${limit} en 24${NB}h`,
    dailyAt: (t: string) => `Synchronisation automatique chaque jour à ${t}.`,
    sync: 'Synchroniser',
    syncing: 'Synchronisation en cours…',
    syncHelp: 'Relit les pièces et les noms depuis Cozytouch. Kelvin en fait au plus 3 par 24 heures, tout compris.',
    spent: (when: string) =>
      `Les lectures disponibles sur 24${NB}h sont utilisées (la dernière reste pour un redémarrage)${NB}: prochaine synchronisation possible ${when}.`,
    stale: `Des pièces ont pu être modifiées dans l’application Cozytouch${NB}: elles apparaîtront à la prochaine synchronisation.`,
    atTime: (t: string) => `à ${t}`,
    onDate: (d: string) => `le ${d}`,
    misplaced: 'Pas dans la même pièce que son radiateur',
    tidy: 'Ranger avec le radiateur',
    home: 'Maison',
    radiator: 'Radiateur',
    undo: 'Annuler',
    done: (label: string) => `${label} — confirmé`,
    watts: (n: string) => `${n}${NB}W`,
    problem: {
      empty: 'Indiquez un nom.',
      long: `32${NB}caractères au maximum.`,
      invisible: 'Retirez les caractères invisibles.',
      dots: 'Un nom ne peut pas être fait que de points.',
      taken: 'Une pièce porte déjà ce nom.',
      reserved: 'Ce mot est réservé par Cozytouch.'
    },
    detail: {
      model: 'Modèle',
      maker: 'Fabricant',
      power: 'Puissance',
      voltage: 'Tension',
      version: 'Version',
      uptime: 'Durée de fonctionnement',
      rssi: 'Signal (RSSI)',
      rssiLevel: 'Niveau de signal',
      wifi: 'Signal Wi-Fi',
      connectivity: 'Connexion',
      running: 'État de marche',
      workingRate: 'Taux de chauffe',
      maxLevel: 'Niveau de chauffe maximal',
      lowering: 'Abaissement cumulé',
      holidays: 'Mode vacances',
      derogation: 'Consigne de dérogation',
      peakNotice: 'Préavis de pointe',
      peakWarning: 'Alerte de pointe'
    }
  },
  cozytouch: {
    auth: 'Cozytouch refuse la connexion.',
    network: 'Cozytouch ne répond pas.',
    quota: 'Limite de requêtes Cozytouch atteinte.',
    unknown: 'Erreur Cozytouch.'
  },
  action: {
    mode: (p: ApiParams) => `${p.name}${NB}: ${own(MODE_NAME, p.mode) ?? p.mode}`,
    setpoint: (p: ApiParams) => `${p.name}${NB}: ${own(KIND, p.kind) ?? p.kind} ${num(p.value)}${NB}°C`,
    program: (p: ApiParams) => `${p.name}${NB}: programme`,
    settings: (p: ApiParams) => `${p.name}${NB}: réglages`,
    night_light: (p: ApiParams) => `${p.name}${NB}: veilleuse ${p.on ? 'allumée' : 'éteinte'}`,
    night_light_intensity: (p: ApiParams) => `${p.name}${NB}: veilleuse à ${p.intensity}${NB}%`,
    identify: (p: ApiParams) => `${p.name}${NB}: identification`,
    // Plan 12
    level: (p: ApiParams) => `${p.name}${NB}: allure ${own(LEVEL_FR, p.level) ?? p.level}`,
    dryer: (p: ApiParams) => `${p.name}${NB}: ${own(DRYER_FR, p.action) ?? p.action}`,
    boost: (p: ApiParams) => `${p.name}${NB}: forcé à ${num(p.temperature)}${NB}°C`,
    away: (p: ApiParams) => `Absence à ${num(p.temperature)}${NB}°C`,
    all_off: () => 'Tout éteindre',
    all_program: () => 'Tout en programme',
    boost_end: () => 'Fin du forçage',
    away_end: () => 'Fin de l’absence',
    setup_room_create: (p: ApiParams) => `Nouvelle pièce «${NB}${p.label}${NB}»`,
    setup_room_rename: (p: ApiParams) => `${p.name}${NB}: renommée «${NB}${p.label}${NB}»`,
    setup_room_delete: (p: ApiParams) => `Suppression de la pièce ${p.name}`,
    setup_move: (p: ApiParams) => `${p.name}${NB}: vers ${p.room}`,
    setup_rename_device: (p: ApiParams) => `${p.name}${NB}: renommé «${NB}${p.label}${NB}»`,
    setup_tidy: (p: ApiParams) => `${p.name}${NB}: appareil rangé avec le radiateur`
  },
  api: {
    login_required: () => 'Connexion requise.',
    session_is_current: () => `Utilisez «${NB}Se déconnecter${NB}» pour cet appareil.`,
    session_unknown: () => 'Cet appareil n’est plus connecté.',
    alert_unknown: () => 'Alerte introuvable.',
    header_missing: () => 'En-tête X-Kelvin manquant.',
    bad_credentials: () => 'Email ou mot de passe Cozytouch incorrect.',
    wrong_account: () => 'Ce compte Cozytouch n’est pas celui de cette maison.',
    cozytouch_unreachable: () => 'Cozytouch injoignable, réessayez dans un instant.',
    cozytouch_unavailable: () => 'Cozytouch injoignable, réessayez plus tard.',
    quotas_unavailable: () => 'Quotas indisponibles.',
    too_many_attempts: (p: ApiParams) => `Trop de tentatives. Réessayez dans ${p.minutes}${NB}min.`,
    not_found: () => 'Introuvable.',
    method_not_allowed: () => 'Méthode non autorisée.',
    invalid_request: (p: ApiParams) => (p.field ? `Requête invalide${NB}: ${p.field}.` : 'Requête invalide.'),
    radiator_unknown: () => 'Radiateur inconnu.',
    room_unknown: () => 'Pièce inconnue.',
    too_many_radiators: () => 'Trop de radiateurs dans la demande.',
    nothing_to_change: () => 'Rien à modifier.',
    override_not_found: () => 'Forçage ou absence introuvable.',
    no_radiator: () => 'Aucun radiateur.',
    radiator_unknown_id: () => 'Radiateur inconnu dans la demande.',
    end_in_past: () => 'La fin doit être dans le futur.',
    unsupported_command: (p: ApiParams) => `Ce radiateur ne prend pas en charge «${NB}${p.command}${NB}».`,
    temp_range: (p: ApiParams) => `${subject(p.kind)} doit être comprise entre ${bound(p.min)} et ${bound(p.max)}${NB}°C.`,
    temp_step: (p: ApiParams) => `${subject(p.kind)} se règle par pas de 0,5${NB}°C.`,
    mode_unknown: (p: ApiParams) => `Mode inconnu${NB}: ${p.mode}.`,
    setpoint_kind_unknown: (p: ApiParams) => `Type de consigne inconnu${NB}: ${p.kind}.`,
    program_time_invalid: (p: ApiParams) =>
      `${dayLower(p.day)}${NB}: heure invalide «${NB}${p.value}${NB}» (format HH:MM).`,
    day_unknown: (p: ApiParams) => `Jour inconnu${NB}: ${p.day}.`,
    program_too_many: (p: ApiParams) => `${dayLower(p.day)}${NB}: 3 plages confort au maximum.`,
    program_day_unknown: (p: ApiParams) =>
      `${dayLower(p.day)}${NB}: le radiateur n’a pas rapporté ce jour${NB}; renseignez-le pour envoyer le programme.`,
    program_slot_invalid: (p: ApiParams) => `${dayLower(p.day)}${NB}: la plage ${p.start}–${p.end} est invalide.`,
    program_overlap: (p: ApiParams) => `${dayLower(p.day)}${NB}: des plages se chevauchent.`,
    program_changed_elsewhere: () => `Programme modifié ailleurs${NB}: rechargez-le ou remplacez-le.`,
    feature_unknown: (p: ApiParams) => `Fonction inconnue${NB}: ${p.feature}.`,
    no_night_light: () => 'Ce radiateur n’a pas de veilleuse.',
    intensity_light_off: () => 'L’intensité ne peut être réglée que veilleuse allumée.',
    intensity_range: () => `L’intensité doit être comprise entre 1 et 100${NB}%.`,
    slot_time_invalid: (p: ApiParams) => `Heure invalide${NB}: ${p.value} (format HH:MM).`,
    slots_none: () => 'Indiquez au moins une plage d’heures creuses.',
    slots_too_many: () => 'Trois plages d’heures creuses au maximum.',
    slot_empty: () => 'Une plage d’heures creuses ne peut pas être vide.',
    slots_overlap: () => 'Les plages d’heures creuses se chevauchent.',
    tariff_option_unsupported: () => 'Seule l’option heures pleines / heures creuses est disponible.',
    kva_unknown: () => 'Puissance souscrite inconnue.',
    price_subscription_invalid: () => 'Prix de l’abonnement invalide.',
    price_hc_invalid: () => 'Prix du kWh en heures creuses invalide.',
    price_hp_invalid: () => 'Prix du kWh en heures pleines invalide.',
    linky_unavailable: () => 'Linky indisponible.',
    period_invalid: () => 'Période invalide.',
    pdl_invalid: () => 'Le PDL compte 14 chiffres.',
    token_missing: () => 'Collez le jeton MyElectricalData.',
    linky_quota: () => `Quota Linky du jour atteint${NB}: réessayez demain.`,
    linky_refused: () => 'MyElectricalData refuse ce PDL ou ce jeton.',
    linky_throttled: () => `Enedis limite les requêtes${NB}: réessayez plus tard.`,
    med_unreachable: () => 'MyElectricalData injoignable, réessayez plus tard.',
    linky_status_auth: () => `MyElectricalData refuse le jeton${NB}: renouvelez-le dans Réglages.`,
    linky_status_quota: () => `Quota Linky du jour atteint${NB}: reprise demain.`,
    linky_status_error: () => 'Synchronisation Linky en échec.',
    linky_status_throttled: (p: ApiParams) => `Enedis limite les requêtes${NB}: nouvel essai à ${p.at}.`,
    room_label_invalid: () => `Le nom de la pièce doit faire de 1 à 32${NB}caractères, sans caractère invisible.`,
    room_label_taken: (p: ApiParams) => `Une pièce s’appelle déjà «${NB}${p.label}${NB}».`,
    room_label_reserved: (p: ApiParams) =>
      `«${NB}${p.label}${NB}» attend encore la confirmation de Cozytouch${NB}: réessayez après la prochaine synchronisation${p.at ? ` (possible ${p.day ? `le ${p.day} ` : ''}à ${p.at})` : ''}.`,
    room_not_empty: () => `Videz d’abord la pièce${NB}: déplacez ses radiateurs et appareils vers une autre pièce.`,
    room_protected: () =>
      `Cette pièce ne peut pas être supprimée${NB}: c’est la maison, ou elle contient le pont Cozytouch ou d’autres pièces.`,
    room_type_unknown: () => `Créez d’abord une pièce dans l’application Cozytouch${NB}: Kelvin reprend son type.`,
    setup_busy: () => 'Une modification est déjà en cours pour cette pièce ou ce radiateur.',
    setup_not_found: () => 'Cozytouch ne trouve plus cette pièce ou cet appareil.',
    setup_failed: () => 'Cozytouch a refusé la modification.',
    setup_no_confirmation: () => `Cozytouch n’a pas confirmé la modification${NB}: Kelvin vérifie au prochain relevé.`,
    radiator_in_room: () => 'Le radiateur est déjà dans cette pièce.',
    device_in_place: () => 'L’appareil est déjà dans la pièce de son radiateur.',
    device_unknown: () => 'Appareil inconnu.',
    setup_move_partial: (p: ApiParams) => `Déplacement partiel (${p.done} sur ${p.total}).`,
    rename_alone: () => 'Renommez le radiateur seul, sans autre réglage dans la même demande.',
    setup_sync_spent: () =>
      `Les lectures complètes de Cozytouch disponibles sur 24${NB}h sont utilisées (la dernière reste pour un redémarrage)${NB}: réessayez plus tard.`,
    device_label_invalid: () => `Le nom doit faire de 1 à 32${NB}caractères, sans caractère invisible ni mot réservé.`,
    send_failed: (p: ApiParams) => {
      const why = own(REASON, p.reason_code);
      return why ? `Envoi impossible${NB}: ${why}.` : 'Envoi impossible.';
    },
    send_internal: () => `Envoi impossible${NB}: erreur interne.`,
    radiator_refused: () => 'Le radiateur a refusé la commande.',
    no_confirmation: () => 'Pas de confirmation du radiateur.',
    // Plan 12
    server_unknown: () => 'Serveur inconnu.',
    server_mismatch: (p: ApiParams) =>
      `Cette maison est reliée au serveur ${p.server}. Pour changer de serveur, repartez d’une installation neuve (voir le README).`,
    data_other_server: (p: ApiParams) =>
      `Ce dossier de données appartient à une maison reliée au serveur ${p.server}${NB}: utilisez un autre dossier KELVIN_DATA.`,
    bad_credentials_server: (p: ApiParams) => `Email ou mot de passe ${p.server} incorrect.`,
    read_only_device: () => `Kelvin ne pilote pas cet appareil${NB}: il est affiché en lecture seule.`,
    level_unknown: (p: ApiParams) => `Allure inconnue${NB}: ${p.level}.`,
    dryer_action_unknown: (p: ApiParams) => `Action inconnue${NB}: ${p.action}.`,
    unsupported_in_room: () => 'Aucun des radiateurs concernés ne prend en charge cette commande.'
  },
  // Plan 12 (Task 12)
  kind: {
    setpoint_heater: 'Radiateur',
    pilot_wire_heater: 'Radiateur fil pilote',
    towel_dryer: 'Sèche-serviettes',
    heater_unknown: 'Chauffage'
  },
  support: {
    expected: 'Devrait fonctionner',
    experimental: 'Expérimental',
    readonly: 'Lecture seule',
    readonlyHint: `Kelvin ne pilote pas ce type d’appareil${NB}: il est affiché tel que Cozytouch le décrit.`
  },
  pilot: {
    label: 'Allure',
    comfort: 'Confort',
    comfort1: 'Confort −1',
    comfort2: 'Confort −2',
    eco: 'Éco',
    frostprotection: 'Hors-gel',
    off: 'Arrêt'
  },
  dryer: { label: 'Sèche-serviettes', normal: 'Normal', boost: 'Boost', drying: 'Séchage' },
  roomCaps: {
    partial: (n: number, total: number) =>
      n === 1 ? `S’applique à 1 radiateur sur ${total}` : `S’applique à ${n} radiateurs sur ${total}`,
    readOnly: 'Kelvin ne pilote aucun appareil de cette pièce.'
  },
  // Plan 12
  servers: {
    label: 'Serveur',
    cozytouch: 'Cozytouch',
    experimental: 'Expérimental — chauffage seulement',
    experimentalNote: `Expérimental${NB}: Kelvin n’affiche que le chauffage, ne modifie pas les pièces, et certains appareils restent en lecture seule.`,
    locked: (name: string) =>
      `Serveur${NB}: ${name}. Pour en changer, repartez d’une installation neuve (voir le README).`
  }
};

export type Messages = typeof fr;
