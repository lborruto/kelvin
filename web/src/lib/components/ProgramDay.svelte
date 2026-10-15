<script lang="ts">
  import { slide } from 'svelte/transition';
  import type { Day } from '$lib/api/types';
  import { m } from '$lib/i18n';
  import { dur, easeOut, T } from '$lib/motion';
  import Icon from './Icon.svelte';
  import { addSlot, fromMin, moveSlot, removeSlot, resizeSlot, toMin, validateDay, type Seg } from '$lib/program';

  interface Props {
    day: Day;
    segs: Seg[];
    nowMinute?: number | null;
    pending?: boolean;
    /** Phone: only the open day shows its time slots; its bar always shows. */
    collapsible?: boolean;
    open?: boolean;
    ontoggle?: () => void;
    onchange: (segs: Seg[]) => void;
  }
  let { day, segs, nowMinute = null, pending = false, collapsible = false, open = true, ontoggle, onchange }: Props = $props();
  const uid = $props.id();
  let label = $derived(m.days[day]);
  let shut = $derived(collapsible && !open);
  let dragging = $state(false);

  let bar = $state<HTMLDivElement>();
  let drag: { i: number; kind: 'move' | 'start' | 'end'; origin: number; base: Seg[] } | null = null;
  let moved = false;
  let error = $derived(validateDay(segs));

  const minuteAt = (clientX: number) => {
    const r = bar!.getBoundingClientRect();
    return r.width ? ((clientX - r.left) / r.width) * 1440 : 0;
  };
  const pct = (min: number) => `${(min / 1440) * 100}%`;

  function down(e: PointerEvent, i: number, kind: 'move' | 'start' | 'end') {
    e.stopPropagation();
    if (pending) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag = { i, kind, origin: minuteAt(e.clientX), base: segs };
    dragging = true;
    moved = false;
  }
  function move(e: PointerEvent) {
    if (!drag || pending) return;
    const at = minuteAt(e.clientX);
    moved = true;
    onchange(drag.kind === 'move' ? moveSlot(drag.base, drag.i, at - drag.origin) : resizeSlot(drag.base, drag.i, drag.kind, at));
  }
  function up() {
    drag = null;
    dragging = false;
  }
  function barDown() {
    moved = false;
  }
  function addAt(e: MouseEvent) {
    // A closed day on the phone: the first tap opens it rather than adding a slot blind.
    if (shut) {
      ontoggle?.();
      return;
    }
    if (pending) return;
    if (moved) {
      moved = false;
      return;
    }
    const next = addSlot(segs, minuteAt(e.clientX));
    if (next) onchange(next);
  }
  function addFirstFree() {
    if (pending || segs.length >= 3) return;
    for (const at of [420, 1080, 720, 0, 60, 180, 300, 540, 840, 960, 1200, 1320]) {
      const next = addSlot(segs, at);
      if (next) return onchange(next);
    }
  }
  function setTime(el: HTMLInputElement, i: number, edge: 'start' | 'end') {
    const value = el.value;
    if (pending || !segs[i]) return;
    let shown = segs[i][edge];
    if (/^\d{2}:\d{2}$/.test(value)) {
      const next = resizeSlot(segs, i, edge, toMin(value));
      shown = next[i]?.[edge] ?? shown;
      onchange(next);
    }
    // Reset the field to the model so a rejected or clamped value does not linger.
    el.value = fromMin(shown);
  }
  function key(e: KeyboardEvent, i: number) {
    if (pending) return;
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

<div class="day" class:shut>
  <div class="head">
    {#if collapsible}
      <button type="button" class="dayhead" aria-expanded={open} aria-controls="{uid}-slots" onclick={() => ontoggle?.()}>
        <span class="label">{label}</span>
        <span class="slots-sum">{segs.map((s) => `${fromMin(s.start)}–${fromMin(s.end)}`).join(' · ') || m.program.ecoAllDay}</span>
        <span class="chev" aria-hidden="true"><Icon name="chevron" size={14} /></span>
      </button>
    {:else}
      <span class="label">{label}</span>
    {/if}
  </div>
  <span class="visually-hidden" id="{uid}-hint">{m.program.blockHint}</span>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="bar" class:pending class:dragging data-testid="bar-{day}" bind:this={bar} onclick={addAt} onpointerdown={barDown}
    onpointermove={move} onpointerup={up} onpointercancel={up}>
    {#each [6, 12, 18] as h (h)}<span class="tick" style:left={pct(h * 60)}></span>{/each}
    {#each segs as s, i (i)}
      <div class="block" role="button" tabindex="0" aria-roledescription={m.program.slotRole} aria-describedby="{uid}-hint"
        aria-label="{label} {fromMin(s.start)}–{fromMin(s.end)}"
        style:left={pct(s.start)} style:width={pct(s.end - s.start)}
        onpointerdown={(e) => down(e, i, 'move')} onkeydown={(e) => key(e, i)}
        onclick={(e) => e.stopPropagation()}>
        <span class="handle start" onpointerdown={(e) => down(e, i, 'start')} aria-hidden="true"></span>
        <span class="handle end" onpointerdown={(e) => down(e, i, 'end')} aria-hidden="true"></span>
      </div>
    {/each}
    {#if nowMinute != null}<span class="now" style:left={pct(nowMinute)}></span>{/if}
  </div>
  {#if !shut}
    <ul class="slots" id="{uid}-slots" transition:slide={{ duration: dur(collapsible ? T.enter : 0), easing: easeOut }}>
      {#each segs as s, i (i)}
        <li>
          <input type="time" step="900" disabled={pending} aria-label={m.program.slotStart(label, i + 1)} value={fromMin(s.start)}
            onchange={(e) => setTime(e.currentTarget, i, 'start')} />
          <span aria-hidden="true">–</span>
          <input type="time" step="900" disabled={pending} aria-label={m.program.slotEnd(label, i + 1)} value={fromMin(s.end)}
            onchange={(e) => setTime(e.currentTarget, i, 'end')} />
          <button type="button" class="btn sq" disabled={pending} aria-label={m.program.removeSlot(i + 1, label)}
            onclick={() => onchange(removeSlot(segs, i))}><Icon name="x" size={16} /></button>
        </li>
      {/each}
      <li>
        <button type="button" class="btn btn-sm add" aria-disabled={pending || segs.length >= 3} aria-label={m.program.addSlot(label)}
          onclick={addFirstFree}><Icon name="plus" size={16} />{m.program.addShort}</button>
      </li>
    </ul>
  {/if}
  {#if error}<p class="error" role="alert">{m.program.dayError[error]}</p>{/if}
</div>

<style>
  .day {
    display: grid;
    gap: 6px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }
  .label {
    font-weight: 600;
    font-size: 13px;
  }
  .dayhead {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    margin-block: -6px;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }
  .dayhead .label {
    flex: none;
    min-width: 5.5rem;
  }
  .slots-sum {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: var(--mu);
    font-variant-numeric: tabular-nums;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chev {
    display: inline-flex;
    color: var(--mu);
    transform: rotate(90deg);
    transition: transform var(--t-state) var(--ease-out);
  }
  [aria-expanded='true'] .chev {
    transform: rotate(-90deg);
  }
  .bar {
    position: relative;
    height: 32px;
    border-radius: 6px;
    background: var(--in);
    border: 1px solid var(--field-line);
    cursor: copy;
    touch-action: pan-y;
  }
  /* While a block is dragged, the page must not scroll under the finger. */
  .bar.dragging {
    touch-action: none;
  }
  .shut .bar {
    cursor: pointer;
  }
  .bar.pending {
    cursor: default;
  }
  .pending .block {
    background: transparent;
    border: 1.5px dashed var(--mu);
    cursor: default;
  }
  .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--line);
  }
  /* Comfort blocks: warm at 75 % (3:1 against the well in both themes, WCAG 1.4.11). */
  .block {
    position: absolute;
    top: 3px;
    bottom: 3px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--warm) 75%, var(--in));
    cursor: grab;
    touch-action: none;
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
  .handle.start {
    left: -4px;
  }
  .handle.end {
    right: -4px;
  }
  .now {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    background: var(--tx);
  }
  .slots {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    align-items: center;
  }
  .slots li {
    /* A grid, not a flex row: the time inputs can shrink, so a row never pushes the page wider
       than the screen (Chromium's intrinsic time-input width varies by platform and fonts). */
    display: grid;
    grid-template-columns: minmax(0, 7.5rem) auto minmax(0, 7.5rem) auto;
    align-items: center;
    gap: 4px;
    max-width: 100%;
  }
  input {
    min-width: 0;
    width: 100%;
    padding: 0 6px;
    border-radius: 6px;
  }
  .sq {
    width: 44px;
    padding: 0;
    border-radius: 6px;
  }
  .add {
    border-radius: 6px;
    padding: 0 12px 0 10px;
    gap: 4px;
  }
  .error {
    margin: 0;
    color: var(--bad);
    font-size: 12px;
  }
  @media (max-width: 599px) {
    .bar {
      height: 40px;
    }
    .handle::before {
      inset: -6px -12px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
</style>
