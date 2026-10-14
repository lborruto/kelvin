<script lang="ts">
  import type { Status } from '$lib/api/types';
  import { fmtAgo } from '$lib/format';
  import Icon from './Icon.svelte';

  interface Props {
    connection: 'connecting' | 'open' | 'reconnecting';
    status: Status;
    now: number;
  }
  let { connection, status, now }: Props = $props();
  let rejected = $derived(connection === 'open' && !!status.auth_rejected);
  let message = $derived.by(() => {
    if (connection === 'reconnecting') return 'Reconnexion à Kelvin…';
    if (rejected) return 'Mot de passe Cozytouch modifié : reconnectez-vous';
    if (connection === 'open' && !status.connected) {
      const age = status.last_ok_at ? ` — données ${fmtAgo(status.last_ok_at * 1000, now)}` : '';
      return `Cozytouch injoignable${age}`;
    }
    return '';
  });
</script>

<div class="banner" class:empty={!message} role="status">
  {#if message}<Icon name="alert" size={16} />{message}{#if rejected}<a href="/login?reauth=1">Se reconnecter</a>{/if}{/if}
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: color-mix(in srgb, var(--bad) 14%, var(--s1));
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  a {
    margin-left: auto;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    color: var(--tx);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .empty {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    border: 0;
    white-space: nowrap;
  }
</style>
