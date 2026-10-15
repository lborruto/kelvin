<!-- Maison › Compte (UX batch 8: account, server, Cozytouch connection and signed-in devices moved from the
     Maison page). The future « Accès MCP » panel goes after « Appareils connectés », before « Se déconnecter ». -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import SessionsPanel from '$lib/components/SessionsPanel.svelte';
  import SupportChip from '$lib/components/SupportChip.svelte';
  import { fmtAgo } from '$lib/format';
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

<PageHeader title={m.account.title} back={{ href: ROUTES.home, label: m.nav.home }} />
<section class="panel">
  <dl>
    <div class="item"><dt>{m.account.email}</dt><dd>{auth.email ?? '—'}</dd></div>
    <div class="item"><dt>{m.settings.server}</dt><dd>{auth.server?.name ?? '—'}{#if auth.server?.tier === 'experimental'} <SupportChip support="experimental" />{/if}</dd></div>
    <div class="item">
      <dt>Cozytouch</dt>
      <dd>
        <span>{house.status.connected ? m.settings.connected : m.settings.unreachable}</span>
        {#if house.status.last_ok_at}<span class="muted"> · {m.settings.lastSync(fmtAgo(house.status.last_ok_at * 1000, now))}</span>{/if}
        {#if house.status.last_error}<div class="muted small" title={house.status.last_error}>{statusError(house.status)}</div>{/if}
      </dd>
    </div>
  </dl>
</section>
<section id={ANCHORS.sessions} class="panel">
  <h2>{m.sessions.title}</h2>
  <SessionsPanel />
</section>
<button type="button" class="btn" aria-disabled={loggingOut} onclick={logout}>{m.settings.signOut}</button>

<style>
  .panel {
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    max-width: 720px;
    margin-bottom: 14px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--mu);
  }
  dl {
    display: grid;
    gap: 6px;
    margin: 0;
    font-size: 13px;
  }
  .item {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 4px 14px;
    min-height: 44px;
  }
  dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .small {
    font-size: 12px;
  }
</style>
