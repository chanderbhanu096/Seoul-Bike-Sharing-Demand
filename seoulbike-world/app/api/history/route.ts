import observations from '@/data/history.json';
import { timelineWindow } from '@/lib/timeline';
import { seasonForDate, type Scenario } from '@/lib/scenario';
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const mode = q.get('mode') || 'range';
    if (mode !== 'range' && mode !== 'continuous')
      throw Error('Invalid playback mode.');
    const window = timelineWindow(
      q.get('date') || '',
      Number(q.get('start')),
      q.get('endDate') || q.get('date') || '',
      Number(q.get('end')),
      mode,
    );
    const rows = observations
      .slice(window.startIndex, window.startIndex + window.hours)
      .map((r, offset) => {
        const iso = new Date(
          Date.parse(window.start + 'Z') + offset * 3600000,
        ).toISOString();
        const date = iso.slice(0, 10);
        const scenario: Scenario = {
          date,
          hour: Number(iso.slice(11, 13)),
          temperature: r[1] as number,
          humidity: r[2] as number,
          windSpeed: r[3] as number,
          visibility: r[4] as number,
          dewPoint: r[5] as number,
          solarRadiation: r[6] as number,
          rainfall: r[7] as number,
          snowfall: r[8] as number,
          holiday: r[9] as boolean,
          functioning: r[10] as boolean,
          season: seasonForDate(date),
        };
        return {
          scenario,
          observed: r[0],
          partition:
            date > '2018-09-18' ? 'Final holdout' : 'Training demonstration',
        };
      });
    return Response.json(
      { rows, start: window.start, end: window.end, hours: window.hours, mode },
      { headers: { 'Cache-Control': 'public, max-age=86400' } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : 'Historical period unavailable.',
      },
      { status: 422 },
    );
  }
}
