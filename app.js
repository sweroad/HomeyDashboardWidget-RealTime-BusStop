'use strict';

const { App } = require('homey');

const STOP_LOOKUP_URL = 'https://realtime-api.trafiklab.se/v1/stop-lookup';
const GTFS_BASE_URL   = 'https://opendata.samtrafiken.se/gtfs';
const CACHE_TTL_MS    = 24 * 60 * 60 * 1000; // 24 h

const OPERATOR_SLUG = {
  jlt:   'jlt',
  sl:    'sl',
  skane: 'skane',
  vt:    'vastmanland',
};

class BusStopApp extends App {

  async onInit() {
    this.log('BusStop app initialized');
    this._stopsCache     = {};
    this._departuresCache = {}; // keyed by stopId, TTL 60s (matches Trafiklab cache)

    const widget = this.homey.dashboards.getWidget('bus-departures');

    widget.registerSettingAutocompleteListener('stop', async (query, settings) => {
      const apiKey   = settings.apiKey   ?? '';
      const operator = settings.operator ?? 'jlt';

      if (!apiKey || query.trim().length < 2) return [];

      try {
        return await this._searchStops(query.trim(), operator, apiKey);
      } catch (err) {
        this.error('Autocomplete error:', err.message);
        return [];
      }
    });
  }

  // ── Stop search ────────────────────────────────────────────────────────────

  async _searchStops(q, operator, apiKey) {
    // Primary: Trafiklab Stop Lookup API (returns JSON, no ZIP parsing)
    try {
      const url = `${STOP_LOOKUP_URL}?q=${encodeURIComponent(q)}&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const stops = data.stops ?? data.results ?? data ?? [];
        if (Array.isArray(stops) && stops.length > 0) {
          return stops
            .map(s => ({ id: s.id ?? s.stop_id ?? s.area_id, name: s.name ?? s.stop_name }))
            .filter(s => s.id && s.name)
            .slice(0, 20);
        }
      }
    } catch (err) {
      this.error('Stop Lookup API failed, falling back to GTFS:', err.message);
    }

    // Fallback: download and parse GTFS stops.txt for the operator
    return this._searchStopsFromGtfs(q, operator, apiKey);
  }

  async _searchStopsFromGtfs(q, operator, apiKey) {
    const cacheKey = `${operator}:${apiKey}`;
    const now = Date.now();

    if (!this._stopsCache[cacheKey] || now - this._stopsCache[cacheKey].fetchedAt > CACHE_TTL_MS) {
      const slug = OPERATOR_SLUG[operator] ?? operator;
      const url = `${GTFS_BASE_URL}/${slug}/${slug}.zip?key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`GTFS download failed: ${res.status} ${res.statusText}`);

      const buffer = Buffer.from(await res.arrayBuffer());
      const stops  = this._parseStopsFromZip(buffer);
      this._stopsCache[cacheKey] = { stops, fetchedAt: now };
    }

    const search = q.toLowerCase();
    return this._stopsCache[cacheKey].stops
      .filter(s => s.name.toLowerCase().includes(search))
      .slice(0, 20)
      .map(s => ({ id: s.id, name: s.name }));
  }

  _parseStopsFromZip(buffer) {
    const csv = extractFileFromZip(buffer, 'stops.txt');
    if (!csv) throw new Error('stops.txt not found in GTFS ZIP');
    return parseStopsCsv(csv);
  }

}

module.exports = BusStopApp;

// ── ZIP / CSV helpers (no external deps, Node 22 built-ins only) ──────────────

function extractFileFromZip(buffer, targetName) {
  const EOCD_SIG = 0x06054b50;
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) throw new Error('Invalid ZIP: EOCD not found');

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const cdSize   = buffer.readUInt32LE(eocdOffset + 12);
  const CD_SIG   = 0x02014b50;

  let pos = cdOffset;
  while (pos < cdOffset + cdSize) {
    if (buffer.readUInt32LE(pos) !== CD_SIG) break;
    const compMethod  = buffer.readUInt16LE(pos + 10);
    const compSize    = buffer.readUInt32LE(pos + 20);
    const fnLen       = buffer.readUInt16LE(pos + 28);
    const extraLen    = buffer.readUInt16LE(pos + 30);
    const commentLen  = buffer.readUInt16LE(pos + 32);
    const lfhOffset   = buffer.readUInt32LE(pos + 42);
    const filename    = buffer.slice(pos + 46, pos + 46 + fnLen).toString('utf8');

    pos += 46 + fnLen + extraLen + commentLen;
    if (filename !== targetName) continue;

    const lfhFnLen    = buffer.readUInt16LE(lfhOffset + 26);
    const lfhExtraLen = buffer.readUInt16LE(lfhOffset + 28);
    const dataStart   = lfhOffset + 30 + lfhFnLen + lfhExtraLen;
    const compData    = buffer.slice(dataStart, dataStart + compSize);

    if (compMethod === 0) return compData.toString('utf8');
    if (compMethod === 8) {
      return require('node:zlib').inflateRawSync(compData).toString('utf8');
    }
    throw new Error(`Unsupported ZIP compression method: ${compMethod}`);
  }
  return null;
}

function parseStopsCsv(csv) {
  const lines = csv.split('\n');
  const headers = parseCsvLine(lines[0]);
  const idx = name => headers.indexOf(name);

  const idCol     = idx('stop_id');
  const nameCol   = idx('stop_name');
  const typeCol   = idx('location_type');
  const parentCol = idx('parent_station');

  return lines.slice(1)
    .map(line => {
      if (!line.trim()) return null;
      const cols = parseCsvLine(line);
      return {
        id:     cols[idCol]?.trim()     ?? '',
        name:   cols[nameCol]?.trim()   ?? '',
        type:   cols[typeCol]?.trim()   ?? '0',
        parent: cols[parentCol]?.trim() ?? '',
      };
    })
    .filter(s => s && s.id && s.name && (s.type === '1' || s.parent === ''));
}

function parseCsvLine(line) {
  if (!line) return [];
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line.trimEnd()) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}
