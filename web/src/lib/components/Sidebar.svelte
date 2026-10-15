<script lang="ts">
  import { page } from '$app/state';
  import { m } from '$lib/i18n';
  import { isActive, NAV } from '$lib/paths';
  import HouseActions from './HouseActions.svelte';
  import Icon from './Icon.svelte';
</script>

<nav class="sidebar" aria-label={m.nav.label}>
  <div class="brand">Kelvin</div>
  {#each NAV as l (l.href)}
    <a href={l.href} aria-current={isActive(page.url.pathname, l.href) ? 'page' : undefined}><Icon name={l.icon} />{m.nav[l.key]}</a>
  {/each}
  <div class="foot"><HouseActions stacked /></div>
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
    font-weight: 700;
    letter-spacing: -0.01em;
    padding: 0 10px 14px;
  }
  a {
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
  .foot {
    margin-top: auto;
  }
</style>
