<!-- The price fields of the tariff editor (Tableau « Tarif »): one field per rate of the option, its swatch (HC
     hatched, HP solid) or TempoDot in the caption. A price that cannot be right (not a number, more than 4
     decimals, 0, above 5 €/kWh) is flagged as soon as the field is left: red edge, aria-invalid and one line under
     the fields, before anything is saved. -->
<script lang="ts">
  import type { TariffOption, TempoColour } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { priceProblem, RATE_KEYS } from '$lib/tariff';
  import Swatch from './Swatch.svelte';
  import TempoDot from './TempoDot.svelte';

  interface Props {
    option: TariffOption;
    /** Decimal text per rate key, as typed (comma or point). */
    values: Record<string, string>;
  }
  let { option, values = $bindable() }: Props = $props();
  const uid = $props.id();
  // A field is judged once left (blur), then on every keystroke until it is right.
  let left = $state<Record<string, boolean>>({});
  let bad = $derived(RATE_KEYS[option].filter((k) => left[k] && priceProblem(values[k] ?? '')));
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
        <input class="w-price" inputmode="decimal" autocomplete="off" bind:value={values[key]} onblur={() => (left[key] = true)}
          aria-invalid={bad.includes(key) ? 'true' : undefined} aria-describedby={bad.includes(key) ? `${uid}-bad` : undefined} />
      </label>
    {/each}
  </div>
  {#if bad.length}<p class="bad" id="{uid}-bad">{m.tariff.priceInvalid}</p>{/if}
</fieldset>

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  legend {
    font-size: 13px;
    font-weight: 600;
    color: var(--tx);
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
    gap: 6px;
    font-size: 13px;
    color: var(--mu);
  }
  .bad {
    margin: 6px 0 0;
    font-size: var(--fs-note);
    color: var(--bad);
  }
  .cap {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
</style>
