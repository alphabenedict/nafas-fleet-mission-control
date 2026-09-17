from datetime import datetime, timezone
from typing import List, Dict, Any

class AlertEngine:
    @staticmethod
    def evaluate_device_alerts(
        project: Dict[str, Any],
        room_devices: Dict[str, List[Dict[str, Any]]]
    ) -> List[Dict[str, Any]]:
        alerts = []
        all_devices = []
        for dev_list in room_devices.values():
            all_devices.extend(dev_list)
        
        if not all_devices:
            return alerts

        # 1. Rule: Blackout Warning (100% devices offline at site with >= 2 devices)
        total_devs = len(all_devices)
        offline_devs = [d for d in all_devices if d.get("connectivity") == "offline"]
        if total_devs >= 2 and len(offline_devs) == total_devs:
            alerts.append({
                "severity": "WARNING",
                "type": "SITE_BLACKOUT",
                "title": "Apartment / Site Wide Blackout",
                "message": f"All {total_devs} devices at this location are offline simultaneously (potential power shutoff or resident travel).",
                "project_id": project.get("id"),
                "project_name": project.get("project_name"),
                "client_name": project.get("client_name"),
                "location_uuid": project.get("location_uuid"),
                "created_at": datetime.now(timezone.utc).isoformat()
            })

        # 2. Rule: Silent Dropout (Purifier offline while monitor in same room is online)
        for room_name, devs in room_devices.items():
            monitors = [d for d in devs if d.get("category_code") == "airmon"]
            purifiers = [d for d in devs if d.get("category_code") == "airpure"]
            
            has_online_monitor = any(m.get("connectivity") == "online" for m in monitors)
            
            for p in purifiers:
                if p.get("connectivity") == "offline" and has_online_monitor:
                    alerts.append({
                        "severity": "CRITICAL",
                        "type": "SILENT_PURIFIER_DROPOUT",
                        "title": f"Silent Dropout: {p.get('device_name')}",
                        "message": f"Purifier in '{room_name}' is offline while the room monitor is active. Probable hardware board failure or unplugged unit.",
                        "project_id": project.get("id"),
                        "project_name": project.get("project_name"),
                        "client_name": project.get("client_name"),
                        "location_uuid": project.get("location_uuid"),
                        "room_name": room_name,
                        "device_id": p.get("vendor_device_id"),
                        "device_name": p.get("device_name"),
                        "device_type": p.get("device_type"),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })

        # 3. Rule: Environmental Breach (PM2.5 > 15 ug/m3 or CO2 > 1000 ppm)
        for room_name, devs in room_devices.items():
            monitors = [d for d in devs if d.get("category_code") == "airmon"]
            for m in monitors:
                meas = m.get("measurement_current", {})
                pm25 = meas.get("pm25")
                co2 = meas.get("co2")
                
                if pm25 is not None and pm25 > 25:
                    alerts.append({
                        "severity": "WARNING",
                        "type": "POLLUTION_BREACH_PM25",
                        "title": f"Elevated PM₂.₅ ({pm25} µg/m³) in {room_name}",
                        "message": f"Indoor air quality in '{room_name}' exceeds 25 µg/m³ threshold. Clean Air Zone seal compromised.",
                        "project_id": project.get("id"),
                        "project_name": project.get("project_name"),
                        "client_name": project.get("client_name"),
                        "room_name": room_name,
                        "device_name": m.get("device_name"),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })
                
                if co2 is not None and co2 > 1200:
                    alerts.append({
                        "severity": "WARNING",
                        "type": "VENTILATION_ALERT_CO2",
                        "title": f"High CO₂ Accumulation ({co2} ppm) in {room_name}",
                        "message": f"Stagnant air in '{room_name}' exceeds 1,200 ppm. Ventilation/door opening recommended.",
                        "project_id": project.get("id"),
                        "project_name": project.get("project_name"),
                        "client_name": project.get("client_name"),
                        "room_name": room_name,
                        "device_name": m.get("device_name"),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })

        # 4. Rule: Filter Depletion (Filter life < 15%)
        for room_name, devs in room_devices.items():
            purifiers = [d for d in devs if d.get("category_code") == "airpure"]
            for p in purifiers:
                state = p.get("device_state", {})
                filt = state.get("filter", {})
                life = filt.get("life")
                if life is not None and life < 15.0:
                    alerts.append({
                        "severity": "WARNING",
                        "type": "FILTER_DEPLETION",
                        "title": f"Filter Life Low ({life:.1f}%) on {p.get('device_name')}",
                        "message": f"Filter in '{room_name}' has reached {life:.1f}% remaining lifetime. Schedule replacement milestone.",
                        "project_id": project.get("id"),
                        "project_name": project.get("project_name"),
                        "client_name": project.get("client_name"),
                        "room_name": room_name,
                        "device_name": p.get("device_name"),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    })

        return alerts
