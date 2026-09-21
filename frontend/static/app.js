// Nafas Clean Air Zone™ Fleet Mission Control Client App
let fleetData = {
  summary: {},
  clients: [],
  alerts: [],
  currentTab: 'all',
  selectedCountry: 'all',
  currentTableMode: 'active', // 'active' or 'lost'
  searchQuery: '',
  sortColumn: 'client_name',
  sortDirection: 'asc',
  page: 1,
  pageSize: 15,
  selectedClient: null
};

// Format currency
function formatRupiah(num) {
  if (!num) return 'Rp 0';
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

// Country and City normalization
function normalizeClientCountryCity(c) {
  if (!c) return;
  const rawCountry = (c.country || '').trim();
  if (rawCountry.toLowerCase() === 'cilegon') {
    c.country = 'Indonesia';
    if (!c.city || c.city.toLowerCase() === 'jakarta') {
      c.city = 'Cilegon';
    }
  } else if (!c.country) {
    c.country = 'Indonesia';
  }
}

// Country Flag Helper
function getCountryFlag(country) {
  if (!country) return '🌐';
  const c = country.trim().toLowerCase();
  if (c === 'indonesia' || c === 'cilegon') return '🇮🇩';
  if (c === 'qatar') return '🇶🇦';
  if (c === 'uae' || c === 'united arab emirates') return '🇦🇪';
  if (c === 'singapore') return '🇸🇬';
  if (c === 'thailand') return '🇹🇭';
  if (c === 'vietnam') return '🇻🇳';
  return '🌍';
}

function switchFleetTable(mode) {
  fleetData.currentTableMode = mode;
  fleetData.page = 1;

  const btnActive = document.getElementById('fleet-tab-active');
  const btnLost = document.getElementById('fleet-tab-lost');
  const desc = document.getElementById('fleet-table-mode-desc');
  const tableTitle = document.getElementById('table-title');
  const tableSubtitle = document.getElementById('table-subtitle');
  const quickFilters = document.getElementById('quick-filter-tabs');

  if (mode === 'active') {
    if (btnActive) btnActive.className = 'flex items-center gap-2 px-4 py-2.5 border-b-2 border-emerald-500 text-emerald-400 font-bold text-xs transition-colors cursor-pointer';
    if (btnLost) btnLost.className = 'flex items-center gap-2 px-4 py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 font-bold text-xs transition-colors cursor-pointer';
    if (desc) desc.innerText = 'Showing active clients with running deployments';
    if (tableTitle) tableTitle.innerText = 'Clean Air Zone™ Client Fleet Directory';
    if (tableSubtitle) tableSubtitle.innerText = 'Cross-referenced with Mini-ERP device specs, MongoDB billing & telemetry electrical health';
    if (quickFilters) quickFilters.classList.remove('opacity-40', 'pointer-events-none');
  } else {
    if (btnActive) btnActive.className = 'flex items-center gap-2 px-4 py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200 font-bold text-xs transition-colors cursor-pointer';
    if (btnLost) btnLost.className = 'flex items-center gap-2 px-4 py-2.5 border-b-2 border-rose-500 text-rose-400 font-bold text-xs transition-colors cursor-pointer';
    if (desc) desc.innerText = 'Showing decommissioned / churned accounts (Mini-ERP takeouts & hardware reconciliation)';
    if (tableTitle) tableTitle.innerText = 'Decommissioned & Lost Client Accounts';
    if (tableSubtitle) tableSubtitle.innerText = 'Accounts flagged as LOST in NeonDB. Cross-referenced with Mini-ERP hardware takeouts';
    if (quickFilters) quickFilters.classList.add('opacity-40', 'pointer-events-none');
  }

  populateCountryFilter();
  renderClientsTable();
}

function updateTableTabCounts() {
  const activeCount = (fleetData.clients || []).filter(c => (c.project_status || 'active') === 'active').length;
  const lostCount = (fleetData.clients || []).filter(c => (c.project_status || '').toLowerCase() === 'lost').length;

  const aEl = document.getElementById('active-fleet-count');
  if (aEl) aEl.innerText = activeCount;

  const lEl = document.getElementById('lost-fleet-count');
  if (lEl) lEl.innerText = lostCount;
}

function handleCountryFilter(country) {
  fleetData.selectedCountry = country;
  fleetData.page = 1;
  renderClientsTable();
}

function populateCountryFilter() {
  const select = document.getElementById('country-filter');
  if (!select) return;

  const mode = fleetData.currentTableMode || 'active';
  const targetClients = (fleetData.clients || []).filter(c => {
    if (mode === 'active') return (c.project_status || 'active') === 'active';
    if (mode === 'lost') return (c.project_status || '').toLowerCase() === 'lost';
    return true;
  });

  const counts = {};
  targetClients.forEach(c => {
    normalizeClientCountryCity(c);
    const ctry = (c.country || 'Indonesia').trim();
    counts[ctry] = (counts[ctry] || 0) + 1;
  });

  const sortedCountries = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const current = fleetData.selectedCountry || 'all';

  select.innerHTML = `
    <option value="all">🌍 All Countries (${targetClients.length})</option>
    ${sortedCountries.map(ctry => {
      const flag = getCountryFlag(ctry);
      return `<option value="${escapeHtml(ctry)}" ${current.toLowerCase() === ctry.toLowerCase() ? 'selected' : ''}>${flag} ${escapeHtml(ctry)} (${counts[ctry]})</option>`;
    }).join('')}
  `;
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  fetchFleetData();
  // Auto-refresh every 60 seconds
  setInterval(fetchFleetData, 60000);
});

async function fetchFleetData() {
  try {
    const [summaryRes, clientsRes, alertsRes] = await Promise.all([
      fetch('/api/fleet/summary').then(r => r.json()),
      fetch('/api/fleet/clients').then(r => r.json()),
      fetch('/api/fleet/alerts').then(r => r.json())
    ]);

    fleetData.summary = summaryRes;
    fleetData.clients = (clientsRes.clients || []).filter(c => {
      const combined = ((c.client_name || '') + ' ' + (c.project_name || '')).toLowerCase();
      return !combined.includes('dummy');
    }).map(c => {
      normalizeClientCountryCity(c);
      return c;
    });
    fleetData.alerts = alertsRes.alerts || [];

    updateTableTabCounts();
    populateCountryFilter();
    renderKPIs();
    renderAlerts();
    renderClientsTable();
    updateSyncTime();
  } catch (err) {
    console.error('Failed to load fleet data:', err);
    document.getElementById('vpn-status').innerText = 'VPN / API Offline';
    document.getElementById('vpn-status').className = 'text-rose-400 font-bold';
  }
}

async function triggerManualRefresh() {
  const btn = document.getElementById('refresh-btn');
  const icon = document.getElementById('refresh-icon');
  btn.disabled = true;
  icon.classList.add('animate-spin');

  try {
    const res = await fetch('/api/fleet/refresh', { method: 'POST' }).then(r => r.json());
    if (res.status === 'success') {
      await fetchFleetData();
    }
  } catch (err) {
    console.error('Refresh failed:', err);
  } finally {
    btn.disabled = false;
    icon.classList.remove('animate-spin');
  }
}

function updateSyncTime() {
  const syncLabel = document.getElementById('last-sync-time');
  if (syncLabel) {
    const now = new Date();
    syncLabel.innerText = 'Refreshed ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

// 1. Render KPIs
function renderKPIs() {
  const s = fleetData.summary;
  const activeCount = s.active_clients_count !== undefined ? s.active_clients_count : (s.total_clients || '--');
  const lostCount = s.lost_clients_count !== undefined ? s.lost_clients_count : 0;
  
  document.getElementById('kpi-clients').innerText = activeCount;
  const clientsSub = document.getElementById('kpi-clients-sub');
  if (clientsSub) {
    clientsSub.innerText = `${activeCount} Active • ${lostCount} Lost`;
  }

  document.getElementById('kpi-devices').innerText = s.total_active_devices || '--';
  document.getElementById('kpi-device-sub').innerText = `${s.total_online_devices || 0} Online / ${s.total_offline_devices || 0} Offline`;
  
  const uptimeEl = document.getElementById('kpi-uptime');
  uptimeEl.innerText = `${s.global_uptime_pct || 0}%`;
  if (s.global_uptime_pct >= 90) uptimeEl.className = 'text-2xl font-bold text-emerald-400 mt-1 font-mono tracking-tight';
  else if (s.global_uptime_pct >= 75) uptimeEl.className = 'text-2xl font-bold text-amber-400 mt-1 font-mono tracking-tight';
  else uptimeEl.className = 'text-2xl font-bold text-rose-400 mt-1 font-mono tracking-tight';

  // Total Energy kWh
  const kwhEl = document.getElementById('kpi-kwh');
  if (kwhEl) {
    kwhEl.innerText = `${(s.total_fleet_kwh || 0).toLocaleString()} kWh`;
  }

  // Billing KPI
  const billEl = document.getElementById('kpi-billing');
  const billSub = document.getElementById('kpi-billing-sub');
  const unpaidDot = document.getElementById('kpi-unpaid-dot');
  if (billEl) {
    billEl.innerText = `${s.paid_clients_count || 0} Paid`;
    billSub.innerText = `${s.unpaid_clients_count || 0} Overdue / ${s.pending_clients_count || 0} Pending`;
    if (s.unpaid_clients_count > 0 && unpaidDot) {
      unpaidDot.classList.remove('hidden');
    }
  }

  document.getElementById('kpi-critical').innerText = s.critical_alerts_count || '0';
}

// 2. Render Bad Alert Triage Center
function renderAlerts() {
  const alertsSec = document.getElementById('alerts-section');
  const alertsList = document.getElementById('alerts-list');
  const badge = document.getElementById('alerts-badge');

  const alerts = fleetData.alerts;
  if (!alerts || alerts.length === 0) {
    alertsSec.classList.add('hidden');
    return;
  }

  alertsSec.classList.remove('hidden');
  badge.innerText = `${alerts.length} Active Alerts`;

  alertsList.innerHTML = alerts.slice(0, 10).map(a => {
    const isCrit = a.severity === 'CRITICAL';
    const isWarn = a.severity === 'WARNING';
    
    let borderClass = 'border-slate-800 bg-slate-950/80';
    let badgeClass = 'bg-slate-800 text-slate-300';
    let icon = 'ℹ️';

    if (isCrit) {
      borderClass = 'border-rose-800/80 bg-rose-950/20';
      badgeClass = 'bg-rose-500/20 text-rose-400 border border-rose-500/40';
      icon = '🚨';
    } else if (isWarn) {
      borderClass = 'border-amber-800/60 bg-amber-950/20';
      badgeClass = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      icon = '⚠️';
    }

    return `
      <div class="border ${borderClass} rounded-xl p-3 flex flex-col justify-between space-y-2">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <span>${icon}</span>
            <div>
              <div class="text-xs font-bold text-white">${escapeHtml(a.title || a.type)}</div>
              <div class="text-[11px] text-slate-400 font-mono">${escapeHtml(a.client_name || a.project_name || 'Client')} ${a.room_name ? '• ' + escapeHtml(a.room_name) : ''}</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badgeClass}">${a.severity}</span>
        </div>
        <p class="text-[11px] text-slate-300 leading-snug">${escapeHtml(a.message || '')}</p>
        <div class="flex items-center justify-between pt-1 border-t border-slate-800/40 text-[10px]">
          <span class="text-slate-500 font-mono">${a.created_at ? new Date(a.created_at).toLocaleTimeString() : ''}</span>
          ${a.project_id ? `<button onclick="openClientDetail(${a.project_id})" class="text-emerald-400 hover:text-emerald-300 font-semibold underline">Inspect Client &rarr;</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function toggleAlertsSection() {
  document.getElementById('alerts-section').classList.toggle('hidden');
}

// 3. Search & Filter Handlers
function handleGlobalSearch(query) {
  const q = query.trim().toLowerCase();
  fleetData.searchQuery = q;
  fleetData.page = 1;

  // Keep table search input in sync
  const tableInput = document.getElementById('search-input');
  if (tableInput && tableInput.value !== query) {
    tableInput.value = query;
  }

  // Toggle clear button
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) {
    if (q) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  renderClientsTable();
  renderSearchResultsDropdown(q);
}

function handleTableSearch(query) {
  const q = query.trim().toLowerCase();
  fleetData.searchQuery = q;
  fleetData.page = 1;

  // Keep global search input in sync
  const globalInput = document.getElementById('global-search-input');
  if (globalInput && globalInput.value !== query) {
    globalInput.value = query;
  }

  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) {
    if (q) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  renderClientsTable();
}

function handleSearchKeydown(e) {
  if (e.key === 'Enter') {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const matches = (fleetData.clients || []).filter(c => clientMatchesQuery(c, q));
    if (matches.length > 0) {
      selectSearchResult(matches[0].project_id);
    }
  } else if (e.key === 'Escape') {
    hideSearchDropdown();
  }
}

function clearSearch() {
  const gInput = document.getElementById('global-search-input');
  const tInput = document.getElementById('search-input');
  if (gInput) gInput.value = '';
  if (tInput) tInput.value = '';
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  hideSearchDropdown();
  handleGlobalSearch('');
}

function hideSearchDropdown() {
  const dd = document.getElementById('search-results-dropdown');
  if (dd) dd.classList.add('hidden');
}

function clientMatchesQuery(c, q) {
  if (!q) return true;
  if ((c.client_name || '').toLowerCase().includes(q)) return true;
  if ((c.project_name || '').toLowerCase().includes(q)) return true;
  if ((c.country || '').toLowerCase().includes(q)) return true;
  if ((c.city || '').toLowerCase().includes(q)) return true;
  if ((c.location_uuid || '').toLowerCase().includes(q)) return true;
  if ((c.reconciled_location_name || '').toLowerCase().includes(q)) return true;

  // Match hardware models inside
  const models = Object.keys(c.minierp_models || {});
  if (models.some(m => m.toLowerCase().includes(q))) return true;

  return false;
}

function renderSearchResultsDropdown(q) {
  const dd = document.getElementById('search-results-dropdown');
  const listEl = document.getElementById('search-results-list');
  const countEl = document.getElementById('search-results-count');
  if (!dd || !listEl) return;

  if (!q) {
    dd.classList.add('hidden');
    return;
  }

  const matches = (fleetData.clients || []).filter(c => clientMatchesQuery(c, q));

  countEl.innerText = `${matches.length} client${matches.length === 1 ? '' : 's'} found`;
  dd.classList.remove('hidden');

  if (matches.length === 0) {
    listEl.innerHTML = `
      <div class="p-6 text-center text-slate-500 text-xs font-mono">
        No clients found matching "<span class="text-white">${escapeHtml(q)}</span>"
      </div>
    `;
    return;
  }

  listEl.innerHTML = matches.slice(0, 7).map(c => {
    // Model breakdown summary (What's inside)
    const modelEntries = Object.entries(c.minierp_models || {});
    const modelsSummary = modelEntries.length > 0
      ? modelEntries.map(([m, qty]) => `${qty}x ${m}`).join(' • ')
      : `${c.device_count} units registered`;

    const instCount = c.minierp_installed_count !== undefined ? c.minierp_installed_count : c.device_count;
    const outCount = c.minierp_takeout_count || 0;

    let slaClass = 'text-emerald-400';
    if (c.uptime_pct < 50) slaClass = 'text-rose-400';
    else if (c.uptime_pct < 90) slaClass = 'text-amber-400';

    const isLost = (c.project_status || '').toLowerCase() === 'lost';

    return `
      <div 
        onclick="selectSearchResult(${c.project_id})"
        class="p-3 hover:bg-slate-800/80 cursor-pointer transition-all rounded-xl flex items-start justify-between gap-3 group border border-transparent hover:border-slate-700/80"
      >
        <div class="space-y-1 flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-white text-xs group-hover:text-emerald-400 transition-colors">${escapeHtml(c.client_name)}</span>
            ${isLost ? `<span class="px-1.5 py-0.2 rounded font-bold text-[9px] bg-rose-950/90 text-rose-400 border border-rose-800 font-mono">LOST</span>` : ''}
            <span class="text-[9px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded font-mono">${escapeHtml(c.segment || 'B2C')}</span>
            <span class="text-[10px] text-slate-400 font-mono">${getCountryFlag(c.country)} ${escapeHtml(c.country || 'Indonesia')} • ${escapeHtml(c.city || 'Jakarta')}</span>
            ${c.is_location_reconciled ? `<span class="text-[9px] text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/40">Auto-Linked</span>` : ''}
          </div>
          <div class="text-[11px] text-slate-400 truncate">${escapeHtml(c.project_name)}</div>
          
          <!-- What's Inside Hardware & Telemetry Summary -->
          <div class="flex items-center gap-1.5 flex-wrap pt-0.5 text-[10px] font-mono">
            <span class="px-1.5 py-0.2 rounded bg-slate-950 text-slate-300 border border-slate-800">
              📦 ${c.online_count}/${c.device_count} Active (<span class="${slaClass} font-bold">${c.uptime_pct}% SLA</span>)
            </span>
            <span class="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              🟢 ${instCount} Inst
            </span>
            ${outCount > 0 ? `
              <span class="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold">
                🔴 ${outCount} Out
              </span>
            ` : ''}
            <span class="text-slate-400 truncate max-w-[260px] text-[10px]" title="${escapeHtml(modelsSummary)}">
              🔍 ${escapeHtml(modelsSummary)}
            </span>
          </div>
        </div>

        <button 
          onclick="event.stopPropagation(); selectSearchResult(${c.project_id})" 
          class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] flex-shrink-0 transition-all shadow-sm group-hover:scale-105 flex items-center gap-1"
        >
          <span>Inspect</span>
          <span>&rarr;</span>
        </button>
      </div>
    `;
  }).join('');
}

function selectSearchResult(projectId) {
  hideSearchDropdown();
  const c = (fleetData.clients || []).find(x => x.project_id === projectId);
  if (c && (c.project_status || '').toLowerCase() === 'lost' && fleetData.currentTableMode !== 'lost') {
    switchFleetTable('lost');
  } else if (c && (c.project_status || 'active') === 'active' && fleetData.currentTableMode !== 'active') {
    switchFleetTable('active');
  }
  openClientDetail(projectId);
}

// Global click & keyboard listeners
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    const gInput = document.getElementById('global-search-input');
    if (gInput) {
      gInput.focus();
      gInput.select();
    }
  } else if (e.key === 'Escape') {
    hideSearchDropdown();
  }
});

document.addEventListener('click', (e) => {
  const gSearch = document.getElementById('global-search-container');
  if (gSearch && !gSearch.contains(e.target)) {
    hideSearchDropdown();
  }
});

function filterByTab(tab) {
  fleetData.currentTab = tab;
  fleetData.page = 1;

  // Update tab styles
  ['all', 'critical', 'unpaid', 'overdue', 'outdated_fw', 'healthy'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) {
      if (t === tab) {
        el.className = 'px-2.5 py-1 rounded-lg bg-emerald-600 text-white transition-all font-semibold';
      } else {
        el.className = 'px-2.5 py-1 rounded-lg text-slate-400 hover:text-white transition-all';
      }
    }
  });

  renderClientsTable();
}

function getFilteredClients() {
  let list = fleetData.clients;

  // Filter by Table Mode (Active Fleet vs Lost Accounts)
  const mode = fleetData.currentTableMode || 'active';
  if (mode === 'active') {
    list = list.filter(c => (c.project_status || 'active') === 'active');
  } else if (mode === 'lost') {
    list = list.filter(c => (c.project_status || '').toLowerCase() === 'lost');
  }

  // Filter by country
  if (fleetData.selectedCountry && fleetData.selectedCountry !== 'all') {
    const targetC = fleetData.selectedCountry.toLowerCase();
    list = list.filter(c => (c.country || 'Indonesia').trim().toLowerCase() === targetC);
  }

  if (fleetData.searchQuery) {
    const q = fleetData.searchQuery;
    list = list.filter(c => clientMatchesQuery(c, q));
  }

  if (mode === 'active') {
    if (fleetData.currentTab === 'critical') {
      list = list.filter(c => c.has_critical_alert);
    } else if (fleetData.currentTab === 'unpaid') {
      list = list.filter(c => c.billing_status === 'OVERDUE_UNPAID');
    } else if (fleetData.currentTab === 'overdue') {
      list = list.filter(c => c.maint_status === 'OVERDUE' || c.maint_status === 'DUE_SOON');
    } else if (fleetData.currentTab === 'outdated_fw') {
      list = list.filter(c => c.outdated_fw_count > 0);
    } else if (fleetData.currentTab === 'healthy') {
      list = list.filter(c => !c.has_critical_alert && c.uptime_pct >= 90 && c.billing_status !== 'OVERDUE_UNPAID');
    }
  }

  return list;
}

// Column Sorting Handlers
function sortByColumn(col) {
  if (fleetData.sortColumn === col) {
    fleetData.sortDirection = fleetData.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    fleetData.sortColumn = col;
    // For numeric/status metrics, default to descending first
    if (['device_count', 'uptime_pct', 'kwh', 'health'].includes(col)) {
      fleetData.sortDirection = 'desc';
    } else {
      fleetData.sortDirection = 'asc';
    }
  }
  fleetData.page = 1;
  renderClientsTable();
}

function getSortedClients(list) {
  const col = fleetData.sortColumn || 'client_name';
  const dir = fleetData.sortDirection === 'desc' ? -1 : 1;

  return [...list].sort((a, b) => {
    switch (col) {
      case 'client_name':
        return (a.client_name || '').trim().localeCompare((b.client_name || '').trim(), undefined, { sensitivity: 'base' }) * dir;
      case 'city':
        const locA = `${a.city || ''} ${a.segment || ''}`;
        const locB = `${b.city || ''} ${b.segment || ''}`;
        return locA.localeCompare(locB, undefined, { sensitivity: 'base' }) * dir;
      case 'billing':
        const order = { 'OVERDUE_UNPAID': 3, 'PAYMENT_PENDING': 2, 'B2B_OFFLINE': 1, 'PAID': 0 };
        const bA = order[a.billing_status] !== undefined ? order[a.billing_status] : -1;
        const bB = order[b.billing_status] !== undefined ? order[b.billing_status] : -1;
        return (bA - bB) * dir;
      case 'device_count':
        return ((a.device_count || 0) - (b.device_count || 0)) * dir;
      case 'uptime_pct':
        return ((a.uptime_pct || 0) - (b.uptime_pct || 0)) * dir;
      case 'kwh':
        return ((a.total_kwh || 0) - (b.total_kwh || 0)) * dir;
      case 'maint':
        const mA = a.maint_days_remaining !== null && a.maint_days_remaining !== undefined ? a.maint_days_remaining : 9999;
        const mB = b.maint_days_remaining !== null && b.maint_days_remaining !== undefined ? b.maint_days_remaining : 9999;
        return (mA - mB) * dir;
      case 'health':
        const hA = (a.has_critical_alert ? 100 : 0) + (a.outdated_fw_count || 0);
        const hB = (b.has_critical_alert ? 100 : 0) + (b.outdated_fw_count || 0);
        return (hA - hB) * dir;
      default:
        return 0;
    }
  });
}

function updateSortHeaders() {
  const cols = ['client_name', 'city', 'billing', 'device_count', 'uptime_pct', 'kwh', 'maint', 'health'];
  cols.forEach(col => {
    const el = document.getElementById(`sort-icon-${col}`);
    if (!el) return;
    if (fleetData.sortColumn === col) {
      el.className = 'text-[11px] font-bold text-emerald-400';
      el.innerText = fleetData.sortDirection === 'asc' ? '▲' : '▼';
    } else {
      el.className = 'text-[11px] text-slate-600 group-hover:text-slate-400';
      el.innerText = '↕';
    }
  });
}

// 4. Render Client Table
function renderClientsTable() {
  const tbody = document.getElementById('clients-tbody');
  const filtered = getFilteredClients();
  const sorted = getSortedClients(filtered);

  const total = sorted.length;
  const totalPages = Math.ceil(total / fleetData.pageSize) || 1;
  if (fleetData.page > totalPages) fleetData.page = totalPages;

  const startIdx = (fleetData.page - 1) * fleetData.pageSize;
  const pageItems = sorted.slice(startIdx, startIdx + fleetData.pageSize);

  updateSortHeaders();

  document.getElementById('table-count-label').innerText = `Showing ${pageItems.length > 0 ? startIdx + 1 : 0}–${Math.min(startIdx + pageItems.length, total)} of ${total} clients`;
  document.getElementById('page-num-label').innerText = `Page ${fleetData.page} of ${totalPages}`;
  document.getElementById('prev-page-btn').disabled = fleetData.page <= 1;
  document.getElementById('next-page-btn').disabled = fleetData.page >= totalPages;

  if (pageItems.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-12 text-slate-500 font-mono">
          No clients match the current filter or search criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pageItems.map(c => {
    const isLost = (c.project_status || '').toLowerCase() === 'lost';

    // SLA Pill
    let slaBadge = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    let slaText = `${c.uptime_pct}%`;
    if (isLost) {
      slaBadge = 'bg-slate-800 text-slate-400 border-slate-700';
      slaText = 'INACTIVE';
    } else if (c.uptime_pct < 50) {
      slaBadge = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    } else if (c.uptime_pct < 90) {
      slaBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    }

    // Maintenance Badge
    let maintBadge = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    let maintText = c.maint_days_remaining !== null ? `${c.maint_days_remaining}d remaining` : 'On Track';
    let maintSub = escapeHtml(c.maint_type || 'Filter Service');
    if (isLost) {
      maintBadge = 'bg-slate-900 text-slate-400 border-slate-800';
      maintText = c.end_date ? `End: ${c.end_date}` : 'Contract Closed';
      maintSub = 'Decommissioned';
    } else if (c.maint_status === 'OVERDUE') {
      maintBadge = 'bg-rose-500/20 text-rose-400 border-rose-500/30 font-bold';
      maintText = `${Math.abs(c.maint_days_remaining)}d Overdue`;
    } else if (c.maint_status === 'DUE_SOON') {
      maintBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/30 font-bold';
      maintText = `Due in ${c.maint_days_remaining}d`;
    }

    // Billing Status Badge
    let billingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">B2B PO</span>';
    if (isLost) {
      billingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-400 border border-rose-800/80">LOST / CHURNED 🔴</span>';
    } else if (c.billing_status === 'PAID') {
      billingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">PAID 🟢</span>';
    } else if (c.billing_status === 'OVERDUE_UNPAID') {
      billingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">OVERDUE 🔴</span>';
    } else if (c.billing_status === 'PAYMENT_PENDING') {
      billingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">PENDING 🟡</span>';
    }

    // Health Tags (Critical Alert / Old FW)
    let healthPill = '<span class="text-[11px] text-emerald-400 font-semibold">Healthy</span>';
    if (isLost) {
      healthPill = '<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-slate-400 border border-slate-800">Archived</span>';
    } else if (c.has_critical_alert) {
      healthPill = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">🚨 Critical Alert</span>';
    } else if (c.outdated_fw_count > 0) {
      healthPill = `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">⚠️ ${c.outdated_fw_count} Old FW</span>`;
    }

    return `
      <tr class="hover:bg-slate-800/40 transition-colors group">
        <td class="py-3 px-4">
          <div class="font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5 flex-wrap">
            <span>${escapeHtml(c.client_name)}</span>
            ${isLost ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-950/90 text-rose-400 border border-rose-800 font-mono shadow-sm">LOST</span>` : ''}
            ${c.is_location_reconciled ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-950/80 text-cyan-400 border border-cyan-700/60" title="Auto-reconciled from MySQL location: ${escapeHtml(c.reconciled_location_name)}">🔄 Auto-Linked</span>` : ''}
          </div>
          <div class="text-[11px] text-slate-400">${escapeHtml(c.project_name)}</div>
          ${c.is_location_reconciled ? `<div class="text-[10px] text-cyan-400 font-mono mt-0.5 flex items-center gap-1"><span>📍</span> ${escapeHtml(c.reconciled_location_name)}</div>` : ''}
        </td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">${escapeHtml(c.segment || 'B2C')}</span>
            <span class="text-[10px] font-mono text-slate-300 bg-slate-950/80 px-1.5 py-0.5 rounded border border-slate-800">${getCountryFlag(c.country)} ${escapeHtml(c.country || 'Indonesia')}</span>
          </div>
          <div class="text-[11px] text-slate-400 mt-1 flex items-center gap-1"><span>📍</span> ${escapeHtml(c.city || 'Jakarta')}</div>
        </td>
        <td class="py-3 px-4">
          ${billingBadge}
        </td>
        <td class="py-3 px-4 font-mono">
          <div class="flex items-center gap-1.5 font-bold ${c.offline_count > 0 ? 'text-amber-400' : 'text-emerald-400'}">
            <span>${c.online_count}/${c.device_count}</span>
            <span class="text-[10px] font-normal text-slate-500">units</span>
          </div>
          ${c.minierp_planned_count ? `
            <div class="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
              <span>ERP:</span>
              <span class="text-emerald-400 font-semibold">${c.minierp_installed_count !== undefined ? c.minierp_installed_count : c.minierp_planned_count} inst</span>
              ${c.minierp_takeout_count ? `<span class="text-rose-400 font-semibold">/ ${c.minierp_takeout_count} out</span>` : ''}
            </div>
          ` : ''}
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono border ${slaBadge}">
            ${slaText}
          </span>
        </td>
        <td class="py-3 px-4 font-mono text-cyan-300 font-semibold">
          ${c.total_kwh ? c.total_kwh.toFixed(1) + ' kWh' : '0.0 kWh'}
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] border ${maintBadge}">
            ${maintText}
          </span>
          <div class="text-[10px] text-slate-400 mt-0.5">${maintSub}</div>
        </td>
        <td class="py-3 px-4">
          ${healthPill}
        </td>
        <td class="py-3 px-4 text-right">
          <button onclick="openClientDetail(${c.project_id})" class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-white font-semibold text-xs transition-all shadow-sm">
            Inspect
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function changePage(delta) {
  fleetData.page += delta;
  renderClientsTable();
}

// 5. Client Detail Drawer
let activeInspectRequestId = 0;

function resetDrawerLoading(projectId) {
  const scrollEl = document.getElementById('drawer-scroll-body');
  if (scrollEl) scrollEl.scrollTop = 0;

  const clientBrief = (fleetData.clients || []).find(c => c.project_id === projectId);
  const clientName = clientBrief ? escapeHtml(clientBrief.client_name) : `Client #${projectId}`;
  const projectName = clientBrief ? escapeHtml(clientBrief.project_name) : `Loading details...`;
  const segment = clientBrief ? escapeHtml(clientBrief.segment || 'B2C') : '...';
  const city = clientBrief ? `${escapeHtml(clientBrief.city || 'Jakarta')}, Indonesia` : '...';

  document.getElementById('drawer-client-name').innerHTML = `
    <span class="flex items-center gap-2">
      <span>${clientName}</span>
      <span class="inline-flex items-center text-xs font-normal text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded animate-pulse">
        <svg class="animate-spin -ml-0.5 mr-1.5 h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        Loading...
      </span>
    </span>
  `;
  document.getElementById('drawer-project-sub').innerText = `Project ID: #${projectId} | ${projectName}`;
  document.getElementById('drawer-segment-badge').innerText = segment;
  document.getElementById('drawer-billing-badge').className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700';
  document.getElementById('drawer-billing-badge').innerText = 'Syncing...';
  document.getElementById('drawer-city-label').innerText = city;

  document.getElementById('drawer-b-paid').innerText = 'Rp ...';
  document.getElementById('drawer-b-sub').innerText = 'Loading MongoDB billing...';
  document.getElementById('drawer-b-due').innerText = '...';
  document.getElementById('drawer-erp-count').innerText = '...';
  document.getElementById('drawer-erp-models').innerText = 'Loading Mini-ERP device registry...';
  document.getElementById('drawer-erp-recon').innerText = 'Cross-referencing live telemetry...';
  document.getElementById('drawer-erp-installed-badge').innerText = '-- Installed';
  document.getElementById('drawer-erp-takeout-badge').innerText = '-- Takeout';
  document.getElementById('drawer-erp-devices-list').innerHTML = `
    <div class="py-6 text-center text-slate-400 text-xs font-mono animate-pulse">
      Loading Mini-ERP hardware devices...
    </div>
  `;
  document.getElementById('drawer-maint-date').innerText = '...';
  document.getElementById('drawer-maint-type').innerText = '...';
  document.getElementById('drawer-last-service').innerText = '...';
  document.getElementById('drawer-last-tech').innerText = '...';
  document.getElementById('drawer-device-count').innerText = '...';
  document.getElementById('drawer-loc-uuid').innerText = `Loading location UUID for #${projectId}...`;

  document.getElementById('drawer-rooms-list').innerHTML = `
    <div class="py-8 text-center text-slate-400 text-xs font-mono animate-pulse">
      Loading room sensors, telemetry & electrical draw...
    </div>
  `;
  document.getElementById('drawer-reports-list').innerHTML = `
    <div class="py-4 text-center text-slate-400 text-xs font-mono animate-pulse">
      Loading service logs...
    </div>
  `;
}

function showDrawerError(projectId, err) {
  document.getElementById('drawer-client-name').innerHTML = `
    <span class="text-rose-400 flex items-center gap-2 font-bold">
      <span>⚠️ Error Loading Client #${projectId}</span>
    </span>
  `;
  document.getElementById('drawer-project-sub').innerText = `Could not retrieve live data for this project: ${err.message || err}`;
  document.getElementById('drawer-rooms-list').innerHTML = `
    <div class="p-6 bg-rose-950/30 border border-rose-900/60 rounded-xl text-center space-y-3">
      <div class="text-xs text-rose-300 font-mono">Failed to fetch intelligence records for client #${projectId}.</div>
      <button onclick="openClientDetail(${projectId})" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow">Retry Inspection</button>
    </div>
  `;
}

async function openClientDetail(projectId) {
  const drawer = document.getElementById('detail-drawer');
  drawer.classList.remove('hidden');

  activeInspectRequestId++;
  const currentRequestId = activeInspectRequestId;

  resetDrawerLoading(projectId);

  try {
    const res = await fetch(`/api/fleet/client/${projectId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const detail = await res.json();

    // Guard against stale response if user clicked another client while this was in flight
    if (currentRequestId !== activeInspectRequestId) {
      return;
    }

    fleetData.selectedClient = detail;
    renderDrawerContent(detail);
  } catch (err) {
    if (currentRequestId !== activeInspectRequestId) return;
    console.error('Failed to load client detail:', err);
    showDrawerError(projectId, err);
  }
}

function closeDrawer() {
  activeInspectRequestId++;
  document.getElementById('detail-drawer').classList.add('hidden');
  fleetData.selectedClient = null;
}

function renderDrawerContent(data) {
  if (!data || !data.client_info) {
    showDrawerError(fleetData.selectedClient?.client_info?.project_id || 'Unknown', new Error('Empty response received'));
    return;
  }
  const c = data.client_info;
  normalizeClientCountryCity(c);
  const billing = data.billing || {};
  const isLost = (c.project_status || '').toLowerCase() === 'lost';

  if (isLost) {
    document.getElementById('drawer-client-name').innerHTML = `
      <div class="flex items-center gap-2">
        <span>${escapeHtml(c.client_name)}</span>
        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-400 border border-rose-800 font-mono">LOST</span>
      </div>
    `;
    document.getElementById('drawer-project-sub').innerHTML = `
      <span>Project ID: #${c.project_id} | ${escapeHtml(c.project_name)}</span>
      ${c.end_date ? `<span class="text-rose-400 font-mono ml-2 font-semibold">• Contract Ended: ${escapeHtml(c.end_date)}</span>` : ''}
    `;
    document.getElementById('drawer-device-count').innerText = `${c.online_count}/${c.device_count} Units Online (Account Lost / Inactive)`;
  } else {
    document.getElementById('drawer-client-name').innerText = c.client_name;
    document.getElementById('drawer-project-sub').innerText = `Project ID: #${c.project_id} | ${c.project_name} | Contract: ${c.contract_type || 'Standard'}`;
    document.getElementById('drawer-device-count').innerText = `${c.online_count}/${c.device_count} Units Online (${c.uptime_pct}% SLA)`;
  }

  document.getElementById('drawer-segment-badge').innerText = c.segment || 'B2C';
  document.getElementById('drawer-city-label').innerText = `${c.city || 'Jakarta'}, ${c.country || 'Indonesia'}`;
  
  if (c.is_location_reconciled) {
    document.getElementById('drawer-loc-uuid').innerHTML = `
      <span class="text-slate-400">Location:</span> <span class="text-cyan-300 font-semibold font-mono">📍 ${escapeHtml(c.reconciled_location_name)}</span> 
      <span class="text-[10px] text-cyan-400 bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/60 ml-1">⚡ Auto-Linked (${escapeHtml(c.location_uuid)})</span>
    `;
  } else {
    document.getElementById('drawer-loc-uuid').innerText = `Location UUID: ${c.location_uuid || 'N/A'}`;
  }

  // MongoDB Billing Card
  const bBadge = document.getElementById('drawer-billing-badge');
  const bStatus = document.getElementById('drawer-b-status');
  const bPaid = document.getElementById('drawer-b-paid');
  const bSub = document.getElementById('drawer-b-sub');
  const bDue = document.getElementById('drawer-b-due');

  if (c.billing_status === 'PAID') {
    bBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    bBadge.innerText = 'Paid 🟢';
    bStatus.className = 'px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold';
    bStatus.innerText = 'PAID (GOOD STANDING)';
  } else if (c.billing_status === 'OVERDUE_UNPAID') {
    bBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30';
    bBadge.innerText = 'Overdue 🔴';
    bStatus.className = 'px-1.5 py-0.2 rounded text-[9px] bg-rose-500/20 text-rose-400 font-bold animate-pulse';
    bStatus.innerText = 'OVERDUE / UNPAID';
  } else if (c.billing_status === 'PAYMENT_PENDING') {
    bBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30';
    bBadge.innerText = 'Pending 🟡';
    bStatus.className = 'px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-bold';
    bStatus.innerText = 'PAYMENT PENDING';
  } else {
    bBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700';
    bBadge.innerText = 'B2B PO ⚪';
    bStatus.className = 'px-1.5 py-0.2 rounded text-[9px] bg-slate-800 text-slate-300';
    bStatus.innerText = 'OFFLINE CONTRACT';
  }

  bPaid.innerText = formatRupiah(billing.total_paid_amount || 0);
  bSub.innerText = `Invoices: ${billing.paid_invoices || 0} Paid • ${billing.unpaid_invoices || 0} Unpaid • ${billing.waiting_payment || 0} Pending`;
  bDue.innerText = billing.latest_due_date ? `Latest Due Date: ${billing.latest_due_date}` : 'Payment Schedule: Standard';

  // Mini-ERP Hardware Reconciliation Card
  document.getElementById('drawer-erp-count').innerText = `${erpDevices.length} units planned`;
  const modelEntries = Object.entries(c.minierp_models || {});
  document.getElementById('drawer-erp-models').innerText = modelEntries.length > 0 
    ? modelEntries.map(([m, qty]) => `${qty}x ${m}`).join(', ')
    : 'No explicit BOM models registered';
  document.getElementById('drawer-erp-recon').innerText = `Live MySQL Telemetry: ${c.device_count} units (${c.online_count} active)`;

  // Mini-ERP Hardware Inventory (Installed vs Takeout Breakdown)
  const installedCount = c.minierp_installed_count !== undefined 
    ? c.minierp_installed_count 
    : erpDevices.filter(d => d.normalized_status === 'Installed').length;
  const takeoutCount = c.minierp_takeout_count !== undefined 
    ? c.minierp_takeout_count 
    : erpDevices.filter(d => d.normalized_status === 'Takeout').length;
  const spareCount = c.minierp_spare_count || erpDevices.filter(d => d.normalized_status === 'Spare').length;

  const instBadge = document.getElementById('drawer-erp-installed-badge');
  const outBadge = document.getElementById('drawer-erp-takeout-badge');
  if (instBadge) instBadge.innerText = `${installedCount} Installed`;
  if (outBadge) {
    outBadge.innerText = `${takeoutCount} Takeout`;
    if (takeoutCount > 0) {
      outBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse';
    } else {
      outBadge.className = 'px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-800 text-slate-400 border border-slate-700';
    }
  }

  // Populate drawer-erp-devices-list
  const erpListEl = document.getElementById('drawer-erp-devices-list');
  if (erpListEl) {
    if (erpDevices.length === 0) {
      erpListEl.innerHTML = `<div class="text-xs text-slate-500 font-mono py-3 text-center">No hardware devices planned in Mini-ERP for this project.</div>`;
    } else {
      erpListEl.innerHTML = erpDevices.map(ed => {
        const isTakeout = ed.normalized_status === 'Takeout';
        const isSpare = ed.normalized_status === 'Spare';
        
        let statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">🟢 Installed</span>`;
        if (isTakeout) {
          statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/20 text-rose-400 border border-rose-500/40">🔴 Takeout</span>`;
        } else if (isSpare) {
          statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30">🟡 Spare</span>`;
        }

        let telemetryBadge = '';
        if (ed.in_telemetry) {
          if (ed.connectivity === 'online') {
            telemetryBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-700/50">⚡ Online</span>`;
          } else {
            telemetryBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-rose-950/60 text-rose-400 border border-rose-800/40">Offline</span>`;
          }
        } else {
          telemetryBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-500 bg-slate-900 border border-slate-800">No Signal</span>`;
        }

        const dateInfo = isTakeout && ed.takeout_date 
          ? `<span class="text-rose-400/90 font-mono">Takeout: ${escapeHtml(String(ed.takeout_date).slice(0, 10))}</span>`
          : (ed.installed_date ? `<span class="text-slate-400 font-mono">Installed: ${escapeHtml(String(ed.installed_date).slice(0, 10))}</span>` : '');

        return `
          <div class="flex items-center justify-between p-2.5 rounded-xl border ${isTakeout ? 'border-rose-900/50 bg-rose-950/20' : 'border-slate-800/80 bg-slate-900/60'} text-xs">
            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <span class="font-bold text-white font-mono">${escapeHtml(ed.device_id || 'Unnamed Device')}</span>
                <span class="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded font-mono">${escapeHtml(ed.device_item_type || ed.device_type || 'Unit')}</span>
                ${telemetryBadge}
              </div>
              <div class="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                <span>📍 ${escapeHtml(ed.room_name || 'Room')}</span>
                ${dateInfo ? `<span>•</span> ${dateInfo}` : ''}
                ${ed.notes ? `<span>•</span> <span class="italic text-slate-400 max-w-[200px] truncate" title="${escapeHtml(ed.notes)}">${escapeHtml(ed.notes)}</span>` : ''}
              </div>
            </div>
            <div class="pl-2 flex-shrink-0">
              ${statusBadge}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Maintenance info
  document.getElementById('drawer-maint-date').innerText = c.maint_target_date || 'No Date Set';
  document.getElementById('drawer-maint-type').innerText = c.maint_type || 'Filter Cleaning';
  document.getElementById('drawer-last-service').innerText = c.last_service_date || 'No Prior Log';
  document.getElementById('drawer-last-tech').innerText = c.last_service_technician ? `Technician: ${c.last_service_technician}` : 'Technician: Not Recorded';

  const mBadge = document.getElementById('drawer-maint-badge');
  if (c.maint_status === 'OVERDUE') {
    mBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30';
    mBadge.innerText = `${Math.abs(c.maint_days_remaining)}d Overdue`;
  } else if (c.maint_status === 'DUE_SOON') {
    mBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30';
    mBadge.innerText = `Due in ${c.maint_days_remaining}d`;
  } else {
    mBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    mBadge.innerText = 'On Track';
  }

  // Render Rooms & Devices
  const roomsList = document.getElementById('drawer-rooms-list');
  const rooms = data.rooms || {};
  const roomKeys = Object.keys(rooms);

  if (roomKeys.length === 0) {
    roomsList.innerHTML = `
      <div class="bg-slate-950/40 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs font-mono">
        No telemetry devices transmitting for this location.
      </div>
    `;
  } else {
    roomsList.innerHTML = roomKeys.map(rName => {
      const devs = rooms[rName];
      return `
        <div class="bg-slate-950/90 border border-slate-800/80 rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between border-b border-slate-800/60 pb-2">
            <span class="text-xs font-bold text-white flex items-center gap-1.5">
              <span>📍</span> ${escapeHtml(rName)}
            </span>
            <span class="text-[11px] font-mono text-slate-400">${devs.length} device(s)</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${devs.map(renderDeviceCard).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Reports
  const reportsList = document.getElementById('drawer-reports-list');
  const reports = data.fieldwork_reports || [];
  if (reports.length === 0) {
    reportsList.innerHTML = `<div class="text-xs text-slate-500 font-mono py-2">No fieldwork service logs on record.</div>`;
  } else {
    reportsList.innerHTML = reports.slice(0, 5).map(r => `
      <div class="bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-xs space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-200">${escapeHtml(r.activity_type || 'Maintenance')}</span>
          <span class="font-mono text-slate-400 text-[10px]">${r.activity_date || 'N/A'}</span>
        </div>
        <div class="text-slate-400 text-[11px]">Technician: <span class="text-slate-200">${escapeHtml(r.technician_name || 'Assigned Tech')}</span></div>
        ${r.problem_description ? `<div class="text-rose-400 text-[11px]">Problem: ${escapeHtml(r.problem_description)}</div>` : ''}
        ${r.action_taken ? `<div class="text-emerald-400 text-[11px]">Action: ${escapeHtml(r.action_taken)}</div>` : ''}
      </div>
    `).join('');
  }
}

function renderDeviceCard(d) {
  const isOnline = d.connectivity === 'online';
  const isPurifier = d.category_code === 'airpure';
  const meas = d.measurement_current || {};
  const state = d.device_state || {};
  const filt = state.filter || {};
  const filterLife = filt.life !== undefined ? Number(filt.life).toFixed(1) : null;
  const kwh = d.total_powerconsumption !== undefined ? Number(d.total_powerconsumption).toFixed(2) : '0.00';

  // Firmware tag
  const isOldFw = d.is_firmware_outdated;
  const fwTag = d.device_firmware 
    ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono ${isOldFw ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-800 text-slate-400'}">FW: ${d.device_firmware}${isOldFw ? ' ⚠️' : ''}</span>`
    : '';

  // Mini-ERP status tag
  let erpTag = '';
  if (d.erp_status === 'Takeout') {
    erpTag = `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse" title="Flagged as TAKEOUT in Mini-ERP!">⚠️ ERP: Takeout</span>`;
  } else if (d.erp_status === 'Installed') {
    erpTag = `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">✓ ERP: Installed</span>`;
  } else if (d.erp_status === 'Spare') {
    erpTag = `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">ERP: Spare</span>`;
  } else if (d.erp_status === 'Unregistered') {
    erpTag = `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-800 text-slate-500 border border-slate-700">ERP: Unregistered</span>`;
  }

  return `
    <div class="bg-slate-900 border ${isOnline ? 'border-slate-800' : 'border-rose-900/40'} rounded-xl p-3 flex flex-col justify-between space-y-2.5">
      <div>
        <div class="flex items-start justify-between">
          <div>
            <div class="text-xs font-bold text-white flex items-center gap-1.5">
              <span>${isPurifier ? '🌀' : '📡'}</span>
              <span>${escapeHtml(d.device_name || 'Device')}</span>
            </div>
            <div class="text-[10px] font-mono text-slate-400 mt-0.5">${escapeHtml(d.vendor_device_id || d.device_type)}</div>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${isOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}">
            ${d.connectivity || 'offline'}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-1 mt-1.5">
          ${erpTag}
          ${fwTag}
          ${isPurifier ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">⚡ ${kwh} kWh</span>` : ''}
          ${d.speed ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-800 text-slate-300">Speed ${d.speed}</span>` : ''}
        </div>
      </div>

      <!-- Sensor Metrics Grid -->
      <div class="grid grid-cols-2 gap-1.5 text-[11px] font-mono bg-slate-950/60 p-2 rounded-lg">
        ${meas.pm25 !== undefined ? `
          <div class="text-slate-400">PM₂.₅: <span class="font-bold ${meas.pm25 > 25 ? 'text-rose-400' : 'text-emerald-400'}">${meas.pm25} µg/m³</span></div>
        ` : ''}
        ${meas.co2 !== undefined ? `
          <div class="text-slate-400">CO₂: <span class="font-bold ${meas.co2 > 1200 ? 'text-amber-400' : 'text-slate-200'}">${meas.co2} ppm</span></div>
        ` : ''}
        ${filterLife !== null ? `
          <div class="text-slate-400">Filter: <span class="font-bold ${filterLife < 15 ? 'text-rose-400' : 'text-emerald-400'}">${filterLife}%</span></div>
        ` : ''}
        ${meas.coin_batt !== undefined ? `
          <div class="text-slate-400">Coin Batt: <span class="font-bold text-slate-300">${Number(meas.coin_batt).toFixed(2)}V</span></div>
        ` : ''}
      </div>
    </div>
  `;
}

function copyClientSummary() {
  if (!fleetData.selectedClient) return;
  const c = fleetData.selectedClient.client_info;
  const b = fleetData.selectedClient.billing || {};
  const summary = `Nafas CAZ Fleet Diagnostic:
Client: ${c.client_name} (${c.project_name})
City: ${c.city}, ${c.country}
Billing Status: ${c.billing_status} (Paid: Rp ${Math.round(b.total_paid_amount || 0).toLocaleString('id-ID')})
Devices: ${c.online_count}/${c.device_count} Online (${c.uptime_pct}% SLA)
Total Power: ${c.total_kwh} kWh
Next Maintenance: ${c.maint_target_date || 'N/A'} (${c.maint_type})
Status: ${c.maint_status}`;

  navigator.clipboard.writeText(summary).then(() => {
    alert('Client diagnostic summary copied to clipboard!');
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
