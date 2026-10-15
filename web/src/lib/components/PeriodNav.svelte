<script lang="ts">
  import Icon from './Icon.svelte';

  const COPY = {
    group: 'Période affichée',
    prev: 'Période précédente',
    next: 'Période suivante',
    latest: 'Dernier jour'
  } as const;

  interface Props {
    title: string;
    canPrev: boolean;
    canNext: boolean;
    /** True when the period holds the last day with data: « Dernier jour » is hidden. */
    latest: boolean;
    onstep: (d: -1 | 1) => void;
    onlatest: () => void;
  }
  let { title, canPrev, canNext, latest, onstep, onlatest }: Props = $props();
  let nextBtn: HTMLButtonElement | undefined = $state();

  function go(d: -1 | 1) {
    if (d < 0 ? canPrev : canNext) onstep(d);
  }
  function toLatest() {
    if (latest) return;
    onlatest();
    // « Dernier jour » disappears with the latest period: focus stays in the row, never on <body>.
    nextBtn?.focus();
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      toLatest();
    }
  }
</script>

<div class="nav" role="group" aria-label={COPY.group}>
  <!-- aria-disabled at the ends: a focused button stays focused. -->
  <button type="button" class="btn btn-icon edged" aria-label={COPY.prev} aria-disabled={!canPrev} onclick={() => go(-1)} {onkeydown}>
    <span class="flip"><Icon name="chevron" /></span>
  </button>
  <h2 id="period-label" class="label">{title}</h2>
  <button bind:this={nextBtn} type="button" class="btn btn-icon edged" aria-label={COPY.next} aria-disabled={!canNext} onclick={() => go(1)} {onkeydown}>
    <Icon name="chevron" />
  </button>
  {#if !latest}
    <button type="button" class="btn btn-ghost latest" onclick={toLatest} {onkeydown}>{COPY.latest}</button>
  {/if}
</div>

<style>
  .nav {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    min-height: 44px;
    margin-top: 12px;
    max-width: 1180px;
  }
  .label {
    flex: 1 1 10rem;
    min-width: 0;
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    text-wrap: balance;
  }
  .edged {
    border-color: var(--line);
  }
  .flip {
    display: grid;
    transform: scaleX(-1);
  }
  .latest {
    margin-left: auto;
  }
</style>
