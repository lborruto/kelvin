<script lang="ts">
  import type { Slot } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { ALL_MONTHS, SUMMER, WINTER } from '$lib/tariff';
  import MonthChips from './MonthChips.svelte';

  interface Variant {
    months: number[];
    slots: Slot[];
  }
  interface Props {
    variants: Variant[];
    seasonal: boolean;
  }
  let { variants = $bindable(), seasonal = $bindable() }: Props = $props();

  function setSeasonal(on: boolean) {
    seasonal = on;
    const base = variants[0]?.slots ?? [{ start: '22:00', end: '06:00' }];
    const copy = () => base.map((s) => ({ ...s }));
    variants = on ? [{ months: [...WINTER], slots: copy() }, { months: [...SUMMER], slots: copy() }] : [{ months: [...ALL_MONTHS], slots: copy() }];
  }
  function addSlot(v: Variant) {
    if (v.slots.length < 3) v.slots.push({ start: '12:00', end: '14:00' });
  }
  function removeSlot(v: Variant, i: number) {
    if (v.slots.length > 1) v.slots.splice(i, 1);
  }
</script>

<label class="switch">
  <input type="checkbox" checked={seasonal} onchange={(e) => setSeasonal(e.currentTarget.checked)} />
  <span>{m.tariff.seasonal}</span>
</label>
{#each variants as v, vi (vi)}
  <div class="variant">
    {#if seasonal}
      <h4>{m.tariff.season(vi + 1)}</h4>
      <MonthChips bind:months={v.months} label={m.tariff.months} />
    {/if}
    {#each v.slots as slot, i (i)}
      <!-- One line per slot: « [22:00] → [06:00] [Retirer] »; the captions stay for screen readers. -->
      <div class="slot">
        <label class="field"><span class="visually-hidden">{m.tariff.slotStart(i + 1)}</span><input type="time" step="600" bind:value={slot.start} /></label>
        <span class="arr" aria-hidden="true">→</span>
        <label class="field"><span class="visually-hidden">{m.tariff.slotEnd(i + 1)}</span><input type="time" step="600" bind:value={slot.end} /></label>
        <button type="button" class="btn btn-ghost" aria-label={m.tariff.removeSlotLabel(i + 1)} aria-disabled={v.slots.length === 1}
          onclick={() => removeSlot(v, i)}>{m.tariff.removeSlot}</button>
      </div>
    {/each}
    <button type="button" class="btn btn-ghost add" aria-disabled={v.slots.length >= 3} onclick={() => addSlot(v)}>{m.tariff.addSlot}</button>
  </div>
{/each}

<style>
  .switch {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    font-size: 13px;
  }
  .switch input {
    width: 18px;
    height: 18px;
    accent-color: var(--tx);
  }
  .variant {
    display: grid;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .slot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .arr {
    color: var(--fa);
  }
  .field {
    display: grid;
    font-size: 12px;
    color: var(--mu);
  }
  .add {
    justify-self: start;
  }
</style>
