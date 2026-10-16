<!-- The room sheet over the tableau (Tableau §4 « Room sheet »): `/rooms/[id]` opens it, so a deep link keeps the
     tableau rendered behind; closing it (×, Esc, the backdrop, a drag down on the phone) goes back to `/`.
     Desktop: a centred 920 px modal on --modal; phone: a full-height bottom sheet from 56 px. `?boost=1` (the
     tableau's « Lancer… » tile) opens with the Chauffe temporaire form unfolded. -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { m } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
  import { ROUTES } from '$lib/paths';
  import { roomName } from '$lib/setup';
  import { house } from '$lib/stores/house.svelte';
  import Sheet from '../Sheet.svelte';
  import RoomPanel from './RoomPanel.svelte';

  interface Props {
    roomId: string | null;
  }
  let { roomId }: Props = $props();
  let room = $derived(roomId ? house.room(roomId) : undefined);
  let title = $derived(room ? roomName(room) : m.room.title);
  let boostFirst = $derived(page.url.searchParams.has('boost'));
  const close = () => {
    if (roomId) void goto(ROUTES.rooms, { noScroll: true, keepFocus: true });
  };
</script>

<Sheet open={!!roomId} {title} hideTitle noClose tone="modal" width={920} tall onclose={close} class="room-sheet">
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
