'use strict';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const $stopName    = document.getElementById('stop-name');
const $statusBadge = document.getElementById('status-badge');
const $list        = document.getElementById('list');
const $footer      = document.getElementById('footer');

// ─── State ───────────────────────────────────────────────────────────────────
let lastDepartures = null;
let refreshTimer   = null;
let _Homey         = null; // stored so renderDepartures can call setHeight

// ─── Height ──────────────────────────────────────────────────────────────────
const ROW_HEIGHT    = 48;
const HEADER_HEIGHT = 36;
const FOOTER_HEIGHT = 20;
const PADDING       = 20;

function computeHeight(rowCount) {
  return PADDING + HEADER_HEIGHT + Math.max(rowCount, 1) * ROW_HEIGHT + FOOTER_HEIGHT;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(isoString) {
  if (!isoString) return '–';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDelay(seconds) {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  return `+${mins} min`;
}

function delayClass(seconds) {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 180) return 'delay-ok';
  if (seconds < 360) return 'delay-warn';
  return 'delay-bad';
}

function setStatus(text, visible = true) {
  $statusBadge.textContent = text;
  $statusBadge.classList.toggle('visible', visible);
}

// ─── Render ──────────────────────────────────────────────────────────────────

function renderDepartures(data) {
  const { departures = [], stopName = '', updatedAt = null } = data;

  if (stopName) $stopName.textContent = stopName;

  if (!departures.length) {
    $list.innerHTML = `<div id="empty">${_Homey.__('no_departures')}</div>`;
    _Homey.setHeight(computeHeight(1));
    return;
  }

  $list.innerHTML = departures.map(dep => {
    const displayTime = dep.realtime ? fmtTime(dep.realtime) : fmtTime(dep.scheduled);
    const delayText   = dep.delay > 60 ? fmtDelay(dep.delay) : null;
    const dc          = dep.delay > 60 ? delayClass(dep.delay) : '';
    const cancelClass = dep.cancelled ? 'cancelled' : '';

    return `
      <div class="departure ${cancelClass}">
        <div class="line-badge">${escHtml(dep.line)}</div>
        <div class="dest">${escHtml(dep.destination)}</div>
        <div class="time-col">
          <span class="time-main ${dep.cancelled ? 'delay-bad' : ''}">${dep.cancelled ? _Homey.__('cancelled') : escHtml(displayTime)}</span>
          ${delayText ? `<span class="time-delay ${dc}">${escHtml(delayText)}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  if (updatedAt) {
    $footer.textContent = _Homey.__('updated_at', { time: fmtTime(updatedAt) });
  }

  _Homey.setHeight(computeHeight(departures.length));
}

function renderError(code) {
  const msgs = {
    missing_config: _Homey.__('err_missing_config'),
    missing_key:    _Homey.__('err_missing_key'),
    network_error:  _Homey.__('err_network'),
    api_401:        _Homey.__('err_auth'),
  };
  const msg = msgs[code] ?? _Homey.__('err_generic', { code });
  $list.innerHTML = `<div id="empty">${escHtml(msg)}</div>`;
  _Homey.setHeight(computeHeight(1));
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function refresh() {
  let settings = {};
  try { settings = await _Homey.getSettings(); } catch (_) {}

  try {
    const data = await _Homey.api('POST', '/', {
      stopId:              settings.stopId              ?? '',
      stopName:            settings.stopName            ?? '',
      lines:               settings.lines               ?? '',
      excludeDestinations: settings.excludeDestinations ?? '',
      count:               settings.count               ?? 5,
    });

    if (data.error) {
      setStatus(_Homey.__('err_offline'));
      if (lastDepartures) {
        renderDepartures(lastDepartures);
      } else {
        renderError(data.error);
      }
    } else {
      lastDepartures = data;
      renderDepartures(data);
      setStatus('', false);
    }
  } catch (err) {
    setStatus(_Homey.__('err_offline'));
    if (lastDepartures) {
      renderDepartures(lastDepartures);
    } else {
      renderError('network_error');
    }
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function onHomeyReady(Homey) { // eslint-disable-line no-unused-vars
  _Homey = Homey;

  // Set initial height from configured count before first fetch
  let initialCount = 5;
  try {
    const s = await Homey.getSettings();
    initialCount = Math.min(Math.max(parseInt(s.count) || 5, 1), 10);
  } catch (_) {}

  Homey.ready({ height: computeHeight(initialCount) });

  await refresh();
  refreshTimer = setInterval(refresh, 60 * 1000);
}
