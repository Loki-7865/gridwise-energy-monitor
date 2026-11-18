# GridWise Energy Monitor

GridWise is an energy telemetry portal designed to demonstrate a complete IoT energy-monitoring product before physical hardware is available. It currently uses realistic synthetic readings, a Python API, MySQL, Docker, and a React dashboard. Later, the synthetic source can be replaced with an ESP32 and a PZEM-004T energy meter without changing the database, API contract, or portal.

## In simple words

GridWise is like a live health monitor for electricity use. It shows how much electricity a device or area is using right now, whether the readings are normal, and how the usage has changed over time.

For now, the project creates realistic sample readings so it can be demonstrated without buying or connecting any hardware. Later, a small ESP32 device and an energy meter can send real electricity readings to exactly the same dashboard.

Someone using GridWise does not need to understand databases, APIs, or electronics. They can open the dashboard and see:

- Current electricity usage in watts.
- Voltage, current, frequency, and power factor.
- Whether fresh data is coming in or the system needs attention.
- Usage trends over the last few minutes, hours, or day.
- A history of measurements saved by the system.

### How it works in everyday language

1. A source creates a reading about electricity use. Today this is the built-in simulator; in the future it can be a physical energy meter.
2. The system checks that the reading looks sensible and saves it safely.
3. The dashboard refreshes automatically and turns the reading into easy-to-read cards, charts, and tables.
4. The user can immediately understand current use, compare it with earlier data, and spot unusual changes.

### Why this project is useful

GridWise can be used wherever someone wants to understand and reduce electricity consumption:

| Use case | How GridWise helps |
| --- | --- |
| Home energy awareness | Shows which time periods or appliances may be using more electricity |
| College demonstration | Presents a complete IoT and data-dashboard project even before hardware is available |
| Small office monitoring | Helps track daily electrical demand and identify wasteful usage patterns |
| Lab or workshop monitoring | Provides a simple view of live load, voltage quality, and historic measurements |
| Smart building foundation | Can become one part of a larger building automation or energy-management system |
| Future alerts and analytics | The stored data can later support consumption alerts, bills, reports, and predictions |

### Current demo versus future real device

The project already behaves like the final product from the user’s point of view. The only difference is where the readings come from:

| Today | Later |
| --- | --- |
| The built-in simulator creates realistic sample readings | A PZEM-004T energy meter measures real electricity |
| Best for presentation, design work, and testing | Best for live household, laboratory, or office monitoring |
| No electrical wiring is required | ESP32 sends the meter readings over Wi-Fi |

This approach makes the project useful immediately while keeping a clear path to a real hardware deployment.

```text
PRESENTATION NOW
Synthetic simulator -> Python API -> MySQL -> React portal

HARDWARE LATER
PZEM-004T -> ESP32 -> Python API -> MySQL -> same React portal
```

## Contents

- [In simple words](#in-simple-words)
- [What the project does](#what-the-project-does)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Data logic](#data-logic)
- [Portal pages](#portal-pages)
- [API reference](#api-reference)
- [Development](#development)
- [Future hardware setup](#future-hardware-setup)
- [Troubleshooting](#troubleshooting)

## What the project does

| Area | Capability |
| --- | --- |
| React portal | Responsive operational dashboard with a live status indicator |
| Separate views | Overview, Live telemetry, Trends, and Data history pages |
| Demo data | Synthetic idle, laptop, heater, and high-load profiles |
| Backend | Python HTTP API with validation, freshness checks, and history aggregation |
| Database | MySQL 8 with a persistent Docker volume |
| Live update | The simulator sends a new reading every two seconds in demo mode |
| Future device | ESP32 and PZEM-004T use the same API path and measurement format |

The main goals are to present a believable dashboard without hardware, keep MySQL as the deployment database, and make the later hardware change a configuration and firmware task rather than a software redesign.

## Quick start

Docker is the supported way to run GridWise. It starts MySQL, the Python application, the compiled React portal, and the synthetic simulator together.

```bash
docker compose up --build
```

Open the portal at:

```text
http://localhost:8080
```

Run the services in the background:

```bash
docker compose up --build -d
```

Stop the services while retaining MySQL history:

```bash
docker compose down
```

The `gridwise_data` Docker volume retains the database between restarts. Do not remove the volume unless you intentionally want a blank demonstration database.

### Confirm the system is healthy

```bash
curl http://localhost:8080/health
curl http://localhost:8080/data
curl 'http://localhost:8080/history?range=30m'
```

Example health response:

```json
{
  "ok": true,
  "database": "connected",
  "database_engine": "MySQL",
  "mode": "demo"
}
```

## Architecture

### Docker services

| Service | Container | Responsibility | Host port |
| --- | --- | --- | --- |
| `db` | `gridwise_db` | MySQL 8 and persistent measurement history | `3306` |
| `app` | `gridwise_app` | Python API and production React portal | `8080` by default |
| `simulator` | `gridwise_simulator` | Synthetic measurements every two seconds in demo mode | Internal only |

The application listens on container port `8000`, but Docker exposes it as host port `8080`. This deliberately avoids conflicts with another local service that may be using port `8000`.

### Demo data flow

1. The simulator uses the selected load profile, such as `laptop`.
2. It creates a realistic electrical reading every two seconds.
3. It sends the reading to `POST /data` with source `synthetic`.
4. The API validates the reading, stores it in MySQL, and updates the latest telemetry state.
5. The React portal polls the latest reading every second and asks for history periodically.
6. The portal displays live values, source, freshness, charts, and stored history.

### Future hardware data flow

1. The PZEM-004T measures voltage, current, power, cumulative energy, frequency, and power factor.
2. The ESP32 reads those values and sends them over Wi-Fi to `POST /data`.
3. In hardware mode, the API accepts only records labelled `esp32-pzem`.
4. MySQL, charts, history, and the React portal work as they do in demo mode.

## Operating modes

### Demo mode

Demo mode is the default and is intended for presentations and frontend work.

- `DATA_MODE=demo`
- The synthetic simulator starts automatically through Docker Compose.
- Every record is labelled `synthetic`.
- The portal clearly shows `Synthetic demo` as its data source.
- The portal can change the active virtual load profile.
- ESP32-labelled data is rejected to keep the demo consistent.

| Profile | Behaviour |
| --- | --- |
| Idle | Small baseline electrical load |
| Laptop | Normal computer or desk setup load |
| Heater | Higher steady household load |
| High load | Clearly visible high-consumption presentation profile |

### Hardware mode

Use hardware mode only when an ESP32 and PZEM-004T are ready.

```bash
GRIDWISE_DATA_MODE=hardware docker compose up --build db app
```

Do not start the simulator in hardware mode. Hardware mode rejects synthetic records and changes the portal's source label after it receives a valid ESP32 record.

## Data logic

Every source sends the same measurement object to the backend:

```json
{
  "voltage": 230.2,
  "current": 0.44,
  "power": 92.1,
  "energy": 0.0184,
  "frequency": 50.0,
  "power_factor": 0.92
}
```

| Field | Unit | Meaning | How GridWise uses it |
| --- | --- | --- | --- |
| `voltage` | V | Supply voltage | Rolling five-sample average |
| `current` | A | Circuit draw | Rolling five-sample average |
| `power` | W | Active instantaneous load | Rolling five-sample average and charts |
| `energy` | kWh | Cumulative meter value | Latest valid value only; never averaged |
| `frequency` | Hz | AC line frequency | Rolling five-sample average |
| `power_factor` | 0-1 | Load efficiency indicator | Rolling five-sample average |

### Why energy is not averaged

Energy is cumulative. It is a meter total that increases as electricity is used. Averaging it would make total use incorrect, so GridWise always preserves the newest valid energy value. Voltage, current, power, frequency, and power factor naturally fluctuate, so averaging their five newest values makes the dashboard more readable without hiding the current state.

### Validation, metadata, and freshness

The backend checks that measurements are physically plausible before writing them to MySQL. Each stored record includes its source, optional demo scenario, and measurement time.

The latest-reading endpoint returns the age of the newest record and an `is_fresh` value. The portal therefore distinguishes these states:

| State | Meaning |
| --- | --- |
| Live | The API is reachable and a recent measurement exists |
| Stale | The API is reachable but the latest record is older than the freshness window |
| Waiting | The API is reachable but no record has arrived yet |
| Offline | The browser cannot reach the API |

### History grouping

The History and Trends pages can request `30m`, `1h`, `3h`, or `1d` data ranges. When more than 1,000 readings are present, the backend groups adjacent records before returning them. This keeps charts responsive while retaining a representative view of the entire selected range.

## Portal pages

The React portal uses hash routes. Each sidebar item opens a separate view without needing a server-side routing library.

| Page | Address | Purpose |
| --- | --- | --- |
| Overview | `http://localhost:8080/#/overview` | Main dashboard, key values, load quality, status, and demo controls |
| Live telemetry | `http://localhost:8080/#/live` | Live power, voltage, current, frequency, and streaming chart |
| Trends | `http://localhost:8080/#/trends` | Historical chart and summary statistics sourced from MySQL |
| Data history | `http://localhost:8080/#/history` | Persisted measurements table and time-range selector |

The Overview screen is the presentation landing page. Live telemetry is focused on incoming records. Trends is focused on historic changes. Data history is focused on the persisted rows.

## API reference

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/` | Serves the compiled React portal |
| `GET` | `/health` | Reports MySQL connectivity and active operating mode |
| `GET` | `/data` | Returns newest reading, source, scenario, time, and freshness |
| `POST` | `/data` | Validates and persists one incoming measurement |
| `GET` | `/history?range=30m|1h|3h|1d` | Returns persisted data for tables and charts |
| `GET` | `/demo/scenarios` | Lists available and active synthetic profiles in demo mode |
| `POST` | `/demo/scenario` | Selects a synthetic profile in demo mode |

Change the demo profile from the terminal if needed:

```bash
curl -X POST http://localhost:8080/demo/scenario \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"heater"}'
```

Normally this is done using the profile buttons in the Overview page.

## Development

### Frontend development

Keep Docker running in one terminal, then start Vite in another:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

When the frontend runs on port `5173`, it uses the Docker API on `http://localhost:8080`. The Docker stack must therefore remain active while working on the UI.

### Direct Python backend run

Docker remains recommended, but this path is useful for backend debugging. MySQL must still run in Docker.

```bash
cd frontend
npm run build
cp -R dist/. ../web/
cd ..

docker compose up -d db

python3 -m venv server/.venv
source server/.venv/bin/activate
pip install -r server/requirements.txt
cp server/.env.example server/.env
python server/server.py
```

Start the simulator in a separate terminal:

```bash
source server/.venv/bin/activate
python server/simulator.py --scenario laptop --interval-seconds 2
```

### Tests

With the Python environment active:

```bash
pytest tests/test_api.py -v
```

## Project structure

```text
.
├── docker-compose.yml                 # MySQL, API, and simulator definition
├── frontend/
│   ├── src/main.jsx                   # React polling, charts, page routes, and interactions
│   ├── src/styles.css                 # Shared visual design and responsive layout
│   ├── src/pages.css                  # Separate-page visibility rules
│   ├── vite.config.js                 # Vite development configuration
│   └── package.json                   # React/Vite scripts and dependencies
├── firmware/
│   └── esp32_energy_monitor/          # Future ESP32/PZEM-004T firmware
├── server/
│   ├── server.py                      # API, validation, MySQL, history, static frontend serving
│   ├── simulator.py                   # Synthetic telemetry generator
│   ├── schema.sql                     # MySQL schema
│   ├── requirements.txt               # Python dependencies
│   └── Dockerfile                     # Multi-stage production image
├── web/                               # Local compiled portal used for direct Python serving
└── tests/                             # Backend smoke tests
```

## Future hardware setup

When the ESP32 and PZEM-004T are available:

1. Copy `firmware/esp32_energy_monitor/secrets.example.h` to `secrets.h`.
2. Set the Wi-Fi credentials.
3. Point the firmware to a LAN-accessible backend address, for example:

   ```text
   http://YOUR_COMPUTER_LAN_IP:8080/data
   ```

4. Configure the correct UART pins and suitable level shifting.
5. Flash `esp32_energy_monitor.ino` to the ESP32.
6. Start only the database and application in hardware mode:

   ```bash
   GRIDWISE_DATA_MODE=hardware docker compose up --build db app
   ```

7. Open the normal portal address. The data source becomes ESP32/PZEM after the first valid reading.

## Electrical safety

The future hardware stage involves mains-energy equipment. Mains power is hazardous. Use an insulated enclosure, correct fuse and strain relief, appropriate isolation, supervised testing, and suitable ESP32-to-PZEM UART level shifting. Do not connect ESP32 GPIO directly to a possible 5 V PZEM transmit pin.

## Troubleshooting

### Portal says Offline

1. Check that Docker services are running:

   ```bash
   docker compose ps
   ```

2. Check the backend:

   ```bash
   curl http://localhost:8080/health
   ```

3. Start or rebuild if needed:

   ```bash
   docker compose up --build -d
   ```

4. When working on `localhost:5173`, refresh the browser after frontend code changes. Vite still requires the Docker application on port `8080` for telemetry.

### Portal says Waiting or Stale

Check whether the simulator is running:

```bash
docker compose ps
docker compose logs --tail=50 simulator
```

In demo mode, both `app` and `simulator` should be running. A current reading should appear within a few seconds.

### Port 8080 is already in use

Choose another host port:

```bash
GRIDWISE_APP_PORT=8081 docker compose up --build
```

Then open `http://localhost:8081`.

### Reset all demo data

Run this only when you intentionally want to erase all MySQL history:

```bash
docker compose down -v
```

## Current status

GridWise is ready for a synthetic-data demonstration. The deployment path uses Docker and MySQL, the React portal has separate working pages, and the measurement contract is already prepared for the future ESP32/PZEM-004T source.
