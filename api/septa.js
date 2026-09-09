// Vercel serverless function.
//
// Why this file exists: the browser cannot call www3.septa.org directly
// (no CORS headers on SEPTA's API), so the page calls /api/septa on its own
// origin and this function does the cross-origin call server-side.
//
// SEPTA has no "minutes until this bus reaches this stop" endpoint, so we
// compute the estimate here from each vehicle's live position. That estimate
// is HARD CODE: an explicit, rule-based calculation.

const STOP = {
  id: "14885",
  name: "Walnut St & 11th St",
  lat: 39.948704,
  lng: -75.15883,
};

// Both routes run WESTBOUND on Walnut St through Center City.
const ROUTES = [
  { id: "21", headsign: "69th St Transit Center" },
  { id: "42", headsign: "Wycombe" },
];

// --- tuning constants for the ETA estimate -------------------------------
const GRID_FACTOR = 1.25; // streets are a grid, so road distance > straight line
const BUS_SPEED_MS = 3.1; // ~7 mph average in Center City, including dwell time
const MAX_MINUTES = 45; // ignore vehicles further out than this

function haversineMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function fetchRoute(routeId) {
  const url = "https://www3.septa.org/api/TransitView/index.php?route=" + routeId;
  const res = await fetch(url, { headers: { "User-Agent": "from-here-prototype" } });
  if (!res.ok) throw new Error("SEPTA " + routeId + " returned " + res.status);
  const json = await res.json();
  return Array.isArray(json.bus) ? json.bus : [];
}

function nextArrival(buses, route) {
  const candidates = [];

  for (const b of buses) {
    const lat = parseFloat(b.lat);
    const lng = parseFloat(b.lng);
    if (!isFinite(lat) || !isFinite(lng)) continue;

    // SEPTA emits placeholder rows for vehicles it has lost contact with
    // (VehicleID "None", late 998). They are not real buses.
    if (!b.VehicleID || b.VehicleID === "None") continue;
    if (b.late === 998) continue;

    // Westbound only: these are the buses that serve our side of Walnut St.
    if (!/west/i.test(b.Direction || "")) continue;

    // Westbound means longitude decreases. A bus already west of the stop
    // has passed us, so it is not an arrival we can offer.
    if (lng <= STOP.lng) continue;

    const meters = haversineMeters(lat, lng, STOP.lat, STOP.lng) * GRID_FACTOR;
    const minutes = Math.round(meters / BUS_SPEED_MS / 60);
    if (minutes > MAX_MINUTES) continue;

    candidates.push({
      minutes,
      vehicle: b.VehicleID,
      destination: b.destination || route.headsign,
      nextStop: b.next_stop_name || null,
      late: typeof b.late === "number" ? b.late : null,
      meters: Math.round(meters),
    });
  }

  candidates.sort((a, b) => a.minutes - b.minutes);
  return candidates[0] || null;
}

export default async function handler(req, res) {
  // Cache at the edge so a screen refreshing every 20s does not hammer SEPTA.
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=45");

  try {
    const results = await Promise.all(
      ROUTES.map(async (route) => {
        try {
          const buses = await fetchRoute(route.id);
          const next = nextArrival(buses, route);
          return {
            route: route.id,
            destination: next ? next.destination : route.headsign,
            minutes: next ? next.minutes : null,
            vehicle: next ? next.vehicle : null,
            nextStop: next ? next.nextStop : null,
            late: next ? next.late : null,
            distanceMeters: next ? next.meters : null,
            vehiclesTracked: buses.length,
          };
        } catch (err) {
          return { route: route.id, destination: route.headsign, minutes: null, error: String(err.message || err) };
        }
      })
    );

    res.status(200).json({
      stop: STOP,
      updated: new Date().toISOString(),
      source: "SEPTA TransitView (live vehicle positions)",
      method: "straight-line distance x " + GRID_FACTOR + " grid factor / " + BUS_SPEED_MS + " m/s",
      arrivals: results,
    });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
}
