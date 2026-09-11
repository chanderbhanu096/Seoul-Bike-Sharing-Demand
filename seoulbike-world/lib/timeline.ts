import type { Scenario } from './scenario';
export type HistoricalHour = {
  scenario: Scenario;
  observed: number;
  partition: string;
};
export type TimelinePlan = {
  rows: HistoricalHour[];
  start: string;
  end: string;
  mode: 'range' | 'continuous';
  hours: number;
};
export const SOURCE_START = '2017-12-01T00:00';
export const SOURCE_END = '2018-12-01T00:00';
const HOUR = 3600000;
export function timelineWindow(
  date: string,
  startHour: number,
  endDate: string,
  endHour: number,
  mode: 'range' | 'continuous',
) {
  const validDate = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s + 'T00:00Z')) &&
    new Date(s + 'T00:00Z').toISOString().slice(0, 10) === s;
  if (
    !validDate(date) ||
    !Number.isInteger(startHour) ||
    startHour < 0 ||
    startHour > 23 ||
    (mode === 'range' &&
      (!validDate(endDate) ||
        !Number.isInteger(endHour) ||
        endHour < 0 ||
        endHour > 23))
  )
    throw Error(
      'Choose valid calendar dates and whole hours from 00:00 to 23:00.',
    );
  if (mode !== 'range' && mode !== 'continuous')
    throw Error('Choose a time range or continuous playback.');
  const start = Date.parse(`${date}T00:00Z`) + startHour * HOUR;
  let end =
    mode === 'continuous'
      ? start + 24 * HOUR
      : Date.parse(`${endDate}T00:00Z`) + endHour * HOUR;
  if (mode === 'range' && endDate === date && end <= start) end += 24 * HOUR;
  if (end <= start) throw Error('The end of the period must follow its start.');
  if (
    start < Date.parse(SOURCE_START + 'Z') ||
    end > Date.parse(SOURCE_END + 'Z')
  )
    throw Error(
      'Complete observations are available from 1 December 2017 through 30 November 2018. Choose a period within those dates.',
    );
  return {
    start: new Date(start).toISOString().slice(0, 16),
    end: new Date(end).toISOString().slice(0, 16),
    hours: (end - start) / HOUR,
    startIndex: (start - Date.parse(SOURCE_START + 'Z')) / HOUR,
  };
}
export function timelineStepBudget(
  time: number,
  requestedSeconds: number,
  stopAt?: number,
) {
  return Math.max(
    0,
    stopAt === undefined
      ? requestedSeconds
      : Math.min(requestedSeconds, stopAt - time),
  );
}
export function timelineClock(hour: number, elapsedSeconds: number) {
  const mins = Math.max(
    0,
    Math.min(60, Math.floor((elapsedSeconds + 1e-7) / 60)),
  );
  return `${String((hour + Math.floor(mins / 60)) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
