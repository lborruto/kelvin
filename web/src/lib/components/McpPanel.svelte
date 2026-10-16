<!-- Maison › Compte › Accès MCP (Plan 13, spec MCP §5.4): read-only tokens for an AI assistant. A token's
     secret is shown once, in the creation dialog, with the Claude Code and Claude Desktop snippets; the list
     shows name, hint, created and last call, revoke in the row's « ⋯ » menu after a confirmation; the
     recent calls sit in a Disclosure (L2). -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { McpAuditRow, McpCreated, McpToken, McpTokenList } from '$lib/api/types';
  import { fmtAgo, fmtDateTime } from '$lib/format';
  import { errorText, m } from '$lib/i18n';
  import { claudeCodeSnippet, claudeDesktopSnippet, endpointUrl } from '$lib/mcp';
  import { toasts } from '$lib/stores/toasts.svelte';
  import Disclosure from './Disclosure.svelte';
  import Menu from './Menu.svelte';

  interface Props {
    /** True once the tokens (or their error) are known: what follows waits for it (CLS). */
    ready?: boolean;
  }
  let { ready = $bindable(false) }: Props = $props();
  const uid = $props.id();
  let list = $state<McpTokenList | null>(null);
  let calls = $state<McpAuditRow[]>([]);
  let failed = $state(false);
  let busy = $state(false);
  let name = $state('');
  let created = $state<McpCreated | null>(null);
  let target = $state<McpToken | null>(null);
  let copied = $state<string | null>(null);
  let reveal = $state<HTMLDialogElement>();
  let confirm = $state<HTMLDialogElement>();
  let cancel = $state<HTMLButtonElement>();
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  async function load() {
    failed = false;
    try {
      [list, calls] = await Promise.all([api.mcpTokens(), api.mcpAudit(10)]);
    } catch {
      failed = true;
    }
  }
  $effect(() => {
    load();
  });
  $effect(() => {
    ready = list !== null || failed;
  });

  let url = $derived(list ? endpointUrl(location.origin, list.endpoint_path) : '');

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    try {
      created = await api.createMcpToken(name.trim() || m.mcp.defaultName);
      name = '';
      copied = null;
      reveal?.showModal();
      await load();
    } catch (err) {
      toasts.push(() => errorText(err));
    } finally {
      busy = false;
    }
  }

  function closeReveal() {
    reveal?.close();
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
    } catch {
      copied = null;
    }
  }

  function ask(t: McpToken) {
    if (busy) return;
    target = t;
    confirm?.showModal();
    cancel?.focus(); // the safe choice takes focus
  }

  async function revoke() {
    const t = target;
    confirm?.close();
    if (!t) return;
    busy = true;
    try {
      await api.revokeMcpToken(t.id);
      toasts.push(() => m.mcp.revokedToast, 'info');
      await load();
    } catch (err) {
      toasts.push(() => errorText(err));
    } finally {
      busy = false;
    }
  }
</script>

<p class="muted intro">{m.mcp.intro}</p>
{#if list === null && !failed}
  <div class="sk" aria-hidden="true">
    <span class="skeleton inset row-sk"></span>
    <span class="skeleton inset form-sk"></span>
  </div>
{:else if failed && list === null}
  <p class="error" role="alert">{m.mcp.loadError} <button type="button" class="btn btn-sm" onclick={load}>{m.mcp.retry}</button></p>
{:else if list && !list.enabled}
  <p class="muted small">{m.mcp.disabled}</p>
{:else if list}
  {#if list.tokens.length === 0}
    <p class="muted small empty">{m.mcp.empty}</p>
  {:else}
    <ul class="list" aria-label={m.mcp.title}>
      {#each list.tokens as t (t.id)}
        <li class="row" class:revoked={t.revoked_at !== null}>
          <div class="who">
            <span class="name">{t.name} <span class="hint num">{m.mcp.hint(t.hint)}</span></span>
            <span class="muted small">
              {m.mcp.created(fmtDateTime(t.created * 1000))} ·
              {#if t.revoked_at !== null}
                {m.mcp.revokedOn(fmtDateTime(t.revoked_at * 1000))}
              {:else}
                {t.last_used === null ? m.mcp.neverUsed : m.mcp.lastUsed(fmtAgo(t.last_used * 1000, now))}
              {/if}
            </span>
          </div>
          {#if t.revoked_at === null}
            <Menu label={m.mcp.actionsFor(t.name)} items={[{ label: m.mcp.revoke, icon: 'x', danger: true, onselect: () => ask(t) }]} />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <form class="create" onsubmit={create}>
    <label for="{uid}-name" class="small muted">{m.mcp.nameLabel}</label>
    <div class="line">
      <input id="{uid}-name" class="w-text" bind:value={name} maxlength="40" placeholder={m.mcp.defaultName} autocomplete="off" />
      <button type="submit" class="btn" aria-disabled={busy} aria-busy={busy}>{m.mcp.create}</button>
    </div>
  </form>
  <Disclosure title={m.mcp.recent} meta={calls.length ? m.mcp.recentMeta(calls.length) : undefined} detail>
    {#if calls.length === 0}
      <p class="muted small">{m.mcp.noCalls}</p>
    {:else}
      <ul class="calls">
        {#each calls as row, i (i)}
          <li>
            <span class="num call">{row.name}</span>
            <span class="muted small">{[row.token_name ?? m.mcp.unknownToken, m.mcp.outcome[row.outcome], row.count > 1 ? m.mcp.times(row.count) : null, fmtAgo(row.at * 1000, now)].filter(Boolean).join(' · ')}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </Disclosure>
{/if}

<dialog bind:this={reveal} class="wide" aria-labelledby="{uid}-rt" onclose={() => (created = null)}>
  {#if created}
    <h2 id="{uid}-rt">{m.mcp.secretTitle}</h2>
    <p>{m.mcp.secretOnce}</p>
    <div class="snip">
      <code class="num secret">{created.secret}</code>
      <button type="button" class="btn btn-sm" aria-label={m.mcp.copyLabel(m.mcp.secretLabel)}
        onclick={() => copy('secret', created!.secret)}>{copied === 'secret' ? m.mcp.copied : m.mcp.copy}</button>
    </div>
    <h3>{m.mcp.claudeCode}</h3>
    <div class="snip">
      <pre class="num">{claudeCodeSnippet(url, created.secret)}</pre>
      <button type="button" class="btn btn-sm" aria-label={m.mcp.copyLabel(m.mcp.claudeCode)}
        onclick={() => copy('code', claudeCodeSnippet(url, created!.secret))}>{copied === 'code' ? m.mcp.copied : m.mcp.copy}</button>
    </div>
    <h3>{m.mcp.claudeDesktop}</h3>
    <div class="snip">
      <pre class="num">{claudeDesktopSnippet(url, created.secret)}</pre>
      <button type="button" class="btn btn-sm" aria-label={m.mcp.copyLabel(m.mcp.claudeDesktop)}
        onclick={() => copy('desktop', claudeDesktopSnippet(url, created!.secret))}>{copied === 'desktop' ? m.mcp.copied : m.mcp.copy}</button>
    </div>
    <div class="actions">
      <button type="button" class="btn btn-primary" onclick={closeReveal}>{m.mcp.done}</button>
    </div>
  {/if}
</dialog>

<dialog bind:this={confirm} aria-labelledby="{uid}-ct" aria-describedby="{uid}-cb" onclose={() => (target = null)}>
  <h2 id="{uid}-ct">{m.mcp.confirmTitle(target?.name ?? '')}</h2>
  <p id="{uid}-cb">{m.mcp.confirmBody}</p>
  <div class="actions">
    <button type="button" class="btn" bind:this={cancel} onclick={() => confirm?.close()}>{m.common.cancel}</button>
    <button type="button" class="btn btn-danger" onclick={revoke}>{m.mcp.revoke}</button>
  </div>
</dialog>

<style>
  .intro {
    margin: 0 0 8px;
    font-size: 13px;
  }
  .small {
    font-size: 12px;
  }
  .empty {
    margin: 0;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 56px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
  }
  .row:first-child {
    border-top: 0;
  }
  .who {
    display: grid;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .revoked .name {
    color: var(--mu);
  }
  .hint {
    font-weight: 400;
    font-size: 12px;
    color: var(--mu);
  }
  /* The skeleton: one token row and the create line (what an empty first load becomes, roughly). */
  .sk {
    display: grid;
    gap: 8px;
  }
  .row-sk {
    display: block;
    height: 56px;
  }
  .form-sk {
    display: block;
    height: 58px;
  }
  .create {
    display: grid;
    gap: 4px;
    margin: 10px 0 6px;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .line input {
    min-width: 0;
    max-width: 100%;
  }
  .calls {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .calls li {
    display: flex;
    flex-wrap: wrap;
    column-gap: 8px;
    min-width: 0;
  }
  .call {
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .error {
    color: var(--bad);
  }
  /* The same dialog as « Tout éteindre » (DESIGN: Dialog); the token's is wider for the snippets. */
  dialog {
    background: var(--s1);
    color: var(--tx);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 20px;
    width: min(340px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    overflow: auto;
    opacity: 0;
    transform: translateY(8px) scale(0.98);
    transition:
      opacity var(--t-exit) var(--ease-in),
      transform var(--t-exit) var(--ease-in),
      overlay var(--t-exit) allow-discrete,
      display var(--t-exit) allow-discrete;
  }
  dialog.wide {
    width: min(560px, calc(100vw - 32px));
  }
  dialog[open] {
    opacity: 1;
    transform: none;
    transition-duration: 200ms;
    transition-timing-function: var(--ease-out);
  }
  @starting-style {
    dialog[open] {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
  }
  dialog::backdrop {
    background: transparent;
    transition:
      background-color var(--t-exit) ease,
      overlay var(--t-exit) allow-discrete,
      display var(--t-exit) allow-discrete;
  }
  dialog[open]::backdrop {
    background: color-mix(in srgb, var(--bg) 72%, transparent);
  }
  @starting-style {
    dialog[open]::backdrop {
      background: transparent;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    dialog,
    dialog[open] {
      transform: none;
    }
  }
  dialog h2 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
  }
  dialog h3 {
    margin: 14px 0 6px;
    font-size: 13px;
    font-weight: 600;
  }
  dialog p {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--mu);
  }
  .snip {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }
  .snip code,
  .snip pre {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--s2);
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .secret {
    font-weight: 600;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 16px;
  }
</style>
