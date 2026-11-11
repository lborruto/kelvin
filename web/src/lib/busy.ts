/** What must not be interrupted by a reload for a new version (`$lib/appUpdate`): a command on its way to Kelvin
 * and edits nobody sent yet. (A setpoint waiting to be sent is `draftWaiting`, `$lib/sendDraft.svelte`.) */

let sends = 0;
/** A mutating request left (`$lib/api/client`); call the result when it is over. */
export function sendStarted(): () => void {
  sends++;
  let open = true;
  return () => {
    if (open) sends--;
    open = false;
  };
}
/** True while a command, a save or any other write is in flight. */
export const sending = (): boolean => sends > 0;

let holds = 0;
/** Keep the page from reloading for a new version (unsent edits); returns the way to let go. */
export function holdReload(): () => void {
  holds++;
  let held = true;
  return () => {
    if (held) holds--;
    held = false;
  };
}
export const reloadHeld = (): boolean => holds > 0;
