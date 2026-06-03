'use strict';

// App-level REST API — called from the settings page via fetch()
// All endpoints are public: true so the settings page webview can call them
// without a bearer token.

const SETTINGS_KEYS = ['apiKey', 'stopId', 'stopName', 'operator', 'lines', 'count'];

module.exports = [
  {
    method: 'GET',
    path: '/settings',
    public: true,
    async fn({ homey }) {
      const result = {};
      for (const k of SETTINGS_KEYS) result[k] = homey.settings.get(k) ?? '';
      return result;
    },
  },
  {
    method: 'POST',
    path: '/settings',
    public: true,
    async fn({ homey, body }) {
      for (const k of SETTINGS_KEYS) {
        if (k in body) homey.settings.set(k, body[k]);
      }
      return { ok: true };
    },
  },
  // Legacy single-key endpoints (kept for backward compat)
  {
    method: 'GET',
    path: '/apiKey',
    public: true,
    async fn({ homey }) {
      return { value: homey.settings.get('apiKey') ?? '' };
    },
  },
  {
    method: 'POST',
    path: '/apiKey',
    public: true,
    async fn({ homey, body }) {
      homey.settings.set('apiKey', (body?.value ?? '').trim());
      return { ok: true };
    },
  },
];
