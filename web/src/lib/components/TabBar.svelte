<script lang="ts">
  import { page } from '$app/state';
  import { isActive, NAV, type NavKey } from '$lib/paths';
  import Icon from './Icon.svelte';

  const LABEL: Record<NavKey, string> = { rooms: 'Pièces', schedule: 'Programme', energy: 'Énergie', home: 'Maison' };
</script>

<nav class="tabbar" aria-label="Navigation principale">
  {#each NAV as t (t.href)}
    <a href={t.href} aria-current={isActive(page.url.pathname, t.href) ? 'page' : undefined}><Icon name={t.icon} size={20} /><span>{LABEL[t.key]}</span></a>
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
</style>
