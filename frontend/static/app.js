// Nafas Clean Air Zone™ Fleet Mission Control Client App
let fleetData = {
  summary: {},
  clients: [],
  alerts: [],
  currentTab: 'all',
  searchQuery: '',
  page: 1,
  pageSize: 15,
  selectedClient: null
};

// Format currency
function formatRupiah(num) {
  if (!num) return 'Rp 0';
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
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
    fleetData.clients = clientsRes.clients || [];
    fleetData.alerts = alertsRes.alerts || [];

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
  document.getElementById('kpi-clients').innerText = s.total_clients || '--';
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
function handleSearch(query) {
  fleetData.searchQuery = query.trim().toLowerCase();
  fleetData.page = 1;
  renderClientsTable();
}

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

  if (fleetData.searchQuery) {
    const q = fleetData.searchQuery;
    list = list.filter(c => 
      c.client_name.toLowerCase().includes(q) ||
      c.project_name.toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.location_uuid || '').toLowerCase().includes(q)
    );
  }

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

  return list;
}

// 4. Render Client Table
function renderClientsTable() {
  const tbody = document.getElementById('clients-tbody');
  const filtered = getFilteredClients();

  const total = filtered.length;
  const totalPages = Math.ceil(total / fleetData.pageSize) || 1;
  if (fleetData.page > totalPages) fleetData.page = totalPages;

  const startIdx = (fleetData.page - 1) * fleetData.pageSize;
  const pageItems = filtered.slice(startIdx, startIdx + fleetData.pageSize);

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
    // SLA Pill
    let slaBadge = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (c.uptime_pct < 50) slaBadge = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    else if (c.uptime_pct < 90) slaBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/30';

    // Maintenance Badge
    let maintBadge = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    let maintText = c.maint_days_remaining !== null ? `${c.maint_days_remaining}d remaining` : 'On Track';
    if (c.maint_status === 'OVERDUE') {
      maintBadge = 'bg-rose-500/20 text-rose-400 border-rose-500/30 font-bold';
      maintText = `${Math.abs(c.maint_days_remaining)}d Overdue`;
    } else if (c.maint_status === 'DUE_SOON') {
      maintBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/30 font-bold';
      maintText = `Due in ${c.maint_days_remaining}d`;
    }

    // Billing Status Badge
    let billingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">B2B PO</span>';
    if (c.billing_status === 'PAID') {
      billingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">PAID 🟢</span>';
    } else if (c.billing_status === 'OVERDUE_UNPAID') {
      billingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">OVERDUE 🔴</span>';
    } else if (c.billing_status === 'PAYMENT_PENDING') {
      billingBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">PENDING 🟡</span>';
    }

    // Health Tags (Critical Alert / Old FW)
    let healthPill = '<span class="text-[11px] text-emerald-400 font-semibold">Healthy</span>';
    if (c.has_critical_alert) {
      healthPill = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">🚨 Critical Alert</span>';
    } else if (c.outdated_fw_count > 0) {
      healthPill = `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">⚠️ ${c.outdated_fw_count} Old FW</span>`;
    }

    return `
      <tr class="hover:bg-slate-800/40 transition-colors group">
        <td class="py-3 px-4">
          <div class="font-bold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5 flex-wrap">
            <span>${escapeHtml(c.client_name)}</span>
            ${c.is_location_reconciled ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-950/80 text-cyan-400 border border-cyan-700/60" title="Auto-reconciled from MySQL location: ${escapeHtml(c.reconciled_location_name)}">🔄 Auto-Linked</span>` : ''}
          </div>
          <div class="text-[11px] text-slate-400">${escapeHtml(c.project_name)}</div>
          ${c.is_location_reconciled ? `<div class="text-[10px] text-cyan-400 font-mono mt-0.5 flex items-center gap-1"><span>📍</span> ${escapeHtml(c.reconciled_location_name)}</div>` : ''}
        </td>
        <td class="py-3 px-4">
          <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">${escapeHtml(c.segment || 'B2C')}</span>
          <div class="text-[11px] text-slate-400 mt-0.5">${escapeHtml(c.city || 'Jakarta')}</div>
        </td>
        <td class="py-3 px-4">
          ${billingBadge}
        </td>
        <td class="py-3 px-4 font-mono">
          <div class="flex items-center gap-1.5 font-bold ${c.offline_count > 0 ? 'text-amber-400' : 'text-emerald-400'}">
            <span>${c.online_count}/${c.device_count}</span>
            <span class="text-[10px] font-normal text-slate-500">units</span>
          </div>
          ${c.minierp_planned_count ? `<div class="text-[9px] text-slate-500">ERP: ${c.minierp_planned_count} planned</div>` : ''}
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-full text-[11px] font-bold font-mono border ${slaBadge}">
            ${c.uptime_pct}%
          </span>
        </td>
        <td class="py-3 px-4 font-mono text-cyan-300 font-semibold">
          ${c.total_kwh ? c.total_kwh.toFixed(1) + ' kWh' : '0.0 kWh'}
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] border ${maintBadge}">
            ${maintText}
          </span>
          <div class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(c.maint_type || 'Filter Service')}</div>
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
async function openClientDetail(projectId) {
  const drawer = document.getElementById('detail-drawer');
  drawer.classList.remove('hidden');

  try {
    const detail = await fetch(`/api/fleet/client/${projectId}`).then(r => r.json());
    fleetData.selectedClient = detail;
    renderDrawerContent(detail);
  } catch (err) {
    console.error('Failed to load client detail:', err);
  }
}

function closeDrawer() {
  document.getElementById('detail-drawer').classList.add('hidden');
  fleetData.selectedClient = null;
}

function renderDrawerContent(data) {
  const c = data.client_info;
  const billing = data.billing || {};
  const erpDevices = data.minierp_devices || [];

  document.getElementById('drawer-client-name').innerText = c.client_name;
  document.getElementById('drawer-project-sub').innerText = `Project ID: #${c.project_id} | ${c.project_name} | Contract: ${c.contract_type || 'Standard'}`;
  document.getElementById('drawer-segment-badge').innerText = c.segment || 'B2C';
  document.getElementById('drawer-city-label').innerText = `${c.city || 'Jakarta'}, ${c.country || 'Indonesia'}`;
  document.getElementById('drawer-device-count').innerText = `${c.online_count}/${c.device_count} Units Online (${c.uptime_pct}% SLA)`;
  
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
