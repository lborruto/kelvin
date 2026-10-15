import type { Day } from '$lib/api/types';
import { intFor, type ApiParams } from './rules';

const NB = '\u00a0';
const int = intFor('fr');

const DAY_LOWER: Record<Day, string> = {
  monday: 'lundi',
  tuesday: 'mardi',
  wednesday: 'mercredi',
  thursday: 'jeudi',
  friday: 'vendredi',
  saturday: 'samedi',
  sunday: 'dimanche'
};
const dayLower = (d: unknown) => DAY_LOWER[d as Day] ?? String(d);
const SUBJECT: Record<string, string> = { manual: 'La consigne', comfort: 'La température confort', eco: 'L’abaissement éco' };
const subject = (k: unknown) => SUBJECT[String(k)] ?? String(k);
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
    close: 'Fermer'
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
    unknownResult: 'Résultat inconnu (connexion perdue) — vérifiez.'
  },
  cozytouch: {
    auth: 'Cozytouch refuse la connexion.',
    network: 'Cozytouch ne répond pas.',
    quota: 'Limite de requêtes Cozytouch atteinte.',
    unknown: 'Erreur Cozytouch.'
  },
  action: {
    mode: (p: ApiParams) => `${p.name}${NB}: ${MODE_NAME[String(p.mode)] ?? p.mode}`,
    setpoint: (p: ApiParams) => `${p.name}${NB}: ${KIND[String(p.kind)] ?? p.kind} ${num(p.value)}${NB}°C`,
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
      const why = REASON[String(p.reason_code)];
      return why ? `Envoi impossible${NB}: ${why}.` : 'Envoi impossible.';
    },
    send_internal: () => `Envoi impossible${NB}: erreur interne.`,
    radiator_refused: () => 'Le radiateur a refusé la commande.',
    no_confirmation: () => 'Pas de confirmation du radiateur.'
  }
};

export type Messages = typeof fr;
