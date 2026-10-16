<!-- A notice (spec §3 « Notice », `.notice`): neutral (offline, read-only, locked; s2 at 60 % with a hairline,
     a muted glyph, never red) or bad (an open window, a conflict; the bad tint and edge). A 14/600 title, then
     muted 13 px text (`children`). `role="status"` by default (it reports a state); pass `role={null}` inside a
     region that already announces. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    title: string;
    tone?: 'neutral' | 'bad';
    icon?: IconName;
    role?: 'status' | 'alert' | null;
    children?: Snippet;
  }
  let { title, tone = 'neutral', icon = tone === 'bad' ? 'alert' : 'info', role = 'status', children }: Props = $props();
</script>

<div class="notice {tone === 'bad' ? 'bad' : ''}" role={role ?? undefined}>
  <span class="ic" aria-hidden="true"><Icon name={icon} size={20} /></span>
  <div class="tx"><b>{title}</b>{#if children}<div class="more">{@render children()}</div>{/if}</div>
</div>

<style>
  .ic {
    display: grid;
    flex: none;
    color: var(--mu);
  }
  .bad .ic {
    color: var(--bad);
  }
  .tx {
    min-width: 0;
  }
  b {
    display: block;
    font-size: 14px;
    font-weight: 600;
  }
  .more {
    margin-top: 2px;
    color: var(--mu);
    font-size: 13px;
  }
  .more :global(p) {
    margin: 0;
  }
</style>
