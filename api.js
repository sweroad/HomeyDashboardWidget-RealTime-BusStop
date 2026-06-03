'use strict';

// App-level REST API — called from the settings page via Homey.api()
module.exports = [
  {
    method: 'GET',
    path: '/apiKey',
    async fn({ homey }) {
      return { value: homey.settings.get('apiKey') ?? '' };
    },
  },
  {
    method: 'POST',
    path: '/apiKey',
    async fn({ homey, body }) {
      homey.settings.set('apiKey', (body?.value ?? '').trim());
      return { ok: true };
    },
  },
];
