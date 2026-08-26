// replayEvents.js — two REAL, documented historical Chennai storms, used to
// validate the flood-depth model against genuine, well-reported events
// instead of only ever showing whatever the weather happens to be doing
// right now (which might just be a dry day on demo day). Rainfall figures
// below are real, cited totals from news/scientific coverage of each
// event, not invented numbers -- see each entry's source.
//
// These feed the EXACT SAME /api/inundation and /api/alerts endpoints as
// live "Now" mode -- just with a real historical rainfall figure in place
// of a live-fetched one. No separate model, no separate code path.

export const REPLAY_EVENTS = {
  michaung2023: {
    id: 'michaung2023',
    label: 'Cyclone Michaung',
    dateLabel: 'Dec 2023',
    rainfallMm: 468,
    rainfallBasisLabel: '48-hour storm total',
    blurb: "Chennai recorded 468mm of rain in 48 hours as Cyclone Michaung made landfall nearby in December 2023 — close to half the city's entire average ANNUAL rainfall in two days.",
    sourceLabel: 'Down To Earth',
    sourceUrl: 'https://www.downtoearth.org.in/natural-disasters/severe-cyclone-michaung-rainfall-in-chennai-comparable-to-2015-floods-here-s-how-93211',
  },
  dec2015: {
    id: 'dec2015',
    label: 'Chennai Floods',
    dateLabel: 'Dec 2015',
    rainfallMm: 286,
    rainfallBasisLabel: '24-hour citywide average',
    blurb: 'A record 24-hour downpour on 1–2 Dec 2015 averaged 286mm across the city (the worst-hit station recorded 494mm) — the highest one-day rainfall the region had seen in over a century.',
    sourceLabel: 'World Weather Attribution',
    sourceUrl: 'https://www.worldweatherattribution.org/chennai-floods-december-2015/',
    // Real, documented flooding locations from this exact event, shown as
    // pink dots on the map (see HistoricalFloodPointsLayer.jsx) so the
    // model's predicted flood zones can be checked against genuine
    // ground truth, not just trusted on faith.
    groundTruthLabel: 'OpenCity Chennai Flooding Data',
    groundTruthUrl: 'https://data.opencity.in/dataset/chennai-flooding-data',
  },
};

export const REPLAY_ORDER = ['live', 'michaung2023', 'dec2015'];
