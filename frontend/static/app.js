let allClients = [];
let filteredClients = [];
let currentPage = 1;
const pageSize = 15;
let currentTab = 'all';
let searchQuery = '';

document.addEventListener("DOMContentLoaded", () => {
  fetchSummary();
  fetchAlerts();
  fetchClients();

  // Auto-refresh every 30s
  setInterval(() => {
    fetchSummary();
    fetchAlerts();
    fetchClients(true);
  }, 30000);
});

async function fetchSummary() {
  try {
    const res = await fetch("/api/fleet/summary");
    const data = await res.json();
    
    document.getElementById("kpi-clients").innerText = data.total_clients || 0;
    document.getElementById("kpi-devices").innerText = data.total_active_devices || 0;
    document.getElementById("kpi-device-sub").innerText = `${data.total_online_devices || 0} Online / ${data.total_offline_devices || 0} Offline`;
    document.getElementById("kpi-uptime").innerText = `${data.global_uptime_pct || 0}%`;
    document.getElementById("kpi-critical").innerText = data.critical_alerts_count || 0;
    document.getElementById("kpi-overdue").innerText = data.overdue_services_count || 0;

    const syncTime = new Date().toLocaleTimeString();
    document.getElementById("last-sync-time").innerText = `Last Sync: ${syncTime} (${data.execution_time_ms}ms)`;
  } catch (err) {
    console.error("Failed to fetch summary:", err);
  }
}

async function fetchAlerts() {
  try {
    const res = await fetch("/api/fleet/alerts");
    const data = await res.json();
    
    const alertsSection = document.getElementById("alerts-section");
    const alertsList = document.getElementById("alerts-list");
    const alertsBadge = document.getElementById("alerts-badge");

    if (data.count > 0) {
      alertsSection.classList.remove("hidden");
      alertsBadge.innerText = `${data.count} Bad Alerts`;
      alertsList.innerHTML = data.alerts.map(a => `
        <div class="p-3 rounded-xl ${a.severity === 'CRITICAL' ? 'bg-rose-950/40 border border-rose-800/60' : 'bg-amber-950/30 border border-amber-800/50'} flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${a.severity === 'CRITICAL' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-slate-950'} font-mono">${a.severity}</span>
              <span class="text-xs font-bold text-white">${a.title}</span>
            </div>
            <p class="text-[11px] text-slate-300 mt-1">${a.message}</p>
            <div class="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
              <span>Client: <strong>${a.client_name}</strong></span>
              ${a.room_name ? `<span>• Room: ${a.room_name}</span>` : ''}
            </div>
          </div>
          <button onclick="openClientDetail(${a.project_id})" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-white whitespace-nowrap">View</button>
        </div>
      `).join("");
    } else {
      alertsSection.classList.add("hidden");
    }
  } catch (err) {
    console.error("Failed to fetch alerts:", err);
  }
}

async function fetchClients(silent = false) {
  try {
    const res = await fetch("/api/fleet/clients");
    const data = await res.json();
    allClients = data.clients || [];
    applyFilters();
  } catch (err) {
    console.error("Failed to fetch clients:", err);
  }
}

function applyFilters() {
  filteredClients = allClients.filter(c => {
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = c.client_name.toLowerCase().includes(q) ||
                    c.project_name.toLowerCase().includes(q) ||
                    (c.city || "").toLowerCase().includes(q);
      if (!match) return false;
    }

    // Tab
    if (currentTab === 'critical') return c.has_critical_alert;
    if (currentTab === 'overdue') return c.maint_status === 'OVERDUE' || c.maint_status === 'DUE_SOON';
    if (currentTab === 'healthy') return !c.has_critical_alert && c.uptime_pct >= 90;

    return true;
  });

  currentPage = 1;
  renderTable();
}

function handleSearch(val) {
  searchQuery = val;
  applyFilters();
}

function filterByTab(tab) {
  currentTab = tab;
  ['all', 'critical', 'overdue', 'healthy'].forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (t === tab) {
      btn.className = "px-3 py-1 rounded-lg bg-emerald-600 text-white transition-all";
    } else {
      btn.className = "px-3 py-1 rounded-lg text-slate-400 hover:text-white transition-all";
    }
  });
  applyFilters();
}

function filterByStatus(st) {
  filterByTab(st);
}

function filterByMaint(m) {
  filterByTab(m);
}

function renderTable() {
  const tbody = document.getElementById("clients-tbody");
  const countLabel = document.getElementById("table-count-label");
  const pageLabel = document.getElementById("page-num-label");
  const prevBtn = document.getElementById("prev-page-btn");
  const nextBtn = document.getElementById("next-page-btn");

  countLabel.innerText = `Showing ${filteredClients.length} clients`;

  const totalPages = Math.ceil(filteredClients.length / pageSize) || 1;
  pageLabel.innerText = `Page ${currentPage} of ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;

  const startIdx = (currentPage - 1) * pageSize;
  const pageItems = filteredClients.slice(startIdx, startIdx + pageSize);

  if (pageItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-500">No client projects found matching current criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = pageItems.map(c => {
    // Maintenance Badge
    let maintBadgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    let maintLabel = `In ${c.maint_days_remaining}d`;
    if (c.maint_status === "OVERDUE") {
      maintBadgeClass = "bg-rose-500/20 text-rose-400 border-rose-500/30";
      maintLabel = `Overdue (${Math.abs(c.maint_days_remaining)}d)`;
    } else if (c.maint_status === "DUE_SOON") {
      maintBadgeClass = "bg-amber-500/20 text-amber-400 border-amber-500/30";
      maintLabel = `Due in ${c.maint_days_remaining}d`;
    }

    // Health Status Badge
    let healthBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">Healthy</span>`;
    if (c.has_critical_alert) {
      healthBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse">🚨 Critical Alert</span>`;
    } else if (c.uptime_pct < 60 && c.device_count > 0) {
      healthBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">Low Uptime</span>`;
    }

    return `
      <tr class="hover:bg-slate-900/60 transition-colors">
        <td class="py-3 px-4 font-semibold text-white">
          <div>${c.client_name}</div>
          <div class="text-[11px] text-slate-500 font-mono">${c.project_name}</div>
        </td>
        <td class="py-3 px-4 text-slate-400">
          <div>${c.segment} • ${c.client_type}</div>
          <div class="text-[11px] text-slate-500 font-mono">${c.city}</div>
        </td>
        <td class="py-3 px-4 font-mono">
          <span class="font-bold ${c.online_count === c.device_count ? 'text-emerald-400' : 'text-amber-400'}">${c.online_count}</span>
          <span class="text-slate-500">/ ${c.device_count} devs</span>
        </td>
        <td class="py-3 px-4 font-mono">
          <div class="flex items-center gap-2">
            <span class="font-bold ${c.uptime_pct >= 90 ? 'text-emerald-400' : c.uptime_pct >= 60 ? 'text-amber-400' : 'text-rose-400'}">${c.uptime_pct}%</span>
            <div class="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div class="${c.uptime_pct >= 90 ? 'bg-emerald-500' : c.uptime_pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'} h-full" style="width: ${c.uptime_pct}%"></div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${maintBadgeClass}">${maintLabel}</span>
          <div class="text-[10px] text-slate-500 mt-0.5">${c.maint_target_date || 'N/A'}</div>
        </td>
        <td class="py-3 px-4">
          ${healthBadge}
        </td>
        <td class="py-3 px-4 text-right">
          <button onclick="openClientDetail(${c.project_id})" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold transition-all">Inspect</button>
        </td>
      </tr>
    `;
  }).join("");
}

function changePage(delta) {
  currentPage += delta;
  renderTable();
}

async function openClientDetail(projectId) {
  try {
    const res = await fetch(`/api/fleet/client/${projectId}`);
    const data = await res.json();
    const info = data.client_info;

    document.getElementById("drawer-client-name").innerText = info.client_name;
    document.getElementById("drawer-project-sub").innerText = `Project: ${info.project_name} (ID: ${info.project_id}) | Contract: ${info.contract_type || 'Active'}`;
    document.getElementById("drawer-segment-badge").innerText = `${info.segment} • ${info.client_type}`;
    document.getElementById("drawer-city-label").innerText = `${info.city}, ${info.country}`;
    document.getElementById("drawer-loc-uuid").innerText = `Location UUID: ${info.location_uuid || 'N/A'}`;

    // Maintenance
    document.getElementById("drawer-maint-date").innerText = info.maint_target_date || 'Not Scheduled';
    document.getElementById("drawer-maint-type").innerText = info.maint_type;
    document.getElementById("drawer-last-service").innerText = info.last_service_date || 'No recorded visit';
    document.getElementById("drawer-last-tech").innerText = `Technician: ${info.last_service_technician || 'N/A'}`;

    const maintBadge = document.getElementById("drawer-maint-badge");
    maintBadge.innerText = info.maint_status === 'OVERDUE' ? `Overdue (${Math.abs(info.maint_days_remaining)}d)` : `Due in ${info.maint_days_remaining}d`;
    maintBadge.className = info.maint_status === 'OVERDUE' ? 
      "px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30" : 
      "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";

    // Room Devices
    const roomsList = document.getElementById("drawer-rooms-list");
    const roomEntries = Object.entries(data.rooms || {});
    document.getElementById("drawer-device-count").innerText = `${info.device_count} total devices across ${roomEntries.length} rooms`;

    if (roomEntries.length === 0) {
      roomsList.innerHTML = `<div class="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 text-center">No active hardware paired to this location in MySQL.</div>`;
    } else {
      roomsList.innerHTML = roomEntries.map(([roomName, devs]) => `
        <div class="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span class="font-bold text-sm text-white flex items-center gap-1.5">
              <span>🏠</span> ${roomName}
            </span>
            <span class="text-[11px] text-slate-400 font-mono">${devs.length} devices</span>
          </div>

          <div class="grid grid-cols-1 gap-2.5">
            ${devs.map(d => {
              const isOnline = d.connectivity === 'online';
              const isMonitor = d.category_code === 'airmon';
              const meas = d.measurement_current || {};
              const state = d.device_state || {};
              const filt = state.filter || {};

              return `
                <div class="p-3 rounded-lg bg-slate-900 border ${isOnline ? 'border-slate-800' : 'border-rose-900/60 bg-rose-950/20'} flex items-start justify-between gap-3">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'}"></span>
                      <span class="font-bold text-xs text-white">${d.device_name}</span>
                      <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase">${d.device_type}</span>
                    </div>

                    ${isMonitor ? `
                      <div class="grid grid-cols-3 gap-2 mt-2 font-mono text-[11px]">
                        <div>PM₂.₅: <strong class="${meas.pm25 > 15 ? 'text-amber-400' : 'text-emerald-400'}">${meas.pm25 !== undefined ? meas.pm25 + ' µg' : '--'}</strong></div>
                        <div>CO₂: <strong class="${meas.co2 > 1000 ? 'text-rose-400' : 'text-emerald-400'}">${meas.co2 !== undefined ? meas.co2 + ' ppm' : '--'}</strong></div>
                        <div>AQI: <strong class="text-slate-300">${meas.aqi !== undefined ? meas.aqi : '--'}</strong></div>
                      </div>
                    ` : `
                      <div class="grid grid-cols-3 gap-2 mt-2 font-mono text-[11px]">
                        <div>Power: <strong class="${state.power && state.power.value === 'ON' ? 'text-emerald-400' : 'text-slate-500'}">${state.power ? state.power.value : 'OFF'}</strong></div>
                        <div>Speed: <strong class="text-slate-300">${state.speed ? state.speed.mode : 'AUTO'}</strong></div>
                        <div>Filter: <strong class="${filt.life < 20 ? 'text-rose-400' : 'text-emerald-400'}">${filt.life ? filt.life.toFixed(1) + '%' : '--'}</strong></div>
                      </div>
                    `}
                  </div>
                  <div class="text-[10px] font-mono ${isOnline ? 'text-emerald-400' : 'text-rose-400'} font-semibold uppercase">${d.connectivity}</div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `).join("");
    }

    // Reports History
    const reportsList = document.getElementById("drawer-reports-list");
    const reports = data.fieldwork_reports || [];
    if (reports.length === 0) {
      reportsList.innerHTML = `<div class="text-xs text-slate-500">No past fieldwork reports logged in Mini-ERP.</div>`;
    } else {
      reportsList.innerHTML = reports.slice(0, 5).map(r => `
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs">
          <div class="flex items-center justify-between">
            <span class="font-bold text-white capitalize">${r.activity_type || 'Maintenance'}</span>
            <span class="font-mono text-slate-400">${r.activity_date || 'N/A'}</span>
          </div>
          <div class="text-slate-400 mt-1">Technician: <strong class="text-slate-300">${r.technician_name || 'N/A'}</strong></div>
          <div class="text-[11px] text-slate-300 mt-1 font-mono">${r.problem_description || r.action_taken || 'Routine inspection'}</div>
        </div>
      `).join("");
    }

    document.getElementById("detail-drawer").classList.remove("hidden");
  } catch (err) {
    console.error("Failed to open client detail:", err);
  }
}

function closeDrawer() {
  document.getElementById("detail-drawer").classList.add("hidden");
}

function toggleAlertsSection() {
  document.getElementById("alerts-section").classList.toggle("hidden");
}

async function triggerManualRefresh() {
  const icon = document.getElementById("refresh-icon");
  icon.classList.add("animate-spin");
  try {
    await fetch("/api/fleet/refresh", { method: "POST" });
    await fetchSummary();
    await fetchAlerts();
    await fetchClients();
  } finally {
    icon.classList.remove("animate-spin");
  }
}

function copyClientSummary() {
  const name = document.getElementById("drawer-client-name").innerText;
  const maintDate = document.getElementById("drawer-maint-date").innerText;
  const text = `Clean Air Zone Diagnostic - ${name}\nNext Service: ${maintDate}`;
  navigator.clipboard.writeText(text);
  alert("Diagnostic summary copied to clipboard!");
}
