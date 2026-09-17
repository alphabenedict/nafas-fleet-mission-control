import os
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.aggregator import fleet_engine

app = FastAPI(
    title="Nafas Clean Air Zone™ Fleet Mission Control API",
    version="1.0.0",
    description="Real-Time Fleet Health & Automated Maintenance Cycle Engine"
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
    try:
        fleet_engine.refresh(force=True)
    except Exception as e:
        print(f"Warning: Initial cache prime failed: {e}")

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "cache_valid": fleet_engine.is_cache_valid(),
        "last_refreshed": fleet_engine.last_updated.isoformat() if fleet_engine.last_updated else None
    }

@app.get("/api/fleet/summary")
def get_summary():
    fleet_engine.refresh()
    return fleet_engine.cached_summary

@app.get("/api/fleet/alerts")
def get_alerts(severity: Optional[str] = None):
    fleet_engine.refresh()
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
    segment: Optional[str] = None
):
    fleet_engine.refresh()
    clients = fleet_engine.cached_clients

    if search:
        s = search.lower()
        clients = [c for c in clients if s in c["client_name"].lower() or s in c["project_name"].lower() or s in (c.get("city") or "").lower()]

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

    return {
        "total": len(clients),
        "clients": clients
    }

@app.get("/api/fleet/client/{project_id}")
def get_client_detail(project_id: int):
    fleet_engine.refresh()
    detail = fleet_engine.cached_client_details.get(project_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Client project not found")
    return detail

@app.post("/api/fleet/refresh")
def force_refresh():
    fleet_engine.refresh(force=True)
    return {
        "status": "success",
        "summary": fleet_engine.cached_summary
    }

frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=os.path.join(frontend_dir, "static")), name="static")

    @app.get("/")
    def serve_frontend():
        return FileResponse(os.path.join(frontend_dir, "index.html"))
