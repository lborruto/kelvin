<script lang="ts">
  import '../app.css';
  import { pwaInfo } from 'virtual:pwa-info';
  import { goto, onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { setLoginRequiredHandler } from '$lib/api/client';
  import { loginHref } from '$lib/auth';
  import Banner from '$lib/components/Banner.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TabBar from '$lib/components/TabBar.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import { auth } from '$lib/stores/auth.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { connectStream } from '$lib/stores/stream';

  let { children } = $props();
  let now = $state(Date.now());
  let manifestLink = $derived(pwaInfo ? pwaInfo.webManifest.linkTag : '');
  /** The login screen stands alone: no shell, no stream. */
  let bare = $derived(page.url.pathname === '/login');

  function toLogin() {
    auth.clearSession();
    if (page.url.pathname !== '/login') void goto(loginHref(page.url), { replaceState: true });
  }

  $effect(() => {
    if (!pwaInfo) return;
    import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  });

  $effect(() => {
    setLoginRequiredHandler(toLogin);
    return () => setLoginRequiredHandler(null);
  });

  $effect(() => {
    if (bare) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    // false → the login screen; null (Kelvin unreachable) → the offline shell and its banner.
    void auth.refresh().then((ok) => {
      if (cancelled) return;
      if (ok === false) return toLogin();
      stop = connectStream(house, {
        onError: () =>
          void auth.refresh().then((still) => {
            if (still === false) toLogin();
          })
      });
    });
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => {
      cancelled = true;
      stop?.();
      clearInterval(t);
    };
  });

  onNavigate((navigation) => {
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<svelte:head>{@html manifestLink}</svelte:head>

{#if bare}
  {@render children()}
{:else}
  <div class="app">
    <div class="side"><Sidebar /></div>
    <div class="main">
      <Banner connection={house.connection} status={house.status} {now} />
      <main>{@render children()}</main>
    </div>
  </div>
  <div class="tabs"><TabBar /></div>
{/if}
<Toasts />

<style>
  .app {
    display: grid;
    grid-template-columns: 1fr;
    min-height: 100dvh;
  }
  .side {
    display: none;
  }
  main {
    padding: 16px 16px calc(88px + env(safe-area-inset-bottom));
    max-width: 1280px;
  }
  @media (min-width: 1024px) {
    .app {
      grid-template-columns: 232px 1fr;
    }
    .side {
      display: block;
    }
    .tabs {
      display: none;
    }
    main {
      padding: 24px 28px;
    }
  }
</style>
