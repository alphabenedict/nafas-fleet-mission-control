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

  const btnActive = document.getElementById('sidebar-tab-active') || document.getElementById('fleet-tab-active');
  const btnLost = document.getElementById('sidebar-tab-lost') || document.getElementById('fleet-tab-lost');
  const desc = document.getElementById('table-subtitle');
  const tableTitle = document.getElementById('table-title');
  const quickFilters = document.getElementById('quick-filter-tabs');

  if (mode === 'active') {
    if (btnActive) btnActive.className = 'w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors bg-primary text-primary-foreground flex items-center justify-between cursor-pointer';
    if (btnLost) btnLost.className = 'w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-between cursor-pointer';
    if (desc) desc.innerText = 'Monitoring all active zones and hardware specs across your fleet.';
    if (tableTitle) tableTitle.innerText = 'Coverage overview';
    if (quickFilters) quickFilters.classList.remove('opacity-40', 'pointer-events-none');
  } else {
    if (btnActive) btnActive.className = 'w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-between cursor-pointer';
    if (btnLost) btnLost.className = 'w-full rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors bg-destructive text-destructive-foreground flex items-center justify-between cursor-pointer';
    if (desc) desc.innerText = 'Showing decommissioned / churned accounts (Mini-ERP takeouts & hardware reconciliation)';
    if (tableTitle) tableTitle.innerText = 'Decommissioned & Lost Client Accounts';
    if (quickFilters) quickFilters.classList.add('opacity-40', 'pointer-events-none');
  }

  populateCountryFilter();
  renderKPIs();
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

  // Sync select elements
  const cSel = document.getElementById('country-filter');
  if (cSel && cSel.value !== country) cSel.value = country;
  const hSel = document.getElementById('header-country-filter');
  if (hSel && hSel.value !== country) hSel.value = country;

  populateCountryFilter();
  renderKPIs();
  renderClientsTable();
}

function populateCountryFilter() {
  const selects = [
    document.getElementById('country-filter'),
    document.getElementById('header-country-filter')
  ].filter(Boolean);

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

  const optionsHtml = `
    <option value="all">🌍 All Regions (Global) (${targetClients.length})</option>
    ${sortedCountries.map(ctry => {
      const flag = getCountryFlag(ctry);
      return `<option value="${escapeHtml(ctry)}" ${current.toLowerCase() === ctry.toLowerCase() ? 'selected' : ''}>${flag} ${escapeHtml(ctry)} (${counts[ctry]})</option>`;
    }).join('')}
  `;

  selects.forEach(sel => {
    sel.innerHTML = optionsHtml;
    sel.value = current;
  });

  // Render quick region pills above the 4 Metric Cards
  const pillsContainer = document.getElementById('region-pills');
  if (pillsContainer) {
    const isGlobal = !current || current === 'all';
    pillsContainer.innerHTML = `
      <button 
        onclick="handleCountryFilter('all')" 
        class="px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${isGlobal ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-muted text-muted-foreground hover:text-foreground'}"
      >
        🌍 All Regions (${targetClients.length})
      </button>
      ${sortedCountries.map(ctry => {
        const flag = getCountryFlag(ctry);
        const isActive = current.toLowerCase() === ctry.toLowerCase();
        return `
          <button 
            onclick="handleCountryFilter('${escapeHtml(ctry)}')" 
            class="px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${isActive ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-muted text-muted-foreground hover:text-foreground'}"
          >
            <span>${flag}</span>
            <span>${escapeHtml(ctry)}</span>
            <span class="text-[10px] font-mono opacity-80 font-normal">(${counts[ctry]})</span>
          </button>
        `;
      }).join('')}
    `;
  }

  const regionLabel = document.getElementById('overview-active-region-label');
  if (regionLabel) {
    if (!current || current === 'all') {
      regionLabel.innerText = '🌍 Global Fleet';
    } else {
      regionLabel.innerText = `${getCountryFlag(current)} ${current}`;
    }
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('nafas-theme', isDark ? 'dark' : 'light');
  const icon = document.getElementById('theme-icon');
  if (icon) icon.innerText = isDark ? '☀️' : '🌙';
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('nafas-theme');
  if (saved === 'light') {
    document.documentElement.classList.remove('dark');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerText = '🌙';
  } else {
    document.documentElement.classList.add('dark');
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerText = '☀️';
  }

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

    // If cache is empty during initial server warm-up, poll status every 2.5s until cache is ready
    if (!fleetData.clients || fleetData.clients.length === 0 || !fleetData.summary || !fleetData.summary.total_active_devices) {
      const syncLabel = document.getElementById('last-sync-time');
      if (syncLabel) syncLabel.innerText = 'Syncing fleet telemetry...';
      if (!window._fleetPollInterval) {
        window._fleetPollInterval = setInterval(async () => {
          try {
            const st = await fetch('/api/fleet/status').then(r => r.json());
            if (st.total_active_devices > 0 || (!st.is_refreshing && st.cache_valid)) {
              clearInterval(window._fleetPollInterval);
              window._fleetPollInterval = null;
              await fetchFleetData();
            }
          } catch (e) {}
        }, 2500);
      }
    } else if (window._fleetPollInterval) {
      clearInterval(window._fleetPollInterval);
      window._fleetPollInterval = null;
    }

    // Reset online VPN / API indicator
    const vpnEl = document.getElementById('vpn-status');
    const vpnDot = document.getElementById('vpn-dot');
    if (vpnEl) {
      vpnEl.innerText = 'VPN: Azure Alpha';
      vpnEl.className = 'text-[#A5B3A8] font-medium';
    }
    if (vpnDot) {
      vpnDot.className = 'w-2 h-2 rounded-full bg-[#91C851] animate-pulse';
    }
  } catch (err) {
    console.error('Failed to load fleet data:', err);
    const vpnEl = document.getElementById('vpn-status');
    const vpnDot = document.getElementById('vpn-dot');
    if (vpnEl) {
      vpnEl.innerText = 'VPN / API Offline';
      vpnEl.className = 'text-rose-400 font-bold';
    }
    if (vpnDot) {
      vpnDot.className = 'w-2 h-2 rounded-full bg-rose-500';
    }
    const syncLabel = document.getElementById('last-sync-time');
    if (syncLabel) {
      syncLabel.innerText = 'Sync Error';
    }
  }
}

async function triggerManualRefresh() {
  const btn = document.getElementById('refresh-btn');
  const icon = document.getElementById('refresh-icon');
  const syncLabel = document.getElementById('last-sync-time');
  if (btn) btn.disabled = true;
  if (icon) icon.classList.add('animate-spin');
  if (syncLabel) syncLabel.innerText = 'Syncing...';

  try {
    await fetch('/api/fleet/refresh', { method: 'POST' }).then(r => r.json());

    // Poll status until backend refresh completes
    let seconds = 0;
    const maxWaitSeconds = 90;
    while (seconds < maxWaitSeconds) {
      await new Promise(r => setTimeout(r, 2000));
      seconds += 2;
      try {
        const st = await fetch('/api/fleet/status').then(r => r.json());
        if (!st.is_refreshing) {
          break;
        }
        if (syncLabel) {
          syncLabel.innerText = `Syncing (${seconds}s)...`;
        }
      } catch (e) {
        // keep polling
      }
    }

    await fetchFleetData();
    if (syncLabel) syncLabel.innerText = 'Sync Complete';
    setTimeout(updateSyncTime, 2500);
  } catch (err) {
    console.error('Refresh failed:', err);
    if (syncLabel) syncLabel.innerText = 'Sync Failed';
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.classList.remove('animate-spin');
  }
}

function updateSyncTime() {
  const syncLabel = document.getElementById('last-sync-time');
  if (syncLabel) {
    const now = new Date();
    syncLabel.innerText = 'Refreshed ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

// 1. Render KPIs (Dynamic per Country Selection)
function renderKPIs() {
  const isAllCountries = !fleetData.selectedCountry || fleetData.selectedCountry === 'all';
  const countryName = !isAllCountries ? fleetData.selectedCountry : 'Global';
  const flag = !isAllCountries ? getCountryFlag(countryName) : '🌍';

  let activeCount = 0;
  let lostCount = 0;
  let totalDevices = 0;
  let onlineDevices = 0;
  let offlineDevices = 0;
  let uptimePct = 0;
  let totalKwh = 0;
  let paidCount = 0;
  let unpaidCount = 0;
  let pendingCount = 0;
  let criticalAlertsCount = 0;

  if (isAllCountries) {
    const s = fleetData.summary || {};
    activeCount = s.active_clients_count !== undefined ? s.active_clients_count : (s.total_clients || '--');
    lostCount = s.lost_clients_count !== undefined ? s.lost_clients_count : 0;
    totalDevices = s.total_active_devices !== undefined ? s.total_active_devices : '--';
    onlineDevices = s.total_online_devices || 0;
    offlineDevices = s.total_offline_devices || 0;
    uptimePct = s.global_uptime_pct || 0;
    totalKwh = s.total_fleet_kwh || 0;
    paidCount = s.paid_clients_count || 0;
    unpaidCount = s.unpaid_clients_count || 0;
    pendingCount = s.pending_clients_count || 0;
    criticalAlertsCount = s.critical_alerts_count || 0;
  } else {
    const targetC = countryName.trim().toLowerCase();
    const cList = (fleetData.clients || []).filter(c => (c.country || 'Indonesia').trim().toLowerCase() === targetC);
    
    const activeClients = cList.filter(c => (c.project_status || 'active') === 'active');
    const lostClients = cList.filter(c => (c.project_status || '').toLowerCase() === 'lost');

    activeCount = activeClients.length;
    lostCount = lostClients.length;

    totalDevices = activeClients.reduce((acc, c) => acc + (c.device_count || 0), 0);
    onlineDevices = activeClients.reduce((acc, c) => acc + (c.online_count || 0), 0);
    offlineDevices = Math.max(0, totalDevices - onlineDevices);
    uptimePct = totalDevices > 0 ? Number(((onlineDevices / totalDevices) * 100).toFixed(1)) : 0;
    totalKwh = activeClients.reduce((acc, c) => acc + (c.total_kwh || 0), 0);

    paidCount = activeClients.filter(c => c.billing_status === 'PAID').length;
    unpaidCount = activeClients.filter(c => c.billing_status === 'OVERDUE_UNPAID').length;
    pendingCount = activeClients.filter(c => c.billing_status === 'PAYMENT_PENDING').length;
    criticalAlertsCount = activeClients.filter(c => c.has_critical_alert).length;
  }
  
  // 1. Active Clients Card
  const cEl = document.getElementById('kpi-clients');
  if (cEl) cEl.innerText = activeCount;

  const clientsSub = document.getElementById('kpi-clients-sub');
  if (clientsSub) {
    if (isAllCountries) {
      clientsSub.innerText = `Global: ${activeCount} Active • ${lostCount} Lost`;
    } else {
      clientsSub.innerText = `${flag} ${countryName}: ${activeCount} Active • ${lostCount} Lost`;
    }
  }

  // 2. Deployed Devices Card
  const dEl = document.getElementById('kpi-devices');
  if (dEl) dEl.innerText = totalDevices;

  const dSub = document.getElementById('kpi-device-sub');
  if (dSub) {
    const takeoutTotal = isAllCountries 
      ? (fleetData.summary?.total_takeout_devices || 0)
      : activeClients.reduce((acc, c) => acc + (c.takeout_count || 0), 0);
    const takeoutNotice = takeoutTotal > 0 ? ` • ${takeoutTotal} Takeout Excluded` : '';
    dSub.innerText = `${onlineDevices} Online / ${offlineDevices} Offline${takeoutNotice}`;
  }
  
  // 3. Fleet Uptime (SLA) Card
  const uptimeTitle = document.getElementById('kpi-uptime-title');
  if (uptimeTitle) {
    uptimeTitle.innerText = isAllCountries ? 'Global Fleet Uptime (SLA)' : `${flag} ${countryName} Fleet Uptime (SLA)`;
  }

  const uptimeEl = document.getElementById('kpi-uptime');
  if (uptimeEl) {
    uptimeEl.innerText = `${uptimePct}%`;
    if (uptimePct >= 90) uptimeEl.className = 'text-2xl font-bold text-[#91C851] mt-2 font-mono tracking-tight';
    else if (uptimePct >= 75) uptimeEl.className = 'text-2xl font-bold text-amber-400 mt-2 font-mono tracking-tight';
    else uptimeEl.className = 'text-2xl font-bold text-rose-400 mt-2 font-mono tracking-tight';
  }

  const uptimeSub = document.getElementById('kpi-uptime-sub');
  if (uptimeSub) {
    if (isAllCountries) {
      uptimeSub.innerText = `🌍 Global Target: >95.0% (${onlineDevices}/${totalDevices} online)`;
    } else {
      uptimeSub.innerText = `${flag} ${countryName} Target: >95.0% (${onlineDevices}/${totalDevices} online)`;
    }
  }

  // 4. Total Energy kWh
  const kwhEl = document.getElementById('kpi-kwh');
  if (kwhEl) {
    kwhEl.innerText = `${Math.round(totalKwh).toLocaleString()} kWh`;
  }

  const kwhSub = document.getElementById('kpi-kwh-sub');
  if (kwhSub) {
    if (isAllCountries) {
      kwhSub.innerText = 'Cumulative Telemetry kWh';
    } else {
      kwhSub.innerText = `${flag} ${countryName} Telemetry kWh`;
    }
  }

  // Billing KPI (if present)
  const billEl = document.getElementById('kpi-billing');
  const billSub = document.getElementById('kpi-billing-sub');
  const unpaidDot = document.getElementById('kpi-unpaid-dot');
  if (billEl) {
    billEl.innerText = `${paidCount} Paid`;
    if (billSub) billSub.innerText = `${unpaidCount} Overdue / ${pendingCount} Pending`;
    if (unpaidCount > 0 && unpaidDot) {
      unpaidDot.classList.remove('hidden');
    }
  }

  const critEl = document.getElementById('kpi-critical');
  if (critEl) critEl.innerText = criticalAlertsCount;
}

// 2. Render Bad Alert Triage Center
function renderAlerts() {
  const alertsSec = document.getElementById('alerts-section');
  const alertsList = document.getElementById('alerts-list');
  const badge = document.getElementById('alerts-badge');
  const badgeCount = document.getElementById('alerts-badge-count');

  const alerts = fleetData.alerts || [];
  if (!alerts || alerts.length === 0) {
    if (alertsSec) alertsSec.classList.add('hidden');
    if (badgeCount) badgeCount.innerText = '0';
    return;
  }

  if (alertsSec) alertsSec.classList.remove('hidden');
  if (badge) badge.innerText = `${alerts.length} Active Alerts`;
  if (badgeCount) badgeCount.innerText = alerts.length;

  if (!alertsList) return;
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
        <p class="text-[11px] text-[#A5B3A8] leading-snug">${escapeHtml(a.message || '')}</p>
        <div class="flex items-center justify-between pt-1 border-t border-[#29342c]/60 text-[10px]">
          <span class="text-slate-500 font-mono">${a.created_at ? new Date(a.created_at).toLocaleTimeString() : ''}</span>
          ${a.project_id ? `<button onclick="openClientDetail(${a.project_id})" class="text-[#91C851] hover:underline font-semibold">Inspect Client &rarr;</button>` : ''}
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

  // Keep sidebar, header, and table search inputs in sync
  const sidebarInput = document.getElementById('sidebar-search-input');
  if (sidebarInput && sidebarInput.value !== query) sidebarInput.value = query;
  const headerInput = document.getElementById('global-search-input');
  if (headerInput && headerInput.value !== query) headerInput.value = query;
  const tableInput = document.getElementById('search-input');
  if (tableInput && tableInput.value !== query) tableInput.value = query;

  renderClientsTable();
  renderSearchResultsDropdown(q);
}

function handleTableSearch(query) {
  const q = query.trim().toLowerCase();
  fleetData.searchQuery = q;
  fleetData.page = 1;

  const sidebarInput = document.getElementById('sidebar-search-input');
  if (sidebarInput && sidebarInput.value !== query) sidebarInput.value = query;
  const headerInput = document.getElementById('global-search-input');
  if (headerInput && headerInput.value !== query) headerInput.value = query;
  const tableInput = document.getElementById('search-input');
  if (tableInput && tableInput.value !== query) tableInput.value = query;

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

    let slaClass = 'text-[#91C851]';
    if (c.uptime_pct < 50) slaClass = 'text-rose-400';
    else if (c.uptime_pct < 90) slaClass = 'text-amber-400';

    const isLost = (c.project_status || '').toLowerCase() === 'lost';

    return `
      <div 
        onclick="selectSearchResult(${c.project_id})"
        class="p-3 hover:bg-[#202923] cursor-pointer transition-all rounded-xl flex items-start justify-between gap-3 group border border-transparent hover:border-[#29342c]"
      >
        <div class="space-y-1 flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-bold text-[#F4F6F4] text-xs group-hover:text-[#91C851] transition-colors">${escapeHtml(c.client_name)}</span>
            ${isLost ? `<span class="brand-pill brand-pill-critical">LOST</span>` : ''}
            <span class="text-[9px] text-[#A5B3A8] bg-[#202923] px-1.5 py-0.2 rounded font-mono">${escapeHtml(c.segment || 'B2C')}</span>
            <span class="text-[10px] text-[#A5B3A8] font-mono">${getCountryFlag(c.country)} ${escapeHtml(c.country || 'Indonesia')} • ${escapeHtml(c.city || 'Jakarta')}</span>
            ${c.is_location_reconciled ? `<span class="text-[9px] text-[#2DD4BF] bg-[#2DD4BF]/10 px-1.5 py-0.2 rounded border border-[#2DD4BF]/30">Auto-Linked</span>` : ''}
          </div>
          <div class="text-[11px] text-[#A5B3A8] truncate">${escapeHtml(c.project_name)}</div>
          
          <!-- What's Inside Hardware & Telemetry Summary -->
          <div class="flex items-center gap-1.5 flex-wrap pt-0.5 text-[10px] font-mono">
            <span class="px-1.5 py-0.2 rounded bg-[#101412] text-[#F4F6F4] border border-[#29342c]">
              📦 ${c.online_count}/${c.device_count} Active (<span class="${slaClass} font-bold">${c.uptime_pct}% SLA</span>)
            </span>
            <span class="brand-pill brand-pill-success">
              🟢 ${instCount} Inst
            </span>
            ${outCount > 0 ? `
              <span class="brand-pill brand-pill-critical">
                🔴 ${outCount} Out
              </span>
            ` : ''}
            <span class="text-[#A5B3A8] truncate max-w-[260px] text-[10px]" title="${escapeHtml(modelsSummary)}">
              🔍 ${escapeHtml(modelsSummary)}
            </span>
          </div>
        </div>

        <button 
          onclick="event.stopPropagation(); selectSearchResult(${c.project_id})" 
          class="btn-brand-primary px-2.5 py-1.5 text-[11px] flex-shrink-0 transition-all shadow-sm group-hover:scale-105 flex items-center gap-1 cursor-pointer"
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
  ['all', 'critical', 'unpaid', 'overdue', 'healthy'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) {
      if (t === tab) {
        el.className = 'px-2.5 py-1 rounded-full bg-primary text-primary-foreground font-semibold transition-all';
      } else {
        el.className = 'px-2.5 py-1 rounded-full text-muted-foreground hover:text-foreground transition-all';
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
      el.className = 'text-[11px] font-bold text-[#91C851]';
      el.innerText = fleetData.sortDirection === 'asc' ? '▲' : '▼';
    } else {
      el.className = 'text-[11px] text-[#A5B3A8]/40 group-hover:text-[#A5B3A8]';
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
    let slaBadge = 'brand-pill brand-pill-success';
    let slaText = `${c.uptime_pct}%`;
    if (isLost) {
      slaBadge = 'brand-pill brand-pill-muted';
      slaText = 'INACTIVE';
    } else if (c.uptime_pct < 50) {
      slaBadge = 'brand-pill brand-pill-critical';
    } else if (c.uptime_pct < 90) {
      slaBadge = 'brand-pill brand-pill-warning';
    }

    // Maintenance Badge
    let maintBadge = 'brand-pill brand-pill-success';
    let maintText = c.maint_days_remaining !== null ? `${c.maint_days_remaining}d remaining` : 'On Track';
    let maintSub = escapeHtml(c.maint_type || 'Filter Service');
    if (isLost) {
      maintBadge = 'brand-pill brand-pill-muted';
      maintText = c.end_date ? `End: ${c.end_date}` : 'Contract Closed';
      maintSub = 'Decommissioned';
    } else if (c.maint_status === 'OVERDUE') {
      maintBadge = 'brand-pill brand-pill-critical font-bold';
      maintText = `${Math.abs(c.maint_days_remaining)}d Overdue`;
    } else if (c.maint_status === 'DUE_SOON') {
      maintBadge = 'brand-pill brand-pill-warning font-bold';
      maintText = `Due in ${c.maint_days_remaining}d`;
    }

    // Billing Status Badge
    let billingBadge = '<span class="brand-pill brand-pill-muted">B2B PO</span>';
    if (isLost) {
      billingBadge = '<span class="brand-pill brand-pill-critical">LOST / CHURNED 🔴</span>';
    } else if (c.billing_status === 'PAID') {
      billingBadge = '<span class="brand-pill brand-pill-success">PAID 🟢</span>';
    } else if (c.billing_status === 'OVERDUE_UNPAID') {
      billingBadge = '<span class="brand-pill brand-pill-critical animate-pulse">OVERDUE 🔴</span>';
    } else if (c.billing_status === 'PAYMENT_PENDING') {
      billingBadge = '<span class="brand-pill brand-pill-warning">PENDING 🟡</span>';
    }

    // Health Tags (Critical Alert / Old FW)
    let healthPill = '<span class="brand-pill brand-pill-success">Healthy</span>';
    if (isLost) {
      healthPill = '<span class="brand-pill brand-pill-muted">Archived</span>';
    } else if (c.has_critical_alert) {
      healthPill = '<span class="brand-pill brand-pill-critical">🚨 Critical Alert</span>';
    } else if (c.outdated_fw_count > 0) {
      healthPill = `<span class="brand-pill brand-pill-warning">⚠️ ${c.outdated_fw_count} Old FW</span>`;
    }

    return `
      <tr class="hover:bg-muted/40 transition-colors group">
        <td class="py-3 px-4">
          <div class="font-bold text-foreground group-hover:text-primary transition-colors flex items-center gap-1.5 flex-wrap">
            <span>${escapeHtml(c.client_name)}</span>
            ${isLost ? `<span class="brand-pill brand-pill-critical">LOST</span>` : ''}
            ${c.is_location_reconciled ? `<span class="text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded-full" title="Auto-reconciled from MySQL location: ${escapeHtml(c.reconciled_location_name)}">🔄 Auto-Linked</span>` : ''}
          </div>
          <div class="text-[11px] text-muted-foreground">${escapeHtml(c.project_name)}</div>
          ${c.is_location_reconciled ? `<div class="text-[10px] text-cyan-400 font-mono mt-0.5 flex items-center gap-1"><span>📍</span> ${escapeHtml(c.reconciled_location_name)}</div>` : ''}
        </td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-mono bg-muted text-foreground border border-border">${escapeHtml(c.segment || 'B2C')}</span>
            <span class="text-[10px] font-mono text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border">${getCountryFlag(c.country)} ${escapeHtml(c.country || 'Indonesia')}</span>
          </div>
          <div class="text-[11px] text-muted-foreground mt-1 flex items-center gap-1"><span>📍</span> ${escapeHtml(c.city || 'Jakarta')}</div>
        </td>
        <td class="py-3 px-4">
          ${billingBadge}
        </td>
        <td class="py-3 px-4 font-mono">
          <div class="flex items-center gap-1.5 font-bold ${c.offline_count > 0 ? 'text-amber-500' : 'text-primary'}">
            <span>${c.online_count}/${c.device_count}</span>
            <span class="text-[10px] font-normal text-muted-foreground">units</span>
          </div>
          ${c.takeout_count > 0 ? `
            <div class="text-[9px] text-amber-500 font-mono mt-0.5 flex items-center gap-1" title="Excluded from SLA uptime">
              <span>⚠️ ${c.takeout_count} takeout (excluded)</span>
            </div>
          ` : (c.minierp_planned_count ? `
            <div class="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <span>ERP:</span>
              <span class="text-primary font-semibold">${c.minierp_installed_count !== undefined ? c.minierp_installed_count : c.minierp_planned_count} inst</span>
              ${c.minierp_takeout_count ? `<span class="text-destructive font-semibold">/ ${c.minierp_takeout_count} out</span>` : ''}
            </div>
          ` : '')}
        </td>
        <td class="py-3 px-4">
          <span class="${slaBadge} font-mono">
            ${slaText}
          </span>
        </td>
        <td class="py-3 px-4 font-mono text-[#2DD4BF] font-semibold">
          ${c.total_kwh ? c.total_kwh.toFixed(1) + ' kWh' : '0.0 kWh'}
        </td>
        <td class="py-3 px-4">
          <span class="${maintBadge}">
            ${maintText}
          </span>
          <div class="text-[10px] text-muted-foreground mt-0.5">${maintSub}</div>
        </td>
        <td class="py-3 px-4">
          ${healthPill}
        </td>
        <td class="py-3 px-4 text-right">
          <button onclick="openClientDetail(${c.project_id})" class="btn-replit-secondary text-xs">
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
      <span class="inline-flex items-center text-xs font-normal text-[#91C851] bg-[#91C851]/15 border border-[#91C851]/30 px-2 py-0.5 rounded-full animate-pulse">
        <svg class="animate-spin -ml-0.5 mr-1.5 h-3 w-3 text-[#91C851]" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        Loading...
      </span>
    </span>
  `;
  document.getElementById('drawer-project-sub').innerText = `Project ID: #${projectId} | ${projectName}`;
  document.getElementById('drawer-segment-badge').innerText = segment;
  document.getElementById('drawer-billing-badge').className = 'brand-pill brand-pill-muted';
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
  const erpDevices = data.minierp_devices || [];
  const isLost = (c.project_status || '').toLowerCase() === 'lost';

  const takeoutNotice = c.takeout_count > 0 ? ` • ${c.takeout_count} Takeout (Excluded from SLA)` : '';

  if (isLost) {
    document.getElementById('drawer-client-name').innerHTML = `
      <div class="flex items-center gap-2">
        <span>${escapeHtml(c.client_name)}</span>
        <span class="brand-pill brand-pill-critical">LOST</span>
      </div>
    `;
    document.getElementById('drawer-project-sub').innerHTML = `
      <span>Project ID: #${c.project_id} | ${escapeHtml(c.project_name)}</span>
      ${c.end_date ? `<span class="text-rose-400 font-mono ml-2 font-semibold">• Contract Ended: ${escapeHtml(c.end_date)}</span>` : ''}
    `;
    document.getElementById('drawer-device-count').innerText = `${c.online_count}/${c.device_count} Units Online (Account Lost / Inactive)${takeoutNotice}`;
  } else {
    document.getElementById('drawer-client-name').innerText = c.client_name;
    document.getElementById('drawer-project-sub').innerText = `Project ID: #${c.project_id} | ${c.project_name} | Contract: ${c.contract_type || 'Standard'}`;
    document.getElementById('drawer-device-count').innerText = `${c.online_count}/${c.device_count} Units Online (${c.uptime_pct}% SLA)${takeoutNotice}`;
  }

  document.getElementById('drawer-segment-badge').innerText = c.segment || 'B2C';
  document.getElementById('drawer-city-label').innerText = `${c.city || 'Jakarta'}, ${c.country || 'Indonesia'}`;
  
  if (c.is_location_reconciled) {
    document.getElementById('drawer-loc-uuid').innerHTML = `
      <span class="text-[#A5B3A8]">Location:</span> <span class="text-[#2DD4BF] font-semibold font-mono">📍 ${escapeHtml(c.reconciled_location_name)}</span> 
      <span class="text-[10px] text-[#2DD4BF] bg-[#2DD4BF]/10 px-1.5 py-0.5 rounded border border-[#2DD4BF]/30 ml-1">⚡ Auto-Linked (${escapeHtml(c.location_uuid)})</span>
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
    bBadge.className = 'brand-pill brand-pill-success';
    bBadge.innerText = 'Paid 🟢';
    bStatus.className = 'brand-pill brand-pill-success text-[9px]';
    bStatus.innerText = 'PAID (GOOD STANDING)';
  } else if (c.billing_status === 'OVERDUE_UNPAID') {
    bBadge.className = 'brand-pill brand-pill-critical';
    bBadge.innerText = 'Overdue 🔴';
    bStatus.className = 'brand-pill brand-pill-critical text-[9px] animate-pulse';
    bStatus.innerText = 'OVERDUE / UNPAID';
  } else if (c.billing_status === 'PAYMENT_PENDING') {
    bBadge.className = 'brand-pill brand-pill-warning';
    bBadge.innerText = 'Pending 🟡';
    bStatus.className = 'brand-pill brand-pill-warning text-[9px]';
    bStatus.innerText = 'PAYMENT PENDING';
  } else {
    bBadge.className = 'brand-pill brand-pill-muted';
    bBadge.innerText = 'B2B PO ⚪';
    bStatus.className = 'brand-pill brand-pill-muted text-[9px]';
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
  document.getElementById('drawer-erp-recon').innerText = c.takeout_count > 0
    ? `Live MySQL Telemetry: ${c.device_count} active installed (${c.online_count} online) • ${c.takeout_count} taken out (excluded from SLA)`
    : `Live MySQL Telemetry: ${c.device_count} units (${c.online_count} active)`;

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
  if (instBadge) {
    instBadge.className = 'brand-pill brand-pill-success';
    instBadge.innerText = `${installedCount} Installed`;
  }
  if (outBadge) {
    outBadge.innerText = `${takeoutCount} Takeout`;
    if (takeoutCount > 0) {
      outBadge.className = 'brand-pill brand-pill-critical font-mono animate-pulse';
    } else {
      outBadge.className = 'brand-pill brand-pill-muted font-mono';
    }
  }

  // Populate drawer-erp-devices-list
  const erpListEl = document.getElementById('drawer-erp-devices-list');
  if (erpListEl) {
    if (erpDevices.length === 0) {
      erpListEl.innerHTML = `<div class="text-xs text-[#A5B3A8] font-mono py-3 text-center">No hardware devices planned in Mini-ERP for this project.</div>`;
    } else {
      erpListEl.innerHTML = erpDevices.map(ed => {
        const isTakeout = ed.normalized_status === 'Takeout';
        const isSpare = ed.normalized_status === 'Spare';
        
        let statusBadge = `<span class="brand-pill brand-pill-success font-mono">🟢 Installed</span>`;
        if (isTakeout) {
          statusBadge = `<span class="brand-pill brand-pill-critical font-mono">🔴 Takeout</span>`;
        } else if (isSpare) {
          statusBadge = `<span class="brand-pill brand-pill-warning font-mono">🟡 Spare</span>`;
        }

        let telemetryBadge = '';
        if (ed.in_telemetry) {
          if (ed.connectivity === 'online') {
            telemetryBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#91C851]/15 text-[#91C851] border border-[#91C851]/30">⚡ Online</span>`;
          } else {
            telemetryBadge = `<span class="brand-pill brand-pill-critical text-[9px] font-mono">Offline</span>`;
          }
        } else {
          telemetryBadge = `<span class="brand-pill brand-pill-muted text-[9px] font-mono">No Signal</span>`;
        }

        const dateInfo = isTakeout && ed.takeout_date 
          ? `<span class="text-rose-400/90 font-mono">Takeout: ${escapeHtml(String(ed.takeout_date).slice(0, 10))}</span>`
          : (ed.installed_date ? `<span class="text-slate-400 font-mono">Installed: ${escapeHtml(String(ed.installed_date).slice(0, 10))}</span>` : '');

        return `
          <div class="flex items-center justify-between p-2.5 rounded-xl border ${isTakeout ? 'border-rose-900/50 bg-rose-950/20' : 'border-[#29342c] bg-[#101412]'} text-xs">
            <div class="space-y-0.5">
              <div class="flex items-center gap-2">
                <span class="font-bold text-[#F4F6F4] font-mono">${escapeHtml(ed.device_id || 'Unnamed Device')}</span>
                <span class="text-[10px] text-[#A5B3A8] bg-[#202923] border border-[#29342c] px-1.5 py-0.2 rounded font-mono">${escapeHtml(ed.device_item_type || ed.device_type || 'Unit')}</span>
                ${telemetryBadge}
              </div>
              <div class="text-[11px] text-[#A5B3A8] flex items-center gap-2 flex-wrap">
                <span>📍 ${escapeHtml(ed.room_name || 'Room')}</span>
                ${dateInfo ? `<span>•</span> ${dateInfo}` : ''}
                ${ed.notes ? `<span>•</span> <span class="italic text-[#A5B3A8] max-w-[200px] truncate" title="${escapeHtml(ed.notes)}">${escapeHtml(ed.notes)}</span>` : ''}
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
    mBadge.className = 'brand-pill brand-pill-critical font-bold';
    mBadge.innerText = `${Math.abs(c.maint_days_remaining)}d Overdue`;
  } else if (c.maint_status === 'DUE_SOON') {
    mBadge.className = 'brand-pill brand-pill-warning font-bold';
    mBadge.innerText = `Due in ${c.maint_days_remaining}d`;
  } else {
    mBadge.className = 'brand-pill brand-pill-success';
    mBadge.innerText = 'On Track';
  }

  // Render Rooms & Devices
  const roomsList = document.getElementById('drawer-rooms-list');
  const rooms = data.rooms || {};
  const roomKeys = Object.keys(rooms);

  if (roomKeys.length === 0) {
    roomsList.innerHTML = `
      <div class="bg-[#101412] border border-dashed border-[#29342c] rounded-xl p-8 text-center text-[#A5B3A8] text-xs font-mono">
        No telemetry devices transmitting for this location.
      </div>
    `;
  } else {
    roomsList.innerHTML = roomKeys.map(rName => {
      const devs = rooms[rName];
      return `
        <div class="bg-[#101412] border border-[#29342c] rounded-2xl p-4 space-y-3">
          <div class="flex items-center justify-between border-b border-[#29342c] pb-2">
            <span class="text-xs font-bold text-[#F4F6F4] flex items-center gap-1.5">
              <span>📍</span> ${escapeHtml(rName)}
            </span>
            <span class="text-[11px] font-mono text-[#A5B3A8]">${devs.length} device(s)</span>
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
    reportsList.innerHTML = `<div class="text-xs text-[#A5B3A8] font-mono py-2">No fieldwork service logs on record.</div>`;
  } else {
    reportsList.innerHTML = reports.slice(0, 5).map(r => `
      <div class="bg-[#101412] p-3 rounded-xl border border-[#29342c] text-xs space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="font-bold text-[#F4F6F4]">${escapeHtml(r.activity_type || 'Maintenance')}</span>
          <span class="font-mono text-[#A5B3A8] text-[10px]">${r.activity_date || 'N/A'}</span>
        </div>
        <div class="text-[#A5B3A8] text-[11px]">Technician: <span class="text-[#F4F6F4]">${escapeHtml(r.technician_name || 'Assigned Tech')}</span></div>
        ${r.problem_description ? `<div class="text-rose-400 text-[11px]">Problem: ${escapeHtml(r.problem_description)}</div>` : ''}
        ${r.action_taken ? `<div class="text-[#91C851] text-[11px]">Action: ${escapeHtml(r.action_taken)}</div>` : ''}
      </div>
    `).join('');
  }
}

function renderDeviceCard(d) {
  const isTakeout = d.is_takeout || d.erp_status === 'Takeout';
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
    ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono ${isOldFw ? 'brand-pill brand-pill-warning' : 'brand-pill brand-pill-muted'}">FW: ${d.device_firmware}${isOldFw ? ' ⚠️' : ''}</span>`
    : '';

  // Mini-ERP status tag
  let erpTag = '';
  if (isTakeout) {
    erpTag = `<span class="brand-pill brand-pill-critical font-mono" title="Flagged as TAKEOUT in Mini-ERP — Excluded from Uptime SLA">⚠️ Taken Out (Excluded)</span>`;
  } else if (d.erp_status === 'Installed') {
    erpTag = `<span class="brand-pill brand-pill-success font-mono">✓ ERP: Installed</span>`;
  } else if (d.erp_status === 'Spare') {
    erpTag = `<span class="brand-pill brand-pill-warning font-mono">ERP: Spare</span>`;
  } else if (d.erp_status === 'Unregistered') {
    erpTag = `<span class="brand-pill brand-pill-muted font-mono">ERP: Unregistered</span>`;
  }

  let statusBadge = '';
  let cardBorder = '';
  if (isTakeout) {
    statusBadge = `<span class="brand-pill brand-pill-muted font-mono" title="Excluded from SLA uptime calculations">Taken Out (Excluded)</span>`;
    cardBorder = 'border-slate-800/80 opacity-75 bg-[#171c19]/60';
  } else {
    statusBadge = `<span class="brand-pill ${isOnline ? 'brand-pill-success' : 'brand-pill-critical'} font-mono">${d.connectivity || 'offline'}</span>`;
    cardBorder = isOnline ? 'border-[#29342c] bg-[#171c19]' : 'border-rose-900/40 bg-[#171c19]';
  }

  return `
    <div class="${cardBorder} rounded-xl p-3 flex flex-col justify-between space-y-2.5">
      <div>
        <div class="flex items-start justify-between">
          <div>
            <div class="text-xs font-bold text-[#F4F6F4] flex items-center gap-1.5">
              <span>${isPurifier ? '🌀' : '📡'}</span>
              <span>${escapeHtml(d.device_name || 'Device')}</span>
            </div>
            <div class="text-[10px] font-mono text-[#A5B3A8] mt-0.5">${escapeHtml(d.vendor_device_id || d.device_type)}</div>
          </div>
          ${statusBadge}
        </div>

        <div class="flex flex-wrap items-center gap-1 mt-1.5">
          ${erpTag}
          ${fwTag}
          ${isPurifier ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#2DD4BF]/10 text-[#2DD4BF] border border-[#2DD4BF]/30">⚡ ${kwh} kWh</span>` : ''}
          ${d.speed ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#202923] text-[#F4F6F4] border border-[#29342c]">Speed ${d.speed}</span>` : ''}
        </div>
      </div>

      <!-- Sensor Metrics Grid -->
      <div class="grid grid-cols-2 gap-1.5 text-[11px] font-mono bg-[#101412] p-2 rounded-lg border border-[#29342c]/60">
        ${meas.pm25 !== undefined ? `
          <div class="text-[#A5B3A8]">PM₂.₅: <span class="font-bold ${meas.pm25 > 25 ? 'text-rose-400' : 'text-[#91C851]'}">${meas.pm25} µg/m³</span></div>
        ` : ''}
        ${meas.co2 !== undefined ? `
          <div class="text-[#A5B3A8]">CO₂: <span class="font-bold ${meas.co2 > 1200 ? 'text-amber-400' : 'text-[#F4F6F4]'}">${meas.co2} ppm</span></div>
        ` : ''}
        ${filterLife !== null ? `
          <div class="text-[#A5B3A8]">Filter: <span class="font-bold ${filterLife < 15 ? 'text-rose-400' : 'text-[#91C851]'}">${filterLife}%</span></div>
        ` : ''}
        ${meas.coin_batt !== undefined ? `
          <div class="text-[#A5B3A8]">Coin Batt: <span class="font-bold text-[#F4F6F4]">${Number(meas.coin_batt).toFixed(2)}V</span></div>
        ` : ''}
      </div>
    </div>
  `;
}

function copyClientSummary() {
  if (!fleetData.selectedClient) return;
  const c = fleetData.selectedClient.client_info;
  const b = fleetData.selectedClient.billing || {};
  const takeoutInfo = c.takeout_count > 0 ? ` (${c.takeout_count} Taken Out - Excluded from SLA)` : '';
  const summary = `Nafas CAZ Fleet Diagnostic:
Client: ${c.client_name} (${c.project_name})
City: ${c.city}, ${c.country}
Billing Status: ${c.billing_status} (Paid: Rp ${Math.round(b.total_paid_amount || 0).toLocaleString('id-ID')})
Devices: ${c.online_count}/${c.device_count} Active Online (${c.uptime_pct}% SLA)${takeoutInfo}
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
