import type { Messages } from './fr';
import type { Day } from '$lib/api/types';
import { intFor, own, pluralFor, type ApiParams } from './rules';

const NB = '\u00a0';
const int = intFor('en');
const plural = pluralFor('en');

const DAY: Record<Day, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday'
};
const day = (d: unknown) => own(DAY, d) ?? String(d);
const SUBJECT: Record<string, string> = { manual: 'The setpoint', comfort: 'The comfort temperature', eco: 'The eco setback' };
const subject = (k: unknown) => own(SUBJECT, k) ?? String(k);
const MODE_NAME: Record<string, string> = { off: 'Off', manual: 'Manual', program: 'Schedule', other: 'Other', mixed: 'Mixed' };
const KIND: Record<string, string> = { manual: 'setpoint', comfort: 'comfort', eco: 'eco setback' };
const REASON: Record<string, string> = {
  quota: 'Cozytouch request limit reached',
  auth: 'Cozytouch refused the sign-in',
  network: 'can’t reach Cozytouch',
  unknown: 'unknown error'
};

/** The English (en-GB) dictionary. Every term follows docs/glossary.md. */
export const en: Messages = {
  common: {
    cancel: 'Cancel',
    retry: 'Retry',
    dismiss: 'Dismiss',
    close: 'Close',
    colon: ': '
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
  },
  pending: {
    failed: 'Command failed.',
    lost: 'Command not confirmed (connection lost).',
    unknownResult: 'Unknown result (connection lost) — please check.',
    sending: 'Sending…',
    confirmed: 'Confirmed',
    announceSending: (label: string) => `${label} — sending…`,
    announceConfirmed: (label: string) => `${label} — confirmed`,
    unknownToast: (label: string) => `${label}: unknown result — please check.`,
    cannotRetry: 'Can’t retry from here: try the action again.'
  },
  banner: {
    reconnecting: 'Reconnecting to Kelvin…',
    passwordChanged: 'Cozytouch password changed: sign in again',
    unreachable: 'Can’t reach Cozytouch',
    unreachableSince: (ago: string) => `Can’t reach Cozytouch — last data ${ago}`,
    signInAgain: 'Sign in again'
  },
  override: {
    restoring: 'Restoring…',
    boost: (temp: string, until: string) => `Boosted ${temp} → ${until}`,
    away: (temp: string) => `Away ${temp}`
  },
  mode: { off: 'Off', manual: 'Manual', program: 'Schedule', other: 'Other', mixed: 'Mixed' },
  modeSwitch: {
    programShort: 'Sched.',
    pending: (name: string) => `${name} (pending)`
  },
  level: { comfort: 'Comfort', eco: 'Eco', frostprotection: 'Frost protection', off: 'Idle', mixed: 'Mixed' },
  stepper: {
    decrease: (label: string) => `Decrease ${label}`,
    increase: (label: string) => `Increase ${label}`,
    announce: (label: string, value: string) => `${label}: ${value}`
  },
  nav: {
    rooms: 'Rooms',
    schedule: 'Schedule',
    energy: 'Energy',
    home: 'Home',
    label: 'Main navigation',
    skip: 'Skip to content'
  },
  houseActions: {
    allOff: 'Turn everything off',
    allProgram: 'Put everything back on schedule',
    away: 'Away…',
    confirmTitle: 'Turn everything off?',
    confirmBody: 'The radiators switch off. You can put them back on schedule from Home.'
  },
  page: {
    title: (name: string) => `${name} · Kelvin`,
    notFound: 'Page not found.',
    notFoundTitle: 'Page not found',
    errorTitle: 'Error',
    error: 'Something went wrong.',
    backToRooms: 'Back to rooms'
  },
  rooms: {
    count: (n: number) => `${int(n)} ${plural(n, { one: 'room', other: 'rooms' })}`,
    heating: (n: number) => (n === 0 ? 'none heating' : `${int(n)} heating`),
    awayActive: 'Away mode on'
  },
  room: {
    title: 'Room',
    windowOpen: 'Window open',
    off: 'Off',
    todayLabel: (name: string) => `${name}, today’s temperature`,
    details: 'Details',
    setpoint: 'Setpoint',
    comfort: 'Comfort',
    eco: 'Eco setback',
    mixedMean: 'Mixed (average)',
    mixedMode: 'Mixed — the radiators aren’t in the same mode',
    notFound: 'Room not found.',
    radiatorCount: (n: number) => `${int(n)} ${plural(n, { one: 'radiator', other: 'radiators' })}`,
    programsDiffer: 'Radiators have different schedules',
    controls: 'Controls',
    modeLabel: 'Room mode',
    boostTitle: 'Temporary boost',
    boostActive: (temp: string, until: string) => `Boosted to ${temp} until ${until}.`,
    cancelBoost: 'Cancel boost',
    boostTemp: 'Boost temperature',
    duration: 'Duration',
    boost: 'Boost',
    history: 'History',
    range: 'Time range',
    historyLabel: (name: string, range: string) => `${name}, temperature over ${range}`,
    radiators: 'Radiators'
  },
  range: { day: `24${NB}h`, week: `7${NB}d`, month: `30${NB}d` },
  radiator: {
    default: 'Radiator',
    facts: (model: string, watts: number | null) => (watts ? `${model} · ${watts}${NB}W` : model),
    nameLabel: 'Radiator name',
    rename: 'Rename',
    setpointActive: 'Current setpoint',
    energyTotal: 'Total consumption',
    setpointLabel: (title: string) => `Setpoint ${title}`,
    windowDetection: 'Open-window detection',
    presenceDetection: 'Presence detection',
    nightLight: 'Night light',
    identify: 'Blink'
  },
  days: {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday'
  },
  daysShort: { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' },
  program: {
    nextTomorrow: (time: string, level: string) => `tomorrow ${time} → ${level}`,
    nextOn: (day: Day, time: string, level: string) => `${DAY[day]} ${time} → ${level}`,
    dayError: {
      tooMany: '3 comfort periods at most.',
      endBeforeStart: 'A period must end after it starts.',
      overlap: 'Periods overlap.'
    },
    ecoAllDay: 'eco all day',
    blockHint: `Arrows: move by 15${NB}min. Delete: remove the period.`,
    slotRole: 'period',
    slotStart: (day: string, n: number) => `${day}, period ${n}, start`,
    slotEnd: (day: string, n: number) => `${day}, period ${n}, end`,
    removeSlot: (n: number, day: string) => `Remove period ${n} from ${day}`,
    addSlot: (day: string) => `Add a period on ${day}`,
    addShort: 'Period',
    discard: 'Discard the changes you haven’t sent?',
    sending: 'Sending…',
    daysChanged: (n: number) => `${int(n)} ${plural(n, { one: 'day', other: 'days' })} changed`,
    noDaysChanged: 'No days changed',
    otherRooms: (n: number) => `${int(n)} other ${plural(n, { one: 'room', other: 'rooms' })}`,
    noSlots: 'no periods (eco)',
    roomPicker: 'Room',
    noRadiator: 'This room has no radiators: there is no schedule to set.',
    mismatch: 'The radiators in this room don’t share a schedule; sending aligns them with this one.',
    legend: () => ({
      before: '',
      comfort: 'Comfort',
      middle: ' periods (3 a day at most); the rest of the time is ',
      eco: 'eco',
      after: '. Tap or click the bar to add a period, drag it to move it, pull its edges to adjust it.'
    }),
    today: 'Today',
    previewLabel: (name: string) => `${name}, today’s temperature and this schedule’s periods`,
    copy: 'Copy',
    copyFrom: 'From',
    copyTo: 'to',
    alsoSend: 'Also send to',
    changes: 'Changes',
    changeBefore: (segs: string) => `(before: ${segs})`,
    staleHint: 'Edit, then Send.',
    undo: 'Undo changes',
    send: 'Send'
  },
  strip: {
    range: (min: string, max: string) => `${min} to ${max}`,
    last: (t: string) => `last reading ${t}`,
    none: 'no reading yet',
    setpoint: (t: string) => `setpoint ${t}`,
    program: (comfort: string, eco: string) => `comfort ${comfort}, eco ${eco}`,
    pendingSetpoint: (t: string) => `setpoint ${t} requested, pending`,
    pendingComfort: (t: string) => `comfort ${t} requested, pending`,
    summary: (parts: string[]) => `${parts.join('; ')}.`
  },
  cozytouch: {
    auth: 'Cozytouch refused the sign-in.',
    network: 'Can’t reach Cozytouch.',
    quota: 'Cozytouch request limit reached.',
    unknown: 'Cozytouch error.'
  },
  action: {
    mode: (p: ApiParams) => `${p.name}: ${own(MODE_NAME, p.mode) ?? p.mode}`,
    setpoint: (p: ApiParams) => `${p.name}: ${own(KIND, p.kind) ?? p.kind} ${p.value}${NB}°C`,
    program: (p: ApiParams) => `${p.name}: schedule`,
    settings: (p: ApiParams) => `${p.name}: settings`,
    night_light: (p: ApiParams) => `${p.name}: night light ${p.on ? 'on' : 'off'}`,
    identify: (p: ApiParams) => `${p.name}: blink`,
    boost: (p: ApiParams) => `${p.name}: boost to ${p.temperature}${NB}°C`,
    away: (p: ApiParams) => `Away at ${p.temperature}${NB}°C`,
    all_off: () => 'Turn everything off',
    all_program: () => 'Everything back on schedule',
    boost_end: () => 'Boost ended',
    away_end: () => 'Away ended'
  },
  api: {
    login_required: () => 'Please sign in.',
    header_missing: () => 'Missing X-Kelvin header.',
    bad_credentials: () => 'Wrong Cozytouch email or password.',
    wrong_account: () => 'This Cozytouch account isn’t the one for this home.',
    cozytouch_unreachable: () => 'Can’t reach Cozytouch. Try again in a moment.',
    cozytouch_unavailable: () => 'Can’t reach Cozytouch. Try again later.',
    quotas_unavailable: () => 'Cozytouch request limits unavailable.',
    too_many_attempts: (p: ApiParams) => `Too many attempts. Try again in ${p.minutes}${NB}min.`,
    not_found: () => 'Not found.',
    method_not_allowed: () => 'Method not allowed.',
    invalid_request: (p: ApiParams) => (p.field ? `Invalid request: ${p.field}.` : 'Invalid request.'),
    radiator_unknown: () => 'Unknown radiator.',
    room_unknown: () => 'Unknown room.',
    too_many_radiators: () => 'Too many radiators in the request.',
    nothing_to_change: () => 'Nothing to change.',
    override_not_found: () => 'Boost or away period not found.',
    no_radiator: () => 'No radiators.',
    radiator_unknown_id: () => 'Unknown radiator in the request.',
    end_in_past: () => 'The end must be in the future.',
    unsupported_command: (p: ApiParams) => `This radiator doesn’t support “${p.command}”.`,
    temp_range: (p: ApiParams) => `${subject(p.kind)} must be between ${p.min} and ${p.max}${NB}°C.`,
    temp_step: (p: ApiParams) => `${subject(p.kind)} goes in steps of 0.5${NB}°C.`,
    mode_unknown: (p: ApiParams) => `Unknown mode: ${p.mode}.`,
    setpoint_kind_unknown: (p: ApiParams) => `Unknown setpoint type: ${p.kind}.`,
    program_time_invalid: (p: ApiParams) => `${day(p.day)}: invalid time “${p.value}” (HH:MM).`,
    day_unknown: (p: ApiParams) => `Unknown day: ${p.day}.`,
    program_too_many: (p: ApiParams) => `${day(p.day)}: 3 comfort periods at most.`,
    program_slot_invalid: (p: ApiParams) => `${day(p.day)}: the period ${p.start}–${p.end} isn’t valid.`,
    program_overlap: (p: ApiParams) => `${day(p.day)}: periods overlap.`,
    feature_unknown: (p: ApiParams) => `Unknown feature: ${p.feature}.`,
    no_night_light: () => 'This radiator has no night light.',
    intensity_light_off: () => 'Brightness can only be set with the night light on.',
    intensity_range: () => 'Brightness must be between 1 and 100%.',
    name_length: () => 'The name must be 1 to 32 characters.',
    slot_time_invalid: (p: ApiParams) => `Invalid time: ${p.value} (HH:MM).`,
    slots_none: () => 'Add at least one off-peak period.',
    slots_too_many: () => 'Three off-peak periods at most.',
    slot_empty: () => 'An off-peak period can’t be empty.',
    slots_overlap: () => 'Off-peak periods overlap.',
    tariff_option_unsupported: () => 'Only the peak / off-peak option is available.',
    kva_unknown: () => 'Unknown subscribed power.',
    price_subscription_invalid: () => 'Invalid standing charge.',
    price_hc_invalid: () => 'Invalid off-peak price per kWh.',
    price_hp_invalid: () => 'Invalid peak price per kWh.',
    linky_unavailable: () => 'Linky isn’t available.',
    period_invalid: () => 'Invalid period.',
    pdl_invalid: () => 'The PDL has 14 digits.',
    token_missing: () => 'Paste your MyElectricalData token.',
    linky_quota: () => 'Today’s Linky quota is used up: try again tomorrow.',
    linky_refused: () => 'MyElectricalData rejected this PDL or token.',
    linky_throttled: () => 'Enedis is limiting requests: try again later.',
    med_unreachable: () => 'Can’t reach MyElectricalData. Try again later.',
    linky_status_auth: () => 'MyElectricalData rejected the token: renew it in Settings.',
    linky_status_quota: () => 'Today’s Linky quota is used up: resuming tomorrow.',
    linky_status_error: () => 'Linky sync failed.',
    linky_status_throttled: (p: ApiParams) => `Enedis is limiting requests: next try at ${p.at}.`,
    send_failed: (p: ApiParams) => {
      const why = own(REASON, p.reason_code);
      return why ? `Couldn’t send: ${why}.` : 'Couldn’t send.';
    },
    send_internal: () => 'Couldn’t send: internal error.',
    radiator_refused: () => 'The radiator rejected the command.',
    no_confirmation: () => 'No confirmation from the radiator.'
  }
};
