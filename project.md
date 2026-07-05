# NB6007CEM S2 — Taxi Fleet Tracking REST API
## Project Design Document

---

## 1. Business Case

A taxi company operates a fleet of tuk-tuks across multiple zones in Sri Lanka. The company needs a REST API that allows dispatchers and managers to:

- Track the real-time and historical location of every vehicle
- Know which driver is assigned to which vehicle
- Monitor active trips from pickup to dropoff
- Understand vehicle distribution across depots and zones
- Derive speed from consecutive GPS pings

---

## 2. Data Model

### Entity Overview

```
Zone
 └── Depot
      └── Vehicle ──── Driver
           └── Trip
           └── Ping
```

### 2.1 Zone

A geographic service area (city district or region).

| Field       | Type    | Constraints       |
|-------------|---------|-------------------|
| id          | integer | PK, auto-increment |
| name        | string  | required, unique  |
| description | string  | optional          |

### 2.2 Depot

A base of operations where vehicles are stationed.

| Field   | Type    | Constraints          |
|---------|---------|----------------------|
| id      | integer | PK, auto-increment   |
| name    | string  | required             |
| zone_id | integer | FK → zones.id        |
| address | string  | optional             |

### 2.3 Driver

A person authorised to operate a vehicle.

| Field        | Type    | Constraints          |
|--------------|---------|----------------------|
| id           | integer | PK, auto-increment   |
| name         | string  | required             |
| licence_no   | string  | required, unique     |
| phone        | string  | optional             |
| depot_id     | integer | FK → depots.id       |

### 2.4 Vehicle

A tuk-tuk in the fleet.

| Field               | Type    | Constraints          |
|---------------------|---------|----------------------|
| id                  | integer | PK, auto-increment   |
| registration_number | string  | required, unique     |
| device_id           | string  | required, unique     |
| depot_id            | integer | FK → depots.id       |
| driver_id           | integer | FK → drivers.id, nullable |
| status              | enum    | `available`, `on_trip`, `offline` |

### 2.5 Trip

A single journey from pickup to dropoff.

| Field         | Type      | Constraints          |
|---------------|-----------|----------------------|
| id            | integer   | PK, auto-increment   |
| vehicle_id    | integer   | FK → vehicles.id     |
| driver_id     | integer   | FK → drivers.id      |
| status        | enum      | `pending`, `active`, `completed`, `cancelled` |
| origin_lat    | float     | required             |
| origin_lng    | float     | required             |
| dest_lat      | float     | optional             |
| dest_lng      | float     | optional             |
| started_at    | timestamp | nullable             |
| ended_at      | timestamp | nullable             |

### 2.6 Ping

A GPS location event emitted by a vehicle's tracking device.

| Field      | Type      | Constraints          |
|------------|-----------|----------------------|
| id         | integer   | PK, auto-increment   |
| vehicle_id | integer   | FK → vehicles.id     |
| latitude   | float     | required             |
| longitude  | float     | required             |
| timestamp  | timestamp | required             |

> **Derived field — speed:** Not stored. Computed at the API layer using the
> Haversine formula against the previous chronological ping for the same vehicle.

### FK Chain (full lineage)

```
ping.vehicle_id       → vehicles.id
vehicle.depot_id      → depots.id
vehicle.driver_id     → drivers.id
depot.zone_id         → zones.id
trip.vehicle_id       → vehicles.id
trip.driver_id        → drivers.id
driver.depot_id       → depots.id
```

---

## 3. API Routes

Base URL: `/api/v1`

### 3.1 Zones

| Method | Route         | Description              |
|--------|---------------|--------------------------|
| GET    | /zones        | List all zones           |
| GET    | /zones/:id    | Get a single zone        |

**GET /zones response:**
```json
[
  { "zone_id": 1, "name": "Colombo Central", "description": "..." }
]
```

**GET /zones/:id response:**
```json
{ "zone_id": 1, "name": "Colombo Central", "description": "..." }
```

---

### 3.2 Depots

| Method | Route                     | Description                      |
|--------|---------------------------|----------------------------------|
| GET    | /depots                   | List all depots                  |
| GET    | /depots/:id               | Get a single depot               |
| GET    | /depots/:id/vehicles      | All vehicles based at this depot |

**GET /depots/:id response:**
```json
{
  "depot_id": 3,
  "name": "Kandy Depot",
  "zone_id": 2,
  "address": "123 Peradeniya Road, Kandy"
}
```

**GET /depots/:id/vehicles response:**
```json
[
  {
    "vehicle_id": 12,
    "registration_number": "KNY-4421",
    "device_id": "GPS-TUK-00012",
    "status": "available"
  }
]
```

---

### 3.3 Drivers

| Method | Route                | Description                       |
|--------|----------------------|-----------------------------------|
| GET    | /drivers             | List all drivers                  |
| GET    | /drivers/:id         | Get a single driver               |
| GET    | /drivers/:id/trips   | All trips driven by this driver   |

**GET /drivers/:id response:**
```json
{
  "driver_id": 7,
  "name": "Kasun Perera",
  "licence_no": "WP-2021-00143",
  "phone": "+94771234567",
  "depot_id": 3
}
```

---

### 3.4 Vehicles

| Method | Route                          | Description                              |
|--------|--------------------------------|------------------------------------------|
| GET    | /vehicles                      | List all vehicles                        |
| GET    | /vehicles/:id                  | Vehicle detail with last ping            |
| GET    | /vehicles/:id/pings            | Full ping history (with derived speed)   |
| GET    | /vehicles/:id/last-position    | Most recent ping only                    |
| GET    | /vehicles/:id/trips            | All trips for this vehicle               |

**GET /vehicles/:id response (Layer 2 — composite):**
```json
{
  "vehicle_id": 12,
  "registration_number": "KNY-4421",
  "device_id": "GPS-TUK-00012",
  "depot_id": 3,
  "driver_id": 7,
  "status": "on_trip",
  "last_ping": {
    "ping_id": 5540,
    "timestamp": "2026-06-22T14:30:00+05:30",
    "lat": 7.2923,
    "lng": 80.6364,
    "speed": 24.5
  }
}
```

**GET /vehicles/:id/last-position response (Layer 3 — position only):**
```json
{
  "vehicle_id": 12,
  "timestamp": "2026-06-22T14:30:00+05:30",
  "lat": 7.2923,
  "lng": 80.6364,
  "speed": 24.5
}
```

**GET /vehicles/:id/pings response (array, ascending timestamp):**
```json
[
  {
    "ping_id": 1,
    "vehicle_id": 12,
    "timestamp": "2026-06-15T00:00:00+05:30",
    "lat": 7.2906,
    "lng": 80.6337,
    "speed": 0
  },
  {
    "ping_id": 2,
    "vehicle_id": 12,
    "timestamp": "2026-06-15T01:00:00+05:30",
    "lat": 7.2940,
    "lng": 80.6390,
    "speed": 18.3
  }
]
```

---

### 3.5 Trips

| Method | Route           | Description                              |
|--------|-----------------|------------------------------------------|
| GET    | /trips          | List all trips                           |
| GET    | /trips/:id      | Get a single trip                        |
| POST   | /trips          | Create a new trip (set status: pending)  |
| PATCH  | /trips/:id      | Update trip status or end time           |

**POST /trips request body:**
```json
{
  "vehicle_id": 12,
  "driver_id": 7,
  "origin_lat": 7.2906,
  "origin_lng": 80.6337
}
```

**POST /trips response (201 Created):**
```json
{
  "trip_id": 88,
  "vehicle_id": 12,
  "driver_id": 7,
  "status": "pending",
  "origin_lat": 7.2906,
  "origin_lng": 80.6337,
  "dest_lat": null,
  "dest_lng": null,
  "started_at": null,
  "ended_at": null
}
```

**PATCH /trips/:id request body:**
```json
{ "status": "active", "started_at": "2026-06-22T14:00:00+05:30" }
```

---

## 4. HTTP Status Codes

| Code | When used                                        |
|------|--------------------------------------------------|
| 200  | Successful GET or PATCH                          |
| 201  | Successful POST (resource created)               |
| 400  | Invalid parameter (e.g. non-integer id)          |
| 404  | Resource not found                               |
| 500  | Unexpected server error                          |

---

## 5. Representation Layers

The API uses three distinct levels of response detail:

| Layer | Name      | Used on                         | Contains                                    |
|-------|-----------|---------------------------------|---------------------------------------------|
| 1     | Flat      | Collection endpoints (`GET /vehicles`) | Core fields only, no nesting         |
| 2     | Composite | Single resource (`GET /vehicles/:id`) | Core fields + last_ping nested object |
| 3     | Derived   | Sub-resource (`/last-position`, `/pings`) | Computed fields (speed), no parent object |

---

## 6. Derived Speed Calculation

Speed is not stored in the database. It is computed per ping using the **Haversine formula**:

```
distance (km) = haversine(prev.lat, prev.lng, curr.lat, curr.lng)
time (hours)  = (curr.timestamp - prev.timestamp) / 3600000
speed (km/h)  = distance / time
```

- The first ping in a vehicle's history always has `speed: 0` (no prior point).
- Pings are always sorted ascending by timestamp before speed is derived.

---

## 7. File Structure

```
WebAPI/
├── seed.json               ← seed data (all entities)
├── verify_fk.py            ← FK integrity checker
├── project.md              ← this document
└── ExpressApp/
    ├── server.js           ← Express app + all routes
    ├── package.json
    └── package-lock.json
```

---

## 8. Scale (Seed Data)

| Entity  | Count             |
|---------|-------------------|
| Zones   | 9                 |
| Depots  | 30                |
| Drivers | 200               |
| Vehicles| 200               |
| Trips   | ~400              |
| Pings   | 33,800 (169/vehicle × 200 vehicles, 7-day span) |
