<!-- The phone tab bar (Tableau spec §2): Maison · Programme · Énergie · Réglages on --side, 24 px glyphs over
     11 px labels, the current tab in ink (and heavier: not colour alone). The alert dot sits on Maison's glyph,
     only for a must-fix alert; the count is in the name. Rooms are reached from the Maison tiles. -->
<script lang="ts">
  import { page } from '$app/state';
  import { m } from '$lib/i18n';
  import { ALERT_KEY, NAV_ICON } from '$lib/nav';
  import { navAlerts } from '$lib/navAlerts';
  import { isActive, NAV } from '$lib/paths';
  import { alerts } from '$lib/stores/alerts.svelte';
  import Icon from './Icon.svelte';

  let dot = $derived(navAlerts(alerts.summary, alerts.list));
</script>

<nav class="tabbar" aria-label={m.nav.label}>
  {#each NAV as t (t.href)}
    {@const flag = t.key === ALERT_KEY && dot.count > 0}
    <a href={t.href} aria-current={isActive(page.url.pathname, t.href) ? 'page' : undefined}
      aria-label={flag ? m.nav.alerts(m.nav[t.key], dot.count) : undefined}><span class="ic"><Icon name={NAV_ICON[t.key]} size={24} />{#if flag && dot.bad}<span
            class="dot" aria-hidden="true"></span>{/if}</span><span class="lb">{m.nav[t.key]}</span></a>
  {/each}
</nav>

<style>
  .tabbar {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 20;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 6px 4px env(safe-area-inset-bottom);
    background: var(--side);
    border-top: 1px solid var(--line);
  }
  a {
    position: relative;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 3px;
    min-width: 0;
    min-height: 56px;
    color: var(--fa);
    text-decoration: none;
    font-size: 11px;
    font-weight: 500;
    touch-action: manipulation;
    transition: color var(--t-state) ease;
  }
  a[aria-current='page'] {
    color: var(--tx);
    font-weight: 600;
  }
  a:active {
    color: var(--tx);
  }
  .lb {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The alert dot at the glyph's top-right, ringed in the bar's colour: the item never changes size. */
  .ic {
    position: relative;
    display: grid;
  }
  .dot {
    position: absolute;
    top: 0;
    right: -4px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--bad);
    box-shadow: 0 0 0 2px var(--side);
  }
</style>
