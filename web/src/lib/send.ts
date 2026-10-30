/** When a setpoint control sends (owner decision 2026-10-29): every −/+ tap, arrow key or slider move shows the new
 * value at once, dashed (« pas encore envoyé »); nothing is sent while the owner keeps going; one command with the
 * final value goes out `SEND_IDLE_MS` after the last interaction (a press held or a slider dragged: after its
 * release). Closing the sheet or leaving the page sends a waiting value at once. */
export const SEND_IDLE_MS = 1500;
/** Press and hold −/+: the first repeat after `HOLD_DELAY_MS`, then one step every `HOLD_REPEAT_MS`. */
export const HOLD_DELAY_MS = 500;
export const HOLD_REPEAT_MS = 150;
