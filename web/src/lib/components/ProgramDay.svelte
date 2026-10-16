<script lang="ts">
  import type { Day, DayLock } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { addSlot, fromMin, moveSlot, removeSlot, resizeSlot, type Seg } from '$lib/program';

  interface Props {
    day: Day;
    segs: Seg[];
    nowMinute?: number | null;
    pending?: boolean;
    /** Hour gridlines and the labels under the bar (3 h on desktop, 6 h on a phone). */
    step?: 3 | 6;
    onchange: (segs: Seg[]) => void;
    /** QW8: shown, never edited (re-sent as read). */
    locked?: DayLock | null;
  }
  let { day, segs, nowMinute = null, pending = false, step = 3, onchange, locked = null }: Props = $props();
  const uid = $props.id();
  let label = $derived(m.days[day]);
  // A pending send or a locked day: nothing here edits it.
  let inert = $derived(pending || !!locked);
  let dragging = $state(false);
  let active = $state<number | null>(null);
  let width = $state(0);

  let bar = $state<HTMLDivElement>();
  let drag: { i: number; kind: 'move' | 'start' | 'end'; origin: number; base: Seg[] } | null = null;
  let moved = false;
  let hours = $derived(Array.from({ length: 24 / step + 1 }, (_, i) => i * step));

  const minuteAt = (clientX: number) => {
    const r = bar!.getBoundingClientRect();
    return r.width ? ((clientX - r.left) / r.width) * 1440 : 0;
  };
  const pct = (min: number) => `${(min / 1440) * 100}%`;
  // A block's times are written inside it when they fit (DESIGN ProgramDay).
  const fits = (s: Seg) => ((s.end - s.start) / 1440) * width >= 76;

  function down(e: PointerEvent, i: number, kind: 'move' | 'start' | 'end') {
    e.stopPropagation();
    if (inert) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag = { i, kind, origin: minuteAt(e.clientX), base: segs };
    dragging = true;
    active = i;
    moved = false;
  }
  function move(e: PointerEvent) {
    if (!drag || inert) return;
    const at = minuteAt(e.clientX);
    moved = true;
    onchange(drag.kind === 'move' ? moveSlot(drag.base, drag.i, at - drag.origin) : resizeSlot(drag.base, drag.i, drag.kind, at));
  }
  function up() {
    drag = null;
    dragging = false;
    active = null;
  }
  function barDown() {
    moved = false;
  }
  function addAt(e: MouseEvent) {
    if (inert) return;
    if (moved) {
      moved = false;
      return;
    }
    const next = addSlot(segs, minuteAt(e.clientX));
    if (next) onchange(next);
  }
  function key(e: KeyboardEvent, i: number) {
    if (inert) return;
    const delta = e.key === 'ArrowRight' ? 15 : e.key === 'ArrowLeft' ? -15 : 0;
    if (delta) {
      e.preventDefault();
      onchange(moveSlot(segs, i, delta));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onchange(removeSlot(segs, i));
    }
  }
</script>

<div class="day">
  <span class="visually-hidden" id="{uid}-hint">{m.program.blockHint}</span>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="bar" class:pending class:dragging class:locked={!!locked} class:unknown={locked === 'unrecognised'}
    aria-label={locked === 'unrecognised' ? m.program.unknownDayLabel(label) : undefined} data-testid="bar-{day}" bind:this={bar}
    bind:clientWidth={width} onclick={addAt} onpointerdown={barDown} onpointermove={move} onpointerup={up} onpointercancel={up}>
    {#each hours.slice(1, -1) as h (h)}<span class="tick" style:left={pct(h * 60)}></span>{/each}
    {#each locked === 'unrecognised' ? [] : segs as s, i (i)}
      <div class="block" class:active={active === i} role="button" tabindex={locked ? -1 : 0} aria-roledescription={m.program.slotRole}
        aria-describedby="{uid}-hint" aria-label="{label} {fromMin(s.start)}–{fromMin(s.end)}"
        style:left={pct(s.start)} style:width={pct(s.end - s.start)}
        onpointerdown={(e) => down(e, i, 'move')} onkeydown={(e) => key(e, i)}
        onclick={(e) => e.stopPropagation()}>
        {#if fits(s)}<span class="times num" aria-hidden="true">{fromMin(s.start)}–{fromMin(s.end)}</span>{/if}
        {#if !locked}
          <span class="handle start" onpointerdown={(e) => down(e, i, 'start')} aria-hidden="true"></span>
          <span class="handle end" onpointerdown={(e) => down(e, i, 'end')} aria-hidden="true"></span>
        {/if}
      </div>
    {/each}
    {#if nowMinute != null}<span class="now" style:left={pct(nowMinute)}></span>{/if}
  </div>
  <div class="hours num" aria-hidden="true">
    {#each hours as h (h)}<span style:left={pct(h * 60)}>{String(h).padStart(2, '0')}</span>{/each}
  </div>
</div>

<style>
  .day {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
  }
  .bar {
    position: relative;
    height: 48px;
    border-radius: var(--radius);
    background: var(--in);
    border: 1px solid var(--field-line);
    cursor: copy;
    touch-action: pan-y;
  }
  /* While a block is dragged, the page must not scroll under the finger. */
  .bar.dragging {
    touch-action: none;
  }
  .bar.pending,
  .bar.locked {
    cursor: default;
  }
  .bar.locked {
    background: repeating-linear-gradient(45deg, var(--s2) 0 4px, color-mix(in srgb, var(--mu) 18%, var(--s2)) 4px 8px);
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: color-mix(in srgb, var(--field-line) 35%, transparent);
  }
  /* Comfort blocks: warm at 75 % (3:1 against the well in both themes, WCAG 1.4.11). */
  .block {
    position: absolute;
    top: 3px;
    bottom: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 6px;
    background: color-mix(in srgb, var(--warm) 75%, var(--in));
    cursor: grab;
    touch-action: none;
  }
  .locked .block {
    background: color-mix(in srgb, var(--warm) 45%, var(--in));
    cursor: default;
  }
  .pending .block {
    background: transparent;
    border: 1.5px dashed var(--mu);
    cursor: default;
  }
  /* Times in a block: dark ink on a halo of the warm fill at 82 % (≥ 4.9:1 in both themes, axe), above
     the now marker so a marker never cuts the times. A locked day's paler halo takes ink (≥ 6.6:1). */
  .times {
    position: relative;
    z-index: 2;
    padding: 0 3px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--warm) 82%, var(--in));
    font-size: 11px;
    font-weight: 600;
    color: #1a0d05;
    white-space: nowrap;
    pointer-events: none;
  }
  .locked .times {
    background: color-mix(in srgb, var(--warm) 45%, var(--in));
    color: var(--tx);
  }
  .pending .times {
    background: var(--in);
    color: var(--mu);
  }
  .handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 10px;
    cursor: ew-resize;
    touch-action: none;
  }
  /* A larger invisible grip than the visible edge, for fingers. */
  .handle::before {
    content: '';
    position: absolute;
    inset: -6px -8px;
  }
  /* The grips show on the block being pointed at, focused or dragged. */
  .handle::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 3.5px;
    width: 3px;
    height: 16px;
    margin-top: -8px;
    border-radius: 2px;
    background: color-mix(in srgb, #1a0d05 55%, transparent);
    opacity: 0;
    transition: opacity var(--t-state) ease;
  }
  .block:focus-visible .handle::after,
  .block.active .handle::after {
    opacity: 1;
  }
  @media (hover: hover) {
    .block:hover .handle::after {
      opacity: 1;
    }
  }
  .handle.start {
    left: 0;
  }
  .handle.end {
    right: 0;
  }
  .now {
    position: absolute;
    z-index: 1;
    top: -3px;
    bottom: -3px;
    width: 2px;
    margin-left: -1px;
    border-radius: 1px;
    background: var(--tx);
    pointer-events: none;
  }
  .hours {
    position: relative;
    height: 15px;
    font-size: 11px;
    color: var(--fa);
  }
  .hours span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
  }
  .hours span:first-child {
    transform: none;
  }
  .hours span:last-child {
    transform: translateX(-100%);
  }
  @media (max-width: 599px) {
    .handle::before {
      inset: -6px -12px;
    }
  }
</style>
