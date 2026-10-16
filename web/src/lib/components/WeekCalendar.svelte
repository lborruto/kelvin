<!-- The week as an agenda (Programme, Tableau §4): days are columns, the hours run down, comfort blocks are
     heat. Each day's header is a button named as a sentence (its periods, comfort total, today, edited, lock).
     Desktop (`onedit`): drag a block, or its top or bottom edge, in 15-minute steps with a time bubble; a click
     selects it; dragging on an empty area of a day with fewer than 3 periods draws out a 1 h period. Every
     change goes through `$lib/program` (snap, 23:45 at the latest, neighbours never overlap). The compact
     agenda (a phone) is a picture: a tap opens the day. Locked days are hatched and never take an edit. -->
<script lang="ts">
  import { DAYS, type Day, type DayLock } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { comfortMinutes, drawSlot, fmtDuration, fromMin, moveSlot, resizeSlot, slotTimes, type Seg, type Week } from '$lib/program';
  import Icon from './Icon.svelte';

  interface Props {
    week: Week;
    today: Day;
    nowMinute: number;
    /** The day in the editor beside the agenda (desktop); null when a day opens its own view (phone). */
    selected?: Day | null;
    changed?: Day[];
    locks?: Partial<Record<Day, DayLock>>;
    /** Days just copied onto: their columns pulse once. `n` changes on every copy. */
    pulse?: { days: Day[]; n: number } | null;
    pending?: boolean;
    /** false: an offline room's last known week, read only (headers are not buttons). */
    interactive?: boolean;
    /** The phone agenda: letters, a 6 h scale, no labels in the blocks, no drag. */
    compact?: boolean;
    onselect?: (day: Day) => void;
    /** Desktop drag edits; absent, the agenda only selects. */
    onedit?: (day: Day, segs: Seg[]) => void;
  }
  let {
    week, today, nowMinute, selected = null, changed = [], locks = {}, pulse = null, pending = false, interactive = true,
    compact = false, onselect, onedit
  }: Props = $props();

  type Kind = 'move' | 'start' | 'end' | 'new';
  let heads = $state<HTMLButtonElement[]>([]);
  let bodies: Partial<Record<Day, HTMLElement>> = {};
  let bodyH = $state(0);
  // `base`: the day when the drag began (a cancelled drag puts it back).
  let drag = $state<{ day: Day; i: number; kind: Kind; origin: number; base: Seg[]; y0: number; moved: boolean } | null>(null);
  let sel = $state<{ day: Day; i: number } | null>(null);
  let bubble = $state<{ day: Day; at: number; text: string } | null>(null);

  const pct = (min: number) => `${(min / 1440) * 100}%`;
  let hours = $derived(compact ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24]);
  let stop = $derived(selected ?? today);
  const lockText = (l: DayLock) => (l === 'midnight' ? m.program.lockedMidnight : m.program.lockedUnrecognised);
  const canEdit = (d: Day) => !!onedit && interactive && !compact && !pending && !locks[d];
  // A block writes « Confort » and its times when it is tall enough, its times alone a little shorter.
  const px = (s: Seg) => ((s.end - s.start) / 1440) * bodyH;

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
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(n - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next < 0) return;
    e.preventDefault();
    heads[next]?.focus();
    if (selected) onselect?.(DAYS[next]);
  }

  const minuteAt = (d: Day, clientY: number) => {
    const r = bodies[d]?.getBoundingClientRect();
    return r && r.height ? ((clientY - r.top) / r.height) * 1440 : 0;
  };

  function grab(e: PointerEvent, d: Day, i: number, kind: Kind) {
    if (!interactive || e.button !== 0) return;
    e.stopPropagation();
    if (!compact) onselect?.(d);
    if (i >= 0) sel = { day: d, i };
    else sel = null;
    if (!canEdit(d) || (kind === 'new' && week[d].length >= 3)) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag = { day: d, i, kind, origin: minuteAt(d, e.clientY), base: week[d], y0: e.clientY, moved: false };
  }

  function move(e: PointerEvent, d: Day) {
    const g = drag;
    if (!g || g.day !== d || !canEdit(d)) return;
    if (!g.moved && Math.abs(e.clientY - g.y0) < 4) return;
    g.moved = true;
    const at = minuteAt(d, e.clientY);
    if (g.kind === 'new') {
      // A period drawn from where the drag began, down or up (1 h at least while the gap allows).
      const made = drawSlot(g.base, g.origin, at, 60);
      if (!made) {
        if (g.i < 0) drag = null;
        return;
      }
      const up = at < g.origin;
      const i = made.findIndex((s) => !g.base.some((b) => b.start === s.start && b.end === s.end));
      g.i = i;
      sel = { day: d, i };
      show(d, made[i], up ? 'start' : 'end');
      onedit?.(d, made);
      return;
    }
    const next = g.kind === 'move' ? moveSlot(g.base, g.i, at - g.origin) : resizeSlot(g.base, g.i, g.kind, at);
    show(d, next[g.i], g.kind);
    onedit?.(d, next);
  }
  function show(d: Day, s: Seg, kind: Kind) {
    const text =
      kind === 'start' ? m.program.bubbleStart(fromMin(s.start)) : kind === 'end' ? m.program.bubbleEnd(fromMin(s.end)) : `${fromMin(s.start)}–${fromMin(s.end)}`;
    bubble = { day: d, at: kind === 'end' ? s.end : s.start, text };
  }
  function up() {
    drag = null;
    bubble = null;
  }
  // The system took the pointer (a scroll, a gesture): the day goes back to how the drag found it.
  function cancel() {
    const g = drag;
    if (g?.moved) onedit?.(g.day, g.base);
    if (g?.kind === 'new') sel = null;
    up();
  }
  // A selection belongs to its day: another day in the editor, or a period removed, clears it.
  $effect(() => {
    if (sel && (sel.day !== selected || !week[sel.day]?.[sel.i])) sel = null;
  });
</script>

<div class="cal" class:compact class:pending class:dragging={!!drag}>
  <div class="axis" aria-hidden="true">
    <span class="hd"></span>
    <span class="hours num" bind:clientHeight={bodyH}>
      {#each hours as h (h)}<span style:top={pct(h * 60)}>{String(h).padStart(2, '0')}{compact ? '' : ':00'}</span>{/each}
    </span>
  </div>
  <ol class="days" aria-label={m.program.week}>
    {#each DAYS as d, i (d)}
      {@const lock = locks[d] ?? null}
      {@const segs = lock === 'unrecognised' ? [] : week[d]}
      {@const pulsing = !!pulse && pulse.days.includes(d)}
      <li class="col" class:sel={selected === d} class:is-today={d === today} class:locked={!!lock} data-day={d}>
        {#snippet head()}
          <span class="dn">{compact ? m.daysLetter[d] : m.daysAbbr[d]}</span>
          {#if changed.includes(d)}<span class="ed">{m.program.edited}</span>{:else if d === today}<span class="dot"></span>{/if}
        {/snippet}
        {#if interactive}
          <button bind:this={heads[i]} type="button" class="hd" aria-pressed={selected ? selected === d : undefined} aria-label={name(d)}
            tabindex={d === stop ? 0 : -1} onclick={() => onselect?.(d)} onkeydown={(e) => key(e, i)}>{@render head()}</button>
        {:else}
          <span class="hd" aria-hidden="true">{@render head()}</span><span class="visually-hidden">{name(d)}</span>
        {/if}
        <!-- The pointer path; the header button and the editor are the keyboard path. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="bar" class:edit={canEdit(d) && segs.length < 3} bind:this={bodies[d]} aria-hidden="true"
          style:animation-name={pulsing ? (pulse!.n % 2 ? 'kv-pulse-a' : 'kv-pulse-b') : 'none'}
          onpointerdown={(e) => grab(e, d, -1, 'new')} onpointermove={(e) => move(e, d)} onpointerup={up} onpointercancel={cancel}
          onclick={() => interactive && compact && onselect?.(d)}>
          {#each hours.slice(1, -1) as h (h)}<span class="gl" class:minor={h % 6 !== 0} style:top={pct(h * 60)}></span>{/each}
          {#if lock}
            <span class="hatch"></span>
            <span class="why"><Icon name="lock" size={compact ? 13 : 15} />{#if !compact}<span>{m.program.lockedShort[lock]}</span>{/if}</span>
          {/if}
          {#each segs as s, j (j)}
            {@const isSel = sel?.day === d && sel.i === j}
            {@const h = px(s)}
            <span class="blk" class:sel={isSel} class:grab={canEdit(d)} style:top={pct(s.start)} style:height={pct(s.end - s.start)}
              onpointerdown={(e) => grab(e, d, j, 'move')}>
              {#if !compact && h >= 34}<b>{m.level.comfort}</b>{/if}
              {#if !compact && h >= 18}<span class="t num">{fromMin(s.start)}–{fromMin(s.end)}</span>{/if}
              {#if canEdit(d)}
                <span class="edge top" onpointerdown={(e) => grab(e, d, j, 'start')}></span>
                <span class="edge bottom" onpointerdown={(e) => grab(e, d, j, 'end')}></span>
              {/if}
              {#if isSel && !compact}<span class="hdl top"></span><span class="hdl bottom"></span>{/if}
            </span>
          {/each}
          {#if d === today}<span class="now" style:top={pct(nowMinute)}></span>{/if}
          {#if bubble && bubble.day === d}<span class="bubble num" style:top={pct(bubble.at)}>{bubble.text}</span>{/if}
        </div>
      </li>
    {/each}
  </ol>
</div>

<style>
  /* The agenda's height is fixed (no layout shift as periods change): 600 px on desktop, 320 on a phone. */
  .cal {
    --hd: 50px;
    --body: 600px;
    --axis: 44px;
    display: grid;
    grid-template-columns: var(--axis) minmax(0, 1fr);
    min-width: 0;
    user-select: none;
    -webkit-user-select: none;
  }
  .compact {
    --hd: 34px;
    --body: 300px;
    --axis: 24px;
  }
  .axis {
    display: grid;
    grid-template-rows: var(--hd) var(--body);
  }
  .hours {
    position: relative;
    font-size: var(--fs-axis);
    color: var(--fa);
  }
  .hours span {
    position: absolute;
    right: 6px;
    transform: translateY(-50%);
    line-height: 1;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .col {
    position: relative;
    display: grid;
    grid-template-rows: var(--hd) var(--body);
    min-width: 0;
    border-radius: 10px;
  }
  .col.sel {
    background: color-mix(in srgb, var(--s2) 55%, transparent);
  }
  .hd {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 3px;
    min-width: 0;
    margin: 0;
    padding: 8px 2px 0;
    border: 0;
    border-radius: 10px 10px 0 0;
    background: none;
    color: var(--mu);
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }
  span.hd {
    cursor: default;
  }
  .compact .hd {
    padding-top: 4px;
    gap: 2px;
  }
  .hd:focus-visible {
    outline-offset: -2px;
  }
  .dn {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
  }
  .compact .dn {
    font-size: 11px;
  }
  .sel .hd,
  .is-today .hd {
    color: var(--tx);
  }
  .ed {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    overflow: hidden;
    color: var(--tx);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .ed::before {
    content: '';
    flex: none;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--tx);
  }
  .compact .ed {
    gap: 3px;
    font-size: 9px;
    letter-spacing: -0.01em;
  }
  .dot {
    width: 6px;
    height: 6px;
    margin-top: 3px;
    border-radius: 50%;
    background: var(--tx);
  }
  /* A day's body: hairline left edge, gridlines every 6 h (dashed every 3 h). */
  .bar {
    position: relative;
    border-left: 1px solid var(--line);
    animation-duration: var(--t-data);
    animation-timing-function: ease-in-out;
    touch-action: pan-y;
  }
  .bar.edit {
    cursor: crosshair;
  }
  .cal.dragging .bar {
    touch-action: none;
  }
  .gl {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    border-top: 1px solid var(--line);
    pointer-events: none;
  }
  .gl.minor {
    border-top-style: dashed;
    opacity: 0.8;
  }
  .hatch {
    position: absolute;
    inset: 3px 3px 6px;
    border-radius: 8px;
    background: repeating-linear-gradient(45deg, transparent 0 4px, color-mix(in srgb, var(--fa-mark) 55%, transparent) 4px 5.5px);
    pointer-events: none;
  }
  .compact .hatch {
    border-radius: 5px;
  }
  .why {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 0 2px;
    transform: translateY(-50%);
    color: var(--mu);
    font-size: var(--fs-axis);
    text-align: center;
    pointer-events: none;
  }
  .why span {
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--s1);
  }
  /* Comfort blocks (heat at 78 %; the selected one full, with an ink edge and its two handles). */
  .blk {
    position: absolute;
    left: 3px;
    right: 3px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 5px 6px 0;
    overflow: hidden;
    border-radius: 8px;
    background: color-mix(in srgb, var(--heat) 78%, var(--s1));
    color: var(--heat-ink);
    font-size: 11.5px;
    line-height: 1.25;
    white-space: nowrap;
  }
  .compact .blk {
    left: 2px;
    right: 2px;
    padding: 0;
    border-radius: 5px;
  }
  .blk b {
    font-size: 12px;
    font-weight: 600;
  }
  .blk .t {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .blk.grab {
    cursor: grab;
    touch-action: none;
  }
  .dragging .blk.grab {
    cursor: grabbing;
  }
  .blk.sel {
    background: var(--heat);
    overflow: visible;
    box-shadow: 0 0 0 2px var(--tx);
  }
  .locked .blk {
    background: color-mix(in srgb, var(--heat) 45%, var(--s1));
    color: var(--tx);
  }
  .pending .blk {
    background: transparent;
    outline: 1.5px dashed var(--mu);
    outline-offset: -1.5px;
    color: var(--mu);
  }
  .edge {
    position: absolute;
    left: 0;
    right: 0;
    height: 8px;
    cursor: ns-resize;
    touch-action: none;
  }
  .edge.top {
    top: -2px;
  }
  .edge.bottom {
    bottom: -2px;
  }
  .hdl {
    position: absolute;
    left: 50%;
    width: 28px;
    height: 5px;
    margin-left: -14px;
    border-radius: 3px;
    background: var(--tx);
    pointer-events: none;
  }
  .hdl.top {
    top: -4px;
  }
  .hdl.bottom {
    bottom: -4px;
  }
  .now {
    position: absolute;
    z-index: 2;
    left: 0;
    right: 0;
    height: 2px;
    margin-top: -1px;
    background: var(--tx);
    pointer-events: none;
  }
  .now::before {
    content: '';
    position: absolute;
    left: -4px;
    top: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--tx);
  }
  .bubble {
    position: absolute;
    z-index: 3;
    left: 50%;
    padding: 3px 8px;
    border-radius: 8px;
    background: var(--tx);
    color: var(--bg);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    transform: translate(-50%, calc(-100% - 8px));
    pointer-events: none;
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
