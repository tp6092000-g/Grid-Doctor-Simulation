export type Scenario = "normal" | "solar-drop" | "wind-drop" | "demand-spike";
export type Strategy = "fixed" | "flexible";

export interface SimulationInputs {
  solarCapacityMw: number;
  windCapacityMw: number;
  peakDemandMw: number;
  batteryCapacityMwh: number;
  electrolyzerPowerMw: number;
  hydrogenKwhPerKg: number;
}

export interface HourlyResult {
  hour: number;
  solarMw: number;
  windMw: number;
  renewableMw: number;
  demandMw: number;
  batterySocMwh: number;
  batteryCapacityMwh: number;
  batteryChargeMwh: number;
  batteryDischargeMwh: number;
  electrolyzerMwh: number;
  electrolyzerTargetMwh: number;
  gridImportsMwh: number;
  unmetDemandMwh: number;
  renewableUsedMwh: number;
  curtailedMwh: number;
  hydrogenKg: number;
}

export interface StrategyResult {
  strategy: Strategy;
  hourly: HourlyResult[];
  totals: {
    gridImportsMwh: number;
    unmetDemandMwh: number;
    renewableUsedMwh: number;
    hydrogenKg: number;
  };
}

export interface ComparisonResult {
  profiles: HourlyResult[];
  fixed: StrategyResult;
  flexible: StrategyResult;
}

export const DEFAULT_INPUTS: SimulationInputs = {
  solarCapacityMw: 85,
  windCapacityMw: 55,
  peakDemandMw: 70,
  batteryCapacityMwh: 150,
  electrolyzerPowerMw: 16,
  hydrogenKwhPerKg: 52,
};

export const INPUT_LIMITS = {
  solarCapacityMw: { min: 0, max: 160, step: 5 },
  windCapacityMw: { min: 0, max: 120, step: 5 },
  peakDemandMw: { min: 20, max: 150, step: 5 },
  batteryCapacityMwh: { min: 0, max: 300, step: 10 },
  electrolyzerPowerMw: { min: 0, max: 60, step: 2 },
  hydrogenKwhPerKg: { min: 40, max: 70, step: 1 },
} as const;

export const MODEL_ASSUMPTIONS = {
  hours: 24,
  gridImportLimitMw: 45,
  batteryPowerLimitMw: 40,
  batteryCRatePerHour: 0.5,
  batteryChargeEfficiency: 0.95,
  batteryDischargeEfficiency: 0.95,
  initialBatterySocFraction: 0.5,
  solarDropFactor: 0.12,
  solarDropHours: [11, 12, 13, 14] as const,
  windDropFactor: 0.25,
  windDropHours: [16, 17, 18, 19, 20] as const,
  demandSpikeFactor: 1.4,
  demandSpikeHours: [18, 19, 20] as const,
};

const HOURS = Array.from({ length: MODEL_ASSUMPTIONS.hours }, (_, hour) => hour);

// Repeatable normalized hourly profiles, intentionally supplied as synthetic examples.
const WIND_PROFILE = [
  0.48, 0.46, 0.44, 0.42, 0.4, 0.38, 0.35, 0.33, 0.32, 0.34, 0.37, 0.4,
  0.43, 0.46, 0.48, 0.47, 0.45, 0.42, 0.4, 0.39, 0.41, 0.44, 0.47, 0.49,
];

const DEMAND_PROFILE = [
  0.62, 0.59, 0.56, 0.54, 0.53, 0.55, 0.61, 0.7, 0.77, 0.78, 0.75, 0.73,
  0.74, 0.77, 0.8, 0.83, 0.88, 0.94, 0.98, 1, 0.96, 0.88, 0.76, 0.68,
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function normalizeInputs(inputs: SimulationInputs): SimulationInputs {
  return {
    solarCapacityMw: clamp(
      Number.isFinite(inputs.solarCapacityMw) ? inputs.solarCapacityMw : DEFAULT_INPUTS.solarCapacityMw,
      INPUT_LIMITS.solarCapacityMw.min,
      INPUT_LIMITS.solarCapacityMw.max,
    ),
    windCapacityMw: clamp(
      Number.isFinite(inputs.windCapacityMw) ? inputs.windCapacityMw : DEFAULT_INPUTS.windCapacityMw,
      INPUT_LIMITS.windCapacityMw.min,
      INPUT_LIMITS.windCapacityMw.max,
    ),
    peakDemandMw: clamp(
      Number.isFinite(inputs.peakDemandMw) ? inputs.peakDemandMw : DEFAULT_INPUTS.peakDemandMw,
      INPUT_LIMITS.peakDemandMw.min,
      INPUT_LIMITS.peakDemandMw.max,
    ),
    batteryCapacityMwh: clamp(
      Number.isFinite(inputs.batteryCapacityMwh) ? inputs.batteryCapacityMwh : DEFAULT_INPUTS.batteryCapacityMwh,
      INPUT_LIMITS.batteryCapacityMwh.min,
      INPUT_LIMITS.batteryCapacityMwh.max,
    ),
    electrolyzerPowerMw: clamp(
      Number.isFinite(inputs.electrolyzerPowerMw) ? inputs.electrolyzerPowerMw : DEFAULT_INPUTS.electrolyzerPowerMw,
      INPUT_LIMITS.electrolyzerPowerMw.min,
      INPUT_LIMITS.electrolyzerPowerMw.max,
    ),
    hydrogenKwhPerKg: clamp(
      Number.isFinite(inputs.hydrogenKwhPerKg) ? inputs.hydrogenKwhPerKg : DEFAULT_INPUTS.hydrogenKwhPerKg,
      INPUT_LIMITS.hydrogenKwhPerKg.min,
      INPUT_LIMITS.hydrogenKwhPerKg.max,
    ),
  };
}

function solarCapacityFactor(hour: number): number {
  if (hour < 6 || hour > 18) return 0;
  return Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI)) ** 1.35;
}

function scenarioMultiplier(scenario: Scenario, hour: number): {
  solar: number;
  wind: number;
  demand: number;
} {
  if (
    scenario === "solar-drop" &&
    MODEL_ASSUMPTIONS.solarDropHours.includes(hour as (typeof MODEL_ASSUMPTIONS.solarDropHours)[number])
  ) {
    return { solar: MODEL_ASSUMPTIONS.solarDropFactor, wind: 1, demand: 1 };
  }
  if (
    scenario === "wind-drop" &&
    MODEL_ASSUMPTIONS.windDropHours.includes(hour as (typeof MODEL_ASSUMPTIONS.windDropHours)[number])
  ) {
    return { solar: 1, wind: MODEL_ASSUMPTIONS.windDropFactor, demand: 1 };
  }
  if (
    scenario === "demand-spike" &&
    MODEL_ASSUMPTIONS.demandSpikeHours.includes(hour as (typeof MODEL_ASSUMPTIONS.demandSpikeHours)[number])
  ) {
    return { solar: 1, wind: 1, demand: MODEL_ASSUMPTIONS.demandSpikeFactor };
  }
  return { solar: 1, wind: 1, demand: 1 };
}

function buildProfiles(inputs: SimulationInputs, scenario: Scenario): HourlyResult[] {
  return HOURS.map((hour) => {
    const event = scenarioMultiplier(scenario, hour);
    const solarMw = inputs.solarCapacityMw * solarCapacityFactor(hour) * event.solar;
    const windMw = inputs.windCapacityMw * WIND_PROFILE[hour] * event.wind;
    const renewableMw = solarMw + windMw;
    const demandMw = inputs.peakDemandMw * DEMAND_PROFILE[hour] * event.demand;

    return {
      hour,
      solarMw,
      windMw,
      renewableMw,
      demandMw,
      batterySocMwh: 0,
      batteryCapacityMwh: inputs.batteryCapacityMwh,
      batteryChargeMwh: 0,
      batteryDischargeMwh: 0,
      electrolyzerMwh: 0,
      electrolyzerTargetMwh: inputs.electrolyzerPowerMw,
      gridImportsMwh: 0,
      unmetDemandMwh: 0,
      renewableUsedMwh: 0,
      curtailedMwh: 0,
      hydrogenKg: 0,
    };
  });
}

function dispatch(
  profiles: HourlyResult[],
  inputs: SimulationInputs,
  strategy: Strategy,
): StrategyResult {
  const { batteryCapacityMwh, electrolyzerPowerMw, hydrogenKwhPerKg } = inputs;
  const chargeEfficiency = MODEL_ASSUMPTIONS.batteryChargeEfficiency;
  const dischargeEfficiency = MODEL_ASSUMPTIONS.batteryDischargeEfficiency;
  const maxBatteryPower = Math.min(
    MODEL_ASSUMPTIONS.batteryPowerLimitMw,
    batteryCapacityMwh * MODEL_ASSUMPTIONS.batteryCRatePerHour,
  );
  let stateOfCharge = batteryCapacityMwh * MODEL_ASSUMPTIONS.initialBatterySocFraction;
  let gridImportsMwh = 0;
  let unmetDemandMwh = 0;
  let renewableUsedMwh = 0;
  let hydrogenKg = 0;

  const hourly = profiles.map((profile) => {
    const renewable = profile.renewableMw;
    const demand = profile.demandMw;
    const target = electrolyzerPowerMw;
    let batteryChargeMwh = 0;
    let batteryDischargeMwh = 0;
    let imports = 0;
    let unmet = 0;
    let electrolyzerMwh = 0;
    let curtailedMwh = 0;

    if (strategy === "fixed") {
      // The fixed setpoint is an inflexible load scheduled before other demand.
      const combinedLoad = demand + target;
      if (renewable >= combinedLoad) {
        electrolyzerMwh = target;
        unmet = 0;
        const surplus = renewable - combinedLoad;
        const chargeHeadroom = (batteryCapacityMwh - stateOfCharge) / chargeEfficiency;
        batteryChargeMwh = Math.min(surplus, maxBatteryPower, chargeHeadroom);
        curtailedMwh = Math.max(0, surplus - batteryChargeMwh);
      } else {
        const shortfall = combinedLoad - renewable;
        batteryDischargeMwh = Math.min(
          shortfall,
          maxBatteryPower,
          stateOfCharge * dischargeEfficiency,
        );
        const remaining = shortfall - batteryDischargeMwh;
        imports = Math.min(remaining, MODEL_ASSUMPTIONS.gridImportLimitMw);
        const available = renewable + batteryDischargeMwh + imports;
        electrolyzerMwh = Math.min(target, available);
        unmet = Math.max(0, demand - Math.max(0, available - electrolyzerMwh));
      }
    } else if (renewable >= demand) {
      // Flexible operation serves essential demand, charges storage, then uses remaining renewable energy.
      const surplus = renewable - demand;
      const chargeHeadroom = (batteryCapacityMwh - stateOfCharge) / chargeEfficiency;
      batteryChargeMwh = Math.min(surplus, maxBatteryPower, chargeHeadroom);
      const afterCharging = surplus - batteryChargeMwh;
      electrolyzerMwh = Math.min(target, afterCharging);
      curtailedMwh = Math.max(0, afterCharging - electrolyzerMwh);
    } else {
      // When generation is short, battery and the finite grid connection serve essentials only.
      const shortfall = demand - renewable;
      batteryDischargeMwh = Math.min(
        shortfall,
        maxBatteryPower,
        stateOfCharge * dischargeEfficiency,
      );
      const remaining = shortfall - batteryDischargeMwh;
      imports = Math.min(remaining, MODEL_ASSUMPTIONS.gridImportLimitMw);
      unmet = Math.max(0, remaining - imports);
    }

    stateOfCharge = clamp(
      stateOfCharge -
        batteryDischargeMwh / dischargeEfficiency +
        batteryChargeMwh * chargeEfficiency,
      0,
      batteryCapacityMwh,
    );
    const renewableUsed = renewable - curtailedMwh;
    const hydrogen = (electrolyzerMwh * 1000) / hydrogenKwhPerKg;

    gridImportsMwh += imports;
    unmetDemandMwh += unmet;
    renewableUsedMwh += renewableUsed;
    hydrogenKg += hydrogen;

    return {
      ...profile,
      batterySocMwh: stateOfCharge,
      batteryChargeMwh,
      batteryDischargeMwh,
      electrolyzerMwh,
      gridImportsMwh: imports,
      unmetDemandMwh: unmet,
      renewableUsedMwh: renewableUsed,
      curtailedMwh,
      hydrogenKg: hydrogen,
    };
  });

  return {
    strategy,
    hourly,
    totals: { gridImportsMwh, unmetDemandMwh, renewableUsedMwh, hydrogenKg },
  };
}

export function getScenarioLabel(scenario: Scenario): string {
  switch (scenario) {
    case "solar-drop":
      return "Sudden solar drop";
    case "wind-drop":
      return "Wind drop";
    case "demand-spike":
      return "Demand spike";
    default:
      return "Baseline";
  }
}

export function runComparison(
  inputs: SimulationInputs,
  scenario: Scenario,
): ComparisonResult {
  const normalizedInputs = normalizeInputs(inputs);
  const profiles = buildProfiles(normalizedInputs, scenario);
  return {
    profiles,
    fixed: dispatch(profiles, normalizedInputs, "fixed"),
    flexible: dispatch(profiles, normalizedInputs, "flexible"),
  };
}
