'use strict';

const DEPARTURES_URL  = 'https://realtime-api.trafiklab.se/v1/departures';
const CACHE_TTL_MS    = 60 * 1000; // 60s — matches Trafiklab's own cache TTL

module.exports = [

  /**
   * POST / — return upcoming departures for the configured stop.
   * Responses are cached for 60s per stop to stay within the 100k/month API quota.
   * Body: { stopId, apiKey, lines, count }
   */
  {
    method: 'POST',
    path: '/',
    async fn({ homey, body }) {
      const { stopId, apiKey, lines, count = 5 } = body ?? {};

      if (!stopId || !apiKey) {
        return { error: 'missing_config', departures: [], stopName: '' };
      }

      // Return cached response if still fresh (avoids duplicate API calls when
      // multiple widget instances show the same stop, or the widget polls faster
      // than Trafiklab refreshes its own cache).
      const cache    = homey.app._departuresCache;
      const cacheKey = `${stopId}:${apiKey}`;
      const now      = Date.now();

      if (cache[cacheKey] && now - cache[cacheKey].fetchedAt < CACHE_TTL_MS) {
        return applyFilters(cache[cacheKey].data, lines, count);
      }

      let res;
      try {
        res = await fetch(
          `${DEPARTURES_URL}/${encodeURIComponent(stopId)}?key=${encodeURIComponent(apiKey)}`
        );
      } catch (err) {
        homey.error('Departures fetch error:', err.message);
        // Serve stale cache rather than an error if we have something
        if (cache[cacheKey]) return applyFilters(cache[cacheKey].data, lines, count);
        return { error: 'network_error', departures: [], stopName: '' };
      }

      if (!res.ok) {
        if (cache[cacheKey]) return applyFilters(cache[cacheKey].data, lines, count);
        return { error: `api_${res.status}`, departures: [], stopName: '' };
      }

      const raw  = await res.json();
      const data = {
        stopName:  raw.stops?.[0]?.name ?? stopId,
        updatedAt: raw.timestamp        ?? new Date().toISOString(),
        departures: (raw.departures ?? []).map(dep => ({
          line:        dep.route?.designation                       ?? '?',
          destination: dep.route?.destination?.name                 ?? '?',
          scheduled:   dep.scheduled                                ?? null,
          realtime:    dep.realtime                                 ?? null,
          delay:       dep.delay                                    ?? 0,
          cancelled:   dep.canceled                                 ?? false,
          platform:    dep.realtime_platform?.designation
                    ?? dep.scheduled_platform?.designation          ?? null,
        })),
      };

      cache[cacheKey] = { data, fetchedAt: now };
      return applyFilters(data, lines, count);
    },
  },

];

function applyFilters(data, lines, count) {
  let departures = data.departures;

  if (lines) {
    const wanted = lines.split(',').map(l => l.trim()).filter(Boolean);
    if (wanted.length) departures = departures.filter(d => wanted.includes(d.line));
  }

  return { ...data, departures: departures.slice(0, Number(count)) };
}
