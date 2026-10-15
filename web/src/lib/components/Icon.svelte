<script lang="ts" module>
  export type IconName =
    | 'rooms' | 'program' | 'energy' | 'house' | 'power' | 'away' | 'window'
    | 'presence' | 'light' | 'flash' | 'check' | 'alert' | 'chevron' | 'x' | 'plus' | 'minus'
    | 'arrow-left' | 'edit' | 'chevron-left' | 'lock' | 'copy' | 'help' | 'plug-off' | 'more' | 'wifi-off' | 'info';
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
  }
  let { name, size = 18 }: Props = $props();
  const paths: Record<IconName, string> = {
    rooms: 'M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    program: 'M4 6h16M4 12h10M4 18h7M17 15v6M14 18h6',
    energy: 'M13 3 5 13h6l-1 8 8-10h-6z',
    house: 'M4 20V9l8-5 8 5v11M9 20v-6h6v6',
    power: 'M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0',
    away: 'M2 16l20-6-3-3-7 3-5-4-2 1 4 5-5 2z M3 20h18',
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
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.8v.4'
  };
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d={paths[name]} />
</svg>
