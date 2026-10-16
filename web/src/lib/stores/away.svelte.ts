/** The Absence sheet (direction-2 §3): mounted once in the layout, opened from wherever the user is
 * (the sidebar, the phone Pièces header, Maison, `/home#away`). Focus returns to the opener on close. */
class AwaySheetStore {
  open = $state(false);
  /** The element that opened the sheet: focus goes back to it. */
  trigger = $state<HTMLElement | null>(null);

  show(trigger: HTMLElement | null = null): void {
    this.trigger = trigger;
    this.open = true;
  }

  close(): void {
    this.open = false;
  }
}

export const awaySheet = new AwaySheetStore();
