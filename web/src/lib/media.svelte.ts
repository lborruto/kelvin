export const DESKTOP_QUERY = '(min-width: 1024px)';

/** Whether the desktop layout (sidebar, list + inspector) is active; false where matchMedia is missing. */
class Desktop {
  matches = $state(false);
  constructor() {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(DESKTOP_QUERY);
    this.matches = mq.matches;
    mq.addEventListener('change', () => (this.matches = mq.matches));
  }
}

export const desktop = new Desktop();
