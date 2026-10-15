<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Room } from '$lib/api/types';
  import { retry } from '$lib/actions';
  import { fmtTemp } from '$lib/format';
  import { m } from '$lib/i18n';
  import { dur, flash, T } from '$lib/motion';
  import { ROUTES } from '$lib/paths';
  import { Settle } from '$lib/settle.svelte';
  import { roomName } from '$lib/setup';
  import { reportedKey, requestKey, roomReading, roomStatus } from '$lib/status';
  import { house } from '$lib/stores/house.svelte';
  import type { StripPoint } from '$lib/stores/history.svelte';
  import { addParisDays, parisMidnight } from '$lib/time';
  import Icon from './Icon.svelte';
  import PendingEdge from './PendingEdge.svelte';
  import PendingTag from './PendingTag.svelte';
  import ThermalStrip from './ThermalStrip.svelte';

  interface Props {
    room: Room;
    now: number;
    points: StripPoint[];
    /** Desktop: the room opens in the inspector beside the list (focus and scroll stay). Phone: its own page. */
    desktop?: boolean;
    /** The room shown in the inspector (desktop). */
    selected?: boolean;
    /** This card's room is the page's URL (a room page, not "/"). */
    current?: boolean;
  }
  let { room, now, points, desktop = false, selected = false, current = false }: Props = $props();
  // The phone card's figure becomes the room page's figure (a shared-element view transition).
  // Named by the room's position, which is unique whatever characters its id holds.
  let vtName = $derived(desktop ? undefined : `temp-${house.rooms.findIndex((r) => r.id === room.id)}`);

  let radiators = $derived(house.roomRadiators(room.id));
  let expected = $derived(house.roomExpected(room.id));
  let pending = $derived(house.pendingFor(room.radiator_ids));
  let override = $derived(house.overrideFor(room.id));
  let status = $derived(roomStatus(room, radiators, override, expected, now));
  let offline = $derived(status.kind === 'offline');
  // The request's values, not the sentence's text: the mark closes solid only when the radiators report them.
  const settle: Settle<string> = new Settle<string>(() => requestKey(expected), () => reportedKey(radiators, settle.held?.v ?? null));
  let reading = $derived(roomReading(room, radiators));
  let heating = $derived(!offline && status.kind !== 'off' && house.roomHeating(room.id));
  let start = $derived(parisMidnight(now));
  let end = $derived(addParisDays(start, 1));
  let name = $derived(roomName(room));
  let target = $derived(status.target == null ? null : m.room.target(fmtTemp(status.target)));
  let partial = $derived(status.someOffline ? m.status.someOffline(status.someOffline.k, status.someOffline.n) : null);
  // One sentence for screen readers, from the parts the card shows.
  let label = $derived(
    (
      offline
        ? [name, status.text, status.hint ?? '']
        : [name, fmtTemp(reading), status.text, target ?? '', heating ? m.room.heatingNow : '', partial ?? ''].filter(Boolean)
    ).join(', ')
  );
  let href = $derived(ROUTES.room(room.id));
</script>

{#if offline}
  <article class="card off" class:selected>
    <a class="cover" {href} aria-label={label} aria-current={current ? 'page' : undefined} data-sveltekit-keepfocus={desktop || undefined}
      data-sveltekit-noscroll={desktop || undefined}><span class="name">{name}</span></a>
    <span class="why" aria-hidden="true">{status.text}<span class="sep">{' · '}</span><span class="hint">{status.hint}</span></span>
    <span class="plug" aria-hidden="true"><Icon name="plug-off" size={20} /></span>
    {#if pending}<span class="off-tag"><PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} /></span>{/if}
  </article>
{:else}
  <article class="card" class:selected>
    <span class="nameline">
      <a class="cover" {href} aria-label={label} aria-current={current ? 'page' : undefined} data-sveltekit-keepfocus={desktop || undefined}
        data-sveltekit-noscroll={desktop || undefined}><span class="name">{name}</span></a>
      {#if heating}<span class="heat" aria-hidden="true"><span class="dot"></span>{m.room.heatingNow}</span>{/if}
      {#if partial}<span class="part" aria-hidden="true"><Icon name="plug-off" size={14} />{partial}</span>{/if}
    </span>
    <span class="temp num" style:view-transition-name={vtName} aria-hidden="true">{#key reading}<span class="fig"
        in:flash>{fmtTemp(reading)}</span>{/key}</span>
    <span class="status" aria-hidden="true">
      {#key status.text}<span class="sentence" class:dashed={status.pending || settle.confirmed} in:fade={{ duration: dur(T.state) }}><span
          class="lead {status.tone}">{#if status.kind === 'window'}<Icon name="window" size={14} />{/if}{status.lead}</span>{#if status.rest}{' · '}{status.rest}{/if}<PendingEdge
            pending={status.pending} confirmed={!status.pending && settle.confirmed} /></span>{/key}
    </span>
    <span class="target num">
      {#if pending}<PendingTag {pending} onretry={retry} ondismiss={(id) => house.dismiss(id)} />{:else if target}<span
          class="muted" aria-hidden="true">{target}</span>{/if}
    </span>
    <div class="strip">
      <ThermalStrip {points} {start} {end} {now} program={radiators[0]?.program} mode={room.mode} comfort={room.comfort} eco={room.eco}
        target={room.target} pendingTarget={expected.target ?? null} pendingComfort={expected.comfort ?? null} height={32}
        label={m.room.todayLabel(name)} />
    </div>
  </article>
{/if}

<style>
  .card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'name temp' 'status target' 'strip strip';
    align-items: baseline;
    column-gap: 12px;
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 12px 14px;
    transition:
      border-color var(--t-state) ease,
      background-color var(--t-press) ease;
  }
  /* The card answers the pointer: a firmer edge on hover, a tone deeper while pressed. */
  @media (hover: hover) {
    .card:has(.cover:hover) {
      border-color: color-mix(in srgb, var(--line) 50%, var(--mu));
    }
  }
  .card:has(.cover:active) {
    background: color-mix(in srgb, var(--s1) 60%, var(--s2));
  }
  /* The whole card is the link: its name stretches over it; the pending tag's buttons sit above. */
  .cover {
    min-width: 0;
    color: inherit;
    text-decoration: none;
    touch-action: manipulation;
  }
  .cover::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .cover:focus-visible {
    outline: none;
  }
  .card:has(.cover:focus-visible) {
    outline: 2px solid var(--tx);
    outline-offset: 2px;
  }
  /* The room in the inspector (desktop). */
  .card.selected {
    border-color: var(--mu);
  }
  .name {
    font-weight: 600;
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  .nameline {
    grid-area: name;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
  }
  .heat,
  .part {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    white-space: nowrap;
  }
  /* Warm means heating (DESIGN: Heat Means Heat). */
  .heat {
    color: var(--warm);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--warm);
  }
  .part {
    color: var(--mu);
  }
  .temp {
    grid-area: temp;
    font-size: 26px;
    font-weight: 600;
    line-height: 1.15;
    letter-spacing: -0.02em;
    text-align: right;
  }
  .fig {
    display: inline-block;
  }
  /* One line reserved on a wide card, two on a narrow one: a new sentence never moves the list. */
  .status {
    grid-area: status;
    min-width: 0;
    min-height: 20px;
    font-size: 13px;
    line-height: 20px;
  }
  .sentence {
    position: relative;
    display: inline;
  }
  .sentence.dashed {
    display: inline-block;
    padding-bottom: 2px;
  }
  .lead {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .lead :global(svg) {
    flex: none;
  }
  .lead.muted {
    color: var(--mu);
  }
  .lead.warm {
    color: var(--warm);
  }
  .lead.cool {
    color: var(--cool);
  }
  .lead.bad {
    color: var(--bad);
  }
  .status:has(.lead.muted) {
    color: var(--mu);
  }
  .target {
    grid-area: target;
    position: relative;
    z-index: 1;
    justify-self: end;
    max-width: 60cqi;
    font-size: 13px;
    line-height: 20px;
    text-align: right;
    white-space: nowrap;
  }
  .target :global(.tag) {
    white-space: normal;
  }
  .strip {
    grid-area: strip;
    margin-top: 8px;
    height: 32px;
  }
  @container (max-width: 419px) {
    .status {
      min-height: 40px;
    }
  }

  /* Offline: compact, muted, no figure, no strip, never red. */
  .off .cover {
    grid-area: name;
  }
  .card.off {
    grid-template-areas: 'name plug' 'why plug';
    align-items: center;
    row-gap: 2px;
    padding: 11px 14px;
  }
  .off .name {
    color: color-mix(in srgb, var(--tx) 80%, transparent);
  }
  .why {
    grid-area: why;
    font-size: 13px;
    line-height: 19px;
    color: var(--mu);
  }
  .off-tag {
    grid-column: 1 / -1;
    position: relative;
    z-index: 1;
    margin-top: 4px;
    font-size: 13px;
  }
  .plug {
    grid-area: plug;
    display: inline-flex;
    color: var(--mu);
  }
  @container (max-width: 419px) {
    .sep {
      display: none;
    }
    .hint {
      display: block;
    }
  }
</style>
