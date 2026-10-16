<script lang="ts" module>
  export type IconName =
    | 'rooms' | 'program' | 'energy' | 'house' | 'power' | 'away' | 'window'
    | 'presence' | 'light' | 'flash' | 'check' | 'alert' | 'chevron' | 'x' | 'plus' | 'minus'
    | 'arrow-left' | 'edit' | 'chevron-left' | 'lock' | 'copy' | 'help' | 'plug-off' | 'more' | 'wifi-off' | 'info'
    | 'eye' | 'eye-off' | 'download'
    // Maison (UX batches 8–10)
    | 'flame' | 'trash' | 'arrow-right' | 'list' | 'sync'
    // Tableau (spec §2–3): the nav, the tiles and the summary chips
    | 'home' | 'cal' | 'chart' | 'gear' | 'bolt' | 'rad' | 'resume' | 'euro' | 'tag' | 'clock' | 'user' | 'globe'
    | 'box' | 'key' | 'shield' | 'chevron-down' | 'grid';
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
    /** Stroke width (1.75 by default; the ⋯ glyph reads better at 3). */
    stroke?: number;
  }
  let { name, size = 18, stroke = 1.75 }: Props = $props();
  const paths: Record<IconName, string> = {
    rooms: 'M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    program: 'M4 6h16M4 12h10M4 18h7M17 15v6M14 18h6',
    energy: 'M13 3 5 13h6l-1 8 8-10h-6z',
    house: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6',
    power: 'M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0',
    // A suitcase: « Partir… », Absence (the Tableau mockups).
    away: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
    window: 'M4 4h16v16H4zM12 4v16M4 12h16',
    presence: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
    light: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
    flash: 'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    alert: 'M12 8v5M12 16.5v.5M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    chevron: 'M9 6l6 6-6 6',
    x: 'M6 6l12 12M18 6 6 18',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    'chevron-left': 'M15 6l-6 6 6 6',
    lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5',
    'plug-off': 'M9 3v4M15 3v4M7 7h10v4a5 5 0 0 1-10 0zM12 16v5M3.5 3.5l17 17',
    more: 'M5 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6zM12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6zM19 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z',
    'wifi-off': 'M3 3l18 18M8.6 16.4a4.8 4.8 0 0 1 6.2-.5M5.3 13a9.5 9.5 0 0 1 4-2.3M18.7 13a9.5 9.5 0 0 0-2.1-1.5M2 9.3a14.5 14.5 0 0 1 4.3-2.9M22 9.3a14.5 14.5 0 0 0-11.6-3.6M12 20v.01',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.8v.4',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    'eye-off': 'M3 3l18 18M10.6 5.6A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.3-.6 4.6-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2',
    download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
    // Maison (UX batches 8–10)
    flame: 'M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-3-2 2-3 4.5-3 7a6 6 0 0 0 6 6z',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    'arrow-right': 'M5 12h14M13 6l6 6-6 6',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
    sync: 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4',
    // Tableau (spec §2–3)
    home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
    cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
    bolt: 'M13 2L5 14h6l-1 8 8-12h-6z',
    rad: 'M6 5v14M10 5v14M14 5v14M18 5v14M4 19h16M4 5h16',
    resume: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 4v4h4',
    euro: 'M17 6.5A7 7 0 1 0 17 17.5M4 10h9M4 14h9',
    tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
    clock: 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16M12 8v4l3 2',
    user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 20c1.5-4 4.5-5 8-5s6.5 1 8 5',
    globe: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
    box: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
    key: 'M14 4a6 6 0 1 1-3.9 10.6L4 20.7V17h3v-3h3l.1-.1A6 6 0 0 1 14 4zM16 8h.01',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    'chevron-down': 'M6 9l6 6 6-6',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'
  };
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke}
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={paths[name]} />
</svg>
