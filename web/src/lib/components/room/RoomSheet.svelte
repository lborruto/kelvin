<!-- The room sheet (Tableau §4 « Room sheet »), a shell overlay mounted once in the root layout: `?sheet=<id>` opens
     it over whatever page is under it (Maison, Programme, Énergie, Réglages…), which stays mounted, scrolled and
     as it was. Opening it is a navigation (Maison's tiles, the sidebar's « Pièces » rows), so a reload or a shared
     link opens it again and Back closes it; closing it (×, Esc, the backdrop, a drag down on the phone) goes back
     to the page under it (a history step back when that is the entry it came from, else the same URL without the
     parameter) and gives focus back to what opened it. Only one can be open: the URL holds one room.
     Desktop: a centred 920 px modal on --modal; phone: a full-height bottom sheet from 56 px. `&boost=1` (the
     tableau's « Lancer… » tile) opens with the Chauffe temporaire form unfolded. -->
<script lang="ts">
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { m } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
  import { ROOM_SHEET_BOOST, roomSheetOf, sheetOnly, withoutRoomSheet } from '$lib/paths';
  import { roomName } from '$lib/setup';
  import { house } from '$lib/stores/house.svelte';
  import Sheet from '../Sheet.svelte';
  import RoomPanel from './RoomPanel.svelte';

  let roomId = $derived(roomSheetOf(page.url));
  let room = $derived(roomId ? house.room(roomId) : undefined);
  let title = $derived(room ? roomName(room) : m.room.title);
  let boostFirst = $derived(page.url.searchParams.has(ROOM_SHEET_BOOST));
  /** The history entry under this one is the same page without the sheet: closing steps back to it. */
  let backable = false;
  /** What opened the sheet (the sidebar row, the tile): focus goes back to it on close. */
  let trigger = $state<HTMLElement | null>(null);

  beforeNavigate(({ from, to }) => {
    if (!to?.url || !roomSheetOf(to.url) || !sheetOnly(from?.url, to.url)) return;
    const active = document.activeElement as HTMLElement | null;
    const href = `${to.url.pathname}${to.url.search}`;
    // Safari does not focus a clicked link: the link to this very sheet stands in for it.
    trigger = active && active !== document.body && !active.closest('dialog') ? active : document.querySelector<HTMLElement>(`a[href="${CSS.escape(href)}"]`);
  });

  afterNavigate(({ from, to, type }) => {
    if (roomSheetOf(to?.url)) {
      backable = type !== 'enter' && !!from?.url && !roomSheetOf(from.url) && sheetOnly(from.url, to?.url);
      return;
    }
    backable = false;
    const back = trigger;
    trigger = null;
    // Closed over the same page: focus goes back to what opened the sheet (the router moved it to <body>).
    if (sheetOnly(from?.url, to?.url) && back?.isConnected) back.focus({ preventScroll: true });
  });

  const close = () => {
    if (!roomId) return;
    if (backable) history.back();
    else void goto(withoutRoomSheet(page.url), { replaceState: true, noScroll: true, keepFocus: true });
  };
</script>

<Sheet open={!!roomId} {title} hideTitle noClose tone="modal" width={920} tall {trigger} onclose={close} class="room-sheet">
  {#if roomId}
    {#key roomId}<RoomPanel {roomId} layout={desktop.matches ? 'modal' : 'sheet'} {boostFirst} onclose={close} />{/key}
  {/if}
</Sheet>

<style>
  /* A fixed height on desktop: the content arriving (chart, figures, the month) never resizes and re-centres the
     modal (CLS); it scrolls inside. */
  :global(dialog.room-sheet) {
    height: min(820px, calc(100dvh - 48px));
    max-height: min(820px, calc(100dvh - 48px));
  }
  :global(dialog.room-sheet .body) {
    height: 100%;
  }
  :global(dialog.room-sheet .body) {
    padding: 28px 32px 32px;
  }
  /* The dialog itself holds focus when it opens (its content mounts after showModal): no ring around the sheet. */
  :global(dialog.room-sheet:focus) {
    outline: none;
  }
  @media (max-width: 1023px) {
    :global(dialog.room-sheet) {
      height: calc(100dvh - 56px);
      max-height: calc(100dvh - 56px);
    }
    :global(dialog.room-sheet .body) {
      padding: 0 18px calc(24px + env(safe-area-inset-bottom));
    }
  }
</style>
