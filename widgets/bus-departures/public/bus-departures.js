'use strict';

/* global Homey */

// ─── DOM refs ────────────────────────────────────────────────────────────────
const $stopName    = document.getElementById('stop-name');
const $statusBadge = document.getElementById('status-badge');
const $list        = document.getElementById('list');
const $footer      = document.getElementById('footer');

// ─── State ───────────────────────────────────────────────────────────────────
let lastDepartures = null;
let refreshTimer   = null;

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
    $list.innerHTML = `<div id="empty">${Homey.__('no_departures')}</div>`;
    return;
  }

  $list.innerHTML = departures.map(dep => {
    const displayTime  = dep.realtime ? fmtTime(dep.realtime) : fmtTime(dep.scheduled);
    const delayText    = dep.delay > 60 ? fmtDelay(dep.delay) : null;
    const dc           = dep.delay > 60 ? delayClass(dep.delay) : '';
    const cancelClass  = dep.cancelled ? 'cancelled' : '';

    return `
      <div class="departure ${cancelClass}">
        <div class="line-badge">${escHtml(dep.line)}</div>
        <div class="dest">${escHtml(dep.destination)}</div>
        <div class="time-col">
          <span class="time-main ${dep.cancelled ? 'delay-bad' : ''}">${dep.cancelled ? Homey.__('cancelled') : escHtml(displayTime)}</span>
          ${delayText ? `<span class="time-delay ${dc}">${escHtml(delayText)}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  if (updatedAt) {
    $footer.textContent = Homey.__('updated_at', { time: fmtTime(updatedAt) });
  }
}

function renderError(code) {
  const msgs = {
    missing_config: Homey.__('err_missing_config'),
    missing_key:    Homey.__('err_missing_key'),
    network_error:  Homey.__('err_network'),
    api_401:        Homey.__('err_auth'),
  };
  const msg = msgs[code] ?? Homey.__('err_generic', { code });
  $list.innerHTML = `<div id="empty">${escHtml(msg)}</div>`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Data fetching ───────────────────────────────────────────────────────────

async function refresh() {
  try {
    const data = await Homey.api('GET', '/', {});

    if (data.error) {
      // Keep last known departures visible but show error badge
      setStatus(Homey.__('err_offline'));
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
    setStatus(Homey.__('err_offline'));
    if (lastDepartures) {
      renderDepartures(lastDepartures);
    } else {
      renderError('network_error');
    }
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function onHomeyReady(Homey) { // eslint-disable-line no-unused-vars
  await refresh();
  refreshTimer = setInterval(refresh, 60 * 1000);
  Homey.ready();
}
