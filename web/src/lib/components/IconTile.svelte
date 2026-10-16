<!-- A round-icon tile (spec §3 « RoomWidget » tiles, `.tl`): Chauffe temp., Programme, Radiateurs, Fenêtre. An s1
     tile (radius 20, 14 px padding, ≥ 68 px tall) with a 40 px s2 disc and a title (15/600) over a muted line.
     `stack` puts the disc above the words (the two small tiles); `row` beside them. `tone="heat"` fills the disc
     in heat (a radiator heating, a running chauffe temporaire): heat means heating only. `off` is the calm
     outlined variant (offline, unavailable): faint, never red. A link, a button or plain. -->
<script lang="ts">
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    icon: IconName;
    title: string;
    sub?: string;
    tone?: 'heat' | 'cool' | null;
    layout?: 'row' | 'stack';
    off?: boolean;
    href?: string;
    onclick?: (e: MouseEvent) => void;
    ariaLabel?: string;
    /** `aria-disabled` (a guarded click, focus kept): reconnecting, a command on its way. */
    inert?: boolean;
    class?: string;
  }
  let { icon, title, sub, tone = null, layout = 'row', off = false, href, onclick, ariaLabel, inert = false, class: cls = '' }: Props = $props();
  const click = (e: MouseEvent) => {
    if (inert) return e.preventDefault();
    onclick?.(e);
  };
</script>

{#snippet inner()}
  <span class="ti {tone ?? ''}" aria-hidden="true"><Icon name={icon} size={18} /></span>
  <span class="tx"><b>{title}</b>{#if sub}<span class="sub">{sub}</span>{/if}</span>
{/snippet}

{#if href}
  <a class="tl {layout} {cls}" class:off {href} aria-label={ariaLabel} aria-disabled={inert || undefined} onclick={click}>{@render inner()}</a>
{:else if onclick}
  <button type="button" class="tl {layout} {cls}" class:off aria-label={ariaLabel} aria-disabled={inert} onclick={click}>{@render inner()}</button>
{:else}
  <div class="tl {layout} {cls}" class:off>{@render inner()}</div>
{/if}

<style>
  .tl {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 68px;
    padding: 14px;
    border: 0;
    border-radius: var(--r-tile);
    background: var(--s1);
    color: var(--tx);
    font: inherit;
    text-align: left;
    text-decoration: none;
  }
  .tl.stack {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  a.tl,
  button.tl {
    cursor: pointer;
    transition:
      background-color var(--t-state) ease,
      opacity var(--t-state) ease;
  }
  @media (hover: hover) {
    a.tl:hover,
    button.tl:hover {
      background: color-mix(in srgb, var(--s1) 70%, var(--s2));
    }
  }
  .tl[aria-disabled='true'] {
    opacity: 0.4;
    cursor: default;
  }
  .ti {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--s2);
    color: var(--mu);
  }
  .ti.heat {
    background: var(--heat);
    color: var(--heat-ink);
  }
  .ti.cool {
    color: var(--cool);
  }
  .tx {
    display: grid;
    min-width: 0;
  }
  b {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.2;
  }
  .sub {
    color: var(--mu);
    font-size: 13px;
    line-height: 1.3;
  }
  .tl.off {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .tl.off b,
  .tl.off .ti {
    color: var(--fa);
  }
</style>
