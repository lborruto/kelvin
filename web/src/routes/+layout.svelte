<script lang="ts">
  import '../app.css';
  import onestLatin from '@fontsource-variable/onest/files/onest-latin-wght-normal.woff2?url';
  import { pwaInfo } from 'virtual:pwa-info';
  import { afterNavigate, goto, onNavigate } from '$app/navigation';
  import { navigating, page } from '$app/state';
  import { setLoginRequiredHandler } from '$lib/api/client';
  import { loginHref } from '$lib/auth';
  import Banner from '$lib/components/Banner.svelte';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import TabBar from '$lib/components/TabBar.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import { reducedMotion } from '$lib/motion';
  import { announcer } from '$lib/stores/announcer.svelte';
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

  // The static first-paint shell in app.html (a fixed overlay, so removing it moves nothing).
  $effect(() => {
    document.getElementById('kv-shell')?.remove();
  });

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

  // Page changes cross-fade under a still sidebar, tab bar and banner (view-transition names below).
  onNavigate((navigation) => {
    if (!document.startViewTransition || reducedMotion()) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  // SvelteKit leaves focus on <body> after a navigation: start keyboard users at the new page's
  // title instead of the top of the sidebar. A link that kept focus (a room card) keeps it.
  afterNavigate(({ type, to }) => {
    if (type === 'enter' || to?.url.hash) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (!h1) return;
    h1.tabIndex = -1;
    h1.focus({ preventScroll: true });
  });

  // A route chunk on a slow network: a thin bar after 150 ms, so a fast navigation shows nothing.
  let loadingRoute = $state(false);
  $effect(() => {
    if (!navigating.to) return;
    const t = setTimeout(() => (loadingRoute = true), 150);
    return () => {
      clearTimeout(t);
      loadingRoute = false;
    };
  });
</script>

<svelte:head>
  <link rel="preload" as="font" type="font/woff2" href={onestLatin} crossorigin="anonymous" />
  {@html manifestLink}
</svelte:head>

{#if bare}
  {@render children()}
{:else}
  <a class="skip" href="#contenu">Aller au contenu</a>
  {#if loadingRoute}<div class="progress" aria-hidden="true"></div>{/if}
  <div class="app">
    <div class="side"><Sidebar /></div>
    <div class="main">
      <Banner connection={house.connection} status={house.status} {now} />
      <main id="contenu" tabindex="-1">{@render children()}</main>
    </div>
  </div>
  <div class="tabs"><TabBar /></div>
{/if}
<Toasts />
<div class="visually-hidden" role="status" aria-live="polite">{announcer.polite}</div>
<div class="visually-hidden" aria-live="assertive">{announcer.assertive}</div>

<style>
  .app {
    display: grid;
    grid-template-columns: 1fr;
    min-height: 100dvh;
  }
  .side {
    display: none;
    view-transition-name: sidebar;
  }
  .tabs {
    view-transition-name: tabbar;
  }
  main {
    padding: 16px 16px calc(88px + env(safe-area-inset-bottom));
    max-width: 1280px;
    min-width: 0;
  }
  main:focus {
    outline: none;
  }
  .skip {
    position: fixed;
    top: 8px;
    left: 8px;
    z-index: 50;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border-radius: var(--radius);
    background: var(--tx);
    color: var(--bg);
    font-weight: 600;
    text-decoration: none;
    transform: translateY(-200%);
  }
  .skip:focus-visible {
    transform: none;
  }
  .progress {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    z-index: 40;
    overflow: hidden;
    view-transition-name: progress;
  }
  .progress::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--tx);
    transform-origin: left;
    animation: progress 1.6s var(--ease-out) infinite;
  }
  @keyframes progress {
    from {
      transform: translateX(-100%) scaleX(0.4);
    }
    to {
      transform: translateX(100%) scaleX(0.4);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .progress::after {
      animation: none;
      opacity: 0.6;
    }
  }
  @media (min-width: 1024px) {
    .app {
      grid-template-columns: 232px minmax(0, 1fr);
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
    .progress {
      left: 232px;
    }
  }
</style>
