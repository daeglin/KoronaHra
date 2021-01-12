import {addDays, differenceInDays, format} from 'date-fns';

export function nextDay(day: string): string {
  // works internally with local time (TZ-resistant)
  const date = addDays(new Date(`${day}T00:00`), 1);
  return format(date, 'yyyy-MM-dd');
}

export function dateDiff(laterDate: string, earlierDate: string) {
  return differenceInDays(new Date(`${laterDate}T00:00`), new Date(`${earlierDate}T00:00`));
}

// Create 3 sigma clipped function sampling from log normal (math checks out for sigma << mode)
export function clippedLogNormalSampler(mode: number, sigma: number) {
  return () => mode * Math.exp(clippedRandn() * sigma / mode);
}

// 3 sigma clipped normal distribution
function clippedRandn() {
  let r = randn();
  while (Math.abs(r) > 3) {
    r = randn();
  }

  return r;
}

function randn() {
  const u = 1 - Math.random();
  const v = Math.random();

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Returns seasonal stage of the year in the interval [0, .5]
 * @param date actual date
 * @param peak date of the season
 */
export function getSeasonality(date: string, peak: string) {
  const tropicalYearLength = 365.2422;
  const daysDistance = Math.abs(dateDiff(date, peak));
  const seasonalityPhase = (daysDistance / tropicalYearLength) % 1;

  return seasonalityPhase > .5 ? 1 - seasonalityPhase : seasonalityPhase;
}
