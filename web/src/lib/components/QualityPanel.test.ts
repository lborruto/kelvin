import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { EnergyReport, Quality } from '$lib/api/types';
import QualityPanel from './QualityPanel.svelte';

const b = (key: string, o: Record<string, unknown>) => ({ key, days: 1, present_days: 1, missing_days: 0, curve: { complete_days: 1 }, radiators: { coverage: 1 }, ...o });
const buckets = [
  b('2026-10-10', {}),
  b('2026-10-11', { curve: null, radiators: { coverage: 0.5 } }),
  b('2026-10-12', { present_days: 0, missing_days: 1, curve: null, radiators: null }),
  b('2026-10-13', { present_days: 0, missing_days: 0, curve: null, radiators: null }) // not yet published: no mark
] as unknown as EnergyReport['buckets'];
const quality: Quality = {
  fallback_share: 0.362, fallback_method: 'fallback_window', estimated_days: 3, curve_vs_daily_pct: 1.4,
  linky_since: '2025-11-01', curve_since: '2026-01-15', radiators_since: '2026-09-01', retro_priced_days: 6
};

describe('QualityPanel', () => {
  it('is a heading holding its toggle (final review minor 2: a heading inside <summary> loses its role in some readers)', async () => {
    const { container } = render(QualityPanel, { buckets, group: 'day', quality });
    const heading = screen.getByRole('heading', { level: 2, name: 'Qualité des données' });
    expect(heading.closest('summary, button')).toBeNull();
    const toggle = within(heading).getByRole('button', { name: 'Qualité des données', expanded: false });
    const body = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(body).not.toBeVisible();
    expect(container.querySelector('#quality')).toContainElement(body);
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(body).toBeVisible();
  });

  it('closed, its body stays findable: hidden until found, and a find-in-page match opens it', async () => {
    render(QualityPanel, { buckets, group: 'day', quality });
    const toggle = screen.getByRole('button', { name: 'Qualité des données' });
    const body = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(body).toHaveAttribute('hidden', 'until-found');
    await fireEvent(body, new Event('beforematch', { bubbles: true }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(body).not.toHaveAttribute('hidden');
  });

  it('is collapsed, with a coverage strip per bucket and row: full, partial, missing', () => {
    const { container } = render(QualityPanel, { buckets, group: 'day', quality });
    expect(container.querySelector('#quality [aria-expanded]')).toHaveAttribute('aria-expanded', 'false');
    const MARKS = ['full', 'partial', 'missing', 'none'];
    const row = (i: number) =>
      [...container.querySelectorAll('.strip .row')[i].querySelectorAll('.cell')].map((c) => [...c.classList].find((x) => MARKS.includes(x)));
    expect(row(0)).toEqual(['full', 'full', 'missing', 'none']);
    expect(row(1)).toEqual(['full', 'missing', 'missing', 'none']);
    expect(row(2)).toEqual(['full', 'partial', 'missing', 'none']);
    const cells = [...container.querySelectorAll('.visually-hidden tbody tr')[1].querySelectorAll('td')].map((t) => t.textContent);
    expect(cells).toEqual(['complet', 'manquant', 'partiel (50,0\u00a0%)']);
  });

  it('a coverage that rounds to 0,0 % says no radiator-day was fully measured, never « partiel (0,0 %) »', () => {
    const tiny = [
      b('2026-10-10', { radiators: { coverage: 0.0004 } }),
      b('2026-10-11', { radiators: { coverage: 0.0005 } })
    ] as unknown as EnergyReport['buckets'];
    const { container } = render(QualityPanel, { buckets: tiny, group: 'day', quality });
    const radiators = [...container.querySelectorAll('.visually-hidden tbody tr')].map((r) => r.querySelectorAll('td')[2].textContent);
    expect(radiators).toEqual(['partiel (aucun jour entier mesuré)', 'partiel (0,1\u00a0%)']);
  });

  it('radiators are not « missing » before they were first recorded', () => {
    const { container } = render(QualityPanel, { buckets, group: 'day', quality: { ...quality, radiators_since: '2026-10-13' } });
    const cells = [...container.querySelectorAll('.strip .row')[2].querySelectorAll('.cell')];
    expect(cells[2]).toHaveClass('none');
  });

  it('says where every estimate comes from', () => {
    const { container } = render(QualityPanel, { buckets, group: 'day', quality });
    const t = container.textContent!.replace(/\s+/g, ' ');
    expect(t).toContain('Courbe disponible depuis le 15 janvier 2026');
    expect(t).toContain('Radiateurs enregistrés depuis le 1 septembre 2026');
    expect(t).toContain('Jours HC/HP estimés : 3 (part de repli 36,2 %, méthode : ±15 jours)');
    expect(t).toContain('Écart moyen courbe / relevé : 1,4 %');
    expect(t).toContain('Prix du premier tarif appliqué à 6 jours antérieurs');
  });

  it('opens when the page is reached at #quality', () => {
    window.location.hash = '#quality';
    const { container } = render(QualityPanel, { buckets, group: 'day', quality });
    expect(container.querySelector('#quality [aria-expanded]')).toHaveAttribute('aria-expanded', 'true');
    window.location.hash = '';
  });

  it('opens when an « est. » link to #quality is followed', async () => {
    const link = document.body.appendChild(Object.assign(document.createElement('a'), { href: '#quality', textContent: 'est.' }));
    const { container } = render(QualityPanel, { buckets, group: 'day', quality });
    link.click();
    await Promise.resolve();
    expect(container.querySelector('#quality [aria-expanded]')).toHaveAttribute('aria-expanded', 'true');
    link.remove();
    window.location.hash = '';
  });

  it('the Courbe is not « missing » before it was first available', () => {
    const { container } = render(QualityPanel, { buckets, group: 'day', quality: { ...quality, curve_since: '2026-10-12' } });
    const cells = [...container.querySelectorAll('.strip .row')[1].querySelectorAll('.cell')];
    expect(cells[1]).toHaveClass('none'); // 11 October: before the curve existed
    expect(cells[2]).toHaveClass('missing'); // 12 October: expected, absent
  });

  it('a running bucket is judged on the days expected so far: complete so far, not « partiel »', () => {
    const months = [
      b('2026-09', { days: 30, present_days: 28, missing_days: 2, curve: { complete_days: 28 } }),
      b('2026-10', { days: 31, present_days: 14, missing_days: 0, curve: { complete_days: 14 } }),
      b('2026-11', { days: 30, present_days: 0, missing_days: 0, curve: null, radiators: null })
    ] as unknown as EnergyReport['buckets'];
    const { container } = render(QualityPanel, { buckets: months, group: 'month', quality });
    const MARKS = ['full', 'partial', 'missing', 'none'];
    const row = (i: number) =>
      [...container.querySelectorAll('.strip .row')[i].querySelectorAll('.cell')].map((c) => [...c.classList].find((x) => MARKS.includes(x)));
    expect(row(0)).toEqual(['partial', 'full', 'none']);
    expect(row(1)).toEqual(['full', 'full', 'none']);
  });
});
