import React, { useEffect, useState, useId } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./pages.css";

const POLL_MS = 1000;
const HISTORY_POLL_MS = 30000;
const MAX_LIVE_POINTS = 60;
const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || (window.location.port === "5173" ? `${window.location.protocol}//${window.location.hostname}:8080` : "");
const apiUrl = (path) => `${API_ORIGIN}${path}`;

const number = (value, digits = 1) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
};

const compactTime = (timestamp) => {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  return Number.isNaN(date.valueOf())
    ? timestamp.replace("T", " ").slice(0, 19)
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const average = (items) => items.length ? items.reduce((sum, item) => sum + item, 0) / items.length : 0;

function Icon({ name, size = 18 }) {
  const paths = {
    grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    bolt: "M13 2 4.5 13H11l-1 9L19.5 10H13z",
    pulse: "M3 12h4l2.2-6 4.1 12L16 12h5",
    chart: "M4 19V5M4 19h16M8 16v-4M12 16V7M16 16V9M20 16V4",
    clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    database: "M20 6c0 2.2-3.6 4-8 4s-8-1.8-8-4 3.6-4 8-4 8 1.8 8 4ZM4 6v6c0 2.2 3.6 4 8 4s8-1.8 8-4V6M4 12v6c0 2.2 3.6 4 8 4s8-1.8 8-4v-6",
    settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.5-1H5.3v-3h.2A1.7 1.7 0 0 0 7 10a1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.2h3v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.5 1h.2v3h-.2a1.7 1.7 0 0 0-1.5 1Z",
    menu: "M4 7h16M4 12h16M4 17h16",
    arrow: "M5 12h14M14 7l5 5-5 5",
    chevron: "m9 18 6-6-6-6",
    dot: "M12 12h.01",
  };
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={paths[name]} /></svg>;
}

function LineChart({ points, metric, height = 280 }) {
  // Each chart instance needs unique SVG gradient IDs.
  const chartId = useId().replace(/:/g, "");
  const fillId = `${chartId}-chartFill`;
  const strokeId = `${chartId}-chartStroke`;

  const values = points.map((point) => Number(point[metric] || 0));
  if (!values.length) return <div className="chart-empty">Waiting for telemetry</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 800;
  const pad = { top: 24, right: 14, bottom: 30, left: 44 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const coords = values.map((value, index) => {
    const x = pad.left + (values.length === 1 ? innerWidth : index * innerWidth / (values.length - 1));
    const y = pad.top + innerHeight - ((value - min) / range) * innerHeight;
    return [x, y];
  });
  const line = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const fill = `${line} L ${coords.at(-1)[0]} ${pad.top + innerHeight} L ${coords[0][0]} ${pad.top + innerHeight} Z`;
  const labels = { power: "Power", voltage: "Voltage", current: "Current", energy: "Energy" };
  const units = { power: "W", voltage: "V", current: "A", energy: "kWh" };

  return (
    <div className="chart-wrap" style={{ "--chart-height": `${height}px` }}>
      <div className="chart-key"><span>{labels[metric]}</span><strong>{number(values.at(-1), metric === "current" ? 3 : metric === "energy" ? 5 : 1)} {units[metric]}</strong></div>
      <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${labels[metric]} trend`}>
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="#4777ff" stopOpacity=".35" />
            <stop offset="1" stopColor="#4777ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={strokeId} x1="0" x2="1">
            <stop stopColor="#a8b9ff" />
            <stop offset="1" stopColor="#4d7dff" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((lineIndex) => <line key={lineIndex} x1={pad.left} x2={width - pad.right} y1={pad.top + innerHeight * lineIndex / 3} y2={pad.top + innerHeight * lineIndex / 3} className="grid-line" />)}
        <path
          d={fill}
          className="chart-fill"
          style={{ fill: `url(#${fillId})` }}
        />
        <path
          d={line}
          className="chart-line"
          style={{ stroke: `url(#${strokeId})` }}
        />
        <circle cx={coords.at(-1)[0]} cy={coords.at(-1)[1]} r="4" className="chart-dot" />
        <text x="3" y={pad.top + 4}>{number(max, 1)}</text>
        <text x="3" y={pad.top + innerHeight}>{number(min, 1)}</text>
        <text x={pad.left} y={height - 7}>{compactTime(points[0]?.last_update || points[0]?.measured_at)}</text>
        <text x={width - pad.right} y={height - 7} textAnchor="end">Now</text>
      </svg>
    </div>
  );
}

function Gauge({ value }) {
  const progress = Math.min(1, Math.max(0, Number(value) || 0));
  return (
    <div className="gauge" style={{ "--progress": `${progress * 100}%` }}>
      <div><strong>{number(progress, 2)}</strong><span>power factor</span></div>
    </div>
  );
}

function App() {
  const [live, setLive] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyMeta, setHistoryMeta] = useState(null);
  const [range, setRange] = useState("30m");
  const [chartMetric, setChartMetric] = useState("power");
  const [livePoints, setLivePoints] = useState([]);
  const [tariff, setTariff] = useState(8);
  const [sessionStart, setSessionStart] = useState(null);
  const [apiOnline, setApiOnline] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [page, setPage] = useState(() => window.location.hash.replace("#/", "") || "overview");

  const getLive = async () => {
    try {
      const response = await fetch(apiUrl("/data"), { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to read live telemetry");
      const data = await response.json();
      setApiOnline(true);
      setLive(data);
      if (data.last_update) {
        setLivePoints((current) => {
          if (current.at(-1)?.last_update === data.last_update) return current;
          return [...current, data].slice(-MAX_LIVE_POINTS);
        });
      }
      if (sessionStart === null && Number.isFinite(Number(data.energy))) setSessionStart(Number(data.energy));
    } catch {
      setApiOnline(false);
    }
  };

  const getHistory = async (chosenRange = range) => {
    try {
      const response = await fetch(apiUrl(`/history?range=${encodeURIComponent(chosenRange)}`), { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to read history");
      const data = await response.json();
      setHistory(data.rows || []);
      setHistoryMeta(data);
    } catch {
      setHistory([]);
      setHistoryMeta(null);
    }
  };

  useEffect(() => {
    getLive();
    const timer = window.setInterval(getLive, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    getHistory(range);
    const timer = window.setInterval(() => getHistory(range), HISTORY_POLL_MS);
    return () => window.clearInterval(timer);
  }, [range]);

  useEffect(() => {
    const syncPage = () => setPage(window.location.hash.replace("#/", "") || "overview");
    window.addEventListener("hashchange", syncPage);
    return () => window.removeEventListener("hashchange", syncPage);
  }, []);

  const switchScenario = async (scenario) => {
    setScenarioLoading(true);
    try {
      const response = await fetch(apiUrl("/demo/scenario"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario }) });
      if (!response.ok) throw new Error("Could not change profile");
      await getLive();
    } finally {
      setScenarioLoading(false);
    }
  };

  const status = !apiOnline ? "Offline" : !live?.last_update ? "Waiting" : live.is_fresh ? "Live" : "Stale";
  const energyDelta = Math.max(0, Number(live?.energy || 0) - Number(sessionStart || 0));
  const sessionCost = energyDelta * Number(tariff || 0);
  const maxPower = Math.max(0, ...livePoints.map((point) => Number(point.power || 0)));
  const averagePower = average(livePoints.map((point) => Number(point.power || 0)));
  const profileName = live?.scenario?.replaceAll("_", " ") || "Synthetic profile";
  const historyPower = history.map((item) => Number(item.avg_power || 0));
  const historyEnergy = history.map((item) => Number(item.avg_energy ?? item.raw_energy ?? 0));
  const energyRange = historyEnergy.length ? Math.max(0, historyEnergy.at(-1) - historyEnergy[0]) : 0;
  const historyPoints = history.map((item) => ({
    last_update: item.measured_at,
    power: item.avg_power,
    voltage: item.avg_voltage,
    current: item.avg_current,
    energy: item.avg_energy ?? item.raw_energy,
  }));

  const navItems = [
    ["overview", "Overview", "grid"], ["live", "Live telemetry", "pulse"], ["trends", "Trends", "chart"], ["history", "Data history", "database"],
  ];
  const pageTitles = { overview: "Overview", live: "Live telemetry", trends: "Trends", history: "Data history" };
  const navigate = (nextPage) => {
    window.location.hash = `/${nextPage}`;
    setPage(nextPage);
    setMobileNav(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <div className="brand"><span className="brand-mark"><Icon name="bolt" /></span><span>Grid<span>Wise</span></span></div>
        <div className="workspace"><span className="workspace-icon"><Icon name="grid" size={15} /></span><div><small>WORKSPACE</small><strong>Energy monitor</strong></div><Icon name="chevron" size={15} /></div>
        <nav><p className="nav-label">MONITOR</p>{navItems.map(([route, label, icon]) => <button className={page === route ? "nav-item active" : "nav-item"} key={route} onClick={() => navigate(route)}><Icon name={icon}/><span>{label}</span>{route === "history" && <Icon name="chevron" size={15}/>}</button>)}</nav>
        <div className="sidebar-bottom"><p className="nav-label">SYSTEM</p><button className="nav-item"><Icon name="settings"/><span>Settings</span></button><div className="source-card"><span className="source-dot"></span><div><small>DATA SOURCE</small><strong>{live?.is_simulated !== false ? "Synthetic demo" : "ESP32 / PZEM"}</strong></div></div></div>
      </aside>

      <main>
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav((open) => !open)} aria-label="Open navigation"><Icon name="menu" /></button><div className="breadcrumb"><span>Energy monitor</span><Icon name="chevron" size={14}/><strong>{pageTitles[page] || "Overview"}</strong></div><div className="topbar-actions"><div className={`status-pill ${status.toLowerCase()}`}><i></i><span>{status}</span>{live?.data_age_seconds !== null && live?.data_age_seconds !== undefined && <small>{Math.round(live.data_age_seconds)}s ago</small>}</div><div className="avatar">GW</div></div></header>

        <section className={`content page-${page}`} id="overview">
          <section className="route-page live-page">
            <div className="page-heading"><div><p className="eyebrow">REAL-TIME STREAM</p><h1>Live telemetry</h1><p>Incoming measurements update automatically every second.</p></div><div className="last-read"><span>LAST MEASUREMENT</span><strong>{compactTime(live?.last_update)}</strong></div></div>
            <section className="metric-grid"><article className="metric-card primary"><div className="metric-top"><span>Active power</span><span className="metric-icon"><Icon name="bolt" /></span></div><strong>{number(live?.power, 0)} <small>W</small></strong><p>{live?.is_fresh ? "Fresh reading received" : "Waiting for a fresh sample"}</p></article><article className="metric-card"><div className="metric-top"><span>Voltage</span><span className="metric-icon muted-icon"><Icon name="pulse" /></span></div><strong>{number(live?.voltage, 1)} <small>V</small></strong><p>Nominal supply voltage</p></article><article className="metric-card"><div className="metric-top"><span>Current</span><span className="metric-icon muted-icon"><Icon name="chart" /></span></div><strong>{number(live?.current, 3)} <small>A</small></strong><p>Present circuit draw</p></article><article className="metric-card"><div className="metric-top"><span>Frequency</span><span className="metric-icon muted-icon">Hz</span></div><strong>{number(live?.frequency, 1)} <small>Hz</small></strong><p>Line frequency</p></article></section>
            <section className="dashboard-grid live-dashboard"><article className="panel trend-panel"><div className="panel-header"><div><h2>Live consumption</h2><p>Last {MAX_LIVE_POINTS} incoming measurements</p></div><div className="metric-tabs">{["power", "voltage", "current", "energy"].map((metric) => <button key={metric} className={chartMetric === metric ? "active" : ""} onClick={() => setChartMetric(metric)}>{metric}</button>)}</div></div><LineChart points={livePoints} metric={chartMetric} /></article><article className="panel efficiency-panel"><div className="panel-header"><div><h2>Load quality</h2><p>Power factor performance</p></div><span className={Number(live?.power_factor) >= .85 ? "health-tag good" : "health-tag warning"}>{Number(live?.power_factor) >= .85 ? "Good" : "Review"}</span></div><Gauge value={live?.power_factor}/><div className="quality-info"><span>Power factor</span><strong>{number(live?.power_factor, 2)}</strong><span>Data source</span><strong>{live?.is_simulated !== false ? "Synthetic demo" : "ESP32 / PZEM"}</strong></div></article></section>
          </section>

          <section className="route-page trends-page">
            <div className="page-heading"><div><p className="eyebrow">ANALYSIS</p><h1>Telemetry trends</h1><p>Review persisted energy patterns over the selected time window.</p></div><div className="last-read"><span>RECORDS IN RANGE</span><strong>{historyMeta?.count ?? "—"}</strong></div></div>
            <section className="panel trend-panel"><div className="panel-header"><div><h2>Historical trend</h2><p>MySQL measurements grouped for readable analysis</p></div><div className="metric-tabs">{["power", "voltage", "current", "energy"].map((metric) => <button key={metric} className={chartMetric === metric ? "active" : ""} onClick={() => setChartMetric(metric)}>{metric}</button>)}</div></div><LineChart points={historyPoints} metric={chartMetric} height={340} /></section>
            <div className="history-summary trend-summary"><div><span>AVERAGE POWER</span><strong>{number(average(historyPower), 1)} W</strong></div><div><span>ENERGY USED</span><strong>{number(energyRange, 5)} kWh</strong></div><div><span>DATA SOURCE</span><strong>{historyMeta?.source || "Synthetic"}</strong></div><div><span>DISPLAY</span><strong>{historyMeta?.aggregated ? `${historyMeta.displayed_count} grouped` : "Raw readings"}</strong></div></div>
          </section>
          {live?.is_simulated !== false && <div className="demo-banner"><Icon name="bolt" size={15}/><span><strong>Demo environment</strong> · all readings are synthetic and stored in MySQL</span><span className="demo-profile">{profileName}</span></div>}
          <div className="page-heading"><div><p className="eyebrow">LIVE ENERGY TELEMETRY</p><h1>Good evening, Ayush.</h1><p>Monitor the current load, energy use, and data quality at a glance.</p></div><div className="last-read"><span>LAST MEASUREMENT</span><strong>{compactTime(live?.last_update)}</strong></div></div>

          <section className="metric-grid">
            <article className="metric-card primary"><div className="metric-top"><span>Active power</span><span className="metric-icon"><Icon name="bolt" /></span></div><strong>{number(live?.power, 0)} <small>W</small></strong><p>{live?.is_fresh ? "Current five-sample average" : "Waiting for a fresh sample"}</p><div className="mini-trend"><span style={{ width: `${Math.min(100, Number(live?.power || 0) / 23)}%` }}></span></div></article>
            <article className="metric-card"><div className="metric-top"><span>Session energy</span><span className="metric-icon muted-icon"><Icon name="pulse" /></span></div><strong>{number(energyDelta, 5)} <small>kWh</small></strong><p>Since this browser session started</p></article>
            <article className="metric-card"><div className="metric-top"><span>Session cost</span><span className="metric-icon muted-icon">₹</span></div><strong>₹{number(sessionCost, 2)}</strong><p><label>Tariff <input value={tariff} type="number" min="0" step=".5" onChange={(event) => setTariff(event.target.value)} /> / kWh</label></p></article>
            <article className="metric-card"><div className="metric-top"><span>Power factor</span><span className="metric-icon muted-icon"><Icon name="chart" /></span></div><strong>{number(live?.power_factor, 2)}</strong><p>{Number(live?.power_factor) >= .85 ? "Within the preferred range" : "Check the load efficiency"}</p></article>
          </section>

          <section className="dashboard-grid">
            <article className="panel trend-panel"><div className="panel-header"><div><h2>Live consumption</h2><p>Last {MAX_LIVE_POINTS} incoming measurements</p></div><div className="metric-tabs">{["power", "voltage", "current", "energy"].map((metric) => <button key={metric} className={chartMetric === metric ? "active" : ""} onClick={() => setChartMetric(metric)}>{metric}</button>)}</div></div><LineChart points={livePoints} metric={chartMetric} /></article>
            <article className="panel efficiency-panel"><div className="panel-header"><div><h2>Load quality</h2><p>Power factor performance</p></div><span className={Number(live?.power_factor) >= .85 ? "health-tag good" : "health-tag warning"}>{Number(live?.power_factor) >= .85 ? "Good" : "Review"}</span></div><Gauge value={live?.power_factor}/><div className="quality-info"><span>Voltage</span><strong>{number(live?.voltage, 1)} V</strong><span>Frequency</span><strong>{number(live?.frequency, 1)} Hz</strong></div></article>
            <article className="panel stat-panel"><div className="panel-header"><div><h2>Live statistics</h2><p>Visible browser session</p></div><Icon name="dot" /></div><div className="statistics"><div><span>Average load</span><strong>{number(averagePower, 1)} W</strong></div><div><span>Peak load</span><strong>{number(maxPower, 1)} W</strong></div><div><span>Peak current</span><strong>{number(Math.max(0, ...livePoints.map((point) => Number(point.current || 0))), 3)} A</strong></div><div><span>Samples</span><strong>{livePoints.length}</strong></div></div></article>
            <article className="panel alert-panel"><div className="panel-header"><div><h2>System status</h2><p>Telemetry health and guidance</p></div><span className={`status-indicator ${status.toLowerCase()}`}></span></div><div className={`alert-copy ${status.toLowerCase()}`}><Icon name={status === "Live" ? "bolt" : "clock"}/><div><strong>{status === "Live" ? "Telemetry is flowing normally" : status === "Stale" ? "Telemetry needs attention" : "Awaiting telemetry"}</strong><p>{status === "Live" ? `${profileName} data is current and validated.` : status === "Stale" ? "The server is reachable, but no new reading has arrived within the freshness window." : "Start the simulator; the portal will update automatically."}</p></div></div></article>
          </section>

          {live?.is_simulated !== false && <section className="profile-section"><div><p className="eyebrow">PRESENTATION CONTROLS</p><h2>Synthetic load profile</h2><p>Select a realistic virtual load; the simulator applies it before its next reading.</p></div><div className="profile-options">{[["idle", "Idle"], ["laptop", "Laptop"], ["heater", "Heater"], ["high_load_demo", "High load"]].map(([value, label]) => <button key={value} className={live?.scenario === value ? "selected" : ""} onClick={() => switchScenario(value)} disabled={scenarioLoading}>{label}</button>)}</div></section>}

          <section className="history-section" id="history"><div className="section-title"><div><p className="eyebrow">PERSISTED MEASUREMENTS</p><h2>Data history</h2><p>Source-filtered telemetry stored in MySQL.</p></div><div className="range-tabs">{[["30m", "30 min"], ["1h", "1 hour"], ["3h", "3 hours"], ["1d", "24 hours"]].map(([value, label]) => <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>{label}</button>)}</div></div>
            <div className="history-summary"><div><span>RECORDS</span><strong>{historyMeta?.count ?? "—"}</strong></div><div><span>AVERAGE POWER</span><strong>{number(average(historyPower), 1)} W</strong></div><div><span>ENERGY USED</span><strong>{number(energyRange, 5)} kWh</strong></div><div><span>DISPLAY</span><strong>{historyMeta?.aggregated ? `${historyMeta.displayed_count} grouped` : "Raw readings"}</strong></div></div>
            <article className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Time</th><th>Power</th><th>Voltage</th><th>Current</th><th>Energy</th><th>PF</th><th>Samples</th></tr></thead><tbody>{history.length ? history.slice(-12).reverse().map((row) => <tr key={`${row.id}-${row.measured_at}`}><td>{compactTime(row.measured_at)}</td><td>{number(row.avg_power, 1)} W</td><td>{number(row.avg_voltage, 1)} V</td><td>{number(row.avg_current, 3)} A</td><td>{number(row.avg_energy ?? row.raw_energy, 5)} kWh</td><td>{number(row.avg_power_factor, 2)}</td><td>{row.bucket_samples || row.samples_averaged}</td></tr>) : <tr><td colSpan="7" className="empty-cell">No stored telemetry in this period.</td></tr>}</tbody></table></div></article>
          </section>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
