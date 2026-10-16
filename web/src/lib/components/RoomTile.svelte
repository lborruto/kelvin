<!-- A room on the Maison tableau (spec §3 « RoomTile » / « RoomWidget », §4 « Tile gestures »). Two layouts:
     `tile` (phone, 2 columns: a 36 px glyph disc and the 26 px reading on top, the name, one status line, then
     the compact −/+) and `widget` (desktop column: the glyph, the name and a 32 px reading, the status, the
     −/+ and the mini sparkline). Tapping the tile body opens the room sheet (one link stretched over it, named
     by `ariaLabel`); the −/+ and any action sit above that link and act directly. The glyph disc is heat only
     while the room heats. Variants: `off` (no stepper: `note` « La pièce ne chauffe pas. »), `absence` (cool,
     no stepper), `readonly` (no control, the chip), `offline` (the calm full-width variant: plug, faint name,
     « Hors ligne depuis 04:07 », the hint; never red, no temperature). The screen composes the status words
     (`roomStatus`) and the control (`primarySetpoint` + Stepper); the tile only lays them out. The reading dips
     and returns (400 ms) when `dipKey` changes. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { fmtTempShort } from '$lib/format';
  import { flash } from '$lib/motion';
  import type { Tone } from '$lib/status';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    name: string;
    href: string;
    /** The cover link's accessible name: one sentence (name, reading, status, consigne, en chauffe). */
    ariaLabel: string;
    reading: number | null;
    /** The status line's lead (in its tone) and rest (« En chauffe » · « → 23:00 »). */
    lead?: string;
    tone?: Tone;
    rest?: string;
    /** Dash the status while a request is not confirmed (the shared pending mark). */
    pending?: boolean;
    heating?: boolean;
    glyph?: IconName;
    variant?: 'normal' | 'off' | 'absence' | 'readonly' | 'offline';
    layout?: 'tile' | 'widget';
    /** Replaces the control (« Ne chauffe pas », « jusqu’à dim. 18:00 »). */
    note?: string;
    /** Offline: the second sentence (« Radiateur hors tension ou hors de portée »). */
    hint?: string;
    /** The chip of a read-only room (« Lecture seule »). */
    chip?: string;
    /** The −/+ (a Stepper, `size="sm"` on tiles, `block`). */
    control?: Snippet;
    /** Under the control (widget): the MiniSpark. */
    spark?: Snippet;
    /** A PendingTag (sending, confirmed, failed with Réessayer), above the link. */
    tag?: Snippet;
    dipKey?: unknown;
    class?: string;
  }
  let {
    name, href, ariaLabel, reading, lead = '', tone = 'tx', rest = '', pending = false, heating = false, glyph,
    variant = 'normal', layout = 'tile', note, hint, chip, control, spark, tag, dipKey, class: cls = ''
  }: Props = $props();
  let icon = $derived<IconName>(glyph ?? (variant === 'off' ? 'power' : variant === 'absence' ? 'away' : variant === 'offline' ? 'plug-off' : 'flame'));
  let disc = $derived(heating && variant === 'normal' ? 'heat' : variant === 'absence' ? 'cool' : '');
</script>

{#if variant === 'offline'}
  <article class="rt offline {layout} {cls}">
    <span class="ti" aria-hidden="true"><Icon name="plug-off" size={18} /></span>
    <div class="tx">
      <a class="cover n" {href} aria-label={ariaLabel}>{name}</a>
      <span class="s faint">{lead}{#if hint}<span class="sep">{' · '}</span><span class="hint">{hint}</span>{/if}</span>
      {#if tag}<div class="above">{@render tag()}</div>{/if}
    </div>
  </article>
{:else}
  <article class="rt {layout} {variant} {cls}">
    <div class="top">
      <span class="ti {disc}" aria-hidden="true"><Icon name={icon} size={layout === 'widget' ? 18 : 17} /></span>
      {#if layout === 'widget'}<a class="cover n" {href} aria-label={ariaLabel}>{name}</a>{/if}
      {#key dipKey}<span class="t num" class:t-widget={layout === 'widget'} in:flash aria-hidden="true">{fmtTempShort(reading)}</span>{/key}
    </div>
    <div class="mid">
      {#if layout === 'tile'}<a class="cover n" {href} aria-label={ariaLabel}>{name}</a>{/if}
      <span class="s" class:pending aria-hidden="true"><span class="lead {tone}">{lead}</span>{#if rest}<span class="sep">{' · '}</span>{rest}{/if}</span>
    </div>
    {#if chip}<span class="chip solid above">{chip}</span>{/if}
    <!-- Only a normal room takes −/+: off, absence and read-only never render a control, even if one is passed
         (a command that cannot work is absent). Offline renders neither control nor note. -->
    {#if control && variant === 'normal'}<div class="ctl above">{@render control()}</div>
    {:else if note}<p class="note-line">{note}</p>{/if}
    {#if tag}<div class="above">{@render tag()}</div>{/if}
    {#if spark}<div class="spark">{@render spark()}</div>{/if}
  </article>
{/if}

<style>
  .rt {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 12px;
    border-radius: var(--r-tile);
    background: var(--s1);
    transition: background-color var(--t-state) ease;
  }
  .rt.widget {
    gap: 0;
    padding: 16px;
    border-radius: var(--r-widget);
  }
  @media (hover: hover) {
    .rt:has(.cover:hover) {
      background: color-mix(in srgb, var(--s1) 75%, var(--s2));
    }
  }
  .rt:has(.cover:active) {
    background: var(--s2);
  }
  /* The whole tile is the link to the room sheet; controls sit above it. */
  .cover {
    color: inherit;
    text-decoration: none;
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
  .rt:has(.cover:focus-visible) {
    outline: 2px solid var(--tx);
    outline-offset: 2px;
  }
  .above {
    position: relative;
    z-index: 1;
  }
  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .widget .top {
    align-items: center;
  }
  .ti {
    display: grid;
    place-items: center;
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--s2);
    color: var(--mu);
  }
  .widget .ti {
    width: 40px;
    height: 40px;
  }
  .ti.heat {
    background: var(--heat);
    color: var(--heat-ink);
  }
  .ti.cool {
    color: var(--cool);
  }
  .t {
    font-size: 26px;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
  }
  .t.t-widget {
    margin-left: auto;
    font-size: 32px;
  }
  .widget .n {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .mid {
    display: grid;
    min-width: 0;
  }
  .tile .n {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .s {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--mu);
    font-size: 12.5px;
    line-height: 1.3;
  }
  .widget .s {
    margin-top: 6px;
    font-size: 13px;
  }
  .s.pending {
    text-decoration: underline dashed var(--mu);
    text-underline-offset: 3px;
  }
  .lead.warm {
    color: var(--heat);
  }
  .lead.cool {
    color: var(--cool);
  }
  .lead.bad {
    color: var(--bad);
  }
  .lead.tx {
    color: var(--mu);
  }
  .ctl {
    min-width: 0;
  }
  .widget .ctl,
  .widget .note-line {
    margin-top: 14px;
  }
  .note-line {
    display: flex;
    align-items: center;
    height: 40px;
    margin: 0;
    color: var(--mu);
    font-size: 12.5px;
  }
  .widget .note-line {
    height: 44px;
    font-size: 13px;
  }
  .spark {
    margin-top: 12px;
  }
  .chip {
    align-self: flex-start;
  }
  /* Offline: calm, full width, faint; never red, no temperature. */
  .rt.offline {
    flex-direction: row;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 14px;
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .rt.offline.widget {
    flex-direction: column;
    align-items: flex-start;
    padding: 16px;
  }
  .offline .ti {
    width: 40px;
    height: 40px;
    color: var(--fa);
  }
  .offline .tx {
    display: grid;
    min-width: 0;
  }
  .offline .n {
    color: var(--fa);
    font-weight: 600;
  }
  .offline .s {
    white-space: normal;
  }
  .faint {
    color: var(--fa);
  }
</style>
