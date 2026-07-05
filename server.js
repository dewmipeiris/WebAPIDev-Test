const express = require("express");
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Read the seed data (fail fast if missing - no silent stub creation)
const candidateSeedPaths = [
    path.join(__dirname, 'seed.json'),
    path.join(__dirname, 'data', 'seed.json')
];

const seedPath = candidateSeedPaths.find((p) => fs.existsSync(p));

if (!seedPath) {
    console.error(`Seed data not found. Checked: ${candidateSeedPaths.join(', ')}. Make sure seed.json exists.`);
    process.exit(1);
}

const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const { provinces, districts, stations, vehicles, pings } = seedData;

// ---------- Helpers ----------
function findById(collection, id) {
    return collection.find((item) => item.id === id);
}

function parseId(param) {
    const id = Number(param);
    return Number.isInteger(id) ? id : null;
}

function toRad(deg) {
    return (deg * Math.PI) / 180;
}

// Haversine distance between two lat/lng points, in km
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ---------- Response shape mappers ----------
function mapProvince(p) {
    return { province_id: p.id, name: p.name };
}

function mapDistrict(d) {
    return { district_id: d.id, name: d.name, province_id: d.province_id };
}

function mapStation(s) {
    return { station_id: s.id, name: s.name, district_id: s.district_id };
}

function mapVehicle(v) {
    return {
        vehicle_id: v.id,
        reg_number: v.registration_number,
        device_id: v.device_id,
        station_id: v.station_id
    };
}

// Pings need a derived "speed" field (km/h), computed from consecutive points
// since seed.json does not store speed directly.
function mapPingsWithSpeed(vehiclePings) {
    const sorted = [...vehiclePings].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    return sorted.map((p, i) => {
        let speed = 0;
        if (i > 0) {
            const prev = sorted[i - 1];
            const distanceKm = haversineKm(prev.latitude, prev.longitude, p.latitude, p.longitude);
            const hours = (new Date(p.timestamp) - new Date(prev.timestamp)) / (1000 * 60 * 60);
            speed = hours > 0 ? Math.round((distanceKm / hours) * 10) / 10 : 0;
        }
        return {
            ping_id: p.id,
            vehicle_id: p.vehicle_id,
            timestamp: p.timestamp,
            lat: p.latitude,
            lng: p.longitude,
            speed
        };
    });
}

app.get("/", (req, res) => {
    res.send("Hello World");
});

// ---------- PROVINCES ----------
app.get("/provinces", (req, res) => {
    res.json(provinces.map(mapProvince));
});

app.get("/provinces/:provinceId", (req, res) => {
    const id = parseId(req.params.provinceId);
    if (id === null) return res.status(400).json({ error: 'Invalid provinceId' });

    const province = findById(provinces, id);
    if (!province) return res.status(404).json({ error: 'Province not found' });

    res.json(mapProvince(province));
});

// ---------- DISTRICTS ----------
app.get("/districts", (req, res) => {
    res.json(districts.map(mapDistrict));
});

app.get("/districts/:districtId", (req, res) => {
    const id = parseId(req.params.districtId);
    if (id === null) return res.status(400).json({ error: 'Invalid districtId' });

    const district = findById(districts, id);
    if (!district) return res.status(404).json({ error: 'District not found' });

    res.json(mapDistrict(district));
});

// ---------- STATIONS ----------
app.get("/stations", (req, res) => {
    res.json(stations.map(mapStation));
});

app.get("/stations/:stationId", (req, res) => {
    const id = parseId(req.params.stationId);
    if (id === null) return res.status(400).json({ error: 'Invalid stationId' });

    const station = findById(stations, id);
    if (!station) return res.status(404).json({ error: 'Station not found' });

    res.json(mapStation(station));
});

// ---------- VEHICLES ----------
app.get("/vehicles", (req, res) => {
    res.json(vehicles.map(mapVehicle));
});

// Layer 2: composite vehicle response, including the single most recent
// ping (by timestamp, descending) as a nested object - or null if the
// vehicle has no pings. The full pings array is never embedded here.
function buildVehicleComposite(v) {
    const vehiclePings = pings.filter((p) => p.vehicle_id === v.id);

    let last_ping = null;
    if (vehiclePings.length > 0) {
        // mapPingsWithSpeed sorts ascending by timestamp and computes speed
        // from each ping's prior point - the chronologically last entry is
        // exactly the "sort descending, take [0]" most-recent ping.
        const withSpeed = mapPingsWithSpeed(vehiclePings);
        last_ping = withSpeed[withSpeed.length - 1];
    }

    return {
        vehicle_id: v.id,
        reg_number: v.registration_number,
        device_id: v.device_id,
        station_id: v.station_id,
        last_ping
    };
}

app.get("/vehicles/:vehicleId", (req, res) => {
    const id = parseId(req.params.vehicleId);
    if (id === null) return res.status(400).json({ error: 'Invalid vehicleId' });

    const vehicle = findById(vehicles, id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    res.json(buildVehicleComposite(vehicle));
});

app.get("/vehicles/:vehicleId/pings", (req, res) => {
    const id = parseId(req.params.vehicleId);
    if (id === null) return res.status(400).json({ error: 'Invalid vehicleId' });

    const vehicle = findById(vehicles, id);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' });

    const vehiclePings = pings.filter((p) => p.vehicle_id === id);
    res.json(mapPingsWithSpeed(vehiclePings));
});

// Layer 3: position only - NOT the composite. No reg_number/device_id,
// no last_ping wrapper. Filters pings by vehicle_id, sorts descending by
// timestamp, takes the most recent. 404 if no pings exist for this vehicle
// (this also naturally covers a vehicleId that doesn't exist at all, since
// it would have zero matching pings too).
app.get("/vehicles/:vehicleId/last-position", (req, res) => {
    const id = parseId(req.params.vehicleId);
    if (id === null) return res.status(400).json({ error: 'Invalid vehicleId' });

    const vehiclePings = pings.filter((p) => p.vehicle_id === id);
    if (vehiclePings.length === 0) {
        return res.status(404).json({ error: 'No pings found for this vehicle' });
    }

    const withSpeed = mapPingsWithSpeed(vehiclePings);
    const latest = withSpeed[withSpeed.length - 1];

    res.json({
        vehicle_id: latest.vehicle_id,
        timestamp: latest.timestamp,
        lat: latest.lat,
        lng: latest.lng,
        speed: latest.speed
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});