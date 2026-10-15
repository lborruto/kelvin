<!-- The one day being edited (Programme): its bar (drag, resize, keyboard), its periods as time
     fields, « Ajouter une plage » (3 at most), the comfort total and « Copier vers… ». A locked day
     is shown read-only with its reason. -->
<script lang="ts">
  import type { Day, DayLock } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import {
    addSlot, comfortMinutes, fmtDuration, fromMin, removeSlot, resizeSlot, slotTimes, toMin, validateDay, type Seg
  } from '$lib/program';
  import CopyDays from './CopyDays.svelte';
  import Icon from './Icon.svelte';
  import ProgramDay from './ProgramDay.svelte';

  interface Props {
    day: Day;
    segs: Seg[];
    today: Day;
    nowMinute: number;
    edited?: boolean;
    pending?: boolean;
    locked?: DayLock | null;
    locks?: Partial<Record<Day, DayLock>>;
    /** Phone: the day view (an h1, 6 h scale, short slot labels). */
    compact?: boolean;
    onchange: (segs: Seg[]) => void;
    onprev: () => void;
    onnext: () => void;
    oncopy: (days: Day[]) => void;
  }
  let {
    day, segs, today, nowMinute, edited = false, pending = false, locked = null, locks = {}, compact = false,
    onchange, onprev, onnext, oncopy
  }: Props = $props();
  const uid = $props.id();
  let label = $derived(m.days[day]);
  let error = $derived(validateDay(segs));
  let full = $derived(segs.length >= 3);
  let sub = $derived([day === today ? m.program.todayTag : '', edited ? m.program.edited : ''].filter(Boolean).join(' · '));
  const lockText = (l: DayLock) => (l === 'midnight' ? m.program.lockedMidnight : m.program.lockedUnrecognised);

  function addFirstFree() {
    if (pending || full) return;
    for (const at of [420, 1080, 720, 0, 60, 180, 300, 540, 840, 960, 1200, 1320]) {
      const next = addSlot(segs, at);
      if (next) return onchange(next);
    }
  }
  function setTime(el: HTMLInputElement, i: number, edge: 'start' | 'end') {
    if (!segs[i]) return;
    let shown = segs[i][edge];
    if (!pending && /^\d{2}:\d{2}$/.test(el.value)) {
      const next = resizeSlot(segs, i, edge, toMin(el.value));
      shown = next[i]?.[edge] ?? shown;
      onchange(next);
    }
    // Reset the field to the model so a rejected or clamped value does not linger.
    el.value = fromMin(shown);
  }
  function remove(i: number) {
    if (!pending) onchange(removeSlot(segs, i));
  }
</script>

<section class="editor" class:compact aria-labelledby="{uid}-title">
  <div class="head">
    <button type="button" class="btn btn-icon edged" aria-label={m.program.prevDay} onclick={onprev}><Icon name="chevron-left" /></button>
    <svelte:element this={compact ? 'h1' : 'h2'} id="{uid}-title" class="title">
      {label}{' '}<small>{sub}</small>
    </svelte:element>
    <button type="button" class="btn btn-icon edged" aria-label={m.program.nextDay} onclick={onnext}><Icon name="chevron" /></button>
  </div>

  <ProgramDay {day} {segs} nowMinute={day === today ? nowMinute : null} {pending} {locked} step={compact ? 6 : 3} {onchange} />

  {#if locked}
    {#if locked === 'midnight'}<p class="locked-times num">{slotTimes(segs).join(' · ')}</p>{/if}
    <p class="lock"><Icon name="lock" size={14} />{lockText(locked)}</p>
  {:else}
    {#if segs.length}
      <ul class="slots">
        {#each segs as s, i (i)}
          <li>
            <span class="sw" aria-hidden="true"></span>
            <span class="lab" aria-hidden="true">{compact ? i + 1 : m.program.slot(i + 1)}</span>
            <input type="time" step="900" readonly={pending} aria-disabled={pending} aria-label={m.program.slotStart(label, i + 1)}
              value={fromMin(s.start)} onchange={(e) => setTime(e.currentTarget, i, 'start')} />
            <span class="arr" aria-hidden="true">→</span>
            <input type="time" step="900" readonly={pending} aria-disabled={pending} aria-label={m.program.slotEnd(label, i + 1)}
              value={fromMin(s.end)} onchange={(e) => setTime(e.currentTarget, i, 'end')} />
            <button type="button" class="btn btn-icon" aria-disabled={pending} aria-label={m.program.removeSlot(i + 1, label)}
              onclick={() => remove(i)}><Icon name="x" size={16} /></button>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="summary">
      {#if segs.length}<b class="num">{m.program.summary(fmtDuration(comfortMinutes(segs)))}</b> · {m.program.summaryRest}
      {:else}<b>{m.program.allEco}</b>{/if}
    </p>
    {#if error}<p class="error" role="alert">{m.program.dayError[error]}</p>{/if}
    <div class="actions">
      <button type="button" class="btn btn-sm add" aria-disabled={pending || full} aria-label={m.program.addSlot(label)}
        aria-describedby={full ? `${uid}-max` : undefined} onclick={addFirstFree}><Icon name="plus" size={16} />{m.program.addPeriod}</button>
      <CopyDays source={day} {locks} disabled={pending} {oncopy} />
    </div>
    {#if full}<p class="note" id="{uid}-max">{m.program.maxPeriods}</p>{/if}
  {/if}
</section>

<style>
  .editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    padding: 16px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    min-width: 0;
  }
  .editor.compact {
    padding: 0;
    background: none;
    border: 0;
  }
  .head {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 8px;
  }
  .edged {
    border-color: var(--line);
  }
  .title {
    margin: 0;
    display: grid;
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.25;
  }
  .title small {
    /* Reserved even when empty, so editing a day never moves what is under it. */
    min-height: 1.25em;
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--mu);
  }
  .slots {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .slots li {
    display: grid;
    grid-template-columns: 12px auto minmax(0, 1fr) 14px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .sw {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--warm) 75%, var(--in));
  }
  .lab {
    color: var(--mu);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .arr {
    color: var(--fa);
    text-align: center;
  }
  input {
    width: 100%;
    padding: 0 6px;
    text-align: center;
  }
  input[aria-disabled='true'] {
    color: var(--fa);
  }
  .summary,
  .locked-times {
    margin: 0;
    font-size: 13px;
    color: var(--mu);
  }
  .summary b {
    color: var(--tx);
    font-weight: 600;
  }
  .locked-times {
    color: var(--tx);
  }
  .lock {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 12px;
    color: var(--mu);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .note {
    margin: -6px 0 0;
    font-size: 12px;
    color: var(--mu);
  }
  .error {
    margin: 0;
    color: var(--bad);
    font-size: 12px;
  }
</style>
