import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import Home from '../app/page';
import presets from '../data/presets.json';
const city = vi.hoisted(() => ({ props: {} as any }));
vi.mock('@/components/world/City', () => ({
  default: (props: any) => {
    city.props = props;
    return null;
  },
}));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: any) => children,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <p>{children}</p>,
}));
let registry: Record<string, any>,
  pending: { scenario: any; resolve: (r: Response) => void }[],
  root: Root,
  container: HTMLDivElement;
const response = (prediction: number) =>
  new Response(
    JSON.stringify({
      prediction,
      modelVersion: 'seoulbike-uci560-gbr-v1',
      warnings: [],
      explanation: { contributions: [] },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
const read = () => registry.read_seoulbike_scenario.execute();
const tick = async (ms = 1) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const start = async (index: number) => {
  await act(async () => {
    registry.apply_seoulbike_scenario
      .execute({ scenario: presets[index].scenario })
      .catch(() => {});
  });
};
beforeEach(async () => {
  vi.useFakeTimers();
  registry = {};
  pending = [];
  historyPlan = null;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    value: {
      registerTool: (tool: any) => {
        registry[tool.name] = tool;
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: any) => {
      if (url.includes('/api/history'))
        return Promise.resolve(new Response(JSON.stringify(historyPlan)));
      if (url.includes('/data/'))
        return Promise.resolve(
          new Response(
            JSON.stringify(
              url.includes('playback') ? { label: 'test', rows: [] } : {},
            ),
          ),
        );
      return new Promise((resolve) =>
        pending.push({
          scenario: JSON.parse(init.body).scenario,
          resolve: resolve as any,
        }),
      );
    }),
  );
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Home />));
  await tick();
  expect(pending.length).toBe(1);
  await act(async () => pending[0].resolve(response(1364.578)));
  await tick();
  expect(read().prediction.prediction).toBe(1364.578);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
test('an old response cannot apply while the newer edit is still debouncing', async () => {
  await start(1);
  await tick(600);
  expect(pending.length).toBe(2);
  await start(2);
  await act(async () => pending[1].resolve(response(50)));
  await tick(10);
  expect(read().phase).toBe('editing');
  expect(read().prediction.prediction).toBe(1364.578);
  expect(read().draft.rainfall).toBe(presets[2].scenario.rainfall);
  await tick(600);
  await act(async () => pending[2].resolve(response(234)));
  await tick(100);
  expect(read().phase).toBe('applied');
  expect(read().applied).toEqual(presets[2].scenario);
  expect(read().prediction.prediction).toBe(234);
});
test('responses arriving B then A leave B authoritative', async () => {
  await start(1);
  await tick(600);
  await start(2);
  await tick(600);
  await act(async () => pending[2].resolve(response(234)));
  await tick(100);
  await act(async () => pending[1].resolve(response(50)));
  await tick(100);
  expect(read().applied).toEqual(presets[2].scenario);
  expect(read().prediction.prediction).toBe(234);
});
test('a service error retains the previous applied estimate and visible warning', async () => {
  await start(1);
  await tick(600);
  await act(async () =>
    pending[1].resolve(
      new Response(JSON.stringify({ error: 'Prediction unavailable' }), {
        status: 503,
      }),
    ),
  );
  await tick(100);
  expect(read().phase).toBe('error');
  expect(read().prediction.prediction).toBe(1364.578);
  expect(read().applied).toEqual(presets[0].scenario);
  expect(container.textContent).toContain('Previous estimate');
  expect(container.textContent).toContain('Prediction unavailable');
});
test('invalid complete-scenario tool input fails without corrupting state', async () => {
  await expect(
    registry.apply_seoulbike_scenario.execute({
      scenario: { temperature: 20 },
    }),
  ).rejects.toThrow();
  expect(read().phase).toBe('applied');
  expect(read().applied).toEqual(presets[0].scenario);
  expect(pending.length).toBe(1);
});

let historyPlan: any;
const clickButton = async (label: string) => {
  const button = Array.from(container.querySelectorAll('button')).find(
    (b) =>
      b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  );
  expect(button, label).toBeTruthy();
  await act(async () => button!.click());
};
const runPeriod = async (mode: 'range' | 'continuous' = 'range') => {
  historyPlan = {
    start: '2018-09-04T06:00',
    end: mode === 'range' ? '2018-09-04T08:00' : '2018-09-05T06:00',
    mode,
    hours: mode === 'range' ? 2 : 24,
    rows: Array.from({ length: mode === 'range' ? 2 : 24 }, (_, i) => ({
      scenario: {
        ...presets[0].scenario,
        hour: (6 + i) % 24,
        date: i < 18 ? '2018-09-04' : '2018-09-05',
      },
      observed: 100 + i,
      partition: 'Training demonstration',
    })),
  };
  await clickButton('Time range and continuous playback');
  if (mode === 'continuous') await clickButton('Continuous');
  await clickButton(
    mode === 'range' ? 'Run this time range' : 'Start continuous playback',
  );
  await tick();
  expect(city.props.playing).toBe(false);
  await act(async () => pending.at(-1)!.resolve(response(1000)));
  await tick();
};
test('numeric popup displays a decrease with before/after counts then fades', async () => {
  await start(1);
  await tick(600);
  await act(async () => pending.at(-1)!.resolve(response(50.0387)));
  await tick();
  const toast = container.querySelector('.toast-stack');
  expect(toast?.textContent).toContain('−1,315 rentals/hour');
  expect(toast?.textContent).toContain('1,365 → 50 rentals/hour');
  await tick(5600);
  expect(
    container.querySelector('.toast-stack')?.textContent || '',
  ).not.toContain('−1,315');
  await clickButton('Event history');
  expect(container.querySelector('.event-item')?.textContent).toContain(
    '−1,315 rentals/hour',
  );
});
test('range pauses for each prediction, keeps the network, stops at end and replays cleanly', async () => {
  await runPeriod();
  const reset = city.props.reset;
  expect(city.props.stopAtSeconds).toBe(3600);
  await act(async () => city.props.onTimeBoundary());
  await tick();
  expect(city.props.playing).toBe(false);
  expect(city.props.reset).toBe(reset);
  expect(pending.at(-1)!.scenario.hour).toBe(7);
  expect(read().timeline.totals).toEqual({
    estimated: 1000,
    observed: 100,
    hours: 1,
  });
  await act(async () => pending.at(-1)!.resolve(response(600)));
  await tick();
  expect(city.props.playing).toBe(true);
  expect(city.props.stopAtSeconds).toBe(7200);
  await act(async () => city.props.onTimeBoundary());
  await tick();
  expect(city.props.playing).toBe(false);
  expect(read().timeline.totals).toEqual({
    estimated: 1600,
    observed: 201,
    hours: 2,
  });
  expect(read().timeline.finishedAt).toBe('2018-09-04T08:00');
  await clickButton('Replay time range');
  await tick();
  expect(read().timeline.finishedAt).toBeNull();
  expect(city.props.reset).toBe(reset + 1);
  expect(read().timeline.totals.hours).toBe(0);
});
test('continuous playback loops all 24 hours without resetting active journeys', async () => {
  await runPeriod('continuous');
  const reset = city.props.reset;
  for (let i = 0; i < 24; i++) {
    await act(async () => city.props.onTimeBoundary());
    await tick();
    await act(async () => pending.at(-1)!.resolve(response(1000)));
    await tick();
  }
  expect(read().timeline.active).toBe(true);
  expect(read().timeline.index).toBe(0);
  expect(read().timeline.totals.hours).toBe(24);
  expect(city.props.reset).toBe(reset);
  expect(city.props.stopAtSeconds).toBe(25 * 3600);
  expect(city.props.playing).toBe(true);
});
test('time playback failures pause at the boundary and stop cancels the pending hour', async () => {
  await runPeriod();
  await act(async () => city.props.onTimeBoundary());
  await tick();
  await act(async () =>
    pending
      .at(-1)!
      .resolve(
        new Response(JSON.stringify({ error: 'Unavailable' }), { status: 503 }),
      ),
  );
  await tick();
  expect(read().phase).toBe('error');
  expect(city.props.playing).toBe(false);
  expect(read().timeline.totals.hours).toBe(1);
  expect(read().applied.hour).toBe(6);
  await clickButton('Stop time playback');
  await tick();
  expect(read().timeline.active).toBe(false);
  expect(read().phase).toBe('applied');
  expect(city.props.playing).toBe(false);
});

test('activity readout changes immediately while city controls preserve prediction and simulation reset', async () => {
  await start(1);
  await tick(600);
  await act(async () => pending.at(-1)!.resolve(response(50)));
  await tick();
  expect(container.querySelector('.activity-rate')?.textContent).toContain(
    '5.0',
  );
  expect(city.props.prediction).toBe(50);
  const reset = city.props.reset;
  await clickButton('Explore Seoul');
  await clickButton('Map from aboveNorth at the top; see the road network');
  expect(city.props.view).toBe('map');
  expect(city.props.reset).toBe(reset);
  expect(read().prediction.prediction).toBe(50);
});
