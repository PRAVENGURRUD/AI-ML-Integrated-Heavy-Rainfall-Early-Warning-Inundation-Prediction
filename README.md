# PS71 — AI/ML Integrated Heavy Rainfall Early Warning & Inundation Prediction

SIH 2026, PS71 (SIH26071). Built for Chennai as the demo city.

## What this is

This project reuses the map/scoring engine from an existing project
(`REFERENCE_README.md` describes the original) as a well-understood
starting point, and adds the pieces PS71 actually asks for on top of it:
a rainfall nowcast, a real rainfall-driven flood depth calculation, and
ward-level early warning alerts.

## Structure

- `backend/` — Express + Google Earth Engine. `fvi.js` and `fisi.js` are
  the reused, understood base (two flood-risk scorecards based on the
  shape of the land). New rainfall/inundation/alert pieces will be added
  here as separate files.
- `frontend/` — React + Leaflet map, reused as-is for now.
- `REFERENCE_README.md` — the original project's own README, kept for reference.

## Running it locally

You'll need a Google Earth Engine **service account** key file (see
`backend/.env.example` for details on why this is different from a normal
Google login).

```
cd backend
npm install
cp .env.example .env   # then edit .env to point at your key file
npm start
```

```
cd frontend
npm install
npm start
```

## Status

Base copied over from the reference project (2026-08-26). Rainfall
nowcast, inundation model, and alerts are being built next.
