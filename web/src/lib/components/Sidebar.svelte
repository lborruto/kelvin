<script lang="ts">
  import { page } from '$app/state';
  import HouseActions from './HouseActions.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  const links: { href: string; label: string; icon: IconName }[] = [
    { href: '/', label: 'Pièces', icon: 'rooms' },
    { href: '/programme', label: 'Programme', icon: 'program' },
    { href: '/energie', label: 'Énergie', icon: 'energy' },
    { href: '/maison', label: 'Maison', icon: 'house' }
  ];
  const active = (href: string) =>
    href === '/' ? page.url.pathname === '/' || page.url.pathname.startsWith('/pieces') : page.url.pathname.startsWith(href);
</script>

<nav class="sidebar" aria-label="Navigation principale">
  <div class="brand">Kelvin</div>
  {#each links as l (l.href)}
    <a href={l.href} aria-current={active(l.href) ? 'page' : undefined}><Icon name={l.icon} />{l.label}</a>
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
    border-radius: 8px;
    color: var(--mu);
    text-decoration: none;
    font-weight: 500;
  }
  a[aria-current='page'] {
    background: var(--s1);
    color: var(--tx);
  }
  .foot {
    margin-top: auto;
  }
</style>
