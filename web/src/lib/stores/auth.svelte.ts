import { api, ApiError } from '$lib/api/client';
import type { Me } from '$lib/api/types';
import { alerts } from './alerts.svelte';
import { history } from './history.svelte';
import { house } from './house.svelte';
import { resetRoomData } from './roomdata.svelte';

export class AuthStore {
  email = $state<string | null>(null);
  /** null: not known yet, or Kelvin could not be reached (the offline shell still opens). */
  loggedIn = $state<boolean | null>(null);
  reauth = $state(false);
  simulator = $state(false);

  apply(me: Me): void {
    this.email = me.email;
    this.loggedIn = me.logged_in;
    this.reauth = !!me.reauth;
    this.simulator = !!me.simulator;
  }

  async refresh(): Promise<boolean | null> {
    try {
      const me = await api.me();
      this.apply(me);
      return me.logged_in;
    } catch {
      return null;
    }
  }

  async login(email: string, password: string): Promise<void> {
    this.apply(await api.login(email, password));
  }

  /** Forget the session and every piece of house data held in the browser. */
  clearSession(): void {
    this.email = null;
    this.loggedIn = false;
    house.reset();
    history.reset();
    resetRoomData();
    alerts.reset();
  }

  /** A 401 means the session is already gone (success); any other failure rejects and changes nothing. */
  async logout(): Promise<void> {
    try {
      await api.logout();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }
    this.clearSession();
  }
}

export const auth = new AuthStore();
