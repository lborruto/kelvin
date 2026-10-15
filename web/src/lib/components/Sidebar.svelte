<script lang="ts">
  import { page } from '$app/state';
  import { m } from '$lib/i18n';
  import { navAlerts } from '$lib/navAlerts';
  import { isActive, NAV } from '$lib/paths';
  import { alerts } from '$lib/stores/alerts.svelte';
  import CozytouchStatus from './CozytouchStatus.svelte';
  import HouseActions from './HouseActions.svelte';
  import Icon from './Icon.svelte';
  import Wordmark from './Wordmark.svelte';

  interface Props {
    /** The layout's clock, for the status footer's « il y a 1 min ». */
    now?: number;
  }
  let { now = Date.now() }: Props = $props();
  let dot = $derived(navAlerts(alerts.summary, alerts.list));
</script>

<nav class="sidebar" aria-label={m.nav.label}>
  <div class="brand"><Wordmark /></div>
  {#each NAV as l (l.href)}
    {@const flag = l.key === 'home' && dot.count > 0}
    <!-- The alert dot never changes the link's width (absolutely placed); the count is in the name only. -->
    <a href={l.href} aria-current={isActive(page.url.pathname, l.href) ? 'page' : undefined}
      aria-label={flag ? m.nav.alerts(m.nav[l.key], dot.count) : undefined}><Icon name={l.icon} />{m.nav[l.key]}{#if flag}<span
          class="dot" class:bad={dot.bad} aria-hidden="true"></span>{/if}</a>
  {/each}
  <div class="foot">
    <HouseActions stacked />
    <div class="status"><CozytouchStatus {now} /></div>
  </div>
</nav>

<style>
  .sidebar {
    position: sticky;
    top: 0;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 20px 14px;
    border-right: 1px solid var(--line);
    background: var(--bg);
  }
  .brand {
    padding: 0 10px 14px;
  }
  a {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--mu);
    text-decoration: none;
    font-weight: 500;
    transition:
      background-color var(--t-state) ease,
      border-color var(--t-state) ease,
      color var(--t-state) ease;
  }
  @media (hover: hover) {
    a:not([aria-current='page']):hover {
      color: var(--tx);
      background: color-mix(in srgb, var(--s1) 60%, transparent);
    }
  }
  /* The current page: raised and edged, so it reads in the light theme too (s1 on bg alone does not). */
  a[aria-current='page'] {
    background: var(--s1);
    border-color: var(--line);
    color: var(--tx);
  }
  .dot {
    position: absolute;
    top: 50%;
    right: 12px;
    width: 6px;
    height: 6px;
    margin-top: -3px;
    border-radius: 50%;
    background: var(--mu);
  }
  .dot.bad {
    background: var(--bad);
  }
  .foot {
    margin-top: auto;
  }
  /* The status footer: under a hairline, the app's one always-visible freshness signal. */
  .status {
    margin-top: 12px;
    padding: 4px 10px 0;
    border-top: 1px solid var(--line);
  }
</style>
