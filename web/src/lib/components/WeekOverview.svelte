<!-- The week as a picture (Programme): read-only bars on an hour scale, the times written out, one
     button per day that opens it in the day editor. Narrow (a phone, a small desktop column): the
     times sit over the bar and the scale is every 6 h. -->
<script lang="ts">
  import { DAYS, type Day, type DayLock } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { comfortMinutes, fmtDuration, slotTimes, type Week } from '$lib/program';
  import Icon from './Icon.svelte';

  interface Props {
    week: Week;
    today: Day;
    nowMinute: number;
    /** The day in the editor beside the week (desktop); null when rows open a day view (phone). */
    selected?: Day | null;
    changed?: Day[];
    locks?: Partial<Record<Day, DayLock>>;
    /** Days just copied onto: their bars pulse once. `n` changes on every copy. */
    pulse?: { days: Day[]; n: number } | null;
    pending?: boolean;
    /** false: an offline room's last known week, read only (rows are not buttons). */
    interactive?: boolean;
    onselect?: (day: Day) => void;
  }
  let {
    week, today, nowMinute, selected = null, changed = [], locks = {}, pulse = null, pending = false, interactive = true, onselect
  }: Props = $props();

  let rows = $state<HTMLButtonElement[]>([]);
  const pct = (min: number) => `${(min / 1440) * 100}%`;
  const WIDE = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  const NARROW = [0, 6, 12, 18, 24];
  let stop = $derived(selected ?? today);

  // Two periods per line at most, so a line never ends on a dangling « · ».
  const lines = (segs: Week[Day]) => {
    const t = slotTimes(segs);
    return t.length > 2 ? [t.slice(0, 2).join(' · '), t.slice(2).join(' · ')] : [t.join(' · ')];
  };
  const lockText = (l: DayLock) => (l === 'midnight' ? m.program.lockedMidnight : m.program.lockedUnrecognised);
  function name(d: Day): string {
    const lock = locks[d];
    const segs = week[d];
    const parts = [m.days[d]];
    if (d === today) parts.push(m.program.todayTag);
    if (lock !== 'unrecognised') {
      parts.push(segs.length ? m.program.list(slotTimes(segs)) : m.program.allEco);
      if (segs.length) parts.push(m.program.comfortFor(fmtDuration(comfortMinutes(segs))));
    }
    if (changed.includes(d)) parts.push(m.program.edited);
    if (lock) parts.push(lockText(lock));
    return parts.join(', ');
  }

  // Arrows move between days (and, beside an editor, select the day at once).
  function key(e: KeyboardEvent, i: number) {
    const n = DAYS.length;
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(n - 1, i + 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    rows[next]?.focus();
    if (selected) onselect?.(DAYS[next]);
  }
</script>

<div class="week" class:pending>
  <div class="scale num" aria-hidden="true">
    <span class="ticks wide">{#each WIDE as h (h)}<span style:left={pct(h * 60)}>{String(h).padStart(2, '0')}</span>{/each}</span>
    <span class="ticks narrow">{#each NARROW as h (h)}<span style:left={pct(h * 60)}>{String(h).padStart(2, '0')}</span>{/each}</span>
  </div>
  <ol class="rows" aria-label={m.program.week}>
    {#each DAYS as d, i (d)}
      {@const lock = locks[d] ?? null}
      {@const segs = lock === 'unrecognised' ? [] : week[d]}
      {@const pulsing = !!pulse && pulse.days.includes(d)}
      <li>
        {#snippet content()}
          <span class="name">{m.days[d]}{#if d === today}<small>{m.program.todayTag}</small>{/if}</span>
          <span class="bar" class:locked={!!lock} class:unknown={lock === 'unrecognised'}
            style:animation-name={pulsing ? (pulse!.n % 2 ? 'kv-pulse-a' : 'kv-pulse-b') : 'none'} aria-hidden="true">
            {#each segs as s, j (j)}<span class="blk" style:left={pct(s.start)} style:width={pct(s.end - s.start)}></span>{/each}
            {#if d === today}<span class="now" style:left={pct(nowMinute)}></span>{/if}
          </span>
          <span class="times num">
            {#if changed.includes(d)}<small class="ed">{m.program.edited}</small>{/if}
            {#if lock !== 'unrecognised'}
              {#if segs.length}{#each lines(segs) as line, j (j)}<span class="t">{line}</span>{/each}
              {:else}<span class="t">{m.program.allEco}</span>{/if}
            {/if}
          </span>
          {#if lock}<span class="lock"><Icon name="lock" size={14} />{lockText(lock)}</span>{/if}
        {/snippet}
        {#if interactive}
          <button bind:this={rows[i]} type="button" class="row" class:sel={selected === d} aria-pressed={selected ? selected === d : undefined}
            aria-label={name(d)} tabindex={d === stop ? 0 : -1} data-day={d} onclick={() => onselect?.(d)}
            onkeydown={(e) => key(e, i)}>{@render content()}</button>
        {:else}
          <div class="row" data-day={d}><span class="contents" aria-hidden="true">{@render content()}</span><span class="visually-hidden">{name(d)}</span></div>
        {/if}
      </li>
    {/each}
  </ol>
</div>

<style>
  .week {
    container-type: inline-size;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 6px 12px 4px;
    min-width: 0;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .contents {
    display: contents;
  }
  .rows li + li .row {
    border-top: 1px solid var(--line);
  }
  /* Narrow (default): name and times on one line, the bar under them, the lock note last. */
  .row,
  .scale {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 10px;
  }
  .row {
    grid-template-areas: 'name times' 'bar bar' 'lock lock';
    align-items: baseline;
    width: 100%;
    padding: 10px 8px;
    margin: 0;
    border: 0;
    border-radius: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    touch-action: manipulation;
  }
  button.row {
    cursor: pointer;
    transition: background-color var(--t-state) ease;
  }
  @media (hover: hover) {
    button.row:hover {
      background: color-mix(in srgb, var(--s2) 60%, transparent);
    }
  }
  .row.sel {
    background: var(--s2);
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--mu);
  }
  .rows li:has(.sel) + li .row {
    border-top-color: transparent;
  }
  .row:focus-visible {
    outline-offset: -2px;
    border-radius: 8px;
  }
  .scale {
    grid-template-areas: 'ticks ticks';
    padding: 6px 8px 2px;
    font-size: 11px;
    color: var(--fa);
  }
  .ticks {
    grid-area: ticks;
    position: relative;
    height: 14px;
  }
  .ticks span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
  }
  .ticks span:first-child {
    transform: none;
  }
  .ticks span:last-child {
    transform: translateX(-100%);
  }
  .wide {
    display: none;
  }
  .name {
    grid-area: name;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 6px;
    font-size: 14px;
    font-weight: 600;
    min-width: 0;
  }
  .name small {
    font-size: 12px;
    font-weight: 500;
    color: var(--tx);
  }
  .times {
    grid-area: times;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    font-size: 12px;
    color: var(--mu);
    text-align: right;
    min-width: 0;
  }
  .times .t {
    white-space: nowrap;
  }
  .ed {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--tx);
    font-size: 12px;
    font-weight: 600;
  }
  .ed::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--tx);
  }
  .bar {
    grid-area: bar;
    position: relative;
    display: block;
    height: 24px;
    border: 1px solid var(--field-line);
    border-radius: 6px;
    overflow: hidden;
    background-color: var(--in);
    --grid: 25%;
    background-image: repeating-linear-gradient(
      90deg,
      transparent 0,
      transparent calc(var(--grid) - 1px),
      color-mix(in srgb, var(--field-line) 35%, transparent) calc(var(--grid) - 1px),
      color-mix(in srgb, var(--field-line) 35%, transparent) var(--grid)
    );
    animation-duration: var(--t-data);
    animation-timing-function: ease-in-out;
  }
  .bar.locked {
    background-color: var(--s2);
    background-image: repeating-linear-gradient(45deg, var(--s2) 0 4px, color-mix(in srgb, var(--mu) 18%, var(--s2)) 4px 8px);
  }
  /* Comfort blocks: warm at 75 % over the well (3:1 in both themes), as in the editor. */
  .blk {
    position: absolute;
    top: 2px;
    bottom: 2px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--warm) 75%, var(--in));
  }
  .locked .blk {
    background: color-mix(in srgb, var(--warm) 45%, var(--in));
  }
  .pending .blk {
    background: transparent;
    border: 1.5px dashed var(--mu);
  }
  .now {
    position: absolute;
    top: -1px;
    bottom: -1px;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background: var(--tx);
  }
  .lock {
    grid-area: lock;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--mu);
  }
  /* Wide: day | bar | times on one line, every 3 h; the lock note under the bar. */
  @container (min-width: 560px) {
    .row,
    .scale {
      grid-template-columns: 92px minmax(0, 1fr) minmax(0, 176px);
      gap: 4px 14px;
    }
    .row {
      grid-template-areas: 'name bar times' '. lock lock';
      align-items: center;
      min-height: 52px;
      padding: 8px;
    }
    .scale {
      grid-template-areas: '. ticks .';
    }
    .wide {
      display: block;
    }
    .narrow {
      display: none;
    }
    .name {
      display: grid;
      line-height: 1.25;
    }
    .name small {
      color: var(--mu);
    }
    .bar {
      height: 28px;
      --grid: 12.5%;
    }
  }
  @keyframes -global-kv-pulse-a {
    50% {
      opacity: 0.55;
    }
  }
  @keyframes -global-kv-pulse-b {
    50% {
      opacity: 0.55;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar {
      animation: none !important;
    }
  }
</style>
