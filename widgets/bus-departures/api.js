'use strict';

const DEPARTURES_URL = 'https://realtime-api.trafiklab.se/v1/departures';
const CACHE_TTL_MS   = 60 * 1000;

// Widget API handlers — keys must match widget.compose.json's "api" declarations.
// Homey routes Homey.api('GET', '/') → getDepartures based on method+path.
module.exports = {

  async getDepartures({ homey }) {
    homey.log('getDepartures called');

    const settings = homey.app.homey.settings;
    const apiKey   = settings.get('apiKey')  ?? '';
    const stopId   = settings.get('stopId')  ?? '';
    const lines    = settings.get('lines')   ?? '';
    const count    = settings.get('count')   || 5;

    homey.log('stopId:', stopId, '— apiKey len:', apiKey.length);

    if (!stopId) return { error: 'missing_config', departures: [], stopName: '' };
    if (!apiKey) return { error: 'missing_key',    departures: [], stopName: '' };

    const cache    = homey.app._departuresCache;
    const cacheKey = stopId;
    const now      = Date.now();

    if (cache[cacheKey] && now - cache[cacheKey].fetchedAt < CACHE_TTL_MS) {
      homey.log('serving from cache');
      return applyFilters(cache[cacheKey].data, lines, count);
    }

    let res;
    try {
      res = await fetch(
        `${DEPARTURES_URL}/${encodeURIComponent(stopId)}?key=${encodeURIComponent(apiKey)}`
      );
    } catch (err) {
      homey.error('fetch error:', err.message);
      if (cache[cacheKey]) return applyFilters(cache[cacheKey].data, lines, count);
      return { error: 'network_error', departures: [], stopName: '' };
    }

    if (!res.ok) {
      homey.error('api error:', res.status);
      if (cache[cacheKey]) return applyFilters(cache[cacheKey].data, lines, count);
      return { error: `api_${res.status}`, departures: [], stopName: '' };
    }

    const raw  = await res.json();
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
    homey.log('fetched', data.departures.length, 'departures for', data.stopName);
    return applyFilters(data, lines, count);
  },

};

function applyFilters(data, lines, count) {
  let departures = data.departures;
  if (lines) {
    const wanted = lines.split(',').map(l => l.trim()).filter(Boolean);
    if (wanted.length) departures = departures.filter(d => wanted.includes(d.line));
  }
  return { ...data, departures: departures.slice(0, Number(count)) };
}
