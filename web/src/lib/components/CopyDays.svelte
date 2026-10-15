<!-- « Copier vers… »: copies the day being edited onto other days of the draft (nothing is sent).
     Shortcuts pick weekdays, the weekend or every day; the source day and locked days are never
     offered. -->
<script lang="ts">
  import { DAYS, type Day, type DayLock } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { presetDays, type Preset } from '$lib/program';
  import ChoiceSheet from './ChoiceSheet.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    source: Day;
    locks?: Partial<Record<Day, DayLock>>;
    disabled?: boolean;
    oncopy: (days: Day[]) => void;
  }
  let { source, locks = {}, disabled = false, oncopy }: Props = $props();
  const PRESETS: Preset[] = ['weekdays', 'weekend', 'every'];
  let open = $state(false);
  let chosen = $state<Day[]>([]);
  let trigger = $state<HTMLButtonElement>();
  let shown = $derived(DAYS.filter((d) => !locks[d]));
  const same = (a: Day[], b: Day[]) => a.length === b.length && a.every((d) => b.includes(d));

  function show() {
    if (disabled) return;
    chosen = [];
    open = true;
  }
  function apply() {
    if (!chosen.length) return;
    oncopy(DAYS.filter((d) => chosen.includes(d)));
    open = false;
  }
</script>

<button type="button" class="btn btn-sm" bind:this={trigger} aria-haspopup="dialog" aria-disabled={disabled} onclick={show}>
  <Icon name="copy" size={16} />{m.program.copyTo}
</button>

<ChoiceSheet title={m.program.copyTitle(source)} {open} {trigger} onclose={() => (open = false)}>
  <div class="presets" role="group" aria-label={m.program.presetsLabel}>
    {#each PRESETS as p (p)}
      {@const days = presetDays(p, source, locks)}
      <button type="button" class="chip" aria-pressed={days.length > 0 && same(chosen, days)} onclick={() => (chosen = days)}>
        {m.program.presets[p]}
      </button>
    {/each}
  </div>
  <fieldset class="days">
    <legend class="visually-hidden">{m.program.copyDays}</legend>
    {#each shown as d (d)}
      {#if d === source}
        <span class="chip off" aria-hidden="true"><span class="box"></span>{m.daysShort[d]}</span>
      {:else}
        <label class="chip"><input class="visually-hidden" type="checkbox" value={d} aria-label={m.days[d]} bind:group={chosen} /><span
            class="box" aria-hidden="true"><Icon name="check" size={12} /></span><span aria-hidden="true">{m.daysShort[d]}</span></label>
      {/if}
    {/each}
  </fieldset>
  <button type="button" class="btn btn-primary go" aria-disabled={!chosen.length} onclick={apply}>{m.program.copyN(chosen.length)}</button>
  <p class="note">{m.program.copyNote}</p>
</ChoiceSheet>

<style>
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 0 0 14px;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: none;
    color: var(--mu);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    touch-action: manipulation;
    transition:
      background-color var(--t-state) ease,
      border-color var(--t-state) ease,
      color var(--t-state) ease;
  }
  .presets .chip {
    padding: 0 12px;
  }
  @media (hover: hover) {
    .chip:not(.off):hover {
      color: var(--tx);
      border-color: var(--fa);
    }
  }
  .chip[aria-pressed='true'],
  .chip:has(:checked) {
    background: var(--s2);
    border-color: var(--mu);
    color: var(--tx);
  }
  .chip:has(:focus-visible) {
    outline: 2px solid var(--tx);
    outline-offset: 2px;
  }
  .chip.off {
    color: var(--fa);
    border-style: dashed;
    cursor: default;
  }
  .box {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--field-line);
    border-radius: 4px;
    color: transparent;
  }
  .chip:has(:checked) .box {
    background: var(--tx);
    border-color: var(--tx);
    color: var(--bg);
  }
  .go {
    width: 100%;
  }
  .note {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--mu);
    text-align: center;
  }
</style>
