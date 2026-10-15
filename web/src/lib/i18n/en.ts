import type { Messages } from './fr';
import { intFor } from './rules';

const NB = '\u00a0';
const int = intFor('en');

/** The English (en-GB) dictionary. Every term follows docs/glossary.md. */
export const en: Messages = {
  common: {
    cancel: 'Cancel',
    retry: 'Retry',
    dismiss: 'Dismiss',
    close: 'Close'
  },
  error: {
    network: 'Can’t reach Kelvin.',
    unexpected: 'Something went wrong.',
    server: 'The Kelvin server hit an error.'
  },
  ago: {
    justNow: 'just now',
    minutes: (n: number) => `${int(n)}${NB}min ago`,
    hours: (n: number) => `${int(n)}${NB}h ago`,
    on: (dateTime: string) => `on ${dateTime}`
  }
};
