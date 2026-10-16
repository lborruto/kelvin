<!-- The Freshness mark (direction-2 §1.2, DESIGN « Freshness »): an 8 px circle beside a source's name.
     Solid muted ring: fresh (within the source's cadence) · dashed muted ring: waiting or late (the same
     dashed-means-not-yet signature as a pending command) · solid bad dot: failed (only what DESIGN already
     makes red) · nothing when there is nothing to say. Always paired with words; decorative. -->
<script lang="ts">
  import type { Fresh } from '$lib/freshness';

  interface Props {
    state: Fresh;
  }
  let { state }: Props = $props();
</script>

{#if state !== 'none'}
  <svg class="mark {state}" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" data-fresh={state}>
    {#if state === 'bad'}<circle cx="4" cy="4" r="4" />{:else}<circle cx="4" cy="4" r="3.375" />{/if}
  </svg>
{/if}

<style>
  .mark {
    flex: none;
    display: inline-block;
    vertical-align: 0;
    overflow: visible;
  }
  circle {
    fill: none;
    stroke: var(--mu);
    stroke-width: 1.25;
  }
  .late circle {
    stroke-dasharray: 2 1.6;
  }
  .bad circle {
    fill: var(--bad);
    stroke: none;
  }
</style>
