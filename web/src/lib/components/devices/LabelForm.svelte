<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { m } from '$lib/i18n';
  import { labelProblem, problemText } from '$lib/setup';

  interface Props {
    /** The field's caption, also its accessible name. */
    name: string;
    initial?: string;
    kind: 'room' | 'device';
    existing?: string[];
    submitText: string;
    busy?: boolean;
    /** May return the write's promise: the form waits for it before it can send again. */
    onsubmit: (value: string) => unknown;
    oncancel?: () => void;
  }
  let { name, initial = '', kind, existing = [], submitText, busy = false, onsubmit, oncancel }: Props = $props();
  const uid = $props.id();
  let value = $state(untrack(() => initial));
  let touched = $state(false);
  let submitting = $state(false);
  let input = $state<HTMLInputElement>();
  let problem = $derived(labelProblem(value, { kind, existing }));
  let showProblem = $derived(touched && problem !== null);

  onMount(() => input?.focus());

  function submit(e: SubmitEvent): void {
    e.preventDefault();
    touched = true;
    if (busy || submitting) return;
    if (problem !== null) {
      input?.focus();
      return;
    }
    const sent = onsubmit(value.normalize('NFC').trim());
    if (sent instanceof Promise) {
      submitting = true;
      void sent.finally(() => (submitting = false));
    }
  }
</script>

<form class="label-form" onsubmit={submit} novalidate>
  <label class="field" for="{uid}-input">
    <span>{name}</span>
    <input
      id="{uid}-input"
      bind:this={input}
      bind:value
      autocomplete="off"
      aria-invalid={showProblem}
      aria-describedby={showProblem ? `${uid}-problem` : undefined}
      oninput={() => (touched = true)}
    />
  </label>
  <div class="buttons">
    <button type="submit" class="btn btn-sm btn-primary" aria-disabled={busy || submitting}>{submitText}</button>
    {#if oncancel}<button type="button" class="btn btn-sm btn-ghost" onclick={oncancel}>{m.common.cancel}</button>{/if}
  </div>
  {#if showProblem && problem !== null}<p class="problem" id="{uid}-problem">{problemText(problem)}</p>{/if}
</form>

<style>
  .label-form {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 8px 10px;
    width: 100%;
    margin-top: 8px;
  }
  .field {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--mu);
    flex: 1 1 200px;
    min-width: 0;
  }
  input {
    min-height: 44px;
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    font-size: 15px;
    color: var(--tx);
    background: var(--s2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0 12px;
  }
  input[aria-invalid='true'] {
    border-color: color-mix(in srgb, var(--bad) 60%, var(--line));
  }
  .buttons {
    display: flex;
    gap: 8px;
  }
  .problem {
    flex-basis: 100%;
    margin: 0;
    font-size: 12px;
  }
</style>
