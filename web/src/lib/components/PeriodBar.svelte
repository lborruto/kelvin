<!-- The condensed period bar (direction-2 §2): once the period navigator has scrolled above the screen, a fixed 44 px
     bar fades in at the top (« ‹ Octobre 2026 · Mois › »), s1 at 92 % with a 12 px blur and a hairline, like the tab
     bar. It is `position: fixed` and was never in flow, so it moves nothing (zero CLS). It only repeats the navigator,
     which stays the one control for assistive technology: aria-hidden always, its buttons out of the tab order, inert
     while hidden. Its buttons run the navigator's own handlers. -->
<script lang="ts">
  import { m } from '$lib/i18n';
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    /** « Mois », « Jour »… */
    view: string;
    canPrev: boolean;
    canNext: boolean;
    onstep: (d: -1 | 1) => void;
    /** The navigator: the bar shows while it is above the screen. */
    anchor: HTMLElement | null | undefined;
  }
  let { title, view, canPrev, canNext, onstep, anchor }: Props = $props();
  let shown = $state(false);

  $effect(() => {
    const t = anchor;
    if (!t || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      // Above the screen only: a navigator below it (a short page scrolled back up) needs no bar.
      shown = !e.isIntersecting && e.boundingClientRect.bottom <= 0;
    });
    io.observe(t);
    return () => io.disconnect();
  });
</script>

<div class="period-bar" class:shown aria-hidden="true" inert={!shown} data-testid="period-bar">
  <button type="button" class="btn btn-icon step" tabindex="-1" aria-disabled={!canPrev} onclick={() => canPrev && onstep(-1)}>
    <Icon name="chevron-left" />
  </button>
  <p class="label num"><span class="t">{title}</span><span class="v">{m.energyUi.barView(view)}</span></p>
  <button type="button" class="btn btn-icon step" tabindex="-1" aria-disabled={!canNext} onclick={() => canNext && onstep(1)}>
    <Icon name="chevron" />
  </button>
</div>

<style>
  .period-bar {
    position: fixed;
    z-index: 40;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    height: calc(44px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) 8px 0;
    background: color-mix(in srgb, var(--s1) 92%, transparent);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--line);
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease;
  }
  .period-bar.shown {
    opacity: 1;
    pointer-events: auto;
  }
  /* Beside the sidebar on a desktop. */
  @media (min-width: 1024px) {
    .period-bar {
      left: 232px;
      padding-inline: 20px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .period-bar {
      transition: none;
    }
  }
  .label {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
  }
  .t {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .v {
    flex: none;
    font-size: 12px;
    font-weight: 400;
    color: var(--mu);
  }
  .step[aria-disabled='true'] {
    color: var(--fa);
  }
</style>
