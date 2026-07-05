"""
verify_fk.py

Verifies seed.json for the Sri Lanka Police Tuk-Tuk Monitoring System
against the assignment rubric:

Direct FK checks:
    district.province_id  -> provinces.id
    station.district_id   -> districts.id
    vehicle.station_id    -> stations.id
    ping.vehicle_id        -> vehicles.id

Chain checks (full lineage must resolve, end to end):
    vehicle -> station -> district -> province
    ping    -> vehicle -> station -> district -> province

Scale checks:
    9 provinces
    25+ districts
    20+ stations
    200+ vehicles
    7+ days of pings per vehicle (timespan check)

Timestamp sanity check:
    Each vehicle's pings must have varied, non-identical timestamps.

Usage:
    python verify_fk.py seed.json
"""

import json
import sys
from datetime import datetime


def parse_ts(ts):
    # Handles "2026-06-15T00:00:00+05:30"
    return datetime.fromisoformat(ts)


def main():
    if len(sys.argv) != 2:
        print("Usage: python verify_fk.py <path-to-seed.json>")
        sys.exit(1)

    path = sys.argv[1]
    with open(path, "r") as f:
        data = json.load(f)

    provinces = data["provinces"]
    districts = data["districts"]
    stations = data["stations"]
    vehicles = data["vehicles"]
    pings = data["pings"]

    province_by_id = {p["id"]: p for p in provinces}
    district_by_id = {d["id"]: d for d in districts}
    station_by_id = {s["id"]: s for s in stations}
    vehicle_by_id = {v["id"]: v for v in vehicles}

    errors = []
    warnings = []

    # ---------- 1. Direct FK checks ----------
    for d in districts:
        if d["province_id"] not in province_by_id:
            errors.append(
                f"[direct] District {d['id']} ({d['name']}) -> "
                f"missing province_id {d['province_id']}"
            )

    for s in stations:
        if s["district_id"] not in district_by_id:
            errors.append(
                f"[direct] Station {s['id']} ({s['name']}) -> "
                f"missing district_id {s['district_id']}"
            )

    for v in vehicles:
        if v["station_id"] not in station_by_id:
            errors.append(
                f"[direct] Vehicle {v['id']} ({v['registration_number']}) -> "
                f"missing station_id {v['station_id']}"
            )

    for p in pings:
        if p["vehicle_id"] not in vehicle_by_id:
            errors.append(
                f"[direct] Ping {p['id']} -> missing vehicle_id {p['vehicle_id']}"
            )

    # ---------- 2. Full chain checks ----------
    # vehicle -> station -> district -> province
    for v in vehicles:
        station = station_by_id.get(v["station_id"])
        if station is None:
            continue  # already reported above
        district = district_by_id.get(station["district_id"])
        if district is None:
            errors.append(
                f"[chain] Vehicle {v['id']} -> Station {station['id']} -> "
                f"missing District {station['district_id']}"
            )
            continue
        province = province_by_id.get(district["province_id"])
        if province is None:
            errors.append(
                f"[chain] Vehicle {v['id']} -> Station {station['id']} -> "
                f"District {district['id']} -> missing Province "
                f"{district['province_id']}"
            )

    # ping -> vehicle -> station -> district -> province
    chain_broken_pings = 0
    for p in pings:
        v = vehicle_by_id.get(p["vehicle_id"])
        if v is None:
            chain_broken_pings += 1
            continue
        station = station_by_id.get(v["station_id"])
        if station is None:
            chain_broken_pings += 1
            continue
        district = district_by_id.get(station["district_id"])
        if district is None:
            chain_broken_pings += 1
            continue
        if district["province_id"] not in province_by_id:
            chain_broken_pings += 1

    if chain_broken_pings:
        errors.append(
            f"[chain] {chain_broken_pings} ping(s) have a broken "
            f"ping->vehicle->station->district->province chain"
        )

    # ---------- 3. Scale checks ----------
    if len(provinces) != 9:
        errors.append(f"[scale] Expected 9 provinces, found {len(provinces)}")
    if len(districts) < 25:
        errors.append(f"[scale] Expected 25+ districts, found {len(districts)}")
    if len(stations) < 20:
        errors.append(f"[scale] Expected 20+ stations, found {len(stations)}")
    if len(vehicles) < 200:
        errors.append(f"[scale] Expected 200+ vehicles, found {len(vehicles)}")

    # ---------- 4. Timestamp checks (per vehicle) ----------
    pings_by_vehicle = {}
    for p in pings:
        pings_by_vehicle.setdefault(p["vehicle_id"], []).append(p["timestamp"])

    short_history = []
    flat_timestamps = []

    for v in vehicles:
        ts_list = pings_by_vehicle.get(v["id"], [])
        if not ts_list:
            errors.append(f"[scale] Vehicle {v['id']} has zero pings")
            continue

        unique_ts = set(ts_list)
        if len(unique_ts) <= 1:
            flat_timestamps.append(v["id"])
            continue

        parsed = sorted(parse_ts(t) for t in ts_list)
        span_days = (parsed[-1] - parsed[0]).total_seconds() / 86400.0
        if span_days < 7:
            short_history.append((v["id"], round(span_days, 2)))

    if flat_timestamps:
        errors.append(
            f"[timestamp] {len(flat_timestamps)} vehicle(s) have identical "
            f"timestamps across all pings (not varied): "
            f"{flat_timestamps[:10]}{'...' if len(flat_timestamps) > 10 else ''}"
        )

    if short_history:
        warnings.append(
            f"[timestamp] {len(short_history)} vehicle(s) span < 7 days of "
            f"pings, e.g. {short_history[:5]}"
        )

    # ---------- Report ----------
    print(f"Provinces: {len(provinces)}")
    print(f"Districts: {len(districts)}")
    print(f"Stations:  {len(stations)}")
    print(f"Vehicles:  {len(vehicles)}")
    print(f"Pings:     {len(pings)}")
    if vehicles:
        print(f"Avg pings/vehicle: {len(pings) / len(vehicles):.1f}")
    print()

    if warnings:
        print(f"WARNINGS ({len(warnings)}):")
        for w in warnings:
            print(f"  - {w}")
        print()

    if errors:
        print(f"FAILED — {len(errors)} issue(s) found:\n")
        for e in errors[:30]:
            print(f"  - {e}")
        if len(errors) > 30:
            print(f"  ... and {len(errors) - 30} more")
        sys.exit(1)
    else:
        print("PASSED — all FK references, chains, and scale requirements check out.")
        sys.exit(0)


if __name__ == "__main__":
    main()
