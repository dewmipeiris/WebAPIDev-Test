const express = require("express");

const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
    res.json({ status: 'ok', session: 'NB6007CEM S2' });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});