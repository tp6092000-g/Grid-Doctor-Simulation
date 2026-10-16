import { useMemo, useState, type CSSProperties } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  BatteryCharging,
  CircleHelp,
  RotateCcw,
  ShieldAlert,
  Sun,
  Wind,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_INPUTS,
  getScenarioLabel,
  INPUT_LIMITS,
  runComparison,
} from '@/lib/simulation';
import type {
  Scenario,
  SimulationInputs,
  StrategyResult,
} from '@/lib/simulation';

const SCENARIOS: { id: Scenario; title: string; description: string }[] = [
  { id: 'normal', title: 'Baseline day', description: 'Typical weather + demand' },
  { id: 'solar-drop', title: 'Solar drop', description: '88% fall · hours 11–14' },
  { id: 'wind-drop', title: 'Wind drop', description: '75% fall · hours 16–20' },
  { id: 'demand-spike', title: 'Demand spike', description: '40% rise · hours 18–20' },
];

const CONTROLS: {
  key: keyof SimulationInputs;
  label: string;
  unit: string;
  icon: typeof Sun;
}[] = [
  { key: 'solarCapacityMw', label: 'Solar capacity', unit: 'MW', icon: Sun },
  { key: 'windCapacityMw', label: 'Wind capacity', unit: 'MW', icon: Wind },
  { key: 'peakDemandMw', label: 'Peak demand', unit: 'MW', icon: Activity },
  { key: 'batteryCapacityMwh', label: 'Battery capacity', unit: 'MWh', icon: BatteryCharging },
  { key: 'electrolyzerPowerMw', label: 'Electrolyser power', unit: 'MW', icon: Zap },
  { key: 'hydrogenKwhPerKg', label: 'Electricity per kg H₂', unit: 'kWh/kg', icon: Activity },
];

const format = (value: number, digits = 1) => Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '0.0';
const hourLabel = (value: number) => `${String(value).padStart(2, '0')}:00`;

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  const labels: Record<string, string> = {
    solarMw: 'Solar', windMw: 'Wind', demandMw: 'Demand', batterySocMwh: 'Battery SOC',
    batteryChargeMwh: 'Battery charge', batteryDischargeMwh: 'Battery discharge',
    gridImportsMwh: 'Grid imports', unmetDemandMwh: 'Unmet demand',
    hydrogenKg: 'Hydrogen', electrolyzerMwh: 'Electrolyser electricity',
    renewableMw: 'Total renewable generation',
  };
  const units: Record<string, string> = {
    solarMw: 'MW', windMw: 'MW', demandMw: 'MW', renewableMw: 'MW',
    batterySocMwh: 'MWh', batteryChargeMwh: 'MWh', batteryDischargeMwh: 'MWh',
    gridImportsMwh: 'MWh', unmetDemandMwh: 'MWh', hydrogenKg: 'kg',
    electrolyzerMwh: 'MWh',
  };
  return (
    <div className="chart-tooltip">
      <div className="tooltip-hour">{hourLabel(Number(label ?? 0))} · local time</div>
      {payload.map((item, index) => (
        <div className="tooltip-line" key={`${item.dataKey}-${index}`}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="legend-dot" style={{ background: item.color }} />
            {labels[String(item.dataKey)] ?? item.name}
          </span>
          <b>{format(Number(item.value ?? 0))} {units[String(item.dataKey)] ?? ''}</b>
        </div>
      ))}
    </div>
  );
}

function StatCell({ label, value, unit, testId }: { label: string; value: number; unit: string; testId: string }) {
  return (
    <div className="stat-cell" data-testid={`metric-${testId}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{format(value)}<span className="stat-unit">{unit}</span></div>
    </div>
  );
}

function StrategyCard({ result, title, flexible }: { result: StrategyResult; title: string; flexible?: boolean }) {
  const socData = result.hourly.map((point) => ({
    hour: point.hour,
    batterySocMwh: point.batterySocMwh,
    batteryChargeMwh: point.batteryChargeMwh,
    batteryDischargeMwh: point.batteryDischargeMwh,
    gridImportsMwh: point.gridImportsMwh,
    unmetDemandMwh: point.unmetDemandMwh,
    hydrogenKg: point.hydrogenKg,
    electrolyzerMwh: point.electrolyzerMwh,
  }));
  return (
    <section className="panel strategy-panel" data-testid={`strategy-${result.strategy}`}>
      <div className="panel-heading">
        <div>
          <div className="panel-kicker">Operating strategy</div>
          <div className="strategy-titleline">
            <h2 className="panel-title strategy-name">
              <i className={`strategy-swatch ${flexible ? 'flex' : ''}`} />
              {title}
            </h2>
            <span className="strategy-chip">{flexible ? 'Adaptive' : 'Fixed schedule'}</span>
          </div>
          <p className="panel-description">{flexible ? 'Essential demand first; hydrogen follows available surplus.' : 'The electrolyser holds a fixed setpoint through the day.'}</p>
        </div>
      </div>
      <div className="strategy-stats">
        <StatCell label="Grid imports" value={result.totals.gridImportsMwh} unit="MWh" testId={`${result.strategy}-imports`} />
        <StatCell label="Unmet demand" value={result.totals.unmetDemandMwh} unit="MWh" testId={`${result.strategy}-unmet`} />
        <StatCell label="Renewables used" value={result.totals.renewableUsedMwh} unit="MWh" testId={`${result.strategy}-renewables`} />
        <StatCell label="Hydrogen made" value={result.totals.hydrogenKg} unit="kg" testId={`${result.strategy}-hydrogen`} />
      </div>
      <div className="strategy-chart-title">
        <span>State of charge · charge · discharge</span><span>MWh · hourly</span>
      </div>
      <div className="chart-area compact">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={socData} margin={{ top: 3, right: 4, bottom: 0, left: -17 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="hour" tickFormatter={hourLabel} interval={5} tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={37} />
            <Tooltip content={<ChartTooltip />} />
            <Area isAnimationActive={false} type="monotone" dataKey="batterySocMwh" name="Battery SOC" stroke={flexible ? '#b8a5ee' : '#75d5b0'} fill={flexible ? 'rgba(184,165,238,.13)' : 'rgba(117,213,176,.12)'} strokeWidth={2} />
            <Line isAnimationActive={false} type="monotone" dataKey="batteryChargeMwh" name="Battery charge" stroke="#e9ac68" strokeWidth={1.4} dot={false} />
            <Line isAnimationActive={false} type="monotone" dataKey="batteryDischargeMwh" name="Battery discharge" stroke="#55c8bd" strokeWidth={1.4} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="strategy-chart-title">
        <span>Imports · electrolysis · unserved · H₂</span><span>MWh · kg</span>
      </div>
      <div className="chart-area compact">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={socData} margin={{ top: 3, right: 4, bottom: 0, left: -17 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="hour" tickFormatter={hourLabel} interval={5} tickLine={false} axisLine={false} />
            <YAxis yAxisId="energy" tickLine={false} axisLine={false} width={34} />
            <YAxis yAxisId="hydrogen" orientation="right" tickLine={false} axisLine={false} width={31} />
            <Tooltip content={<ChartTooltip />} />
            <Area isAnimationActive={false} yAxisId="energy" type="monotone" dataKey="gridImportsMwh" name="Grid imports" stroke="#e9ac68" fill="rgba(233,172,104,.1)" strokeWidth={1.7} />
            <Line isAnimationActive={false} yAxisId="energy" type="monotone" dataKey="electrolyzerMwh" name="Electrolyser electricity" stroke="#55c8bd" strokeWidth={1.4} dot={false} />
            <Line isAnimationActive={false} yAxisId="energy" type="monotone" dataKey="unmetDemandMwh" name="Unmet demand" stroke="#ef7b72" strokeWidth={1.5} dot={false} />
            <Line isAnimationActive={false} yAxisId="hydrogen" type="monotone" dataKey="hydrogenKg" name="Hydrogen" stroke="#a6d56d" strokeWidth={1.7} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function App() {
  const [inputs, setInputs] = useState<SimulationInputs>({ ...DEFAULT_INPUTS });
  const [scenario, setScenario] = useState<Scenario>('normal');
  const comparison = useMemo(() => runComparison(inputs, scenario), [inputs, scenario]);
  const { profiles, fixed, flexible } = comparison;
  const scenarioLabel = getScenarioLabel(scenario);
  const deltaImports = fixed.totals.gridImportsMwh - flexible.totals.gridImportsMwh;
  const deltaUnmet = fixed.totals.unmetDemandMwh - flexible.totals.unmetDemandMwh;
  const deltaHydrogen = flexible.totals.hydrogenKg - fixed.totals.hydrogenKg;
  const hasStress = scenario !== 'normal';
  const higherRenewableUse = flexible.totals.renewableUsedMwh - fixed.totals.renewableUsedMwh;

  const changeInput = (key: keyof SimulationInputs, value: number) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };
  const reset = () => {
    setInputs({ ...DEFAULT_INPUTS });
    setScenario('normal');
  };

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Activity size={19} strokeWidth={2.2} /></div>
          <div>
            <div className="brand-name">GRID DOCTOR</div>
            <div className="brand-sub">Renewable systems lab</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="live-tag"><i className="live-dot" /> SIMULATION READY</div>
          <div className="topbar-divider" />
          <span className="top-time">24-HOUR MODEL</span>
        </div>
      </header>

      <div className="page-wrap">
        <div className="hero-row fade-in">
          <div>
            <div className="eyebrow">SYSTEMS EXPLORER <span style={{ color: '#5b7562' }}> / 01</span></div>
            <h1 className="hero-title">Balance the grid.<br />Make the trade-offs visible.</h1>
            <p className="hero-copy">Tune a synthetic renewable power system and compare fixed and flexible electrolyser strategies. Every change recalculates the full 24-hour dispatch.</p>
          </div>
          <div className={`scenario-status ${hasStress ? 'is-alert' : ''}`} data-testid="status-active-scenario">
            <i className="status-square" />
            <span>Active scenario</span><strong>{scenarioLabel}</strong>
          </div>
        </div>

        <div className="layout-grid">
          <div className="main-column">
            <section className="panel fade-in" data-testid="chart-generation-demand">
              <div className="panel-heading">
                <div>
                  <div className="panel-kicker">01 / POWER BALANCE</div>
                  <h2 className="panel-title">Generation vs. demand</h2>
                  <p className="panel-description">Hourly synthetic profile · power in MW</p>
                </div>
              <div className="chart-legend">
                  <span className="legend-item"><i className="legend-dot" style={{ background: '#83df65' }} />Solar</span>
                  <span className="legend-item"><i className="legend-dot" style={{ background: '#55c8bd' }} />Wind</span>
                  <span className="legend-item"><i className="legend-dot" style={{ background: '#d5e7d5' }} />Total renewables</span>
                  <span className="legend-item"><i className="legend-dot" style={{ background: '#e6b16f' }} />Demand</span>
                </div>
              </div>
              <div className="chart-area">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={profiles} margin={{ top: 4, right: 14, bottom: 0, left: -10 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="hour" tickFormatter={hourLabel} interval={2} tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={43} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area isAnimationActive={false} stackId="renewables" type="monotone" dataKey="solarMw" name="Solar" stroke="#83df65" fill="rgba(131,223,101,.12)" strokeWidth={2} />
                    <Area isAnimationActive={false} stackId="renewables" type="monotone" dataKey="windMw" name="Wind" stroke="#55c8bd" fill="rgba(85,200,189,.10)" strokeWidth={2} />
                    <Line isAnimationActive={false} type="monotone" dataKey="renewableMw" name="Total renewables" stroke="#d5e7d5" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                    <Line isAnimationActive={false} type="monotone" dataKey="demandMw" name="Demand" stroke="#e6b16f" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="panel control-panel fade-in" data-testid="panel-simulation-controls">
              <div className="panel-heading">
                <div>
                  <div className="panel-kicker">02 / SIMULATION INPUTS</div>
                  <h2 className="panel-title">Shape the conditions</h2>
                  <p className="panel-description">Select a disruption, then tune the system configuration.</p>
                </div>
                <button className="scenario-button" type="button" onClick={reset} data-testid="button-reset" style={{ minHeight: 34, minWidth: 92, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <RotateCcw size={12} /> Reset
                </button>
              </div>
              <div className="scenario-grid">
                {SCENARIOS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`scenario-button ${scenario === item.id ? 'active' : ''}`}
                    onClick={() => setScenario(item.id)}
                    aria-pressed={scenario === item.id}
                    data-testid={`scenario-${item.id}`}
                  >
                    <span>{item.title}</span><small>{item.description}</small>
                  </button>
                ))}
              </div>
              <div className="slider-list">
                {CONTROLS.map(({ key, label, unit, icon: Icon }) => {
                  const { min, max, step } = INPUT_LIMITS[key];
                  const value = inputs[key];
                  const fill = `${((value - min) / (max - min)) * 100}%`;
                  return (
                    <div className="slider-row" key={key}>
                      <div className="slider-meta">
                        <label className="slider-label" htmlFor={`control-${key}`} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Icon size={12} color="#7f9a84" />{label}
                        </label>
                        <span className="slider-value" data-testid={`value-${key}`}>{format(value, key === 'hydrogenKwhPerKg' ? 0 : 0)}<em>{unit}</em></span>
                      </div>
                      <input
                        id={`control-${key}`}
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={value}
                        onChange={(event) => changeInput(key, Number(event.target.value))}
                        style={{ '--range-fill': fill } as CSSProperties}
                        aria-label={label}
                        data-testid={`control-${key}`}
                      />
                      <div className="slider-bounds"><span>{min} {unit}</span><span>{max} {unit}</span></div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel tradeoff-panel" data-testid="panel-tradeoff">
              <div className="tradeoff-heading"><ArrowDownRight size={14} /> Dispatch readout</div>
              <p className="tradeoff-copy">
                {deltaImports > 0.05
                  ? <>Flexible dispatch avoids <strong>{format(deltaImports)} MWh</strong> of grid imports compared with the fixed schedule.</>
                  : deltaImports < -0.05
                    ? <>The fixed schedule imports <strong>{format(Math.abs(deltaImports))} MWh</strong> less in this configuration.</>
                    : <>Grid imports are nearly even between dispatch strategies in this configuration.</>}
                {' '}{higherRenewableUse > 0.05
                  ? <>Flexible operation uses <strong>{format(higherRenewableUse)} MWh</strong> more renewable electricity.</>
                  : higherRenewableUse < -0.05
                    ? <>Fixed dispatch captures <strong>{format(Math.abs(higherRenewableUse))} MWh</strong> more renewable electricity.</>
                    : null}
                {' '}{deltaUnmet > 0.05
                  ? <>It also avoids <strong>{format(deltaUnmet)} MWh</strong> of unmet essential demand.</>
                  : deltaUnmet < -0.05
                    ? <>The fixed schedule has <strong>{format(Math.abs(deltaUnmet))} MWh</strong> less unmet essential demand.</>
                    : <>Unmet essential demand is nearly even between strategies.</>}
                {deltaHydrogen > 0.05
                  ? <> It also produces <strong>{format(deltaHydrogen, 0)} kg</strong> more hydrogen.</>
                  : deltaHydrogen < -0.05
                    ? <> Fixed dispatch produces <strong>{format(Math.abs(deltaHydrogen), 0)} kg</strong> more hydrogen.</>
                    : null}
              </p>
              <div className="delta-line"><ArrowRight size={12} /> {hasStress ? 'Stress scenario active' : 'Baseline conditions'} <span style={{ color: '#627568' }}>·</span> result-led comparison</div>
              <p className="tradeoff-copy" style={{ marginTop: 11 }}>
                <strong>Read the fixed result as a deliberate stress-test.</strong> It treats the full electrolyser nameplate target as must-run and dispatches it ahead of essential demand when energy is scarce, exposing unmet demand. This is not recommended real-world dispatch.
              </p>
            </section>
            <section className="panel assumptions" data-testid="panel-assumptions">
              <div className="assumption-title"><span>Assumptions &amp; limits</span><span className="assumption-tag">MODEL NOTES</span></div>
              <ul className="assumption-list">
                <li>24 hourly time steps; each hour is a 1-hour energy interval.</li>
                <li>Solar, wind, and demand profiles are synthetic examples scaled by the sliders.</li>
                <li>Solar drops 88% from 11:00–14:00; wind drops 75% from 16:00–20:00; demand rises 40% from 18:00–20:00 in their respective scenarios.</li>
                <li>Electrolysis uses electricity to split water into hydrogen and oxygen. Hydrogen output is estimated from the chosen electricity intensity; this model does not simulate water use or hydrogen storage.</li>
                <li>Solar and wind vary hour by hour, so generation may not coincide with demand. The battery shifts surplus across hours, subject to its capacity, power limit, and conversion losses.</li>
                <li><strong style={{ color: '#a9b7aa' }}>Flexible dispatch:</strong> essential demand first, then battery charging from renewable surplus, then remaining surplus to H₂.</li>
                <li><strong style={{ color: '#a9b7aa' }}>Fixed dispatch:</strong> it targets full electrolyser nameplate and prioritizes electrolysis ahead of essential demand when energy is scarce. Any unmet process target is curtailed only after available energy is exhausted. This stress-test is not recommended real-world dispatch.</li>
                <li>Both strategies share a 45 MW grid import limit. Battery power is 0.5C, capped at 40 MW; initial state of charge is 50%, with 95% charge and discharge efficiency.</li>
                <li>Hydrogen uses the configured electricity intensity (kWh/kg); storage and downstream use are not modelled.</li>
                <li>Grid imports and unmet demand are accounting outputs, not market or reliability forecasts.</li>
                <li>All figures are illustrative synthetic examples, not forecasts or operational recommendations.</li>
              </ul>
            </section>
            <div className="footer-note" data-testid="note-synthetic-data">
              <CircleHelp size={13} />
              <span><strong style={{ color: '#82978a' }}>Synthetic example data.</strong> Not a forecast or operational recommendation. Hour labels represent a modelled day, not a specific date.</span>
            </div>
            <div className="footer-note"><ShieldAlert size={13} /><span>Learning simulator only. Real systems require engineering studies and validated local data.</span></div>
          </div>

          <aside className="side-column">
            <StrategyCard result={fixed} title="Fixed electrolyser" />
            <StrategyCard result={flexible} title="Flexible electrolyser" flexible />
          </aside>
        </div>
      </div>
    </main>
  );
}

export default App;
