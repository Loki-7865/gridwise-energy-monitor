# GridWise — IoT Energy Monitor

GridWise is an energy-telemetry portal with one stable API contract and two
operating modes:

```text
PRESENTATION NOW
Synthetic simulator → Python API → MySQL (Docker) → live portal

HARDWARE LATER
PZEM-004T → ESP32 → Python API → the same MySQL database and portal
```

The presentation build is deliberately **synthetic-only**. The portal labels
every reading as simulated and the API rejects ESP32-labelled input while demo
mode is active. When hardware is available later, switch modes; the ESP32 uses
the same `POST /data` route and payload.

## Run the presentation

Docker is the recommended path. It starts MySQL, the API, and the synthetic
telemetry generator together:

```bash
docker compose up --build
```

Open `http://localhost:8080`.

The first start can take a little longer while MySQL creates its data volume.
The portal begins receiving laptop-profile telemetry automatically. Use the
synthetic load profile controls in the portal to switch between idle, laptop,
heater, and high-load data; the simulator applies the new profile before its
next two-second sample.

To stop the stack without deleting history:

```bash
docker compose down
```

The named Docker volume, `gridwise_data`, keeps MySQL measurements between
starts. Delete it only when you intentionally want a completely blank demo.

## Local development option

The portal is a React application in `frontend/`. For UI work, run its Vite
development server in one terminal:

```bash
cd frontend
npm install
npm run dev
```

When preparing a direct Python run, build the React portal first, then keep
MySQL in Docker and run the API and simulator in separate terminals:

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

In another terminal:

```bash
source server/.venv/bin/activate
python server/simulator.py --scenario laptop --interval-seconds 2
```

## Future ESP32 / PZEM-004T mode

No hardware is needed for the presentation. When it is available:

1. Copy `firmware/esp32_energy_monitor/secrets.example.h` to `secrets.h`.
2. Set Wi-Fi credentials and a reachable server URL such as
   `http://YOUR_COMPUTER_LAN_IP:8080/data`.
3. Flash `esp32_energy_monitor.ino` to the ESP32.
4. Start only MySQL and the API in hardware mode:

   ```bash
   GRIDWISE_DATA_MODE=hardware docker compose up --build db app
   ```

5. Open the same portal. It changes from `SIMULATED` to `ESP32 · LIVE` after
   the first valid measurement.

Hardware mode rejects synthetic telemetry; do not start the simulator in this
mode. The current firmware posts voltage, current, power, cumulative energy,
frequency, and power factor every two seconds.

> **Safety:** mains electricity is hazardous. Use a supervised lab bench,
> insulated enclosure, fuse/strain relief, and appropriate ESP32-to-PZEM UART
> level shifting. Never wire ESP32 GPIO directly to a possible 5 V PZEM TX pin.

## Measurement logic

Every source sends this payload to `POST /data`:

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

The server validates the physical ranges, stores the raw reading in MySQL, and
computes a rolling average of the latest five voltage/current/power/frequency/
power-factor samples. Cumulative energy is **never averaged**; the newest
meter value is preserved.

`GET /data` includes the current reading, its source, its timestamp, and a
freshness flag. This means the portal can distinguish a reachable API from
genuinely fresh telemetry.

`GET /history?range=30m|1h|3h|1d` returns the entire selected period. When a
period contains more than 1,000 readings, the API groups adjacent readings so
the chart still represents the full range rather than silently dropping recent
measurements.

## API routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/` | Live telemetry portal |
| `GET` | `/health` | MySQL connection and active mode |
| `GET` | `/data` | Latest reading plus freshness/source metadata |
| `POST` | `/data` | Ingest one valid measurement |
| `GET` | `/history` | Persisted readings for a range or custom dates |
| `GET` | `/demo/scenarios` | Current synthetic profile and options (demo only) |
| `POST` | `/demo/scenario` | Change the synthetic profile (demo only) |

## Verification

With the stack running:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/data
curl 'http://localhost:8000/history?range=30m'
```

Run the smoke tests from the local Python environment:

```bash
pytest tests/test_api.py -v
```
