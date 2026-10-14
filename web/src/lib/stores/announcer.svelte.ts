/**
 * One app-level pair of live regions (rendered once by the root layout, always present): screen
 * readers ignore regions that are inserted already holding their text, so status changes are
 * written here instead of being announced by the element that shows them.
 */
class Announcer {
  polite = $state('');
  assertive = $state('');

  /** Announce `message`; `urgent` for failures. Repeating the same message is announced again. */
  say(message: string, urgent = false): void {
    // A trailing no-break space toggles, so an identical message is still a change.
    const next = (prev: string) => (prev === message ? `${message} ` : message);
    if (urgent) this.assertive = next(this.assertive);
    else this.polite = next(this.polite);
  }

  clear(): void {
    this.polite = '';
    this.assertive = '';
  }
}

export const announcer = new Announcer();
