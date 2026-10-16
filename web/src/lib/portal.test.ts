import { afterEach, expect, it } from 'vitest';
import { portal } from './portal';

afterEach(() => (document.body.innerHTML = ''));

it('moves a floating card to the end of <body>, and removes it with its component', () => {
  const host = document.createElement('div');
  const card = document.createElement('div');
  host.appendChild(card);
  document.body.appendChild(host);
  const a = portal(card);
  expect(card.parentElement).toBe(document.body);
  a.destroy();
  expect(card.isConnected).toBe(false);
});

it('inside an open modal dialog (the room sheet), it stays in that dialog: the page behind is inert', () => {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('open', '');
  const inner = document.createElement('div');
  const card = document.createElement('div');
  inner.appendChild(card);
  dialog.appendChild(inner);
  document.body.appendChild(dialog);
  portal(card);
  expect(card.parentElement).toBe(dialog);
  expect(dialog.lastElementChild).toBe(card);
});

it('an explicit target wins', () => {
  const target = document.createElement('section');
  document.body.appendChild(target);
  const card = document.createElement('div');
  document.body.appendChild(card);
  portal(card, target);
  expect(card.parentElement).toBe(target);
});
