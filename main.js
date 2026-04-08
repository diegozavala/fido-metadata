(function () {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────────
  const CERTIFIED_STATUSES = new Set([
    'FIDO_CERTIFIED', 'FIDO_CERTIFIED_L1', 'FIDO_CERTIFIED_L2',
    'FIDO_CERTIFIED_L3', 'FIDO_CERTIFIED_L3plus',
    'FIDO_CERTIFIED_L1_PLUS', 'FIDO_CERTIFIED_L2_PLUS', 'FIDO_CERTIFIED_L3_PLUS',
  ]);

  const STATUS_LABELS = {
    'FIDO_CERTIFIED': 'Certified',
  };

  // ── State ───────────────────────────────────────────────────────────────────
  let allEntries = [];
  let state = { query: '' };

  // ── Data helpers ─────────────────────────────────────────────────────────────
  function parseEntry(entry) {
    const ms = entry.metadataStatement;
    if (!ms) return null;
    const id = ms.aaguid || ms.aaid ||
               (ms.attestationCertificateKeyIdentifiers || [])[0] || '';
    const status = ((entry.statusReports || [])[0] || {}).status || 'N/A';
    return {
      id,
      description: ms.description || 'Unknown',
      protocol: ms.protocolFamily || 'N/A',
      status,
      date: entry.timeOfLastStatusChange || '',
      icon: ms.icon || null,
      raw: entry,
    };
  }

  function formatDateFriendly(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function formatStatusLabel(status) {
    if (STATUS_LABELS[status]) return STATUS_LABELS[status];
    const match = String(status).match(/^FIDO_CERTIFIED_L([1-3])(?:_?PLUS)?$/i);
    if (match) {
      const hasPlus = /PLUS$/i.test(String(status));
      return `Certified L${match[1]}${hasPlus ? '+' : ''}`;
    }
    return status;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Routing ──────────────────────────────────────────────────────────────────
  function parseHash() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (!hash) return { view: 'list', query: '' };

    if (hash.startsWith('device/')) {
      return { view: 'device', id: decodeURIComponent(hash.slice(7)) };
    }

    if (hash.startsWith('filter')) {
      const qi = hash.indexOf('?');
      const p = qi >= 0 ? new URLSearchParams(hash.slice(qi + 1)) : new URLSearchParams();
      return { view: 'list', query: p.get('q') || '' };
    }

    return { view: 'list', query: '' };
  }

  function buildHash(query, deviceId) {
    if (deviceId) return `#device/${encodeURIComponent(deviceId)}`;
    if (query) return `#filter?q=${encodeURIComponent(query)}`;
    return '#';
  }

  function navigate(query, deviceId) {
    const h = buildHash(query, deviceId);
    if (window.location.hash === h || (h === '#' && window.location.hash === '')) return;
    window.location.hash = h;
  }

  // ── Filtering ─────────────────────────────────────────────────────────────────
  function applyFilters(entries, query) {
    if (!query) return entries;
    const q = query.toLowerCase();
    return entries.filter(e =>
      e.description.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)
    );
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────
  function renderCards(entries) {
    const grid = document.getElementById('card-grid');
    if (!entries.length) {
      grid.innerHTML = '<div class="empty-state">No security keys found.</div>';
      return;
    }

    // Cap animation stagger at 50 cards (1s max)
    const maxAnimated = 50;

    grid.innerHTML = entries.map((e, i) => {
      const iconHtml = e.icon
        ? `<img src="${esc(e.icon)}" alt="" class="card-icon" loading="lazy">`
        : '<div class="card-icon-placeholder">&#128273;</div>';
      const dateStr = formatDateFriendly(e.date);
      const animDelay = i < maxAnimated ? `style="--i:${i}"` : 'style="--i:0"';
      return `<div class="card" data-id="${esc(e.id)}" ${animDelay}>
        <div class="card-icon-wrapper">${iconHtml}</div>
        <h3 class="card-name">${esc(e.description)}</h3>
        <p class="card-date">${dateStr ? 'Updated ' + esc(dateStr) : ''}</p>
      </div>`;
    }).join('');

    grid.querySelectorAll('.card[data-id]').forEach(card => {
      card.addEventListener('click', () => navigate(state.query, card.dataset.id));
    });
  }

  function renderResults() {
    const filtered = applyFilters(allEntries, state.query);
    const countEl = document.getElementById('results-count');
    if (state.query) {
      countEl.textContent = `${filtered.length} of ${allEntries.length} security keys`;
    } else {
      countEl.textContent = `${allEntries.length} security keys`;
    }
    renderCards(filtered);
  }

  // ── Device modal ──────────────────────────────────────────────────────────────
  function showModal(id) {
    const entry = allEntries.find(e => e.id === id);
    if (!entry) return;
    const ms = entry.raw.metadataStatement;
    const agi = ms.authenticatorGetInfo || {};

    const iconHtml = entry.icon
      ? `<img src="${esc(entry.icon)}" alt="" class="modal-icon">`
      : '<div class="modal-icon no-icon">&#128273;</div>';

    const extraDetails = [
      agi.versions && agi.versions.length
        ? `<div class="detail-item"><label>CTAP Versions</label><span>${esc(agi.versions.join(', '))}</span></div>` : '',
      ms.authenticatorVersion
        ? `<div class="detail-item"><label>Auth Version</label><span>${esc(String(ms.authenticatorVersion))}</span></div>` : '',
    ].join('');

    const kpHtml = (ms.keyProtection || []).map(k => `<span class="detail-badge">${esc(k)}</span>`).join('');
    const ahHtml = (ms.attachmentHint || []).map(k => `<span class="detail-badge">${esc(k)}</span>`).join('');

    document.getElementById('modal-content').innerHTML = `
      <div class="modal-header">
        ${iconHtml}
        <div class="modal-title">
          <h2>${esc(entry.description)}</h2>
          <div class="modal-id">${esc(entry.id)}</div>
        </div>
        <button class="modal-close" id="modal-close-btn" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item">
            <label>Certification</label>
            <span><span class="status-badge status-${esc(entry.status)}">${esc(formatStatusLabel(entry.status))}</span></span>
          </div>
          <div class="detail-item">
            <label>Last Updated</label>
            <span>${esc(formatDateFriendly(entry.date) || '\u2014')}</span>
          </div>
          ${extraDetails}
        </div>
        ${kpHtml ? `<div class="detail-section"><h3>Key Protection</h3><div class="detail-badges">${kpHtml}</div></div>` : ''}
        ${ahHtml ? `<div class="detail-section"><h3>Attachment Hint</h3><div class="detail-badges">${ahHtml}</div></div>` : ''}
      </div>`;

    document.getElementById('device-modal').classList.remove('hidden');

    const close = () => navigate(state.query, null);
    document.getElementById('modal-close-btn').addEventListener('click', close);
    document.getElementById('modal-backdrop').addEventListener('click', close);
    const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }

  function closeModal() {
    document.getElementById('device-modal').classList.add('hidden');
  }

  // ── Hash-change handler ───────────────────────────────────────────────────────
  function handleHashChange() {
    const route = parseHash();
    if (route.view === 'device') {
      renderResults();
      showModal(route.id);
    } else {
      closeModal();
      state.query = route.query || '';
      document.getElementById('search-input').value = state.query;
      renderResults();
    }
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    // Search (debounced)
    let searchTimer;
    document.getElementById('search-input').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        navigate(e.target.value.trim(), null);
      }, 280);
    });

    // Hash routing
    window.addEventListener('hashchange', handleHashChange);

    // Load data
    fetch('mds_metadata.json')
      .then(r => r.json())
      .then(data => {
        document.getElementById('metadata-version').textContent =
          `v${data.no} \u00b7 Next update: ${data.nextUpdate}`;
        document.getElementById('legal-header').textContent = data.legalHeader || '';

        allEntries = (data.entries || [])
          .map(parseEntry)
          .filter(Boolean)
          .filter(e => e.protocol === 'fido2' && CERTIFIED_STATUSES.has(e.status));

        // Sort alphabetically by default
        allEntries.sort((a, b) => a.description.localeCompare(b.description));

        handleHashChange();
      })
      .catch(err => {
        console.error('Error loading data:', err);
        document.getElementById('card-grid').innerHTML =
          '<div class="empty-state">Error loading data. Please try again.</div>';
      });
  });
})();
