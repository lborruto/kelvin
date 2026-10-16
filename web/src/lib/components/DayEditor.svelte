<!-- The one day being edited (Programme, Tableau §4 « DayEditor »): its bar (drag, resize, keyboard), its
     periods as time fields in a grouped list, « Ajouter une plage » (3 at most), « Copier vers… » and the
     comfort total. Desktop: a widget beside the agenda, the day between round previous / next buttons. Phone
     (`compact`): the page itself, the day as the h1 under the way back, Ajouter / Copier vers… as list rows.
     A locked day is shown read-only with its reason and what Kelvin does with it: no field, no add, no copy. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Day, DayLock } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import {
    addSlot, comfortMinutes, fmtDuration, fromMin, removeSlot, resizeSlot, slotTimes, toMin, validateDay, type Seg
  } from '$lib/program';
  import CopyDays from './CopyDays.svelte';
  import Icon from './Icon.svelte';
  import Notice from './Notice.svelte';
  import ProgramDay from './ProgramDay.svelte';

  interface Props {
    day: Day;
    segs: Seg[];
    today: Day;
    nowMinute: number;
    /** The room's name, on the line under the day. */
    room?: string;
    edited?: boolean;
    pending?: boolean;
    locked?: DayLock | null;
    locks?: Partial<Record<Day, DayLock>>;
    /** Phone: the day view (an h1, list rows for the actions). */
    compact?: boolean;
    onchange: (segs: Seg[]) => void;
    onprev: () => void;
    onnext: () => void;
    oncopy: (days: Day[]) => void;
    /** Phone: the way back to the week, left of previous / next. */
    back?: Snippet;
    /** Shown between the header and the bar (the phone day view's temperatures). */
    below?: Snippet;
  }
  let {
    day, segs, today, nowMinute, room = '', edited = false, pending = false, locked = null, locks = {}, compact = false,
    onchange, onprev, onnext, oncopy, back, below
  }: Props = $props();
  const uid = $props.id();
  let label = $derived(m.days[day]);
  let error = $derived(validateDay(segs));
  let full = $derived(segs.length >= 3);
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

{#snippet stepper()}
  <button type="button" class="btn btn-icon nav" aria-label={m.program.prevDay} onclick={onprev}><Icon name="chevron-left" size={18} /></button>
{/snippet}
{#snippet stepperNext()}
  <button type="button" class="btn btn-icon nav" aria-label={m.program.nextDay} onclick={onnext}><Icon name="chevron" size={18} /></button>
{/snippet}

<section class="editor" class:compact aria-labelledby="{uid}-title">
  {#if compact}
    <div class="top">{@render back?.()}<span class="steps">{@render stepper()}{@render stepperNext()}</span></div>
    <h1 id="{uid}-title" class="t-page title">{label}</h1>
  {:else}
    <div class="head">
      {@render stepper()}
      <h2 id="{uid}-title" class="title">{label}</h2>
      {@render stepperNext()}
    </div>
  {/if}
  <!-- Reserved even when it says little, so editing a day never moves what is under it. -->
  <p class="sub">
    {#if compact && locked}<Icon name="lock" size={14} />{m.program.lockedTag}
    {:else}
      {#if room}<span>{room}</span>{/if}
      {#if day === today}<span>{m.program.todayTag}</span>{/if}
      {#if edited}<span class="ed"><i aria-hidden="true"></i>{m.program.edited}</span>{/if}
    {/if}
  </p>

  {@render below?.()}

  <div class="barwrap">
    <ProgramDay {day} {segs} nowMinute={day === today ? nowMinute : null} {pending} {locked} step={6} height={compact ? 44 : 40} {onchange} />
  </div>

  {#if locked}
    {#if locked === 'midnight'}<p class="locked-times num">{slotTimes(segs).join(' · ')}</p>{/if}
    <p class="lock"><Icon name="lock" size={16} />{lockText(locked)}</p>
    <Notice title={m.program.lockedKeepTitle} role={null}>{m.program.lockedKeepBody}</Notice>
  {:else}
    {#if compact}<p class="note hint">{m.program.dragHint}</p>{/if}
    {#if segs.length}
      <p class="grph">{m.program.slotsHead(segs.length)}</p>
      <ul class="grp slots">
        {#each segs as s, i (i)}
          <li class="li">
            <span class="sw" aria-hidden="true"></span>
            <span class="lab" aria-hidden="true">{compact ? i + 1 : m.program.slot(i + 1)}</span>
            <input type="time" step="900" readonly={pending} aria-disabled={pending} aria-label={m.program.slotStart(label, i + 1)}
              value={fromMin(s.start)} onchange={(e) => setTime(e.currentTarget, i, 'start')} />
            <span class="arr" aria-hidden="true"><Icon name="chevron" size={14} /></span>
            <input type="time" step="900" readonly={pending} aria-disabled={pending} aria-label={m.program.slotEnd(label, i + 1)}
              value={fromMin(s.end)} onchange={(e) => setTime(e.currentTarget, i, 'end')} />
            <button type="button" class="btn btn-icon rm" aria-disabled={pending} aria-label={m.program.removeSlot(i + 1, label)}
              onclick={() => remove(i)}><Icon name="x" size={15} /></button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if error}<p class="error" role="alert">{m.program.dayError[error]}</p>{/if}
    {#if compact}
      <ul class="grp acts">
        <li class="li">
          <button type="button" class="row add" aria-disabled={pending || full} aria-label={m.program.addSlot(label)}
            aria-describedby={full ? `${uid}-max` : undefined} onclick={addFirstFree}><Icon name="plus" size={18} /><span class="x">{m.program.addPeriod}</span>
            {#if full}<span class="note" id="{uid}-max">{m.program.maxPeriods}</span>{/if}</button>
        </li>
        <li class="li"><CopyDays source={day} {locks} disabled={pending} {oncopy} variant="row" /></li>
      </ul>
    {:else}
      <div class="actions">
        <button type="button" class="btn btn-sm add" aria-disabled={pending || full} aria-label={m.program.addSlot(label)}
          aria-describedby={full ? `${uid}-max` : undefined} onclick={addFirstFree}><Icon name="plus" size={15} />{m.program.addPeriod}</button>
        <CopyDays source={day} {locks} disabled={pending} {oncopy} />
      </div>
      <p class="note"><span id="{uid}-max">{m.program.maxPeriods}</span> · {m.program.stepNote}</p>
    {/if}
    <p class="summary">
      {#if segs.length}<b class="num">{m.program.summary(fmtDuration(comfortMinutes(segs)))}</b> · {m.program.summaryRest}
      {:else}<b>{m.program.allEco}</b>{/if}
    </p>
  {/if}
</section>

<style>
  .editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding: 18px;
    background: var(--s1);
    border-radius: var(--r-widget);
    min-width: 0;
  }
  .editor.compact {
    padding: 0;
    background: none;
    border-radius: 0;
  }
  .head {
    display: grid;
    grid-template-columns: var(--ctl-h) minmax(0, 1fr) var(--ctl-h);
    align-items: center;
    gap: 8px;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }
  .steps {
    display: flex;
    gap: 8px;
    flex: none;
  }
  .nav {
    background: var(--s2);
  }
  .title {
    margin: 0;
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.25;
  }
  .compact .title {
    margin-top: 8px;
    text-align: left;
    font-size: var(--fs-title);
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0 6px;
    min-height: 1.4em;
    margin: 2px 0 0;
    font-size: var(--fs-sub);
    color: var(--mu);
  }
  .compact .sub {
    justify-content: flex-start;
    font-size: 15px;
  }
  .sub span + span::before {
    content: '·';
    margin-right: 6px;
    color: var(--mu);
  }
  .ed {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--tx);
    font-weight: 600;
  }
  .ed i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--tx);
  }
  .barwrap {
    margin: 16px 0 0;
  }
  .compact .barwrap {
    margin-top: 14px;
  }
  .hint {
    margin: 6px 0 0;
  }
  .grph {
    margin: 18px 2px 6px;
  }
  .slots {
    margin: 0;
    padding: 0 12px;
  }
  /* One period per line from 320 px: the swatch, its number, two 36 px time fields as wide as « 22:00 »
     (--w-time; they may shrink a little on the narrowest phones) and the remove disc (36, 44 px hit). */
  .slots .li {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) minmax(0, 4.6rem) 14px minmax(0, 4.6rem) var(--ctl-h);
    gap: 8px;
    font-size: 14px;
  }
  .compact .slots .li {
    grid-template-columns: 10px minmax(0, 1fr) minmax(0, 4.8rem) 14px minmax(0, 4.8rem) var(--ctl-h);
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--heat);
  }
  .lab {
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .arr {
    display: grid;
    place-items: center;
    color: var(--mu);
  }
  input {
    width: 100%;
    padding: 0 6px;
    border-color: transparent;
    background: var(--s2);
    text-align: center;
    font-weight: 600;
  }
  input:focus-visible {
    outline-offset: 0;
  }
  /* The native clock glyph would crowd « 06:15 » out of a 36 px pill: the field opens its picker on a tap. */
  input::-webkit-calendar-picker-indicator {
    display: none;
  }
  input[aria-disabled='true'] {
    color: var(--fa);
  }
  .rm {
    justify-self: end;
    background: none;
    color: var(--mu);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }
  .note {
    margin: 6px 0 0;
  }
  .acts {
    margin-top: 12px;
  }
  .acts .li {
    padding: 0;
  }
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
  .row .note {
    margin: 0;
    font-size: 12.5px;
  }
  .summary,
  .locked-times {
    margin: 12px 0 0;
    font-size: 14px;
    color: var(--mu);
  }
  .summary b {
    color: var(--tx);
    font-weight: 600;
  }
  .locked-times {
    margin-top: 10px;
    color: var(--tx);
  }
  .lock {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 10px 0 16px;
    font-size: 13px;
    color: var(--mu);
  }
  .lock :global(svg) {
    flex: none;
    margin-top: 1px;
  }
  .error {
    margin: 8px 0 0;
    color: var(--bad);
    font-size: 12.5px;
  }
</style>
