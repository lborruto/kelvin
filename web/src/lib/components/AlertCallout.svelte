<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { Alert } from '$lib/api/types';
  import { alertText } from '$lib/alerts-text';
  import { m } from '$lib/i18n';
  import { dur, T } from '$lib/motion';
  import { alerts } from '$lib/stores/alerts.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    alert: Alert;
  }
  let { alert }: Props = $props();
  let t = $derived(alertText(alert));
</script>

{#if t}
  <div class="callout {alert.severity}" role={alert.severity === 'bad' ? 'alert' : 'status'} out:fade|global={{ duration: dur(T.exit) }}>
    <Icon name="alert" size={14} />
    <p>{t.text}{#if t.link}&nbsp;<a href={t.link.href} rel={t.link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
          target={t.link.href.startsWith('http') ? '_blank' : undefined}>{t.link.label}</a>{/if}</p>
    <button type="button" class="btn btn-icon" aria-label={m.alerts.dismissLabel(t.text)} onclick={() => alerts.dismiss(alert.id)}>
      <Icon name="x" size={16} />
    </button>
  </div>
{/if}

<style>
  .callout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px;
    padding: 8px 4px 8px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--s1);
    font-size: 13px;
  }
  .callout :global(svg:first-child) {
    margin-top: 3px;
    color: var(--mu);
  }
  .callout.bad {
    border-color: color-mix(in srgb, var(--bad) 60%, var(--line));
    background: color-mix(in srgb, var(--bad) 8%, var(--s1));
  }
  .callout.bad :global(svg:first-child) {
    color: var(--bad);
  }
  p {
    margin: 0;
    padding-top: 1px;
    overflow-wrap: anywhere;
  }
  a {
    text-decoration: underline;
  }
  .btn-icon {
    margin: -6px 0;
  }
</style>
