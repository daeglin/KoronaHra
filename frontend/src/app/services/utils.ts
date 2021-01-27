import {addDays, differenceInDays, format} from 'date-fns';

export function nextDay(day: string): string {
  // works internally with local time (TZ-resistant)
  const date = addDays(new Date(`${day}T00:00`), 1);
  return format(date, 'yyyy-MM-dd');
}

export function dateDiff(laterDate: string, earlierDate: string) {
  return differenceInDays(new Date(`${laterDate}T00:00`), new Date(`${earlierDate}T00:00`));
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

export function indexByFraction<T>(array: Readonly<T[]>, i: number) {
  if (array.length === 0) return undefined;
  const idx = Math.floor(i * array.length);
  return array[idx];
}
