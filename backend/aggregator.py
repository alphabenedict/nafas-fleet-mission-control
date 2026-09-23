import re
import json
import time
import logging
import threading
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from typing import Dict, List, Any, Optional
import psycopg2.extras
from backend.database import get_mysql_connection, get_pg_connection, get_mongo_client
from backend.alert_engine import AlertEngine

logger = logging.getLogger("fleet.aggregator")

STOPWORDS = {
    'pt', 'tbk', 'cv', 'ltd', 'inc', 'indonesia', 'jakarta', 'the', 'and', 'by', 'jv',
    'house', 'home', 'office', 'room', 'apartment', 'villa', 'studio', 'main', 'default', 'test', 'location',
    'pak', 'ibu', 'mr', 'mrs', 'dr', 'project'
}

ENTERPRISE_ALIASES = {
    "rtv": ["rtv", "metropolitan televisindo", "rtv thamrin"],
    "mm": ["mighty minds"],
    "twc": ["twc", "taman wisata candi", "injourney lt.12"],
    "sis": ["singapore international school", "yayasan pendidikan singapura asia"],
    "ina": ["ina prosperity tower", "prosperity tower", "indonesia investment authority"],
    "rowdy": ["rowdybox", "rowdy box"],
    "danantara": ["wisma danantara", "dana pensiun"],
    "bsj": ["british school jakarta"]
}

SINGLE_TOKEN_WHITELIST = {
    'rtv', 'rohan', 'monga', 'ratna', 'kartadjoemena', 'rowdy', 'rowdybox',
    'kemenkoinfra', 'injourney', 'soulbox', 'dandelion', 'danantara',
    'danapensiun', 'bodyform', 'neutradc', 'sana', 'wellington', 'kanmo',
    'ecocare', 'tripledot', 'pamerindo', 'tiq', 'ishine', 'acv', 'convivium'
}

def tokenize_name(text: str) -> set:
    if not text:
        return set()
    clean = re.sub(r'[\(\)\[\]\-_,./\\+]', ' ', text.lower())
    tokens = set()
    for w in clean.split():
        if w in STOPWORDS:
            continue
        if len(w) >= 3 or w in ['mm', 'si', 'kg', 'ui', 'it']:
            tokens.add(w)
    return tokens

def serialize_obj(obj: Any) -> Any:
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, dict):
        return {k: serialize_obj(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [serialize_obj(i) for i in obj]
    return obj

class FleetAggregator:
    def __init__(self, cache_ttl: int = 900):
        self.cache_ttl = cache_ttl
        self.last_updated: Optional[datetime] = None
        self.cached_summary: Dict[str, Any] = {}
        self.cached_clients: List[Dict[str, Any]] = []
        self.cached_alerts: List[Dict[str, Any]] = []
        self.cached_client_details: Dict[int, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self._is_refreshing = False

    def is_cache_valid(self) -> bool:
        if not self.last_updated:
            return False
        return (datetime.now(timezone.utc) - self.last_updated).total_seconds() < self.cache_ttl

    def refresh(self, force: bool = False, background: bool = False) -> None:
        if not force and self.is_cache_valid():
            return

        # If data is already in cache, serve stale cache and refresh in background
        if self.cached_clients and (background or not force):
            if not self._is_refreshing:
                threading.Thread(target=self._run_locked_refresh, daemon=True).start()
            return

        self._run_locked_refresh()

    def _run_locked_refresh(self) -> None:
        if self._is_refreshing:
            return
        acquired = self._lock.acquire(blocking=False)
        if not acquired:
            return
        try:
            self._is_refreshing = True
            self._do_refresh()
        finally:
            self._is_refreshing = False
            self._lock.release()

    def _do_refresh(self) -> None:
        logger.info("Refreshing Triple-Database Fleet Intelligence Cache (MySQL + NeonDB + MongoDB)...")
        start_time = time.time()

        try:
            # 1. Fetch from NeonDB (Projects, Milestones, Reports, and Device Specs)
            pg_conn = get_pg_connection()
            pg_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

            # Projects
            pg_cur.execute("""
                SELECT p.id, p.project_name, p.category, p.status, p.location_uuid,
                       p.start_date, p.end_date, p.contract_type, p.country, p.city,
                       c.id as client_id, c.client_name, c.client_type, c.segment
                FROM projects p
                LEFT JOIN clients c ON c.id = p.client_id
                WHERE p.status IN ('active', 'lost')
                  AND p.project_name NOT ILIKE '%dummy%'
                  AND COALESCE(c.client_name, '') NOT ILIKE '%dummy%'
                ORDER BY p.id;
            """)
            raw_projects = pg_cur.fetchall()

            # Milestones
            pg_cur.execute("""
                SELECT id, project_id, name, target_date, actual_date, status, remarks
                FROM project_milestones
                WHERE name ILIKE '%Filter%' OR name ILIKE '%Maintenance%'
                ORDER BY target_date ASC;
            """)
            raw_milestones = pg_cur.fetchall()
            milestones_by_project = {}
            for m in raw_milestones:
                pid = m["project_id"]
                if pid not in milestones_by_project:
                    milestones_by_project[pid] = []
                milestones_by_project[pid].append(serialize_obj(dict(m)))

            # Fieldwork reports
            pg_cur.execute("""
                SELECT id, project_id, client_id, activity_type, activity_date,
                       customer_name, location_name, technician_name, pm25_before, pm25_after,
                       co2_before, co2_after, problem_description, action_taken, status
                FROM fieldwork_reports
                ORDER BY activity_date DESC;
            """)
            raw_reports = pg_cur.fetchall()
            reports_by_project = {}
            reports_by_client_name = {}
            for r in raw_reports:
                pid = r["project_id"]
                c_name = (r["customer_name"] or "").strip().lower()
                r_dict = serialize_obj(dict(r))
                if pid:
                    if pid not in reports_by_project:
                        reports_by_project[pid] = []
                    reports_by_project[pid].append(r_dict)
                if c_name:
                    if c_name not in reports_by_client_name:
                        reports_by_client_name[c_name] = []
                    reports_by_client_name[c_name].append(r_dict)

            # Mini-ERP Planned Hardware Specs (devices joined with rooms)
            pg_cur.execute("""
                SELECT d.id, d.room_id, r.project_id, 
                       COALESCE(r.room_name, 'Room') as room_name,
                       d.device_id, d.device_item_type, d.device_type, d.device_status,
                       d.installed_date, d.takeout_date, d.notes
                FROM devices d
                JOIN rooms r ON r.id = d.room_id;
            """)
            raw_minierp_devices = pg_cur.fetchall()
            minierp_devices_by_project = {}
            for d in raw_minierp_devices:
                pid = d["project_id"]
                if pid not in minierp_devices_by_project:
                    minierp_devices_by_project[pid] = []
                minierp_devices_by_project[pid].append(serialize_obj(dict(d)))

            pg_conn.close()
            logger.info(f"NeonDB fetch completed: {len(raw_projects)} projects, {len(raw_minierp_devices)} planned units.")

            # 2. Fetch from MongoDB (Billing, Invoices, Subscriptions)
            client_billing_map = {}
            try:
                m_client = get_mongo_client()
                m_db = m_client["billing"]
                mongo_invoices = list(m_db.invoices.find({}, {
                    "uuid": 1,
                    "invoice_number": 1,
                    "status": 1,
                    "invoice_due_date": 1,
                    "paid_amount": 1,
                    "client.name": 1,
                    "pic.name": 1
                }))
                m_client.close()

                for inv in mongo_invoices:
                    c_info = inv.get("client") or {}
                    c_name = (c_info.get("name") or "").strip()
                    if not c_name:
                        pic = inv.get("pic") or {}
                        c_name = (pic.get("name") or "").strip()
                    if not c_name:
                        continue

                    norm_key = c_name.lower()
                    status = inv.get("status")
                    if norm_key not in client_billing_map:
                        client_billing_map[norm_key] = {
                            "client_name": c_name,
                            "total_invoices": 0,
                            "paid_invoices": 0,
                            "unpaid_invoices": 0,
                            "waiting_payment": 0,
                            "total_paid_amount": 0.0,
                            "latest_due_date": None,
                            "latest_invoice_number": inv.get("invoice_number"),
                            "has_overdue": False,
                            "billing_status": "PAID"
                        }
                    b_entry = client_billing_map[norm_key]
                    b_entry["total_invoices"] += 1
                    if status == "paid":
                        b_entry["paid_invoices"] += 1
                        b_entry["total_paid_amount"] += float(inv.get("paid_amount") or 0.0)
                    elif status in ["unpaid", "failed", "failed_final"]:
                        b_entry["unpaid_invoices"] += 1
                        b_entry["has_overdue"] = True
                    elif status in ["waiting_payment", "waiting_payment_channel", "generated"]:
                        b_entry["waiting_payment"] += 1
                    
                    due_date = inv.get("invoice_due_date")
                    if due_date:
                        b_entry["latest_due_date"] = str(due_date)[:10]

                for k, v in client_billing_map.items():
                    if v["has_overdue"] or v["unpaid_invoices"] > 0:
                        v["billing_status"] = "OVERDUE_UNPAID"
                    elif v["waiting_payment"] > 0:
                        v["billing_status"] = "PAYMENT_PENDING"
                    elif v["paid_invoices"] > 0:
                        v["billing_status"] = "PAID"
                    else:
                        v["billing_status"] = "B2B_OFFLINE"

            except Exception as mongo_err:
                logger.warning(f"MongoDB Billing sync skipped/fallback: {mongo_err}")

            # 3. Fetch active locations from MySQL for intelligent auto-reconciliation
            all_mysql_locations = []
            try:
                m_conn = get_mysql_connection()
                with m_conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT l.uuid, l.location_name, COUNT(d.id) as active_dev_count
                        FROM nafas_mydevice.tb_mydevice d
                        JOIN nafas_mydevice.tb_role_location l ON d.location_uuid = l.uuid
                        WHERE l.is_deleted = 0 AND d.is_deleted = 0 AND d.status = 'activated'
                        GROUP BY l.uuid, l.location_name;
                    """)
                    all_mysql_locations = cursor.fetchall()
                m_conn.close()
            except Exception as e:
                logger.warning(f"Could not fetch MySQL locations for reconciliation: {e}")

            # Build location token index for precision matching
            valid_locations_index = []
            loc_name_lookup = {}
            for loc in all_mysql_locations:
                l_name = (loc.get("location_name") or "").strip()
                loc_name_lookup[loc["uuid"]] = l_name
                if l_name and l_name.lower() not in STOPWORDS:
                    t = tokenize_name(l_name)
                    if t:
                        valid_locations_index.append({
                            "uuid": loc["uuid"],
                            "name": l_name,
                            "tokens": t,
                            "active_devs": loc.get("active_dev_count") or 0
                        })

            # 3.0 Mini-ERP Benchmark Resolution:
            # Map registered hardware serials from Mini-ERP to their true MySQL location_uuid
            erp_benchmark_devices = {}
            erp_device_room_map = {}
            for d in raw_minierp_devices:
                pid = d["project_id"]
                d_id = (d.get("device_id") or "").strip()
                r_name = (d.get("room_name") or "").strip()
                if d_id:
                    clean_did = d_id.lower()
                    if r_name:
                        erp_device_room_map[clean_did] = r_name
                    if pid not in erp_benchmark_devices:
                        erp_benchmark_devices[pid] = []
                    if len(erp_benchmark_devices[pid]) < 5:
                        erp_benchmark_devices[pid].append(clean_did)

            dev_to_mysql_loc = {}
            try:
                m_conn = get_mysql_connection()
                with m_conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT LOWER(device_name) as device_name, location_uuid
                        FROM nafas_mydevice.tb_mydevice
                        WHERE is_deleted = 0 AND device_name IS NOT NULL AND device_name != '';
                    """)
                    for r in cursor.fetchall():
                        if r.get("location_uuid") and r.get("device_name"):
                            dev_to_mysql_loc[r["device_name"]] = r["location_uuid"]
                m_conn.close()
                logger.info(f"Mini-ERP Benchmark: loaded {len(dev_to_mysql_loc)} device serial mappings in single fast query.")
            except Exception as e:
                logger.warning(f"Error loading device serial mappings from MySQL: {e}")

            project_erp_hardware_loc = {}
            for pid, d_list in erp_benchmark_devices.items():
                for d_name in d_list:
                    loc = dev_to_mysql_loc.get(d_name)
                    if loc:
                        project_erp_hardware_loc[pid] = loc
                        break

            # Map candidate reconciled locations for projects
            project_location_mapping = {}
            target_uuids_set = set()

            for p in raw_projects:
                pid = p["id"]
                direct_uuid = p["location_uuid"]
                p_name = p.get("project_name") or ""
                c_name = p.get("client_name") or ""
                full_p = f"{p_name} {c_name}".strip()

                # Priority 1: Mini-ERP Hardware Serial Ground Truth
                erp_hw_loc = project_erp_hardware_loc.get(pid)
                if erp_hw_loc:
                    target_uuids_set.add(erp_hw_loc)
                    l_title = loc_name_lookup.get(erp_hw_loc) or f"Location {erp_hw_loc[:8]}..."
                    project_location_mapping[pid] = {
                        "uuid": erp_hw_loc,
                        "name": l_title,
                        "method": "hardware_serial"
                    }
                    continue

                if direct_uuid and len(str(direct_uuid)) > 10 and not str(direct_uuid).startswith("proj-"):
                    target_uuids_set.add(direct_uuid)

                # Priority 2: Precision token match candidate
                raw_q_tokens = tokenize_name(full_p)
                expanded_q_tokens = set(raw_q_tokens)
                for k, aliases in ENTERPRISE_ALIASES.items():
                    if k in raw_q_tokens or any(a in full_p.lower() for a in aliases):
                        expanded_q_tokens.add(k)
                        for a in aliases:
                            expanded_q_tokens.update(tokenize_name(a))

                best_loc = None
                best_tuple = (-1, -1.0, -1)  # (exact_raw_overlap_count, score, active_dev_count)

                if expanded_q_tokens:
                    for loc in valid_locations_index:
                        loc_tokens = loc["tokens"]
                        raw_overlap = raw_q_tokens.intersection(loc_tokens)
                        exp_overlap = expanded_q_tokens.intersection(loc_tokens)

                        if not raw_overlap and not exp_overlap:
                            continue

                        exact_count = len(raw_overlap)
                        exp_count = len(exp_overlap)
                        score = exp_count / len(expanded_q_tokens) if expanded_q_tokens else 0.0

                        is_valid = False
                        if exact_count >= 2:
                            is_valid = True
                        elif exp_count >= 2 and score >= 0.3:
                            is_valid = True
                        elif exp_count == 1 and (list(exp_overlap)[0] in SINGLE_TOKEN_WHITELIST or any(t in SINGLE_TOKEN_WHITELIST for t in exp_overlap)):
                            is_valid = True

                        if is_valid:
                            match_tuple = (exact_count, score, loc["active_devs"])
                            if match_tuple > best_tuple:
                                best_tuple = match_tuple
                                best_loc = loc

                if best_loc:
                    project_location_mapping[pid] = best_loc
                    target_uuids_set.add(best_loc["uuid"])

            loc_uuids = list(target_uuids_set)

            # Fetch from MySQL rooms and devices for targeted locations
            raw_devices = []
            rooms_by_uuid = {}
            if loc_uuids:
                max_retries = 2
                for attempt in range(max_retries):
                    raw_devices = []
                    rooms_by_uuid = {}
                    try:
                        m_conn = get_mysql_connection()
                        with m_conn.cursor() as cursor:
                            # Batch rooms in safe chunks of 60 locations
                            chunk_size = 60
                            chunks = [loc_uuids[i:i + chunk_size] for i in range(0, len(loc_uuids), chunk_size)]
                            for chunk in chunks:
                                cursor.execute("""
                                    SELECT uuid, location_uuid, room_name
                                    FROM nafas_mydevice.tb_role_room
                                    WHERE location_uuid IN %s;
                                """, (tuple(chunk),))
                                for rm in cursor.fetchall():
                                    rooms_by_uuid[rm["uuid"]] = rm["room_name"]

                            # Batch devices with lightweight JSON_EXTRACT for filter_life (prevents Azure VPN socket timeout on large blobs)
                            for chunk in chunks:
                                cursor.execute("""
                                    SELECT id, uuid, vendor_device_id, device_name, device_type,
                                           category_code, status, connectivity, location_uuid,
                                           room_uuid, device_firmware, device_series, total_powerconsumption,
                                           speed, mode, activation_date,
                                           JSON_EXTRACT(device_state, '$.filter.life') as filter_life,
                                           measurement_current, updated_at
                                    FROM nafas_mydevice.tb_mydevice
                                    WHERE is_deleted = 0 AND status = 'activated' AND location_uuid IN %s;
                                """, (tuple(chunk),))
                                devs = cursor.fetchall()
                                raw_devices.extend(devs)
                        m_conn.close()

                        # Deduplicate devices by id / uuid as a safety net
                        seen_dev_ids = set()
                        deduped = []
                        for d in raw_devices:
                            d_key = d.get("id") or d.get("uuid")
                            if d_key not in seen_dev_ids:
                                seen_dev_ids.add(d_key)
                                deduped.append(d)
                        raw_devices = deduped

                        logger.info(f"MySQL devices fetch completed: {len(raw_devices)} active IoT devices loaded across {len(loc_uuids)} target locations.")
                        break
                    except Exception as e:
                        logger.warning(f"Attempt {attempt + 1}/{max_retries} fetching MySQL rooms and devices: {e}")
                        if attempt == max_retries - 1:
                            logger.error(f"Error fetching MySQL rooms and devices after {max_retries} attempts: {e}", exc_info=True)
                        time.sleep(1.0)

            # CRITICAL SAFETY GUARD: If raw_devices returned 0 but target locations exist, DO NOT wipe existing cache!
            if len(raw_devices) == 0 and len(loc_uuids) > 0:
                logger.error("CRITICAL: MySQL devices fetch returned 0 devices despite target locations being present! Aborting refresh to avoid telemetry blackout.")
                if self.cached_clients:
                    logger.info("Preserving existing cached clients and devices.")
                raise RuntimeError("MySQL devices fetch returned 0 devices. Aborting refresh to protect cache.")

            # Index MySQL devices by location_uuid
            devices_by_loc = {}
            for dev in raw_devices:
                loc = dev["location_uuid"]
                if loc:
                    if loc not in devices_by_loc:
                        devices_by_loc[loc] = []
                    
                    dev_dict = dict(dev)
                    d_name_clean = (dev.get("device_name") or "").lower()
                    erp_rm = erp_device_room_map.get(d_name_clean)
                    dev_dict["room_name"] = rooms_by_uuid.get(dev["room_uuid"]) or erp_rm or "Main Room"
                    
                    # Convert power consumption with scale normalization
                    raw_p = float(dev_dict.get("total_powerconsumption") or 0.0)
                    if raw_p > 50000000:
                        norm_p = raw_p / 1000000.0  # mWh to kWh
                    elif raw_p > 50000:
                        norm_p = raw_p / 1000.0     # Wh to kWh
                    else:
                        norm_p = raw_p
                    dev_dict["total_powerconsumption"] = round(norm_p, 2)

                    # Determine firmware health
                    d_type = (dev_dict.get("device_type") or "").lower()
                    d_fw = dev_dict.get("device_firmware")
                    latest_fw = AlertEngine.LATEST_FIRMWARE.get(d_type)
                    dev_dict["latest_firmware"] = latest_fw
                    dev_dict["is_firmware_outdated"] = (d_fw != latest_fw) if (d_fw and latest_fw) else False
                    
                    # Construct lightweight device_state from extracted filter_life
                    f_life = dev_dict.get("filter_life")
                    if f_life is not None:
                        try:
                            dev_dict["device_state"] = {"filter": {"life": float(f_life)}}
                        except (ValueError, TypeError):
                            dev_dict["device_state"] = {}
                    else:
                        dev_dict["device_state"] = {}

                    val = dev_dict.get("measurement_current")
                    if isinstance(val, str):
                        try:
                            dev_dict["measurement_current"] = json.loads(val)
                        except Exception:
                            dev_dict["measurement_current"] = {}
                    elif val is None:
                        dev_dict["measurement_current"] = {}
                    
                    dev_dict = serialize_obj(dev_dict)
                    devices_by_loc[loc].append(dev_dict)

            # 4. Process Projects & Reconcile
            processed_clients = []
            all_alerts = []
            total_active_devices = 0
            total_online_devices = 0
            total_fleet_kwh = 0.0
            overdue_services_count = 0
            critical_alerts_count = 0
            paid_clients_count = 0
            unpaid_clients_count = 0
            pending_clients_count = 0
            total_takeout_devices = 0

            today = date.today()

            for p in raw_projects:
                pid = p["id"]
                p_name = p["project_name"] or f"Project #{pid}"
                c_name = p["client_name"] or p_name
                if "dummy" in p_name.lower() or "dummy" in c_name.lower():
                    continue
                p_status = (p["status"] or "active").strip().lower()
                is_lost_client = (p_status == "lost")
                is_active_client = not is_lost_client
                loc_uuid = p["location_uuid"]
                start_date = p["start_date"]

                # Auto-healing location resolution
                loc_devs = []
                is_reconciled = False
                matched_loc_name = None
                active_loc_uuid = loc_uuid

                # Priority 1: Mini-ERP Hardware serial benchmark match
                if pid in project_location_mapping and project_location_mapping[pid].get("method") == "hardware_serial":
                    reconciled_loc = project_location_mapping[pid]
                    rec_uuid = reconciled_loc["uuid"]
                    rec_devs = devices_by_loc.get(rec_uuid, [])
                    if len(rec_devs) > 0:
                        loc_devs = rec_devs
                        is_reconciled = (rec_uuid != loc_uuid)
                        matched_loc_name = reconciled_loc["name"]
                        active_loc_uuid = rec_uuid

                # Priority 2: Direct location_uuid or token-reconciled location
                if not loc_devs:
                    loc_devs = devices_by_loc.get(loc_uuid, [])
                    if len(loc_devs) == 0 and pid in project_location_mapping:
                        reconciled_loc = project_location_mapping[pid]
                        rec_uuid = reconciled_loc["uuid"]
                        rec_devs = devices_by_loc.get(rec_uuid, [])
                        if len(rec_devs) > 0:
                            loc_devs = rec_devs
                            is_reconciled = True
                            matched_loc_name = reconciled_loc["name"]
                            active_loc_uuid = rec_uuid

                minierp_devs = minierp_devices_by_project.get(pid, [])
                
                # Match MongoDB billing info for this client
                client_billing = None
                for target_str in [c_name.lower(), p_name.lower()]:
                    if target_str in client_billing_map:
                        client_billing = client_billing_map[target_str]
                        break
                    # Fuzzy match check
                    for b_key, b_val in client_billing_map.items():
                        if len(b_key) > 4 and (b_key in target_str or target_str in b_key):
                            client_billing = b_val
                            break
                    if client_billing:
                        break

                if not client_billing:
                    client_billing = {
                        "billing_status": "B2B_OFFLINE",
                        "paid_invoices": 0,
                        "unpaid_invoices": 0,
                        "waiting_payment": 0,
                        "total_paid_amount": 0.0,
                        "latest_due_date": None
                    }

                b_status = client_billing["billing_status"]
                if is_active_client:
                    if b_status == "PAID":
                        paid_clients_count += 1
                    elif b_status == "OVERDUE_UNPAID":
                        unpaid_clients_count += 1
                    elif b_status == "PAYMENT_PENDING":
                        pending_clients_count += 1

                # Build lookup of live MySQL devices for cross-referencing
                mysql_dev_lookup = {
                    (d.get("device_name") or "").strip().lower(): d 
                    for d in loc_devs
                }

                # Annotate Mini-ERP devices with Installed / Takeout status and live telemetry
                annotated_minierp_devs = []
                erp_installed_count = 0
                erp_takeout_count = 0
                erp_spare_count = 0

                for ed in minierp_devs:
                    ed_dict = dict(ed)
                    if ed_dict.get("installed_date"):
                        ed_dict["installed_date"] = str(ed_dict["installed_date"])
                    if ed_dict.get("takeout_date"):
                        ed_dict["takeout_date"] = str(ed_dict["takeout_date"])

                    ed_status = (ed_dict.get("device_status") or "Installed").strip()
                    ed_status_lower = ed_status.lower()
                    if "takeout" in ed_status_lower:
                        erp_takeout_count += 1
                        ed_dict["normalized_status"] = "Takeout"
                    elif "spare" in ed_status_lower:
                        erp_spare_count += 1
                        ed_dict["normalized_status"] = "Spare"
                    else:
                        erp_installed_count += 1
                        ed_dict["normalized_status"] = "Installed"

                    ed_name = (ed_dict.get("device_id") or "").strip()
                    m_match = mysql_dev_lookup.get(ed_name.lower()) if ed_name else None
                    if m_match:
                        ed_dict["in_telemetry"] = True
                        ed_dict["connectivity"] = m_match.get("connectivity") or "offline"
                        ed_dict["mysql_status"] = m_match.get("status")
                        ed_dict["telemetry_data"] = {
                            "power_kwh": m_match.get("total_powerconsumption"),
                            "firmware": m_match.get("device_firmware"),
                            "is_outdated_fw": m_match.get("is_firmware_outdated"),
                            "measurements": m_match.get("measurement_current")
                        }
                    else:
                        ed_dict["in_telemetry"] = False
                        ed_dict["connectivity"] = "unlinked"
                        ed_dict["mysql_status"] = None
                        ed_dict["telemetry_data"] = None

                    annotated_minierp_devs.append(ed_dict)

                # Cross-reference live MySQL devices with ERP status
                erp_dev_lookup = {
                    (ed.get("device_id") or "").strip().lower(): ed
                    for ed in annotated_minierp_devs if ed.get("device_id")
                }
                for d in loc_devs:
                    d_clean = (d.get("device_name") or "").strip().lower()
                    matched_erp = erp_dev_lookup.get(d_clean)
                    if matched_erp:
                        d["erp_status"] = matched_erp.get("normalized_status")
                        d["is_takeout"] = (d["erp_status"] == "Takeout")
                        d["erp_installed_date"] = str(matched_erp.get("installed_date")) if matched_erp.get("installed_date") else None
                        d["erp_takeout_date"] = str(matched_erp.get("takeout_date")) if matched_erp.get("takeout_date") else None
                        d["erp_notes"] = matched_erp.get("notes")
                    else:
                        d["erp_status"] = "Unregistered"
                        d["is_takeout"] = False

                # Group devices by room
                room_map = {}
                project_kwh = 0.0
                outdated_fw_count = 0
                for d in loc_devs:
                    r_name = d.get("room_name") or "Main Area"
                    if r_name not in room_map:
                        room_map[r_name] = []
                    room_map[r_name].append(d)
                    if not d.get("is_takeout"):
                        project_kwh += float(d.get("total_powerconsumption") or 0.0)
                        if d.get("is_firmware_outdated"):
                            outdated_fw_count += 1

                # Calculate device stats (STRICTLY EXCLUDING Takeout devices from SLA)
                active_loc_devs = [d for d in loc_devs if not d.get("is_takeout")]
                takeout_loc_devs = [d for d in loc_devs if d.get("is_takeout")]

                dev_count = len(active_loc_devs)
                takeout_count = len(takeout_loc_devs)
                online_count = sum(1 for d in active_loc_devs if d.get("connectivity") == "online")
                offline_count = dev_count - online_count
                uptime_pct = round((online_count / dev_count * 100.0), 1) if dev_count > 0 else 0.0

                if is_active_client:
                    total_fleet_kwh += project_kwh
                    total_active_devices += dev_count
                    total_online_devices += online_count
                    total_takeout_devices += takeout_count

                # Calculate Maintenance Milestone / Cycle
                p_milestones = milestones_by_project.get(pid, [])
                pending_milestones = [m for m in p_milestones if m.get("status") in ["pending", "in_progress", "scheduled"]]
                
                p_reports = reports_by_project.get(pid, []) or reports_by_client_name.get(c_name.lower(), [])
                latest_report = p_reports[0] if p_reports else None

                next_maint_date = None
                next_maint_type = "Filter Cleaning"
                
                if pending_milestones:
                    earliest_pending = sorted(pending_milestones, key=lambda x: str(x.get("target_date") or "9999-99-99"))[0]
                    raw_td = earliest_pending.get("target_date")
                    if raw_td:
                        if isinstance(raw_td, str):
                            try:
                                next_maint_date = datetime.strptime(raw_td[:10], "%Y-%m-%d").date()
                            except Exception:
                                next_maint_date = None
                        elif isinstance(raw_td, (datetime, date)):
                            next_maint_date = raw_td.date() if isinstance(raw_td, datetime) else raw_td
                    next_maint_type = earliest_pending.get("name") or "Filter Cleaning"
                elif latest_report and latest_report.get("activity_date"):
                    raw_act = latest_report["activity_date"]
                    if isinstance(raw_act, str):
                        try:
                            act_date = datetime.strptime(raw_act[:10], "%Y-%m-%d").date()
                        except Exception:
                            act_date = None
                    elif isinstance(raw_act, (datetime, date)):
                        act_date = raw_act.date() if isinstance(raw_act, datetime) else raw_act
                    else:
                        act_date = None
                    if act_date:
                        next_maint_date = act_date + timedelta(days=120)
                        next_maint_type = "Filter Cleaning"
                elif start_date:
                    raw_sd = start_date.date() if isinstance(start_date, datetime) else start_date
                    next_maint_date = raw_sd + timedelta(days=120)
                    next_maint_type = "First Maintenance"

                days_remaining = None
                maint_status = "ON_TRACK"
                if next_maint_date:
                    days_remaining = (next_maint_date - today).days
                    if days_remaining < 0:
                        maint_status = "OVERDUE"
                        if is_active_client:
                            overdue_services_count += 1
                    elif days_remaining <= 14:
                        maint_status = "DUE_SOON"
                    else:
                        maint_status = "ON_TRACK"

                # Evaluate Bad Alerts (with electrical, billing, and ERP mismatch rules)
                project_dict = {
                    "id": pid,
                    "project_name": p_name,
                    "client_name": c_name,
                    "location_uuid": active_loc_uuid
                }
                project_alerts = AlertEngine.evaluate_device_alerts(
                    project_dict, room_map, billing_info=client_billing, minierp_devices=minierp_devs
                )
                if is_active_client:
                    all_alerts.extend(project_alerts)
                    for a in project_alerts:
                        if a.get("severity") == "CRITICAL":
                            critical_alerts_count += 1

                # Summarize Mini-ERP device models
                # Mini-ERP Models & Status Breakdown
                minierp_models = {}
                for md in minierp_devs:
                    m_label = md.get("device_item_type") or md.get("device_type") or "Unit"
                    minierp_models[m_label] = minierp_models.get(m_label, 0) + 1

                raw_country = (p["country"] or "Indonesia").strip()
                raw_city = (p["city"] or "").strip()
                if raw_country.lower() == "cilegon":
                    norm_country = "Indonesia"
                    norm_city = raw_city if raw_city else "Cilegon"
                else:
                    norm_country = raw_country
                    norm_city = raw_city or "Jakarta"

                client_card = {
                    "project_id": pid,
                    "project_name": p_name,
                    "client_name": c_name,
                    "project_status": "lost" if is_lost_client else "active",
                    "client_type": p["client_type"] or "Residential",
                    "segment": p["segment"] or "B2C",
                    "city": norm_city,
                    "country": norm_country,
                    "contract_type": p["contract_type"],
                    "start_date": str(start_date) if start_date else None,
                    "end_date": str(p["end_date"]) if p.get("end_date") else None,
                    "location_uuid": active_loc_uuid,
                    "original_location_uuid": loc_uuid,
                    "is_location_reconciled": is_reconciled,
                    "reconciled_location_name": matched_loc_name,
                    "device_count": dev_count,
                    "takeout_count": takeout_count,
                    "online_count": online_count,
                    "offline_count": offline_count,
                    "uptime_pct": uptime_pct,
                    "total_kwh": round(project_kwh, 2),
                    "outdated_fw_count": outdated_fw_count,
                    "billing_status": b_status,
                    "billing_summary": client_billing,
                    "minierp_planned_count": len(minierp_devs),
                    "minierp_installed_count": erp_installed_count,
                    "minierp_takeout_count": erp_takeout_count,
                    "minierp_spare_count": erp_spare_count,
                    "minierp_models": minierp_models,
                    "maint_target_date": str(next_maint_date) if next_maint_date else None,
                    "maint_type": next_maint_type,
                    "maint_days_remaining": days_remaining,
                    "maint_status": maint_status,
                    "alerts_count": len(project_alerts),
                    "has_critical_alert": any(a.get("severity") == "CRITICAL" for a in project_alerts),
                    "last_service_date": str(latest_report.get("activity_date")) if latest_report else None,
                    "last_service_technician": latest_report.get("technician_name") if latest_report else None
                }
                processed_clients.append(client_card)

                # Store deep details for drawer modal
                self.cached_client_details[pid] = {
                    "client_info": client_card,
                    "rooms": room_map,
                    "milestones": p_milestones,
                    "fieldwork_reports": p_reports,
                    "minierp_devices": annotated_minierp_devs,
                    "billing": client_billing,
                    "alerts": project_alerts
                }

            active_clients = [c for c in processed_clients if c.get("project_status") == "active"]
            lost_clients = [c for c in processed_clients if c.get("project_status") == "lost"]

            # Global Fleet SLA & KPIs
            global_online_pct = round((total_online_devices / total_active_devices * 100.0), 1) if total_active_devices > 0 else 0.0

            self.cached_summary = {
                "total_clients": len(active_clients),
                "active_clients_count": len(active_clients),
                "lost_clients_count": len(lost_clients),
                "total_records_count": len(processed_clients),
                "total_active_devices": total_active_devices,
                "total_online_devices": total_online_devices,
                "total_offline_devices": total_active_devices - total_online_devices,
                "total_takeout_devices": total_takeout_devices,
                "global_uptime_pct": global_online_pct,
                "total_fleet_kwh": round(total_fleet_kwh, 1),
                "paid_clients_count": paid_clients_count,
                "unpaid_clients_count": unpaid_clients_count,
                "pending_clients_count": pending_clients_count,
                "total_alerts": len(all_alerts),
                "critical_alerts_count": critical_alerts_count,
                "overdue_services_count": overdue_services_count,
                "last_refreshed": datetime.now(timezone.utc).isoformat(),
                "execution_time_ms": round((time.time() - start_time) * 1000, 1)
            }
            self.cached_clients = processed_clients
            self.cached_alerts = sorted(all_alerts, key=lambda a: (0 if a.get("severity") == "CRITICAL" else (1 if a.get("severity") == "WARNING" else 2), a.get("created_at") or ""))
            self.last_updated = datetime.now(timezone.utc)

            logger.info(f"Triple-Database Fleet Intelligence refreshed in {self.cached_summary['execution_time_ms']}ms. {len(processed_clients)} clients, {total_active_devices} devices, {len(all_alerts)} alerts, {round(total_fleet_kwh,1)} kWh.")

        except Exception as e:
            logger.error(f"Error during Fleet Intelligence refresh: {e}", exc_info=True)
            # If we already have valid cached data, NEVER overwrite with zeroes!
            if not self.cached_summary or not self.cached_clients:
                self.cached_summary = {
                    "total_clients": len(self.cached_clients),
                    "total_active_devices": 0,
                    "total_online_devices": 0,
                    "total_offline_devices": 0,
                    "global_uptime_pct": 0.0,
                    "total_fleet_kwh": 0.0,
                    "paid_clients_count": 0,
                    "unpaid_clients_count": 0,
                    "pending_clients_count": 0,
                    "total_alerts": 0,
                    "critical_alerts_count": 0,
                    "overdue_services_count": 0,
                    "last_refreshed": datetime.now(timezone.utc).isoformat(),
                    "execution_time_ms": 0.0,
                    "error": str(e)
                }
            else:
                logger.warning("Retaining existing valid fleet cache despite refresh error.")

fleet_engine = FleetAggregator()
