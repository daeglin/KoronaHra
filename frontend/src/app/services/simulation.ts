/*
  The epidemics is modeled by compartmental model
  that is a modification of SIR model.
  There are sx states with nonzero duration:
    suspectible
    exposed - infected but not yet infectious
    infectious
    hospitalized
    resistant (recovered) - temporary resistant to infections
    dead

  The transition diagram looks like:

  suspectible -> exposed -> infectious -+---------------------+-> resistant -> suspectible
                                         \                   /
                                          +-> hospitalized -+
                                                             \
                                                              +-> dead
*/

import {last} from 'lodash';
import {getRandom, settings} from './randomize';
import {getSeasonality, nextDay} from './utils';

export interface MitigationEffect {
  mult: number;
  cost: number;
  stabilityCost: number;
  vaccinationPerDay: number;
  bordersClosed: boolean;
}

interface SirState {
  suspectible: number;
  exposed: number;
  infectious: number;
  resistant: number;
  hospitalized: number;
  dead: number;
  exposedNew: number;
  infectiousNew: number;
  resistantNew: number;
  hospitalizedNew: number;
  deathsNew: number;
}

interface Randomness {
  rNoiseMult: number;
  baseMortality: number;
  hospitalizationRate: number;
}

interface ModelInputs {
  bordersDrift: number;
  seasonalityMult: number;
  R: number;
  stability: number;
  costToday: number;
  vaccinationRate: number;
}

interface MetricStats {
  today: number;
  total: number;
  avg7Day: number;
  totalUnrounded: number;
}

export interface Stats {
  detectedInfections: MetricStats;
  resolvedInfections: MetricStats;
  deaths: MetricStats;
  activeInfections: number;
  mortality: number;
  costTotal: number;
  hospitalizationCapacity: number;
  vaccinationRate: number;
}

export interface DayState {
  date: string;
  randomness?: Randomness;
  modelInputs?: ModelInputs;
  sirState: SirState;
  stats: Stats;
}

export class Simulation {
  readonly R0 = 3.15;
  readonly RSeasonalityEffect = 0.10;
  readonly seasonPeak = '2020-01-15';
  readonly initialPopulation = 10_690_000;
  readonly exposedStart = 3;
  readonly vaccinationMaxRate = 0.75;
  readonly hospitalizationRateMean = settings.hospitalizationRate[0];
  readonly hospitalsOverwhelmedThreshold = 20_000;
  readonly hospitalsOverwhelmedMortalityMultiplier = 2;
  readonly hospitalsBaselineUtilization = 0.7;
  readonly infectionsWhenBordersOpen = 5;
  readonly infectionsWhenBordersClosed = 2;

  readonly rEmaUpdater = createEmaUpdater(7, this.R0);
  readonly stabilityEmaUpdater = createEmaUpdater(100, 1);

  // Durations of various model states
  readonly exposedDuration = 3;          // Duration people spend in exposed state
  readonly infectiousDuration = 5;       // How long people stay infectious before they isolate or get hospitalized
  readonly hospitalizationDuration = 7;  // Duration of hospitalization (TODO too short)
  readonly resistantDuration = 90;       // Immunity duration

  // These two are used to calculate the number of active cases
  readonly incubationDays = 5;       // Days until infection is detected
  readonly recoveryDuration = 14;    // How long is the infection considered active after entering the resistant state

  modelStates: DayState[] = [];
  sirStateBeforeStart: SirState = {
    suspectible: this.initialPopulation,
    exposed: 0,
    infectious: 0,
    resistant: 0,
    hospitalized: 0,
    dead: 0,
    exposedNew: 0,
    infectiousNew: 0,
    resistantNew: 0,
    hospitalizedNew: 0,
    deathsNew: 0,
  };

  constructor(startDate: string) {
    // pandemic params
    const sirState: SirState = {...this.sirStateBeforeStart};
    sirState.suspectible = this.initialPopulation - this.exposedStart;
    sirState.exposed = this.exposedStart;
    sirState.exposedNew = this.exposedStart;
    this.modelStates.push({date: startDate, sirState, stats: this.calcStats(sirState, undefined)});
  }

  private getSirStateInPast(n: number) {
    const i = this.modelStates.length - n;

    if (i >= 0) {
      return this.modelStates[i].sirState;
    } else {
      // days before the start of the epidemic have no sick people
      return this.sirStateBeforeStart;
    }
  }

  calcModelInputs(date: string, mitigationEffect: MitigationEffect): ModelInputs {
    const yesterday = last(this.modelStates)?.modelInputs;
    const seasonalityMult = 1 + this.getSeasonalityEffect(date);

    const bordersDrift = mitigationEffect.bordersClosed ?
      this.infectionsWhenBordersClosed : this.infectionsWhenBordersOpen;

    const prevVaccinationRate = yesterday?.vaccinationRate ? yesterday.vaccinationRate : 0;
    const vaccinationRate = Math.min(prevVaccinationRate + mitigationEffect.vaccinationPerDay, this.vaccinationMaxRate);

    const stabilityToday = Math.max(0, 1 - mitigationEffect.stabilityCost);
    const stability = this.stabilityEmaUpdater(yesterday?.stability, stabilityToday);

    const R = this.rEmaUpdater(yesterday?.R, this.R0 * mitigationEffect.mult * seasonalityMult);

    return {
      stability,
      seasonalityMult,
      bordersDrift,
      vaccinationRate,
      R,
      costToday: mitigationEffect.cost,
    };
  }

  calcSirState(modelInputs: ModelInputs, randomness: Randomness): SirState {
    const yesterday = this.getSirStateInPast(1);

    let suspectible = yesterday.suspectible;
    let exposed = yesterday.exposed;
    let infectious = yesterday.infectious;
    let resistant = yesterday.resistant;
    let hospitalized = yesterday.hospitalized;
    let dead = yesterday.dead;

    // Hospitals overwhelmedness logic
    const hospitalsUtilization = this.hospitalsBaselineUtilization + hospitalized / this.hospitalsOverwhelmedThreshold;
    const hospitalsOverwhelmedMultiplier = (hospitalsUtilization > 1) ?
      this.hospitalsOverwhelmedMortalityMultiplier : 1;

    // suspectible -> exposed
    const activePopulation = suspectible + exposed + infectious + resistant;
    const totalPopulation = activePopulation + hospitalized;
    // Simplifying assumption that only people in "suspectible" compartement are vaccinated
    const suspectibleUnvaccinated = Math.max(0, suspectible - totalPopulation * modelInputs.vaccinationRate);
    let exposedNew = infectious * randomness.rNoiseMult * modelInputs.R /
      this.infectiousDuration * suspectibleUnvaccinated / activePopulation;
    exposedNew += modelInputs.bordersDrift;
    exposedNew = Math.min(exposedNew, suspectible);
    suspectible -= exposedNew;
    exposed += exposedNew;

    // exposed -> infectious
    const infectiousNew = this.getSirStateInPast(this.exposedDuration).exposedNew;
    exposed -= infectiousNew;
    infectious += infectiousNew;

    // infectious -> resistant
    // infectious -> hospitalized
    const infectiousEnd = this.getSirStateInPast(this.infectiousDuration).infectiousNew;
    const hospitalizedNew = infectiousEnd * randomness.hospitalizationRate;
    let resistantNew = infectiousEnd - hospitalizedNew;
    infectious -= infectiousEnd;
    hospitalized += hospitalizedNew;
    // resistant will be updated in the next block

    // hospitalized -> resistant
    // hospitalized -> dead
    const hospitalizedEnd = this.getSirStateInPast(this.hospitalizationDuration).hospitalizedNew;
    const mortalityToday = hospitalsOverwhelmedMultiplier * randomness.baseMortality;
    const deathsNew = hospitalizedEnd * mortalityToday / this.hospitalizationRateMean;
    resistantNew += hospitalizedEnd - deathsNew;
    hospitalized -= hospitalizedEnd;
    dead += deathsNew;
    resistant += resistantNew;

    // resistant -> suspectible
    const resistantEnd = this.getSirStateInPast(this.resistantDuration).resistantNew;
    resistant -= resistantEnd;
    suspectible += resistantEnd;

    return {
      suspectible,
      exposed,
      infectious,
      resistant,
      hospitalized,
      dead,
      exposedNew,
      infectiousNew,
      resistantNew,
      hospitalizedNew,
      deathsNew,
    };
  }

  simOneDay(mitigationEffect: MitigationEffect): DayState {
    const date = nextDay(last(this.modelStates)!.date);
    const randomness: Randomness = {
      rNoiseMult: getRandom('R')(),
      baseMortality: getRandom('mortality')(),
      hospitalizationRate: getRandom('hospitalizationRate')(),
    };
    const modelInputs: ModelInputs = this.calcModelInputs(date, mitigationEffect);
    const sirState: SirState = this.calcSirState(modelInputs, randomness);
    const stats: Stats = this.calcStats(sirState, modelInputs);
    const state: DayState = {date, sirState, randomness, modelInputs, stats};
    this.modelStates.push(state);

    return state;
  }

  rewindOneDay() {
    this.modelStates.pop();
  }

  getLastStats() {
    return last(this.modelStates)?.stats;
  }

  getSeasonalityEffect(date: string): number {
    return this.RSeasonalityEffect * Math.cos(2 * Math.PI * getSeasonality(date, this.seasonPeak));
  }

  private calcMetricStats(name: string, todayUnrounded: number): MetricStats {
    const lastStat = this.getLastStats() as any;
    const prevTotalUnrounded = lastStat ? lastStat[name].totalUnrounded : 0;
    const prevTotal = lastStat ? lastStat[name].total : 0;
    const totalUnrounded = prevTotalUnrounded + todayUnrounded;
    const total = Math.round(totalUnrounded);
    const today = total - prevTotal;
    const sum7DayNDays = Math.min(7, this.modelStates.length + 1);
    let sum7Day = today;

    for (let i = 1; i < sum7DayNDays; ++i) {
      const stats = this.modelStates[this.modelStates.length - i].stats as any;
      sum7Day += stats[name].today;
    }

    return {
      total,
      today,
      totalUnrounded,
      avg7Day: sum7Day / sum7DayNDays,
    };
  }

  // TODO consider removal and computation on-the-fly
  calcStats(state: SirState, modelInputs?: ModelInputs): Stats {
    const lastStat = this.getLastStats();

    const detectedInfections = this.calcMetricStats('detectedInfections',
      this.getSirStateInPast(this.incubationDays).exposedNew);
    const resolvedInfections = this.calcMetricStats('resolvedInfections',
      this.getSirStateInPast(this.recoveryDuration).resistantNew + state.deathsNew);
    const deaths = this.calcMetricStats('deaths', state.deathsNew);

    const costTotal = (lastStat ? lastStat.costTotal : 0) + (modelInputs ? modelInputs.costToday : 0);

    const stats = {
      detectedInfections,
      resolvedInfections,
      deaths,
      activeInfections: detectedInfections.total - resolvedInfections.total,
      mortality: deaths.total / detectedInfections.total,
      costTotal,
      hospitalizationCapacity: this.hospitalsBaselineUtilization + state.hospitalized /
        this.hospitalsOverwhelmedThreshold,
      vaccinationRate: modelInputs ? modelInputs.vaccinationRate : 0,
    };

    return stats;
  }
}

function createEmaUpdater(halfLife: number, initialValue: number) {
  const alpha = Math.pow(0.5, 1 / halfLife);
  return (old: number | undefined, update: number) => {
    const prev = (old === undefined) ? initialValue : old;

    return prev * alpha + update * (1 - alpha);
  };
}

