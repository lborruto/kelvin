<!-- Réglages › Compte (Tableau §4, mockups 5 « Compte »): the home's Cozytouch account (email, server, the
     connection's SourceLine; the server is fixed at the first login), the signed-in devices (#sessions), then
     « Accès MCP » (#mcp, Plan 13), and « Se déconnecter » last. Wide: two columns (the account and its devices
     on the left with « Se déconnecter » under them, Accès MCP on the right); phone: one column in that order.
     Each part arrives below or beside what is already placed, so nothing on screen moves. -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import CozytouchStatus from '$lib/components/CozytouchStatus.svelte';
  import GroupedList from '$lib/components/GroupedList.svelte';
  import McpPanel from '$lib/components/McpPanel.svelte';
  import SessionsPanel from '$lib/components/SessionsPanel.svelte';
  import SupportChip from '$lib/components/SupportChip.svelte';
  import SettingsHeader from '$lib/components/settings/SettingsHeader.svelte';
  import { m, statusError } from '$lib/i18n';
  import { desktop } from '$lib/media.svelte';
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
  <div class="left">
  <section class="acct">
    <GroupedList label={m.account.cozytouch} id="account-cozy" level="h2" tag="dl">
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
    </GroupedList>
    <p class="note">{m.account.serverNote}</p>
  </section>

  <section id={ANCHORS.sessions} class="sess" aria-labelledby="account-sessions">
    <h2 id="account-sessions" class="grph">{m.sessions.title}</h2>
    <!-- The lead sits above the list: nothing under the list moves when it arrives. -->
    <p class="note lead">{m.sessions.intro}</p>
    <GroupedList><SessionsPanel bind:ready={sessionsReady} /></GroupedList>
  </section>

  {#if sessionsReady && mcpReady && desktop.matches}{@render signOut()}{/if}
  </div>

  {#if sessionsReady}
    <section id={ANCHORS.mcp} class="mcp">
      <GroupedList label={m.mcp.title} id="account-mcp" level="h2"><McpPanel bind:ready={mcpReady} /></GroupedList>
    </section>
  {/if}
  {#if sessionsReady && mcpReady && !desktop.matches}{@render signOut()}{/if}
</div>

<!-- « Se déconnecter »: under the devices on a wide screen, last of all on a phone (one place in the DOM each). -->
{#snippet signOut()}
    <div class="out">
      <button type="button" class="btn" aria-disabled={loggingOut} onclick={logout}>{m.settings.signOut}</button>
    </div>
{/snippet}

<style>
  /* Phone: one column, « Se déconnecter » last (after Accès MCP). Wide: the account and its devices on the left
     with « Se déconnecter » under them, Accès MCP on the right; neither column moves the other. */
  .cols {
    display: flex;
    flex-direction: column;
    max-width: 1160px;
  }
  .left {
    display: contents;
  }
  .out {
    margin-top: 20px;
  }
  section {
    min-width: 0;
  }
  .acct > :global(.grph) {
    margin-top: 6px;
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
  .note.lead {
    margin: -2px 16px 8px;
  }
  /* A narrow phone: label over value, so a value arriving late (the email, the source line) never rewraps its row. */
  @media (max-width: 479px) {
    .li {
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 0;
      min-height: 60px;
    }
    dd,
    .conn {
      text-align: left;
      justify-items: start;
    }
  }
  @media (min-width: 1024px) {
    .cols {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: start;
      gap: 24px;
    }
    .left {
      display: block;
      min-width: 0;
    }
    .mcp > :global(.grph) {
      margin-top: 6px;
    }
  }
</style>
