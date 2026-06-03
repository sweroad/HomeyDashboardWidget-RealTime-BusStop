# Homey Dashboard Widget — Real-Time Bus Stop

A [Homey](https://homey.app) Dashboard widget that shows upcoming real-time bus departures from any Swedish bus stop. Built with the [Homey Apps SDK v3](https://apps.developer.homey.app/) and real-time data from [Trafiklab](https://trafiklab.se).

![Widget preview](widgets/bus-departures/preview-light.png)

## Features

- Live departure board on your Homey Dashboard
- Search for any stop by name (autocomplete)
- Configurable operator — defaults to **JLT (Jönköpings Länstrafik)**, also supports SL, Skånetrafiken, and Västtrafik
- Optional line filter (show only specific bus lines)
- Delay information color-coded green / orange / red
- Cancelled trip indicator
- Swedish and English UI
- API response cached 60 s server-side — stays well within Trafiklab's quota

## Prerequisites

- Homey Pro (software version ≥ 12.3.0)
- A free [Trafiklab](https://trafiklab.se) developer account
- The **Trafiklab Realtime APIs** product added to your Trafiklab project (get the API key from your project dashboard)

## Installation

### From source (development)

```bash
npm install -g homey   # Homey CLI
git clone https://github.com/sweroad/HomeyDashboardWidget-RealTime-BusStop.git
cd HomeyDashboardWidget-RealTime-BusStop
npm install
homey app run          # deploys to your Homey in development mode
```

### Validate

```bash
homey app validate
```

## Configuration

After adding the widget to your Homey Dashboard, open its settings:

| Setting | Description |
|---|---|
| **Trafiklab API Key** | Your key for the *Trafiklab Realtime APIs* product |
| **Operator** | Transit authority (JLT, SL, Skånetrafiken, Västtrafik) |
| **Bus Stop** | Type a stop name and pick from the autocomplete list |
| **Filter Lines** | Optional — comma-separated line numbers, e.g. `1,4,12` |
| **Number of Departures** | How many rows to show (1–10, default 5) |

> **Tip:** Enter the API key and select the operator *before* searching for a stop — the autocomplete uses your key to look up stops.

## Data sources

| Data | API | Refresh |
|---|---|---|
| Real-time departures | [Trafiklab Realtime APIs](https://www.trafiklab.se/api/our-apis/trafiklab-realtime-apis/timetables/) | Every 60 s |
| Stop name search | Trafiklab Stop Lookup API (falls back to operator GTFS static ZIP) | Cached 24 h |

### API quota

The Trafiklab free tier allows **100 000 calls per 30 days**.  
Each unique stop uses ~43 200 calls/month (1 call/min × 60 min × 24 h × 30 days).  
Two widget instances showing the **same** stop share the server-side cache and still use ~43 200 calls.  
Two instances showing **different** stops each count separately (~86 400 total).

## Project structure

```
.
├── app.js                              # App init; stop-name autocomplete listener
├── app.json                            # Homey app manifest (managed by CLI)
├── widgets/
│   └── bus-departures/
│       ├── api.js                      # POST / — fetches & caches departures
│       ├── bus-departures.html         # Widget HTML shell
│       ├── bus-departures.js           # Widget frontend (polls every 60 s)
│       ├── widget.compose.json         # Widget settings & API declaration
│       ├── preview-light.png           # Dashboard picker preview (light)
│       └── preview-dark.png            # Dashboard picker preview (dark)
├── locales/
│   ├── en.json
│   └── sv.json
└── assets/
    ├── icon.svg
    └── images/
        ├── small.jpg
        ├── large.jpg
        └── xlarge.jpg
```

## Adding more operators

1. Add an entry to the `operator` dropdown in `widgets/bus-departures/widget.compose.json` (and in `app.json`)
2. Add the operator slug to `OPERATOR_SLUG` in `app.js` — the slug must match the path used on `opendata.samtrafiken.se` (e.g. `jlt` → `gtfs/jlt/jlt.zip`)

## License

MIT — see [LICENSE](LICENSE)

## Attribution

Real-time and static transit data provided by [Trafiklab.se](https://trafiklab.se) / [Samtrafiken](https://samtrafiken.se) under the [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license.
