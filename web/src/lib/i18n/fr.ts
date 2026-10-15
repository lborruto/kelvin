import type { Day } from '$lib/api/types';
import { intFor, own, pluralFor, type ApiParams } from './rules';

const NB = '\u00a0';
const int = intFor('fr');
const plural = pluralFor('fr');

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
    identify: (p: ApiParams) => `${p.name}${NB}: identification`,
    boost: (p: ApiParams) => `${p.name}${NB}: forcé à ${num(p.temperature)}${NB}°C`,
    away: (p: ApiParams) => `Absence à ${num(p.temperature)}${NB}°C`,
    all_off: () => 'Tout éteindre',
    all_program: () => 'Tout en programme',
    boost_end: () => 'Fin du forçage',
    away_end: () => 'Fin de l’absence'
  },
  api: {
    login_required: () => 'Connexion requise.',
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
    temp_range: (p: ApiParams) => `${subject(p.kind)} doit être comprise entre ${p.min} et ${p.max}${NB}°C.`,
    temp_step: (p: ApiParams) => `${subject(p.kind)} se règle par pas de 0,5${NB}°C.`,
    mode_unknown: (p: ApiParams) => `Mode inconnu${NB}: ${p.mode}.`,
    setpoint_kind_unknown: (p: ApiParams) => `Type de consigne inconnu${NB}: ${p.kind}.`,
    program_time_invalid: (p: ApiParams) =>
      `${dayLower(p.day)}${NB}: heure invalide «${NB}${p.value}${NB}» (format HH:MM).`,
    day_unknown: (p: ApiParams) => `Jour inconnu${NB}: ${p.day}.`,
    program_too_many: (p: ApiParams) => `${dayLower(p.day)}${NB}: 3 plages confort au maximum.`,
    program_slot_invalid: (p: ApiParams) => `${dayLower(p.day)}${NB}: la plage ${p.start}–${p.end} est invalide.`,
    program_overlap: (p: ApiParams) => `${dayLower(p.day)}${NB}: des plages se chevauchent.`,
    feature_unknown: (p: ApiParams) => `Fonction inconnue${NB}: ${p.feature}.`,
    no_night_light: () => 'Ce radiateur n’a pas de veilleuse.',
    intensity_light_off: () => 'L’intensité ne peut être réglée que veilleuse allumée.',
    intensity_range: () => `L’intensité doit être comprise entre 1 et 100${NB}%.`,
    name_length: () => 'Le nom doit faire entre 1 et 32 caractères.',
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
    send_failed: (p: ApiParams) => {
      const why = own(REASON, p.reason_code);
      return why ? `Envoi impossible${NB}: ${why}.` : 'Envoi impossible.';
    },
    send_internal: () => `Envoi impossible${NB}: erreur interne.`,
    radiator_refused: () => 'Le radiateur a refusé la commande.',
    no_confirmation: () => 'Pas de confirmation du radiateur.'
  }
};

export type Messages = typeof fr;
