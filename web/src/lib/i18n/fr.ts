import { intFor } from './rules';

const NB = '\u00a0';
const int = intFor('fr');

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
  }
};

export type Messages = typeof fr;
