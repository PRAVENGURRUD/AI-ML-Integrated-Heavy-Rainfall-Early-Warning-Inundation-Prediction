// nowcastAccuracy.js -- tracks the ConvLSTM AI nowcast's real predictions
// against what actually rained, once real satellite data catches up to
// confirm it. Nothing here is simulated: every "predicted" value came
// from a real /api/nowcast call, and every "actual" value comes from a
// LATER /api/nowcast call's own real inputMm (the actual observed rain
// for that hour, once GPM IMERG has ingested it, extracted the same way
// nowcast.js's own summarizeFrames() does) -- this file just remembers
// predictions long enough to check them against reality as the app runs.
//
// Stored in localStorage (this is the user's own real app, not a
// preview) so accuracy keeps building up across page reloads too.

const STORAGE_KEY = 'cfvi_nowcast_predictions_v1';
const MAX_ENTRIES = 300;
const HOUR_MS = 60 * 60 * 1000;

function gridMean(grid) {
  const flat = grid.flat();
  if (!flat.length) return null;
  return flat.reduce((a, b) => a + b, 0) / flat.length;
}

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function saveAll(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch (err) {
    // storage full/unavailable -- accuracy tracking is a bonus, not critical
  }
}

/**
 * Call every time a fresh LIVE /api/nowcast response arrives. Records
 * this call's 3 new +1h/+2h/+3h predictions, and resolves any
 * earlier-recorded predictions whose target hour this call's own
 * inputMm now covers (i.e. real satellite data has since confirmed what
 * actually happened). Returns the updated, already-persisted list.
 */
export function updateNowcastAccuracy(data) {
  if (!data || data.mode !== 'live' || !data.asOf || !data.summary || !data.inputMm) {
    return loadAll();
  }

  const asOfMs = new Date(data.asOf).getTime();
  let list = loadAll();

  const T_IN = data.inputMm.length; // 6 real observed hourly frames
  list = list.map((entry) => {
    if (entry.resolved) return entry;
    const diffHours = Math.round((asOfMs - entry.targetTimeMs) / HOUR_MS);
    if (diffHours < 0 || diffHours > T_IN - 1) return entry; // not observed yet, or aged out
    const idx = (T_IN - 1) - diffHours;
    const observedGrid = data.inputMm[idx];
    const actualAvgMm = observedGrid ? gridMean(observedGrid) : null;
    if (actualAvgMm == null) return entry;
    return {
      ...entry,
      resolved: true,
      actualAvgMm,
      absErrorMm: Math.abs(actualAvgMm - entry.predictedAvgMm),
    };
  });

  const alreadyHave = list.some((e) => e.asOfMs === asOfMs);
  if (!alreadyHave) {
    const newEntries = data.summary.map((h) => ({
      asOfMs,
      hoursAhead: h.hoursFromNow,
      targetTimeMs: asOfMs + h.hoursFromNow * HOUR_MS,
      predictedAvgMm: h.avgMm,
      resolved: false,
      actualAvgMm: null,
      absErrorMm: null,
    }));
    list = [...list, ...newEntries];
  }

  saveAll(list);
  return list;
}

export function getAccuracyStats(list) {
  const resolved = (list || []).filter((e) => e.resolved);
  if (!resolved.length) return { count: 0, maeMm: null, mostRecent: null };
  const maeMm = resolved.reduce((sum, e) => sum + e.absErrorMm, 0) / resolved.length;
  const mostRecent = resolved.slice().sort((a, b) => b.targetTimeMs - a.targetTimeMs)[0];
  return { count: resolved.length, maeMm, mostRecent };
}
