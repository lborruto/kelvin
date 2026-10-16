<!-- « Copier vers… »: copies the day being edited onto other days of the draft (nothing is sent). Shortcuts
     pick weekdays, the weekend or every day; the source day is shown dashed and cannot be picked; locked days
     are never offered (a line says which and why). Desktop: a 400 px dialog; phone: a bottom sheet with the
     large « Copier sur N jours ». `variant="row"`: the trigger is a grouped-list row (the phone day view). -->
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
    variant?: 'button' | 'row';
    oncopy: (days: Day[]) => void;
  }
  let { source, locks = {}, disabled = false, variant = 'button', oncopy }: Props = $props();
  const PRESETS: Preset[] = ['weekdays', 'weekend', 'every'];
  let open = $state(false);
  let chosen = $state<Day[]>([]);
  let trigger = $state<HTMLButtonElement>();
  let shown = $derived(DAYS.filter((d) => !locks[d]));
  let lockedOut = $derived(DAYS.filter((d) => locks[d] && d !== source));
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

{#if variant === 'row'}
  <button type="button" class="row" bind:this={trigger} aria-haspopup="dialog" aria-disabled={disabled} onclick={show}>
    <Icon name="copy" size={18} /><span class="x">{m.program.copyTo}</span><Icon name="chevron" size={16} />
  </button>
{:else}
  <button type="button" class="btn btn-sm" bind:this={trigger} aria-haspopup="dialog" aria-disabled={disabled} onclick={show}>
    <Icon name="copy" size={15} />{m.program.copyTo}
  </button>
{/if}

<ChoiceSheet title={m.program.copyTitle(source)} {open} {trigger} onclose={() => (open = false)}>
  <div class="presets" role="group" aria-label={m.program.presetsLabel}>
    {#each PRESETS as p (p)}
      {@const days = presetDays(p, source, locks)}
      <button type="button" class="dchip hit" aria-pressed={days.length > 0 && same(chosen, days)} onclick={() => (chosen = days)}>
        {m.program.presets[p]}
      </button>
    {/each}
  </div>
  <fieldset class="days">
    <legend class="visually-hidden">{m.program.copyDays}</legend>
    {#each shown as d (d)}
      {#if d === source}
        <span class="dchip src" aria-hidden="true">{m.daysAbbr[d]}</span>
      {:else}
        <label class="dchip hit"><input class="visually-hidden" type="checkbox" value={d} aria-label={m.days[d]} bind:group={chosen} /><span
            aria-hidden="true">{m.daysAbbr[d]}</span><span class="tick" aria-hidden="true"><Icon name="check" size={14} /></span></label>
      {/if}
    {/each}
  </fieldset>
  {#if lockedOut.length}
    <p class="note locked"><Icon name="lock" size={13} />{m.program.lockedNotOffered(m.program.list(lockedOut.map((d) => m.days[d])), lockedOut.length)}</p>
  {/if}
  <button type="button" class="btn btn-primary btn-lg go" aria-disabled={!chosen.length} onclick={apply}>{m.program.copyN(chosen.length)}</button>
  <p class="note end">{m.program.copyNote}</p>
</ChoiceSheet>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--tx);
    font: inherit;
    font-size: 15px;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }
  .row[aria-disabled='true'] {
    color: var(--fa);
    cursor: default;
  }
  .row .x {
    flex: 1;
    min-width: 0;
  }
  .row :global(svg:last-child) {
    color: var(--mu);
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  /* Day and shortcut chips (Tableau « CopySheet »): 40 px pills on s2; picked ones are ink on bg with a ✓
     (not colour alone); the source day is dashed and faint, never a choice. */
  .dchip {
    --ctl-h: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 12px;
    border: 0;
    border-radius: 12px;
    background: var(--s2);
    color: var(--tx);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    touch-action: manipulation;
    transition:
      background-color var(--t-state) ease,
      color var(--t-state) ease;
  }
  @media (hover: hover) {
    .dchip:not(.src, [aria-pressed='true'], :has(:checked)):hover {
      background: var(--s3);
    }
  }
  .dchip[aria-pressed='true'],
  .dchip:has(:checked) {
    background: var(--tx);
    color: var(--bg);
  }
  .dchip:has(:focus-visible) {
    outline: 2px solid var(--tx);
    outline-offset: 2px;
  }
  .tick {
    display: none;
  }
  .dchip:has(:checked) .tick {
    display: inline-grid;
  }
  .dchip.src {
    background: none;
    border: 1.5px dashed var(--field);
    color: var(--mu);
    font-weight: 500;
    cursor: default;
  }
  .note {
    margin: 0;
    font-size: 12.5px;
  }
  .locked {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
  }
  .go {
    width: 100%;
    margin-top: 16px;
  }
  .end {
    margin-top: 10px;
    text-align: center;
  }
</style>
