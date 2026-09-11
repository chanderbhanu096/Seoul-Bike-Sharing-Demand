export type Scenario = {
  date: string;
  hour: number;
  temperature: number;
  humidity: number;
  windSpeed: number;
  visibility: number;
  dewPoint: number;
  solarRadiation: number;
  rainfall: number;
  snowfall: number;
  season: 'Winter' | 'Spring' | 'Summer' | 'Autumn';
  holiday: boolean;
  functioning: boolean;
};
export type Prediction = {
  prediction: number;
  modelVersion: string;
  warnings: string[];
  rawPrediction?: number;
  contributions?: { feature: string; change: number }[];
};
export const initialScenario: Scenario = {
  date: '2018-09-17',
  hour: 17,
  temperature: 24.1,
  humidity: 53,
  windSpeed: 1.8,
  visibility: 2000,
  dewPoint: 13.9,
  solarRadiation: 1.1,
  rainfall: 0,
  snowfall: 0,
  season: 'Autumn',
  holiday: false,
  functioning: true,
};
export const seasonForDate = (date: string): Scenario['season'] => {
  const month = Number(date.slice(5, 7));
  return month === 12 || month < 3
    ? 'Winter'
    : month < 6
      ? 'Spring'
      : month < 9
        ? 'Summer'
        : 'Autumn';
};
export const featureLabels: Record<string, string> = {
  date: 'Date',
  hour: 'Hour',
  temperature: 'Temperature',
  humidity: 'Humidity',
  windSpeed: 'Wind speed',
  visibility: 'Visibility',
  dewPoint: 'Dew point',
  solarRadiation: 'Solar radiation',
  rainfall: 'Rainfall',
  snowfall: 'Snowfall',
  season: 'Season',
  holiday: 'Holiday',
  functioning: 'Service operating',
};
export const featureUnits: Record<string, string> = {
  temperature: '°C',
  humidity: '%',
  windSpeed: 'm/s',
  visibility: '×10 m',
  dewPoint: '°C',
  solarRadiation: 'MJ/m²',
  rainfall: 'mm',
  snowfall: 'cm',
};
export const deltaText = (value: number, base: number) =>
  base === 0
    ? `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString()} rentals vs baseline`
    : `${Math.abs(((value - base) / base) * 100).toFixed(1)}% ${value >= base ? 'above' : 'below'} baseline`;

export function rentalChange(previous: number, current: number) {
  const from = Math.round(previous),
    to = Math.round(current),
    difference = to - from;
  const direction =
    difference > 0 ? 'increase' : difference < 0 ? 'decrease' : 'unchanged';
  const percent =
    previous === 0 ? null : ((current - previous) / previous) * 100;
  return {
    from,
    to,
    difference,
    percent,
    direction,
    title:
      difference === 0
        ? 'Rental estimate unchanged'
        : `Rental activity ${difference > 0 ? 'increasing' : 'decreasing'}`,
    headline: `${difference > 0 ? '+' : difference < 0 ? '−' : ''}${Math.abs(difference).toLocaleString()} rentals/hour`,
    detail: `${from.toLocaleString()} → ${to.toLocaleString()} rentals/hour${percent === null ? '' : ` · ${Math.abs(percent).toFixed(1)}% ${direction === 'unchanged' ? 'change' : direction}`}`,
  };
}
