<script lang="ts">
  import { page } from '$app/state';
  import { m } from '$lib/i18n';
  import { navAlerts } from '$lib/navAlerts';
  import { isActive, NAV } from '$lib/paths';
  import { alerts } from '$lib/stores/alerts.svelte';
  import Icon from './Icon.svelte';

  let dot = $derived(navAlerts(alerts.summary, alerts.list));
</script>

<nav class="tabbar" aria-label={m.nav.label}>
  {#each NAV as t (t.href)}
    {@const flag = t.key === 'home' && dot.count > 0}
    <a href={t.href} aria-current={isActive(page.url.pathname, t.href) ? 'page' : undefined}
      aria-label={flag ? m.nav.alerts(m.nav[t.key], dot.count) : undefined}><span class="ic"><Icon name={t.icon} size={20} />{#if flag}<span
            class="dot" class:bad={dot.bad} aria-hidden="true"></span>{/if}</span><span>{m.nav[t.key]}</span></a>
  {/each}
</nav>

<style>
  .tabbar {
    position: fixed;
    inset: auto 0 0 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding-bottom: env(safe-area-inset-bottom);
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--line);
    z-index: 20;
  }
  @media (prefers-reduced-transparency: reduce) {
    .tabbar {
      background: var(--bg);
      backdrop-filter: none;
    }
  }
  a {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 8px 0 6px;
    min-height: 56px;
    color: var(--fa);
    text-decoration: none;
    font-size: 11px;
    font-weight: 500;
    touch-action: manipulation;
    transition: color var(--t-state) ease;
  }
  /* The current tab: ink, heavier, and a short ink bar on top (not colour alone). */
  a[aria-current='page'] {
    color: var(--tx);
    font-weight: 600;
  }
  a[aria-current='page']::before {
    content: '';
    position: absolute;
    top: -1px;
    left: calc(50% - 10px);
    width: 20px;
    height: 2px;
    border-radius: 0 0 2px 2px;
    background: var(--tx);
  }
  a:active {
    color: var(--tx);
  }
  /* The alert dot at the icon's top-right: absolutely placed, so the item never changes size. */
  .ic {
    position: relative;
    display: grid;
  }
  .dot {
    position: absolute;
    top: -1px;
    right: -3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--mu);
    outline: 1.5px solid var(--bg);
  }
  .dot.bad {
    background: var(--bad);
  }
</style>
