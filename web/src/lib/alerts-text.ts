import type { Alert, Pending } from '$lib/api/types';
import { fmtDay, fmtTime } from '$lib/format';
import { locale, m, pendingError, pendingLabel } from '$lib/i18n';
import { ANCHORS, ROUTES } from '$lib/paths';
import { house } from '$lib/stores/house.svelte';

const MED = 'https://www.myelectricaldata.fr/';

/** « 1er février » / « 3 décembre »; “1 February”. */
export function fmtDayMonth(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const month = new Intl.DateTimeFormat(locale.intl, { month: 'long', timeZone: 'UTC' }).format(d);
  const day = d.getUTCDate();
  return locale.current === 'fr' && day === 1 ? `1er ${month}` : `${day} ${month}`;
}

export interface AlertText {
  text: string;
  link: { href: string; label: string } | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : null);

/** Names only, never an id: an unknown room or radiator reads « Radiateur ». */
function roomLabel(roomId: string, radiatorId: string): string {
  const room = house.room(roomId);
  const rad = house.radiators[radiatorId];
  if (!room) return rad?.name ?? m.radiator.default;
  return room.radiator_ids.length > 1 && rad ? `${room.name} · ${rad.name}` : room.name;
}

/** The words of an alert, from its kind and params only (the backend sends no text). */
export function alertText(a: Alert): AlertText | null {
  const p = a.params;
  switch (a.kind) {
    case 'price_change':
      return {
        text: m.alerts.priceChange(fmtDayMonth(str(p.date))),
        link: { href: `${ROUTES.home}#${ANCHORS.tariff}`, label: m.alerts.addPrices }
      };
    case 'consent_expiring': {
      const when = fmtDayMonth(str(p.date));
      const expired = (num(p.days) ?? 0) < 0;
      return { text: expired ? m.alerts.consentExpired(when) : m.alerts.consentExpiring(when), link: { href: MED, label: 'MyElectricalData' } };
    }
    case 'radiator_unreachable': {
      const where = roomLabel(str(p.room_id), str(p.radiator_id));
      const since = num(p.since);
      return {
        text: since == null ? m.alerts.unreachableLong(where) : m.alerts.unreachableSince(where, fmtTime(since * 1000)),
        link: null
      };
    }
    case 'command_failed': {
      const pending = {
        label: '', label_code: str(p.label_code) || null, label_params: (p.label_params ?? {}) as never,
        error: null, error_code: str(p.error_code) || null, error_params: (p.error_params ?? {}) as never,
        reason_code: str(p.reason_code) || null
      } as unknown as Pending;
      return { text: m.alerts.commandFailed(fmtTime((num(p.at) ?? 0) * 1000), pendingLabel(pending), pendingError(pending)), link: null };
    }
    case 'linky_stalled':
      return {
        text: m.alerts.linkyStalled(fmtDay(str(p.last_day)), num(p.days) ?? 0),
        link: { href: `${ROUTES.home}#${ANCHORS.linky}`, label: 'Linky' }
      };
    default:
      return null;
  }
}
