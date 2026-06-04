'use strict';

const https = require('node:https');

const DEPARTURES_URL = 'https://realtime-api.trafiklab.se/v1/departures';
const CACHE_TTL_MS   = 60 * 1000;

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        resolve({
          ok:     res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json:   () => JSON.parse(body),
        });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = {

  async getDepartures({ homey, body }) {
    // API key stays in app settings (shared across all widget instances)
    const apiKey = homey.app.homey.settings.get('apiKey') ?? '';

    // All other config comes from the widget's own settings (per instance)
    const stopId              = body?.stopId              ?? '';
    const stopName            = body?.stopName            ?? '';
    const lines               = body?.lines               ?? '';
    const excludeDestinations = body?.excludeDestinations ?? '';
    const count               = body?.count               || 5;

    if (!stopId) return { error: 'missing_config', departures: [], stopName: '' };
    if (!apiKey) return { error: 'missing_key',    departures: [], stopName: '' };

    const cache    = homey.app._departuresCache;
    const cacheKey = stopId;
    const now      = Date.now();

    if (cache[cacheKey] && now - cache[cacheKey].fetchedAt < CACHE_TTL_MS) {
      return applyFilters(cache[cacheKey].data, stopName, lines, excludeDestinations, count);
    }

    let res;
    try {
      const url = `${DEPARTURES_URL}/${encodeURIComponent(stopId)}?key=${encodeURIComponent(apiKey)}`;
      res = await httpsGet(url);
    } catch (err) {
      homey.error('fetch error:', err.message);
      if (cache[cacheKey]) return applyFilters(cache[cacheKey].data, stopName, lines, excludeDestinations, count);
      return { error: 'network_error', departures: [], stopName: '' };
    }

    if (!res.ok) {
      homey.error('api error:', res.status);
      if (cache[cacheKey]) return applyFilters(cache[cacheKey].data, stopName, lines, excludeDestinations, count);
      return { error: `api_${res.status}`, departures: [], stopName: '' };
    }

    const raw  = res.json();
    const data = {
      stopName:   raw.stops?.[0]?.name ?? stopId,
      updatedAt:  raw.timestamp        ?? new Date().toISOString(),
      departures: (raw.departures ?? []).map(dep => ({
        line:        dep.route?.designation                        ?? '?',
        destination: dep.route?.destination?.name                  ?? '?',
        scheduled:   dep.scheduled                                 ?? null,
        realtime:    dep.realtime                                  ?? null,
        delay:       dep.delay                                     ?? 0,
        cancelled:   dep.canceled                                  ?? false,
        platform:    dep.realtime_platform?.designation
                  ?? dep.scheduled_platform?.designation           ?? null,
      })),
    };

    cache[cacheKey] = { data, fetchedAt: now };
    return applyFilters(data, stopName, lines, excludeDestinations, count);
  },

};

function applyFilters(data, stopNameOverride, lines, excludeDestinations, count) {
  let departures = data.departures;

  if (lines) {
    const wanted = lines.split(',').map(l => l.trim()).filter(Boolean);
    if (wanted.length) departures = departures.filter(d => wanted.includes(d.line));
  }

  if (excludeDestinations) {
    const excluded = excludeDestinations.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    if (excluded.length) departures = departures.filter(d => !excluded.includes(d.destination.toLowerCase()));
  }

  return {
    ...data,
    stopName:   stopNameOverride || data.stopName,
    departures: departures.slice(0, Number(count)),
  };
}
