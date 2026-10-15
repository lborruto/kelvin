<script lang="ts">
  import { fade, slide } from 'svelte/transition';
  import { CARD_W } from '$lib/chart';
  import type { Inspection } from '$lib/inspector';
  import { dur, T } from '$lib/motion';

  const COPY = {
    est: 'est.',
    estNote: 'est.\u00a0: valeur estimée, détail dans',
    quality: 'Qualité des données'
  } as const;

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
  }
  let { ins, mode, id, left = 0, top = 0, pinned = false, action = null, onclose = null }: Props = $props();
  let hasEst = $derived(ins.rows.some((r) => r.est));
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !onclose) return;
    e.preventDefault();
    onclose();
  }
</script>

{#snippet body()}
  <p class="title">{ins.title}</p>
  {#if ins.empty}<p class="empty">{ins.empty}</p>{/if}
  {#if ins.rows.length}
    <dl>
      {#each ins.rows as r (r.key)}
        <div class="row" class:sub={r.sub}>
          <dt>{r.label}</dt>
          <dd class="num">{r.value}{#if r.est}<span class="est">{COPY.est}</span>{/if}{#if r.note}<span class="why">{r.note}</span>{/if}</dd>
        </div>
      {/each}
    </dl>
  {/if}
  {#if ins.notes.length}
    <ul class="notes">{#each ins.notes as n (n)}<li>{n}</li>{/each}</ul>
  {/if}
  {#if hasEst}<p class="foot">{COPY.estNote} <a href="#qualite">{COPY.quality}</a>.</p>{/if}
  {#if action}<button type="button" class="btn btn-sm" onclick={action.run}>{action.label}</button>{/if}
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
  .title {
    margin: 0 0 6px;
    font-weight: 600;
  }
  dl {
    margin: 0;
    display: grid;
    gap: 3px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .row.sub dt {
    padding-left: 10px;
  }
  dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
    text-align: right;
    white-space: pre-line;
  }
  .est {
    margin-left: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  /* Why a value reads « — »: under it, muted. */
  .why {
    display: block;
    font-size: 12px;
    color: var(--mu);
  }
  .empty,
  .notes,
  .foot {
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
    color: var(--mu);
  }
  /* A 44 px tall target around 12 px text, without moving the lines around it. */
  .foot a {
    padding-block: 14px;
    color: var(--tx);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .btn {
    margin-top: 10px;
  }
  /* Clear of the link's target above it. */
  .foot + .btn {
    margin-top: 18px;
  }
</style>
