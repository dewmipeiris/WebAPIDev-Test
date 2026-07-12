const express = require("express");
const data = require("./seed.json");

const app = express();
const PORT = 3000;

app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
});

app.get("/", (req, res) => {
    res.send("<h1>Hello World</h1>");
});

app.get("/provinces", (req, res) => {
    res.json(data.provinces);
});

app.get("/provinces/:id", (req, res) => {
    const item = data.provinces.find(p => p.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: "Province not found" });
    res.json(item);
});

app.get("/districts", (req, res) => {
    let result = data.districts;
    if (req.query.province_id) {
        result = result.filter(d => d.province_id === Number(req.query.province_id));
    }
    res.json(result);
});

app.get("/districts/:id", (req, res) => {
    const item = data.districts.find(d => d.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: "District not found" });
    res.json(item);
});

app.get("/stations", (req, res) => {
    let result = data.stations;
    if (req.query.district_id) {
        result = result.filter(s => s.district_id === Number(req.query.district_id));
    }
    res.json(result);
});

app.get("/stations/:id", (req, res) => {
    const item = data.stations.find(s => s.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: "Station not found" });
    res.json(item);
});

app.get("/vehicles", (req, res) => {
    let result = data.vehicles;
    if (req.query.station_id) {
        result = result.filter(v => v.station_id === Number(req.query.station_id));
    }
    res.json(result);
});

app.get("/vehicles/:id", (req, res) => {
    const item = data.vehicles.find(v => v.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: "Vehicle not found" });
    res.json(item);
});

app.get("/vehicles/:id/pings", (req, res) => {
    const vehicle = data.vehicles.find(v => v.id === Number(req.params.id));
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    const pings = data.pings.filter(p => p.vehicle_id === Number(req.params.id));
    res.json(pings);
});

app.get("/vehicles/:id/last-position", (req, res) => {
    const vehicle = data.vehicles.find(v => v.id === Number(req.params.id));
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    const pings = data.pings.filter(p => p.vehicle_id === Number(req.params.id));
    if (pings.length === 0) return res.status(404).json({ error: "No pings found for this vehicle" });
    const last = pings.reduce((a, b) => new Date(a.timestamp) > new Date(b.timestamp) ? a : b);
    res.json(last);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});