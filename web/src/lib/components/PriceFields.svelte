<script lang="ts">
  import type { TariffOption, TempoColour } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { RATE_KEYS } from '$lib/tariff';
  import Swatch from './Swatch.svelte';
  import TempoDot from './TempoDot.svelte';

  interface Props {
    option: TariffOption;
    /** Decimal text per rate key, as typed (comma or point). */
    values: Record<string, string>;
  }
  let { option, values = $bindable() }: Props = $props();
  /** The hour type of a rate (« hc », « blue_hc » → hc): its tariff-blue swatch in the caption. */
  const hours = (key: string): 'hc' | 'hp' | null => (key.endsWith('hc') ? 'hc' : key.endsWith('hp') ? 'hp' : null);
  const colour = (key: string): TempoColour | null => (option === 'tempo' ? (key.split('_')[0] as TempoColour) : null);
</script>

<fieldset class:tempo={option === 'tempo'}>
  <legend>{m.tariff.prices}</legend>
  <div class="grid">
    {#each RATE_KEYS[option] as key (key)}
      {@const h = hours(key)}
      {@const c = colour(key)}
      <label class="field">
        <span class="cap">{#if c}<TempoDot colour={c} />{/if}{#if h}<Swatch series={h} size={8} />{/if}{m.tariff.rate[key]}</span>
        <input class="w-price" inputmode="decimal" autocomplete="off" bind:value={values[key]} />
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  legend {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mu);
    padding: 0;
    margin-bottom: 8px;
  }
  /* Intrinsic widths in a wrapping group: a price never gets a stretched field. */
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ctl-gap) 16px;
  }
  /* Tempo: one colour per row, off-peak then peak. */
  .tempo .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, max-content));
  }
  .field {
    display: grid;
    justify-items: start;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
  }
  .cap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
</style>
