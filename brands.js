(function () {
  'use strict';

  // ── Brand mapping ──────────────────────────────────────────────────────────
  // Maps description patterns to canonical brand names.
  // Order matters: first match wins.
  const BRAND_RULES = [
    [/^YubiKey/i,                   'Yubico'],
    [/^Security Key.*Yubico/i,      'Yubico'],
    [/^Feitian/i,                   'Feitian'],
    [/^HID Crescendo/i,             'HID Global'],
    [/^OneSpan/i,                   'OneSpan'],
    [/^Excelsecu/i,                 'Excelsecu'],
    [/^Swissbit/i,                  'Swissbit'],
    [/^eToken/i,                    'Thales'],
    [/^IDPrime/i,                   'Thales'],
    [/^Thales/i,                    'Thales'],
    [/^SECORA/i,                    'Infineon'],
    [/^eWBM/i,                      'eWBM'],
    [/^Hyper FIDO/i,                'Hyper'],
    [/^IDEMIA/i,                    'IDEMIA'],
    [/^ID-One/i,                    'IDEMIA'],
    [/^IDCore/i,                    'IDEMIA'],
    [/^ACS /i,                      'ACS'],
    [/^Windows Hello/i,             'Microsoft'],
    [/^Windows /i,                  'Microsoft'],
    [/^GoTrust/i,                   'GoTrust'],
    [/^RSA /i,                      'RSA'],
    [/^VeriMark/i,                  'Kensington'],
    [/^Taglio/i,                    'Taglio'],
    [/^Cryptnox/i,                  'Cryptnox'],
    [/^IDmelon/i,                   'IDmelon'],
    [/^Ensurity/i,                  'Ensurity'],
    [/^ATKey/i,                     'AuthenTrend'],
    [/^Google/i,                    'Google'],
    [/^Android/i,                   'Google'],
    [/^Arculus/i,                   'Arculus'],
    [/^Clife/i,                     'Chipwon'],
    [/^Chipwon/i,                   'Chipwon'],
    [/^CardOS/i,                    'Atos'],
    [/^Atos/i,                      'Atos'],
    [/^Deepnet/i,                   'Deepnet'],
    [/^FT-JCOS/i,                   'Feitian'],
    [/^FIDO KeyPass/i,              'FEIG Electronic'],
    [/^Hideez/i,                    'Hideez'],
    [/^HYPR/i,                      'HYPR'],
    [/^Neowave/i,                   'Neowave'],
    [/^Ledger/i,                    'Ledger'],
    [/^OCTATCO/i,                   'OCTATCO'],
    [/^TOKEN2/i,                    'TOKEN2'],
    [/^KEY-ID/i,                    'KEY-ID'],
    [/^TrustKey/i,                  'TrustKey'],
    [/^SafeNet/i,                   'Thales'],
    [/^SOLVO/i,                     'IDEMIA'],
    [/^Chunghwa/i,                  'Chunghwa Telecom'],
    [/^Crayonic/i,                  'Crayonic'],
    [/^Allthenticator/i,            'Allthenticate'],
    [/^NXP/i,                       'NXP'],
    [/^Pone Biometrics/i,           'Pone Biometrics'],
    [/^SmartDisplayer/i,            'SmartDisplayer'],
    [/^G\+D/i,                      'Giesecke+Devrient'],
    [/^GSTAG/i,                     'GSTAG'],
  ];

  const CERTIFIED_STATUSES = new Set([
    'FIDO_CERTIFIED', 'FIDO_CERTIFIED_L1', 'FIDO_CERTIFIED_L2',
    'FIDO_CERTIFIED_L3', 'FIDO_CERTIFIED_L3plus',
    'FIDO_CERTIFIED_L1_PLUS', 'FIDO_CERTIFIED_L2_PLUS', 'FIDO_CERTIFIED_L3_PLUS',
  ]);

  const STATUS_LABELS = { 'FIDO_CERTIFIED': 'Certified' };

  // ── State ───────────────────────────────────────────────────────────────────
  let allEntries = [];
  let state = { query: '' };

  // ── Helpers ─────────────────────────────────────────────────────────────────
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

  function getBrand(description) {
    for (const [pattern, brand] of BRAND_RULES) {
      if (pattern.test(description)) return brand;
    }
    // Fallback: use first word
    return description.split(/\s+/)[0];
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
      e.description.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      getBrand(e.description).toLowerCase().includes(q)
    );
  }

  // ── Grouping ──────────────────────────────────────────────────────────────────
  function groupByBrand(entries) {
    const groups = {};
    entries.forEach(e => {
      const brand = getBrand(e.description);
      if (!groups[brand]) groups[brand] = [];
      groups[brand].push(e);
    });

    // Sort brands by number of products (desc), then alphabetically
    return Object.entries(groups)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([brand, items]) => ({
        brand,
        items: items.sort((a, b) => a.description.localeCompare(b.description)),
        icon: items.find(i => i.icon)?.icon || null,
      }));
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────
  function renderBrands(entries) {
    const container = document.getElementById('brands-container');
    const groups = groupByBrand(entries);

    if (!groups.length) {
      container.innerHTML = '<div class="no-brands">No brands found.</div>';
      return;
    }

    const maxAnimated = 30;

    container.innerHTML = groups.map((g, gi) => {
      const logoHtml = g.icon
        ? `<img src="${esc(g.icon)}" alt="" class="brand-logo" loading="lazy">`
        : `<div class="brand-logo-placeholder">${esc(g.brand.charAt(0))}</div>`;

      const cardsHtml = g.items.map((e, i) => {
        const iconHtml = e.icon
          ? `<img src="${esc(e.icon)}" alt="" class="card-icon" loading="lazy">`
          : '<div class="card-icon-placeholder">&#128273;</div>';
        const dateStr = formatDateFriendly(e.date);
        return `<div class="card" data-id="${esc(e.id)}">
          <div class="card-icon-wrapper">${iconHtml}</div>
          <h3 class="card-name">${esc(e.description)}</h3>
          <p class="card-date">${dateStr ? 'Updated ' + esc(dateStr) : ''}</p>
        </div>`;
      }).join('');

      const delay = gi < maxAnimated ? `style="--i:${gi}"` : '';

      return `<div class="brand-section" ${delay}>
        <div class="brand-header">
          <span class="brand-chevron">&#9654;</span>
          ${logoHtml}
          <span class="brand-name">${esc(g.brand)}</span>
          <span class="brand-count">${g.items.length} key${g.items.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="brand-collapse">
          <div class="brand-cards">${cardsHtml}</div>
        </div>
      </div>`;
    }).join('');

    // Toggle individual brand sections
    container.querySelectorAll('.brand-header').forEach(header => {
      header.addEventListener('click', () => {
        header.parentElement.classList.toggle('expanded');
        updateToggleAllButton();
      });
    });

    // Card click → modal
    container.querySelectorAll('.card[data-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        navigate(state.query, card.dataset.id);
      });
    });
  }

  function updateToggleAllButton() {
    const btn = document.getElementById('toggle-all');
    if (!btn) return;
    const sections = document.querySelectorAll('.brand-section');
    const expanded = document.querySelectorAll('.brand-section.expanded');
    btn.textContent = expanded.length >= sections.length ? 'Collapse All' : 'Expand All';
  }

  function renderResults() {
    const filtered = applyFilters(allEntries, state.query);
    const groups = groupByBrand(filtered);
    const countEl = document.getElementById('results-count');
    if (state.query) {
      countEl.textContent = `${groups.length} brand${groups.length !== 1 ? 's' : ''} · ${filtered.length} of ${allEntries.length} security keys`;
    } else {
      countEl.textContent = `${groups.length} brands · ${allEntries.length} security keys`;
    }
    renderBrands(filtered);
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
            <label>Brand</label>
            <span>${esc(getBrand(entry.description))}</span>
          </div>
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
    // Toggle all brands
    document.getElementById('toggle-all').addEventListener('click', () => {
      const sections = document.querySelectorAll('.brand-section');
      const expanded = document.querySelectorAll('.brand-section.expanded');
      const shouldExpand = expanded.length < sections.length;
      sections.forEach(s => s.classList.toggle('expanded', shouldExpand));
      updateToggleAllButton();
    });

    let searchTimer;
    document.getElementById('search-input').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        navigate(e.target.value.trim(), null);
      }, 280);
    });

    window.addEventListener('hashchange', handleHashChange);

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

        allEntries.sort((a, b) => a.description.localeCompare(b.description));

        handleHashChange();
      })
      .catch(err => {
        console.error('Error loading data:', err);
        document.getElementById('brands-container').innerHTML =
          '<div class="no-brands">Error loading data. Please try again.</div>';
      });
  });
})();
