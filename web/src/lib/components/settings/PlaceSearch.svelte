<!-- Réglages › Météo's town search (Plan 14, spec §7.1, §7.7): the APG « combobox with listbox popup ». An input
     at --ctl-h; from 2 characters and 350 ms after the last keystroke it asks the geocoder (a stale answer is
     dropped); results « Lyon · Rhône · 173 m » in a listbox absolutely positioned under the field (nothing below
     moves), at most 8 rows of 44 px. ArrowDown / ArrowUp move the active option (wrapping), Enter picks it, Escape
     closes then clears, Tab closes; a pointer press picks. A polite live region says how many places came back;
     an error sits under the field, tied to it by aria-describedby. -->
<script lang="ts">
  import { api } from '$lib/api/client';
  import type { WeatherPlace } from '$lib/api/types';
  import { errorText, m } from '$lib/i18n';
  import { placeLine } from '$lib/weather';

  interface Props {
    onpick: (p: WeatherPlace) => void;
    lang: 'fr' | 'en';
    /** The geocoder (tests inject one). */
    search?: (q: string, lang: 'fr' | 'en') => Promise<{ results: WeatherPlace[] }>;
    /** Focus the field when it appears (« Changer de lieu »). */
    autofocus?: boolean;
  }
  let { onpick, lang, search = api.weatherSearch, autofocus = false }: Props = $props();
  const uid = $props.id();
  const inputId = `${uid}-q`;
  const listId = `${uid}-list`;
  const errId = `${uid}-err`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const MIN = 2;
  const DEBOUNCE_MS = 350;
  const MAX = 8;

  let text = $state('');
  let results = $state<WeatherPlace[]>([]);
  let open = $state(false);
  let active = $state(-1);
  let announce = $state('');
  let error = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  let input = $state<HTMLInputElement>();

  $effect(() => () => clearTimeout(timer));
  $effect(() => {
    if (autofocus) input?.focus();
  });

  function close() {
    open = false;
    active = -1;
  }

  function oninput(e: Event) {
    text = (e.currentTarget as HTMLInputElement).value;
    clearTimeout(timer);
    error = null;
    const q = text.trim();
    const n = ++seq;
    if (q.length < MIN) {
      results = [];
      close();
      return;
    }
    timer = setTimeout(() => {
      search(q, lang).then(
        (r) => {
          if (n !== seq) return; // the text changed meanwhile
          results = r.results.slice(0, MAX);
          active = -1;
          open = results.length > 0;
          announce = m.weather.results(results.length);
        },
        (err) => {
          if (n !== seq) return;
          results = [];
          close();
          error = errorText(err);
        }
      );
    }, DEBOUNCE_MS);
  }

  function pick(p: WeatherPlace) {
    clearTimeout(timer);
    seq++;
    text = p.name;
    close();
    onpick(p);
  }

  function onkeydown(e: KeyboardEvent) {
    const n = results.length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (!n) return;
        e.preventDefault();
        open = true;
        active = e.key === 'ArrowDown' ? (active + 1) % n : active <= 0 ? n - 1 : active - 1;
        break;
      case 'Enter':
        if (open && active >= 0) {
          e.preventDefault();
          pick(results[active]);
        }
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        } else if (text) {
          e.preventDefault();
          e.stopPropagation();
          clearTimeout(timer);
          seq++;
          text = '';
          results = [];
          error = null;
        }
        break;
      case 'Tab':
        close();
        break;
    }
  }
</script>

<div class="place-search">
  <label for={inputId}>{m.weather.searchLabel}</label>
  <div class="wrap">
    <input
      bind:this={input}
      id={inputId}
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
      aria-describedby={error ? errId : undefined}
      aria-invalid={error ? 'true' : undefined}
      autocomplete="off"
      spellcheck="false"
      placeholder={m.weather.searchHint}
      value={text}
      {oninput}
      {onkeydown}
      onblur={close} />
    <ul role="listbox" id={listId} aria-label={m.weather.searchLabel} hidden={!open}>
      {#each results as p, i (i)}
        <li
          role="option"
          id={optionId(i)}
          aria-selected={i === active}
          onpointerdown={(e) => {
            e.preventDefault(); // keep the focus in the field (no blur before the pick)
            pick(p);
          }}>{placeLine(p)}</li>
      {/each}
    </ul>
  </div>
  <!-- Always there, so the error is announced when it appears (a polite live region). -->
  <p class="error" id={errId} aria-live="polite">{error ?? ''}</p>
  <p role="status" class="visually-hidden">{announce}</p>
</div>

<style>
  .place-search {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  label {
    font-size: 12px;
    color: var(--mu);
  }
  .wrap {
    position: relative;
    min-width: 0;
  }
  input {
    width: var(--w-text);
  }
  ul {
    position: absolute;
    z-index: 5;
    top: calc(100% + 4px);
    left: 0;
    width: min(100%, 26rem);
    max-height: calc(8 * 44px + 8px);
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    list-style: none;
    background: var(--pop);
    border-radius: var(--ctl-radius);
    box-shadow: var(--shadow-pop);
  }
  ul[hidden] {
    display: none;
  }
  li {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 10px;
    border-radius: 8px;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  li[aria-selected='true'],
  li:hover {
    background: var(--s2);
  }
  /* Empty, it takes no room (the grid's gap is cancelled), yet stays in the accessibility tree. */
  .error:empty {
    margin-top: -4px;
  }
  .error {
    margin: 0;
    font-size: 13px;
    color: var(--bad);
  }
</style>
