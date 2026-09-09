# From Here

A bus shelter screen for **11th & Walnut St, Philadelphia** (SEPTA stop `14885`).

The map is centered on the stop itself, not on your phone. It shows top-rated
places and landmarks within walking distance with the walking time to each. One
tap on a place returns how to get there **from this stop** - on foot, or on the
bus you are already waiting for. After 15 seconds it resets itself, so the next
rider never inherits the last person's screen.

Week 2 prototype for *LLMs for UX Prototyping* (IPD 5900, Violet Whitney),
University of Pennsylvania.

> Prototype for a UPenn prototyping course. Not affiliated with SEPTA.

---

## Live data

| | |
|---|---|
| Source | SEPTA **TransitView** - live vehicle positions |
| Endpoint | `https://www3.septa.org/api/TransitView/index.php?route=21` |
| Key needed | No |
| Refresh | Every 20 seconds |
| Routes | 21 -> 69th St Transit Center, 42 -> Wycombe (both westbound on Walnut) |

### Two things worth knowing

**1. The browser cannot call SEPTA directly.** SEPTA's API sends no CORS
headers, so a `fetch()` straight from the page is blocked. `api/septa.js` is a
Vercel serverless function that makes the call server-side and hands the result
back from our own origin. That is the *Servers* in "Street Interface [Web, APIs,
Servers]".

**2. SEPTA has no arrival-prediction endpoint for buses.** There is no "minutes
until route 21 reaches stop 14885". TransitView gives raw positions, so the
estimate is computed in `api/septa.js`:

```
distance = haversine(bus, stop) x 1.25   # grid detour factor
minutes  = distance / 3.1 m/s / 60       # ~7 mph, Center City average
```

Buses are filtered first: westbound only, and only those still **east** of the
stop (a westbound bus west of us has already passed). SEPTA's placeholder rows
(`VehicleID: "None"`, `late: 998`) are dropped.

This is deliberately **hard code** - an explicit rule with numbers you can
argue with. Nothing here is an AI judgment. When no vehicle is tracked, the
screen shows `--` rather than inventing a number.

---

## Files

```
index.html      the interface (this IS the bus stop screen, not a page about it)
api/septa.js    serverless function: SEPTA proxy + arrival estimate
package.json    marks the project as ESM so the function can use import/export
```

The Center City street map is inline SVG built from real street geometry
(numbered streets, Broad, Market, Chestnut, Walnut, Locust, and the real alleys
- Ludlow, Ranstead, Moravian, Camac). No map tiles, no external requests.

## Keyboard helpers (for screen recording)

| Key | Effect |
|---|---|
| `b` | force the next 21 to arrive right now |
| `d` | toggle demo speed (1 transit-minute every 2s instead of real time) |
| `r` | reset the countdowns |

Record with the browser window in portrait, around 500 x 900, which is closest
to the real shelter display.

---

## Run it locally

```bash
npm i -g vercel        # once
vercel dev             # serves index.html and /api/septa on localhost:3000
```

Opening `index.html` as a file will work too, but `/api/septa` will not exist,
so the screen falls back to simulated data and the badge reads `OFFLINE`.

## Deploy

```bash
git init
git add .
git commit -m "From Here - live SEPTA arrivals at 11th & Walnut"
git branch -M main
git remote add origin https://github.com/<your-username>/from-here.git
git push -u origin main
```

Then on [vercel.com](https://vercel.com): **Add New -> Project -> Import** the
repo -> **Deploy**. No environment variables, no build step, no framework
preset. Every later `git push` redeploys automatically.

Check that the deploy worked by opening `/api/septa` on the live URL - it should
return JSON with live vehicle data.
