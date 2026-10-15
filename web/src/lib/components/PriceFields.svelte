<script lang="ts">
  import type { TariffOption } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { RATE_KEYS } from '$lib/tariff';

  interface Props {
    option: TariffOption;
    /** Decimal text per rate key, as typed (comma or point). */
    values: Record<string, string>;
  }
  let { option, values = $bindable() }: Props = $props();
</script>

<fieldset class:tempo={option === 'tempo'}>
  <legend>{m.tariff.prices}</legend>
  <div class="grid">
    {#each RATE_KEYS[option] as key (key)}
      <label class="field"><span>{m.tariff.rate[key]}</span><input inputmode="decimal" autocomplete="off" bind:value={values[key]} /></label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
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
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px;
  }
  /* Tempo: one colour per row, off-peak then peak. */
  .tempo .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .field {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
  }
</style>
