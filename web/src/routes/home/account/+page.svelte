<!-- Réglages › Compte (Tableau §4, mockups 5 « Compte »): the home's Cozytouch account (email, server, the
     connection's SourceLine; the server is fixed at the first login), the signed-in devices (#sessions), then
     « Accès MCP » (#mcp, Plan 13), and « Se déconnecter » last. Wide: two columns (the account and its devices
     on the left with « Se déconnecter » under them, Accès MCP on the right); phone: one column in that order.
     Each part arrives below or beside what is already placed, so nothing on screen moves. -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import CozytouchStatus from '$lib/components/CozytouchStatus.svelte';
  import McpPanel from '$lib/components/McpPanel.svelte';
  import SessionsPanel from '$lib/components/SessionsPanel.svelte';
  import SupportChip from '$lib/components/SupportChip.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
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

  // « Accès MCP » appears once the devices are known and « Se déconnecter » once its tokens are.
  let sessionsReady = $state(false);
  let mcpReady = $state(false);
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

<SettingsHeader back bare title={m.account.title} vt="home-account" />

<div class="cols">
  <section class="acct" aria-labelledby="account-cozy">
    <h2 id="account-cozy" class="grph">{m.account.cozytouch}</h2>
    <dl class="grp">
      <div class="li"><dt>{m.account.email}</dt><dd class="strong">{auth.email ?? '—'}</dd></div>
      <div class="li">
        <dt>{m.settings.server}</dt>
        <dd class="strong">{auth.server?.name ?? '—'}{#if auth.server?.tier === 'experimental'} <SupportChip support="experimental" />{/if}</dd>
      </div>
      <div class="li">
        <dt>{m.account.connection}</dt>
        <dd class="conn">
          <CozytouchStatus {now} />
          {#if house.status.last_error}<span class="err" title={house.status.last_error}>{statusError(house.status)}</span>{/if}
        </dd>
      </div>
    </dl>
    <p class="note">{m.account.serverNote}</p>
  </section>

  <section id={ANCHORS.sessions} class="sess" aria-labelledby="account-sessions">
    <h2 id="account-sessions" class="grph">{m.sessions.title}</h2>
    <div class="grp"><SessionsPanel bind:ready={sessionsReady} /></div>
    <p class="note">{m.sessions.intro}</p>
  </section>

  {#if sessionsReady}
    <section id={ANCHORS.mcp} class="mcp" aria-labelledby="account-mcp">
      <h2 id="account-mcp" class="grph">{m.mcp.title}</h2>
      <div class="grp"><McpPanel bind:ready={mcpReady} /></div>
    </section>
  {/if}

  {#if sessionsReady && mcpReady}
    <div class="out">
      <button type="button" class="btn" aria-disabled={loggingOut} onclick={logout}>{m.settings.signOut}</button>
    </div>
  {/if}
</div>

<style>
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'acct' 'sess' 'mcp' 'out';
    align-items: start;
    gap: 0 24px;
    max-width: 1160px;
  }
  .acct {
    grid-area: acct;
  }
  .sess {
    grid-area: sess;
  }
  .mcp {
    grid-area: mcp;
  }
  .out {
    grid-area: out;
    margin-top: 20px;
  }
  section {
    min-width: 0;
  }
  .grph {
    margin-top: 6px;
  }
  section + section .grph,
  .mcp .grph {
    margin-top: 18px;
  }
  dl {
    margin: 0;
  }
  .li {
    justify-content: space-between;
    gap: 4px 16px;
    flex-wrap: wrap;
    padding: 6px 0;
  }
  dt {
    color: var(--mu);
  }
  dd {
    margin: 0;
    min-width: 0;
    text-align: right;
  }
  .strong {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .conn {
    display: grid;
    justify-items: end;
    gap: 2px;
  }
  .err {
    font-size: 12px;
    color: var(--mu);
  }
  .note {
    margin: 6px 16px 0;
  }
  @media (min-width: 1024px) {
    .cols {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas: 'acct mcp' 'sess mcp' 'out mcp';
      grid-template-rows: auto auto 1fr;
    }
    .mcp .grph {
      margin-top: 6px;
    }
  }
</style>
