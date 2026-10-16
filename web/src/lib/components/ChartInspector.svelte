<script lang="ts">
  import { fade, slide } from 'svelte/transition';
  import { CARD_W } from '$lib/chart';
  import type { Inspection } from '$lib/inspector';
  import { dur, T } from '$lib/motion';
  import type { Provenance } from '$lib/provenance';
  import FicheBody from './FicheBody.svelte';

  interface Props {
    ins: Inspection;
    /** `card`: floating beside a bar (desktop); `sheet`: docked under its chart (phone), so nothing jumps above it. */
    mode: 'card' | 'sheet';
    id: string;
    left?: number;
    top?: number;
    /** A pinned card (click, tap or keyboard) takes the pointer, so its action can be clicked. */
    pinned?: boolean;
    action?: { label: string; run: () => void } | null;
    /** Esc inside the card or sheet: the host closes it and puts focus back on what opened it. */
    onclose?: (() => void) | null;
    /** Where the values come from (the Fiche's Provenance block). */
    provenance?: Provenance | null;
  }
  let { ins, mode, id, left = 0, top = 0, pinned = false, action = null, onclose = null, provenance = null }: Props = $props();
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !onclose) return;
    e.preventDefault();
    onclose();
  }
</script>

{#snippet body()}
  <FicheBody title={ins.title} rows={ins.rows} empty={ins.empty} notes={ins.notes} {provenance} estLink
    action={action ? { label: action.label, run: action.run } : null} />
{/snippet}

<!-- The host mounts the inspector inside its own {#if}: |global lets the entrance play all the same. The keydown only
     catches Esc bubbling up from the controls inside (the action, the Qualité link); the group takes no focus. -->
{#if mode === 'card'}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    {id}
    class="inspector card"
    class:pinned
    role="group"
    aria-label={ins.title}
    style:left="{left}px"
    style:top="{top}px"
    style:width="{CARD_W}px"
    {onkeydown}
    transition:fade|global={{ duration: dur(T.state) }}>
    {@render body()}
  </div>
{:else}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div {id} class="inspector sheet" role="group" aria-label={ins.title} {onkeydown} transition:slide|global={{ duration: dur(T.enter) }}>
    {@render body()}
  </div>
{/if}

<style>
  /* Flat like every surface (DESIGN.md Elevation): s2 over s1, a hairline, no shadow. */
  .inspector {
    font-size: 13px;
    padding: 10px 12px;
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .card {
    position: absolute;
    z-index: 3;
    pointer-events: none;
  }
  .card.pinned {
    pointer-events: auto;
  }
  .sheet {
    margin-top: 10px;
  }
</style>
