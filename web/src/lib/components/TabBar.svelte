<script lang="ts">
  import { page } from '$app/state';
  import Icon, { type IconName } from './Icon.svelte';

  const tabs: { href: string; label: string; icon: IconName }[] = [
    { href: '/', label: 'Pièces', icon: 'rooms' },
    { href: '/programme', label: 'Programme', icon: 'program' },
    { href: '/energie', label: 'Énergie', icon: 'energy' },
    { href: '/maison', label: 'Maison', icon: 'house' }
  ];
  const active = (href: string) =>
    href === '/' ? page.url.pathname === '/' || page.url.pathname.startsWith('/pieces') : page.url.pathname.startsWith(href);
</script>

<nav class="tabbar" aria-label="Navigation principale">
  {#each tabs as t (t.href)}
    <a href={t.href} aria-current={active(t.href) ? 'page' : undefined}><Icon name={t.icon} size={20} /><span>{t.label}</span></a>
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
  a {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 8px 0 6px;
    min-height: 56px;
    color: var(--fa);
    text-decoration: none;
    font-size: 11px;
    font-weight: 600;
  }
  a[aria-current='page'] {
    color: var(--tx);
  }
</style>
