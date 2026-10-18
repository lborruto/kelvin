<!-- The legend key of the outdoor-temperature line over Énergie's charts, and its switch: a button (aria-pressed)
     that shows or hides the line, remembered per device. « prévision » (a dashed key) follows it while a forecast
     is drawn; `forecastSlot` holds its place while the forecast may still arrive, so the legend never moves. -->
<script lang="ts">
  import { m } from '$lib/i18n';
  import { outdoorLine } from '$lib/stores/outdoorLine.svelte';

  interface Props {
    /** A forecast segment is drawn: « prévision » is shown. */
    forecast?: boolean;
    /** The period has days to come: « prévision »'s place is held (unseen) until the forecast arrives. */
    forecastSlot?: boolean;
  }
  let { forecast = false, forecastSlot = false }: Props = $props();
</script>

<li>
  <button type="button" class="toggle hit" aria-pressed={outdoorLine.on} onclick={() => outdoorLine.toggle()}>
    <span class="key" class:off={!outdoorLine.on} aria-hidden="true"></span>{m.outdoorLine.legend}
  </button>
</li>
{#if outdoorLine.on && (forecast || forecastSlot)}
  <li class="fc" class:unseen={!forecast} aria-hidden={forecast ? undefined : 'true'}>
    <span class="key dashed" aria-hidden="true"></span>{m.outdoorLine.forecast}
  </li>
{/if}

<style>
  li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .toggle {
    --hit-y: -14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .toggle[aria-pressed='false'] {
    color: var(--fa);
    text-decoration: line-through;
    text-decoration-color: var(--fa-mark);
  }
  .toggle:focus-visible {
    outline: 2px solid var(--tx);
    outline-offset: 3px;
    border-radius: 4px;
  }
  .key {
    display: inline-block;
    flex: none;
    width: 14px;
    height: 2px;
    border-radius: 1px;
    background: var(--outdoor);
  }
  .key.off {
    background: var(--fa-mark);
  }
  .key.dashed {
    height: 0;
    background: none;
    border-top: 2px dashed var(--outdoor);
    opacity: 0.6;
  }
  .unseen {
    visibility: hidden;
  }
</style>
