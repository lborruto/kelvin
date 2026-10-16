<!-- Maison › Compte (direction-2 §3, UX batch 9): the home's Cozytouch account (email, server, the connection's
     SourceLine), the signed-in devices (#sessions), then « Se déconnecter » last, on its own.
     The future « Accès MCP » panel takes its place after « Appareils connectés », before « Se déconnecter ». -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import CozytouchStatus from '$lib/components/CozytouchStatus.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SessionsPanel from '$lib/components/SessionsPanel.svelte';
  import SupportChip from '$lib/components/SupportChip.svelte';
  import { m, statusError } from '$lib/i18n';
  import { ANCHORS, ROUTES } from '$lib/paths';
  import { auth } from '$lib/stores/auth.svelte';
  import { house } from '$lib/stores/house.svelte';
  import { toasts } from '$lib/stores/toasts.svelte';

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });

  let loggingOut = $state(false);
  async function logout() {
    if (loggingOut) return;
    loggingOut = true;
    try {
      await auth.logout();
    } catch {
      toasts.push(() => m.home.logoutFailed);
      return;
    } finally {
      loggingOut = false;
    }
    await goto(ROUTES.login, { replaceState: true });
  }
</script>

<svelte:head><title>{m.page.title(m.account.title)}</title></svelte:head>

<div class="vt">
  <PageHeader title={m.account.title} back={{ href: ROUTES.home, label: m.nav.home }} />
</div>

<div class="page">
  <section class="panel" aria-labelledby="account-cozy">
    <h2 id="account-cozy" class="sl">{m.account.cozytouch}</h2>
    <dl>
      <div class="r"><dt>{m.account.email}</dt><dd class="email">{auth.email ?? '—'}</dd></div>
      <div class="r">
        <dt>{m.settings.server}</dt>
        <dd>
          <span class="srv">{auth.server?.name ?? '—'}{#if auth.server?.tier === 'experimental'} <SupportChip support="experimental" />{/if}</span>
          <span class="note">{m.account.serverNote}</span>
        </dd>
      </div>
      <div class="r">
        <dt>{m.account.connection}</dt>
        <dd>
          <CozytouchStatus {now} />
          {#if house.status.last_error}<span class="note" title={house.status.last_error}>{statusError(house.status)}</span>{/if}
        </dd>
      </div>
    </dl>
  </section>

  <section id={ANCHORS.sessions} class="panel" aria-labelledby="account-sessions">
    <h2 id="account-sessions" class="sl">{m.sessions.title}</h2>
    <SessionsPanel />
  </section>

  <div class="out">
    <button type="button" class="btn" aria-disabled={loggingOut} onclick={logout}>{m.settings.signOut}</button>
  </div>
</div>

<style>
  .vt :global(h1) {
    view-transition-name: home-account;
  }
  .page {
    display: grid;
    gap: 14px;
    max-width: 720px;
    min-width: 0;
  }
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    min-width: 0;
  }
  .sl {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mu);
  }
  dl {
    margin: 0;
    font-size: 13px;
  }
  .r {
    display: grid;
    grid-template-columns: minmax(6rem, max-content) minmax(0, 1fr);
    align-items: center;
    gap: 4px 16px;
    min-height: 44px;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }
  .r:last-child {
    border-bottom: 0;
  }
  dt {
    color: var(--mu);
  }
  dd {
    display: grid;
    justify-items: end;
    gap: 2px;
    margin: 0;
    min-width: 0;
    text-align: right;
  }
  .email,
  .srv {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .note {
    font-size: 12px;
    color: var(--mu);
  }
  @media (max-width: 479px) {
    .r {
      grid-template-columns: minmax(0, 1fr);
    }
    dd {
      justify-items: start;
      text-align: left;
    }
  }
</style>
