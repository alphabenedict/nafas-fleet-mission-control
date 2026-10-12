import os
import logging
import threading
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.aggregator import fleet_engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("fleet.app")

app = FastAPI(
    title="Nafas Clean Air Zone™ Fleet Mission Control API",
    version="1.1.0",
    description="Triple-Database Fleet Intelligence, Health & Automated Maintenance Cycle Engine"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    # Prime cache in background thread so server becomes immediately available
    threading.Thread(target=fleet_engine.refresh, kwargs={"force": True}, daemon=True).start()

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "is_refreshing": fleet_engine._is_refreshing,
        "cache_valid": fleet_engine.is_cache_valid(),
        "last_refreshed": fleet_engine.last_updated.isoformat() if fleet_engine.last_updated else None,
        "total_active_devices": fleet_engine.cached_summary.get("total_active_devices", 0)
    }

@app.get("/api/fleet/status")
def get_fleet_status():
    return {
        "is_refreshing": fleet_engine._is_refreshing,
        "cache_valid": fleet_engine.is_cache_valid(),
        "last_refreshed": fleet_engine.last_updated.isoformat() if fleet_engine.last_updated else None,
        "total_clients": fleet_engine.cached_summary.get("total_clients", len(fleet_engine.cached_clients)),
        "total_active_devices": fleet_engine.cached_summary.get("total_active_devices", 0),
        "total_online_devices": fleet_engine.cached_summary.get("total_online_devices", 0)
    }

@app.get("/api/fleet/summary")
def get_summary():
    if not fleet_engine.is_cache_valid():
        fleet_engine.refresh(background=True)
    return fleet_engine.cached_summary

@app.get("/api/fleet/alerts")
def get_alerts(severity: Optional[str] = None):
    if not fleet_engine.is_cache_valid():
        fleet_engine.refresh(background=True)
    alerts = fleet_engine.cached_alerts
    if severity:
        alerts = [a for a in alerts if a.get("severity", "").upper() == severity.upper()]
    return {
        "count": len(alerts),
        "alerts": alerts
    }

@app.get("/api/fleet/clients")
def get_clients(
    search: Optional[str] = None,
    status: Optional[str] = None,
    maint: Optional[str] = None,
    segment: Optional[str] = None,
    billing: Optional[str] = None,
    firmware: Optional[str] = None
):
    if not fleet_engine.is_cache_valid():
        fleet_engine.refresh(background=True)
    clients = fleet_engine.cached_clients

    if search:
        s = search.lower()
        clients = [
            c for c in clients 
            if s in c["client_name"].lower() 
            or s in c["project_name"].lower() 
            or s in (c.get("city") or "").lower()
            or s in (c.get("location_uuid") or "").lower()
        ]

    if status == "critical":
        clients = [c for c in clients if c.get("has_critical_alert")]
    elif status == "healthy":
        clients = [c for c in clients if not c.get("has_critical_alert") and c.get("uptime_pct", 0) >= 90]
    elif status == "offline_heavy":
        clients = [c for c in clients if c.get("uptime_pct", 0) < 50]

    if maint == "overdue":
        clients = [c for c in clients if c.get("maint_status") == "OVERDUE"]
    elif maint == "due_soon":
        clients = [c for c in clients if c.get("maint_status") in ["OVERDUE", "DUE_SOON"]]

    if segment:
        clients = [c for c in clients if c.get("segment", "").lower() == segment.lower()]

    if billing == "paid":
        clients = [c for c in clients if c.get("billing_status") == "PAID"]
    elif billing == "unpaid":
        clients = [c for c in clients if c.get("billing_status") == "OVERDUE_UNPAID"]
    elif billing == "pending":
        clients = [c for c in clients if c.get("billing_status") == "PAYMENT_PENDING"]

    if firmware == "outdated":
        clients = [c for c in clients if c.get("outdated_fw_count", 0) > 0]

    return {
        "total": len(clients),
        "clients": clients
    }

@app.get("/api/fleet/client/{project_id}")
@app.get("/api/fleet/clients/{project_id}")
def get_client_detail(project_id: int):
    detail = fleet_engine.cached_client_details.get(project_id)
    if detail:
        if not fleet_engine.is_cache_valid():
            fleet_engine.refresh(background=True)
        return detail
    
    # If not found in cache yet, try refreshing
    fleet_engine.refresh()
    detail = fleet_engine.cached_client_details.get(project_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Client project not found")
    return detail

@app.post("/api/fleet/refresh")
def force_refresh():
    if not fleet_engine._is_refreshing:
        threading.Thread(target=fleet_engine._run_locked_refresh, daemon=True).start()
    return {
        "status": "refreshing",
        "is_refreshing": True,
        "message": "Telemetry refresh initiated in background",
        "last_refreshed": fleet_engine.last_updated.isoformat() if fleet_engine.last_updated else None
    }

@app.get("/api/tactical/summary")
def get_tactical_summary():
    try:
        from backend.database import get_tactical_pg_connection
        import psycopg2.extras
        conn = get_tactical_pg_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        cur.execute("""
            SELECT 
                COUNT(*) as total_deals,
                COUNT(DISTINCT client_id) as total_clients,
                COALESCE(SUM(CASE WHEN pipeline_stage = '6. Closed Won (Installed)' THEN mrr ELSE 0 END), 0) as won_mrr,
                COALESCE(SUM(CASE WHEN pipeline_stage = '6. Closed Won (Installed)' THEN tcv ELSE 0 END), 0) as won_tcv,
                COUNT(CASE WHEN pipeline_stage = '6. Closed Won (Installed)' THEN 1 END) as won_deals,
                COUNT(CASE WHEN pipeline_stage = '7. Closed Lost' THEN 1 END) as lost_deals,
                COUNT(CASE WHEN pipeline_stage NOT IN ('6. Closed Won (Installed)', '7. Closed Lost') THEN 1 END) as active_pipeline_deals
            FROM deals;
        """)
        summary = cur.fetchone()
        
        cur.execute("""
            SELECT pipeline_stage, COUNT(*) as count, 
                   COALESCE(SUM(mrr), 0) as total_mrr, 
                   COALESCE(SUM(tcv), 0) as total_tcv
            FROM deals
            GROUP BY pipeline_stage
            ORDER BY count DESC;
        """)
        stages = cur.fetchall()
        
        cur.close()
        conn.close()
        return {
            "status": "success",
            "summary": summary,
            "pipeline_stages": stages
        }
    except Exception as e:
        logger.error(f"Error fetching tactical summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tactical/deals")
def get_tactical_deals(stage: Optional[str] = None, search: Optional[str] = None, limit: int = 100):
    try:
        from backend.database import get_tactical_pg_connection
        import psycopg2.extras
        conn = get_tactical_pg_connection()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        
        query = """
            SELECT d.id, d.client_id, c.client_name, c.client_segment, c.city,
                   d.project_name, d.pipeline_stage, d.account_stage, d.priority,
                   d.solutions_type, d.purchase_type, d.bd_closer, d.account_manager,
                   d.contract_months, d.mrr, d.tcv
            FROM deals d
            LEFT JOIN clients c ON d.client_id = c.id
            WHERE 1=1
        """
        params = []
        if stage:
            query += " AND d.pipeline_stage = %s"
            params.append(stage)
        if search:
            query += " AND (c.client_name ILIKE %s OR d.project_name ILIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])
            
        query += " ORDER BY d.id DESC LIMIT %s;"
        params.append(limit)
        
        cur.execute(query, tuple(params))
        deals = cur.fetchall()
        
        cur.close()
        conn.close()
        return {
            "status": "success",
            "count": len(deals),
            "deals": deals
        }
    except Exception as e:
        logger.error(f"Error fetching tactical deals: {e}")
        raise HTTPException(status_code=500, detail=str(e))

frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=os.path.join(frontend_dir, "static")), name="static")

    @app.get("/")
    def serve_frontend():
        return FileResponse(os.path.join(frontend_dir, "index.html"))
