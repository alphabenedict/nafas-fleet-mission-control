import json
import time
import logging
import threading
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from typing import Dict, List, Any, Optional
import psycopg2.extras
from backend.database import get_mysql_connection, get_pg_connection
from backend.alert_engine import AlertEngine

logger = logging.getLogger("fleet.aggregator")

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
    def __init__(self, cache_ttl: int = 300):
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

    def refresh(self, force: bool = False) -> None:
        if not force and self.is_cache_valid():
            return

        with self._lock:
            if not force and self.is_cache_valid():
                return
            self._do_refresh()

    def _do_refresh(self) -> None:
        logger.info("Refreshing Fleet Intelligence Cache from MySQL & NeonDB...")
        start_time = time.time()

        try:
            # 1. Fetch from NeonDB
            pg_conn = get_pg_connection()
            pg_cur = pg_conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

            # Projects
            pg_cur.execute("""
                SELECT p.id, p.project_name, p.category, p.status, p.location_uuid,
                       p.start_date, p.end_date, p.contract_type, p.country, p.city,
                       c.id as client_id, c.client_name, c.client_type, c.segment
                FROM projects p
                LEFT JOIN clients c ON c.id = p.client_id
                WHERE p.status = 'active' OR p.category ILIKE '%Clean Air%'
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

            pg_conn.close()

            # 2. Extract active location_uuids for fast MySQL query
            loc_uuids = [p["location_uuid"] for p in raw_projects if p["location_uuid"] and len(str(p["location_uuid"])) > 10]

            # Fetch from MySQL (targeted by location_uuid)
            my_conn = get_mysql_connection()
            raw_devices = []
            rooms_by_uuid = {}
            if loc_uuids:
                with my_conn.cursor() as cursor:
                    # Get rooms for these locations
                    cursor.execute("""
                        SELECT uuid, location_uuid, room_name
                        FROM nafas_mydevice.tb_role_room
                        WHERE location_uuid IN %s;
                    """, (tuple(loc_uuids),))
                    for rm in cursor.fetchall():
                        rooms_by_uuid[rm["uuid"]] = rm["room_name"]

                    # Get devices for these locations (excluding heavy device_config)
                    cursor.execute("""
                        SELECT id, uuid, vendor_device_id, device_name, device_type,
                               category_code, status, connectivity, location_uuid,
                               room_uuid, device_state, measurement_current, updated_at
                        FROM nafas_mydevice.tb_mydevice
                        WHERE is_deleted = 0 AND status = 'activated' AND location_uuid IN %s;
                    """, (tuple(loc_uuids),))
                    raw_devices = cursor.fetchall()
            my_conn.close()

            # Index MySQL devices by location_uuid
            devices_by_loc = {}
            for dev in raw_devices:
                loc = dev["location_uuid"]
                if loc:
                    if loc not in devices_by_loc:
                        devices_by_loc[loc] = []
                    
                    dev_dict = dict(dev)
                    dev_dict["room_name"] = rooms_by_uuid.get(dev["room_uuid"]) or "Main Room"
                    
                    for field in ["device_state", "measurement_current"]:
                        val = dev_dict.get(field)
                        if isinstance(val, str):
                            try:
                                dev_dict[field] = json.loads(val)
                            except Exception:
                                dev_dict[field] = {}
                        elif val is None:
                            dev_dict[field] = {}
                    
                    dev_dict = serialize_obj(dev_dict)
                    devices_by_loc[loc].append(dev_dict)

            # 3. Process Projects & Reconcile
            processed_clients = []
            all_alerts = []
            total_active_devices = 0
            total_online_devices = 0
            overdue_services_count = 0
            critical_alerts_count = 0

            today = date.today()

            for p in raw_projects:
                pid = p["id"]
                p_name = p["project_name"] or f"Project #{pid}"
                c_name = p["client_name"] or p_name
                loc_uuid = p["location_uuid"]
                start_date = p["start_date"]

                loc_devs = devices_by_loc.get(loc_uuid, [])
                
                # Group devices by room
                room_map = {}
                for d in loc_devs:
                    r_name = d.get("room_name") or "Main Area"
                    if r_name not in room_map:
                        room_map[r_name] = []
                    room_map[r_name].append(d)

                # Calculate device stats
                dev_count = len(loc_devs)
                online_count = sum(1 for d in loc_devs if d.get("connectivity") == "online")
                offline_count = dev_count - online_count
                uptime_pct = round((online_count / dev_count * 100.0), 1) if dev_count > 0 else 0.0

                total_active_devices += dev_count
                total_online_devices += online_count

                # Calculate Maintenance Milestone / Cycle
                p_milestones = milestones_by_project.get(pid, [])
                pending_milestones = [m for m in p_milestones if m.get("status") in ["pending", "in_progress", "scheduled"]]
                
                p_reports = reports_by_project.get(pid, []) or reports_by_client_name.get(c_name.lower(), [])
                latest_report = p_reports[0] if p_reports else None

                # Next maintenance target date logic
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

                # Calculate countdown status
                days_remaining = None
                maint_status = "ON_TRACK"
                if next_maint_date:
                    days_remaining = (next_maint_date - today).days
                    if days_remaining < 0:
                        maint_status = "OVERDUE"
                        overdue_services_count += 1
                    elif days_remaining <= 14:
                        maint_status = "DUE_SOON"
                    else:
                        maint_status = "ON_TRACK"

                # Evaluate Bad Alerts
                project_dict = {
                    "id": pid,
                    "project_name": p_name,
                    "client_name": c_name,
                    "location_uuid": loc_uuid
                }
                project_alerts = AlertEngine.evaluate_device_alerts(project_dict, room_map)
                all_alerts.extend(project_alerts)

                for a in project_alerts:
                    if a.get("severity") == "CRITICAL":
                        critical_alerts_count += 1

                client_card = {
                    "project_id": pid,
                    "project_name": p_name,
                    "client_name": c_name,
                    "client_type": p["client_type"] or "Residential",
                    "segment": p["segment"] or "B2C",
                    "city": p["city"] or "Jakarta",
                    "country": p["country"] or "Indonesia",
                    "contract_type": p["contract_type"],
                    "start_date": str(start_date) if start_date else None,
                    "location_uuid": loc_uuid,
                    "device_count": dev_count,
                    "online_count": online_count,
                    "offline_count": offline_count,
                    "uptime_pct": uptime_pct,
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
                    "alerts": project_alerts
                }

            # Global Fleet SLA & KPIs
            global_online_pct = round((total_online_devices / total_active_devices * 100.0), 1) if total_active_devices > 0 else 0.0

            self.cached_summary = {
                "total_clients": len(processed_clients),
                "total_active_devices": total_active_devices,
                "total_online_devices": total_online_devices,
                "total_offline_devices": total_active_devices - total_online_devices,
                "global_uptime_pct": global_online_pct,
                "total_alerts": len(all_alerts),
                "critical_alerts_count": critical_alerts_count,
                "overdue_services_count": overdue_services_count,
                "last_refreshed": datetime.now(timezone.utc).isoformat(),
                "execution_time_ms": round((time.time() - start_time) * 1000, 1)
            }
            self.cached_clients = processed_clients
            self.cached_alerts = sorted(all_alerts, key=lambda a: (0 if a.get("severity") == "CRITICAL" else 1, a.get("created_at") or ""))
            self.last_updated = datetime.now(timezone.utc)

            logger.info(f"Fleet Intelligence refreshed in {self.cached_summary['execution_time_ms']}ms. {len(processed_clients)} clients, {total_active_devices} devices, {len(all_alerts)} alerts.")

        except Exception as e:
            logger.error(f"Error during Fleet Intelligence refresh: {e}", exc_info=True)
            raise

fleet_engine = FleetAggregator()
