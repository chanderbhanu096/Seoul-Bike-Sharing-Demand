'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import City from '@/components/world/City';
import { CITY_VIEWS, type CityView } from '@/lib/world/geography';
import {
  type Scenario,
  type Prediction,
  seasonForDate,
  featureLabels,
  featureUnits,
  deltaText,
  rentalChange,
} from '@/lib/scenario';
import {
  timelineWindow,
  timelineClock,
  type TimelinePlan,
} from '@/lib/timeline';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import presetsData from '@/data/presets.json';
import { VISUAL_SCALE, ROUTE_VERSION } from '@/lib/world/simulation';
import { validateScenario } from '@/lib/inference';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Bike,
  Map,
  TreePine,
  Waves,
  Sun,
  CloudRain,
  Snowflake,
  Moon,
  SlidersHorizontal,
  Play,
  Pause,
  Compass,
  Maximize,
  Minimize,
  Layers,
  History,
  ArrowUpRight,
  Wind,
  Pin,
  Check,
  X,
  Info,
  Settings,
  Focus,
  RotateCcw,
  Download,
  ArrowRight,
  ChevronRight,
  LoaderCircle,
  CalendarClock,
  TrendingUp,
  TrendingDown,
  Repeat2,
  Square,
  MoreHorizontal,
  ChevronLeft,
} from 'lucide-react';
type Explanation = {
  method: string;
  contributions: { label: string; delta: number; fields: string[] }[];
};
type Result = Prediction & { explanation?: Explanation };
type Snapshot = {
  scenario: Scenario;
  result: Result;
  visualScale: number;
  seed: number;
  routeVersion: string;
  savedAt: string;
};
type WorldEvent = {
  id: number;
  title: string;
  body: string;
  time: string;
  change?: ReturnType<typeof rentalChange>;
};
type Preset = {
  id: string;
  label: string;
  description: string;
  scenario: Scenario;
  observed: number;
  prediction: number;
  partition: string;
};
type HistoryRow = { scenario: Scenario; prediction: number; observed: number };
const presets = presetsData as Preset[],
  first = presets[0].scenario;
const snapshot = (scenario: Scenario, result: Result): Snapshot => ({
  scenario: { ...scenario },
  result: { ...result },
  visualScale: VISUAL_SCALE,
  seed: 42317,
  routeVersion: ROUTE_VERSION,
  savedAt: new Date().toISOString(),
});
const controls: {
  key: keyof Scenario;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}[] = [
  { key: 'hour', label: 'Hour of day', min: 0, max: 23, step: 1, unit: ':00' },
  {
    key: 'temperature',
    label: 'Temperature',
    min: -20,
    max: 40,
    step: 0.1,
    unit: '°C',
  },
  {
    key: 'rainfall',
    label: 'Rainfall',
    min: 0,
    max: 35,
    step: 0.1,
    unit: 'mm',
  },
  { key: 'humidity', label: 'Humidity', min: 0, max: 100, step: 1, unit: '%' },
  {
    key: 'windSpeed',
    label: 'Wind speed',
    min: 0,
    max: 8,
    step: 0.1,
    unit: 'm/s',
  },
  { key: 'snowfall', label: 'Snowfall', min: 0, max: 9, step: 0.1, unit: 'cm' },
  {
    key: 'visibility',
    label: 'Visibility',
    min: 0,
    max: 2000,
    step: 10,
    unit: '×10 m',
  },
  {
    key: 'solarRadiation',
    label: 'Solar radiation',
    min: 0,
    max: 4,
    step: 0.01,
    unit: 'MJ/m²',
  },
  {
    key: 'dewPoint',
    label: 'Dew point',
    min: -35,
    max: 28,
    step: 0.1,
    unit: '°C',
  },
];
const fmt = (s: Scenario, key: string) => {
  const v = s[key as keyof Scenario];
  return typeof v === 'boolean'
    ? v
      ? 'Yes'
      : 'No'
    : `${v}${featureUnits[key] ? ' ' + featureUnits[key] : ''}`;
};
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
export default function Home() {
  const [draft, setDraft] = useState<Scenario>({ ...first }),
    [commitTick, setCommitTick] = useState(0),
    [applied, setApplied] = useState<Scenario>({ ...first }),
    [result, setResult] = useState<Result | null>(null),
    [baseline, setBaseline] = useState<Snapshot | null>(null),
    [phase, setPhase] = useState<
      'editing' | 'calculating' | 'applied' | 'error'
    >('calculating'),
    [error, setError] = useState(''),
    [worldError, setWorldError] = useState(''),
    [ready, setReady] = useState(false),
    [panel, setPanel] = useState<string | null>(null),
    [mobileUi, setMobileUi] = useState(false),
    [mode, setMode] = useState('guided'),
    [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(1),
    [overview, setOverview] = useState(0),
    [reset, setReset] = useState(0),
    [follow, setFollow] = useState(false),
    [followId, setFollowId] = useState<number | null>(null),
    [reduced, setReduced] = useState(false),
    [quality, setQuality] = useState(true),
    [labels, setLabels] = useState(true),
    [cityView, setCityView] = useState<CityView>('overview'),
    [activity, setActivity] = useState(true),
    [trails, setTrails] = useState(true),
    [emphasize, setEmphasize] = useState(true),
    [waterMotion, setWaterMotion] = useState(true),
    [cinematic, setCinematic] = useState(false),
    [persistent, setPersistent] = useState(false),
    [extended, setExtended] = useState(false),
    [events, setEvents] = useState<WorldEvent[]>([]),
    [visibleEvents, setVisibleEvents] = useState<WorldEvent[]>([]),
    [stats, setStats] = useState({
      riders: 0,
      departures: 0,
      minutes: 0,
      fps: 0,
    }),
    [comparison, setComparison] = useState<'A' | 'B' | null>(null),
    [historical, setHistorical] = useState(false),
    [timelinePlan, setTimelinePlan] = useState<TimelinePlan | null>(null),
    [timelineIndex, setTimelineIndex] = useState(0),
    [timelineSegment, setTimelineSegment] = useState(0),
    [timelineMode, setTimelineMode] = useState<'range' | 'continuous'>('range'),
    [timelineDate, setTimelineDate] = useState('2018-09-04'),
    [timelineEndDate, setTimelineEndDate] = useState('2018-09-04'),
    [timelineStart, setTimelineStart] = useState(6),
    [timelineEnd, setTimelineEnd] = useState(22),
    [timelineLoading, setTimelineLoading] = useState(false),
    [timelineError, setTimelineError] = useState(''),
    [timelineTotals, setTimelineTotals] = useState({
      estimated: 0,
      observed: 0,
      hours: 0,
    }),
    [finishedAt, setFinishedAt] = useState<string | null>(null),
    [historyIndex, setHistoryIndex] = useState(0),
    [historyData, setHistoryData] = useState<{
      label: string;
      rows: HistoryRow[];
    } | null>(null),
    [report, setReport] = useState<any>(null),
    [sourceLabel, setSourceLabel] = useState(
      'Autumn afternoon · historical preset',
    );
  useEffect(() => {
    const query = window.matchMedia(
      '(max-width: 767px), (max-width: 1100px) and (max-height: 600px) and (pointer: coarse)',
    );
    const update = () => setMobileUi(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const panelBody = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (panelBody.current) panelBody.current.scrollTop = 0;
  }, [panel]);
  const timelineRequest = useRef(0),
    sliderEditing = useRef(false),
    revision = useRef(0),
    abort = useRef<AbortController | null>(null),
    skip = useRef(false),
    baseRef = useRef<Snapshot | null>(null),
    appliedRef = useRef(applied),
    resultRef = useRef(result),
    scenarioB = useRef<Snapshot | null>(null),
    persistentRef = useRef(persistent),
    durationRef = useRef(extended),
    eventId = useRef(0),
    timers = useRef(new Set<ReturnType<typeof setTimeout>>()),
    historySource = useRef(false),
    initialized = useRef(false);
  baseRef.current = baseline;
  appliedRef.current = applied;
  resultRef.current = result;
  persistentRef.current = persistent;
  durationRef.current = extended;
  const notify = useCallback(
    (title: string, body: string, change?: ReturnType<typeof rentalChange>) => {
      const e = {
        id: ++eventId.current,
        title,
        body,
        change,
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setEvents((v) => [e, ...v].slice(0, 1000));
      setVisibleEvents((v) => [...v, e].slice(-2));
      if (!persistentRef.current) {
        const timer = setTimeout(
          () => {
            setVisibleEvents((v) => v.filter((x) => x.id !== e.id));
            timers.current.delete(timer);
          },
          durationRef.current ? 12000 : 5500,
        );
        timers.current.add(timer);
      }
    },
    [],
  );
  useEffect(() => {
    setReduced(matchMedia('(prefers-reduced-motion: reduce)').matches);
    try {
      const saved = JSON.parse(
        localStorage.getItem('seoulbike-baseline-v1') || 'null',
      );
      if (
        saved &&
        saved.result?.modelVersion === 'seoulbike-uci560-gbr-v1' &&
        validateScenario(saved.scenario).length === 0 &&
        Number.isFinite(saved.result.prediction) &&
        saved.result.prediction >= 0 &&
        saved.visualScale === VISUAL_SCALE &&
        saved.routeVersion === ROUTE_VERSION
      )
        setBaseline(saved);
    } catch {}
    fetch('/data/playback.json')
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((value) =>
        setHistoryData(value as { label: string; rows: HistoryRow[] }),
      )
      .catch(() => {});
    fetch('/data/evaluation.json')
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setReport)
      .catch(() => {});
    return () => {
      abort.current?.abort();
      timers.current.forEach(clearTimeout);
    };
  }, []);
  const edit = useCallback(
    (s: Scenario, label = 'Custom conditions', fromHistory = false) => {
      if (label !== 'Custom conditions') sliderEditing.current = false;
      revision.current++;
      abort.current?.abort();
      setError('');
      setDraft({ ...s });
      setPhase('editing');
      setSourceLabel(label);
      setComparison(null);
      scenarioB.current = null;
      if (!fromHistory) {
        setHistorical(false);
        setFinishedAt(null);
        setTimelinePlan(null);
        timelineRequest.current++;
        setTimelineLoading(false);
      }
      historySource.current = fromHistory;
    },
    [],
  );
  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (sliderEditing.current) return;
    const currentRevision = revision.current;
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(
      async () => {
        setPhase('calculating');
        try {
          const response = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scenario: draft,
              baseline: baseRef.current?.scenario,
            }),
            signal: controller.signal,
          });
          const body = (await response.json()) as Result & { error?: string };
          if (!response.ok)
            throw Error(body.error || 'Prediction service unavailable.');
          if (revision.current !== currentRevision) return;
          if (!Number.isFinite(body.prediction) || body.prediction < 0)
            throw Error('The prediction service returned an invalid estimate.');
          const old = appliedRef.current,
            hadResult = !!resultRef.current;
          setApplied({ ...draft });
          setResult(body);
          setPhase('applied');
          setError('');
          if (!baseRef.current) {
            const saved = snapshot(draft, body);
            setBaseline(saved);
          }
          if (hadResult) {
            const changed = Object.keys(draft).filter(
              (k) => draft[k as keyof Scenario] !== old[k as keyof Scenario],
            );
            const detail = changed
              .slice(0, 2)
              .map(
                (k) => `${featureLabels[k]}: ${fmt(old, k)} → ${fmt(draft, k)}`,
              )
              .join(' · ');
            const change = rentalChange(
              resultRef.current!.prediction,
              body.prediction,
            );
            notify(
              change.title,
              `${historySource.current ? 'New hourly observation applied.' : `${detail}${changed.length > 2 ? ` · ${changed.length - 2} more inputs` : ''}.`} ${baseRef.current ? `Pinned baseline: ${deltaText(body.prediction, baseRef.current.result.prediction)}.` : ''}`,
              change,
            );
          }
          if (body.warnings.length && !historySource.current)
            notify('Scenario note', body.warnings.join(' '));
          if (!initialized.current) {
            initialized.current = true;
            notify(
              'Welcome to SeoulBike World',
              'Explore the city, then change the conditions. Every estimate comes from the trained model. Use Time range to let the hours advance.',
            );
          }
        } catch (e) {
          if (controller.signal.aborted || revision.current !== currentRevision)
            return;
          const message =
            e instanceof Error ? e.message : 'Prediction unavailable.';
          setError(message);
          setPhase('error');
          notify(
            'Prediction unavailable',
            'The last applied estimate and cycling activity have been retained.',
          );
        }
      },
      initialized.current && !historySource.current ? 550 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, commitTick, notify]);
  const pin = () => {
    if (!result || phase !== 'applied') return;
    const saved = snapshot(applied, result);
    setBaseline(saved);
    setComparison(null);
    scenarioB.current = null;
    try {
      localStorage.setItem('seoulbike-baseline-v1', JSON.stringify(saved));
      notify(
        'Baseline pinned',
        `${Math.round(result.prediction).toLocaleString()} rentals/hour. The complete scenario is saved on this device.`,
      );
    } catch {
      notify(
        'Baseline pinned for this visit',
        'Browser storage is unavailable. Download the scenario to keep it.',
      );
    }
  };
  const replay = (side: 'A' | 'B') => {
    if (!baseline || !result || phase !== 'applied') return;
    timelineRequest.current++;
    setTimelineLoading(false);
    setTimelinePlan(null);
    if (!scenarioB.current) scenarioB.current = snapshot(applied, result);
    const selected = side === 'A' ? baseline : scenarioB.current;
    revision.current++;
    abort.current?.abort();
    skip.current = true;
    setDraft({ ...selected.scenario });
    setApplied({ ...selected.scenario });
    setResult(selected.result);
    setComparison(side);
    setReset((n) => n + 1);
    setStats({ riders: 0, departures: 0, minutes: 0, fps: stats.fps });
    setFollow(false);
    setHistorical(false);
    setFinishedAt(null);
    setPhase('applied');
    setSourceLabel(
      side === 'A' ? 'Replay A · pinned baseline' : 'Replay B · scenario',
    );
    setPlaying(true);
    notify(
      `Playing ${side === 'A' ? 'baseline A' : 'scenario B'}`,
      'Replay begins from an empty network with the same camera, routes, visual scale and seed.',
    );
  };
  const restore = () => {
    if (!baseline) return;
    edit(baseline.scenario, 'Restored baseline');
    notify(
      'Baseline restored',
      'Applying the saved inputs. Existing journeys will continue.',
    );
  };
  const download = () => {
    if (!result) return;
    const payload = {
      ...snapshot(applied, result),
      baseline,
      comparison,
      simulation: {
        elapsedMinutes: stats.minutes,
        departures: stats.departures,
        timeline: timelinePlan
          ? {
              start: timelinePlan.start,
              end: timelinePlan.end,
              mode: timelinePlan.mode,
              index: timelineIndex,
              completedHours: timelineTotals.hours,
              completedHourTotals: timelineTotals,
            }
          : null,
      },
      target: 'Estimated recorded rentals/hour; not concurrent cyclists',
      spatialAssumptions:
        'Fixed illustrative connected routes and station allocation',
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `seoulbike-${applied.date}-${applied.hour}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const startTimeline = async (options?: {
    date: string;
    start: number;
    endDate: string;
    end: number;
    mode: 'range' | 'continuous';
  }) => {
    const values = options ?? {
      date: timelineDate,
      start: timelineStart,
      endDate: timelineEndDate,
      end: timelineEnd,
      mode: timelineMode,
    };
    const requestId = ++timelineRequest.current;
    setTimelineLoading(true);
    setTimelineError('');
    try {
      timelineWindow(
        values.date,
        values.start,
        values.endDate,
        values.end,
        values.mode,
      );
      const query = new URLSearchParams({
        date: values.date,
        start: String(values.start),
        endDate: values.endDate,
        end: String(values.end),
        mode: values.mode,
      });
      const response = await fetch(`/api/history?${query}`);
      const plan = (await response.json()) as TimelinePlan & { error?: string };
      if (requestId !== timelineRequest.current) return;
      if (!response.ok || !plan.rows?.length)
        throw Error(plan.error || 'This period is unavailable.');
      setTimelinePlan(plan);
      setTimelineIndex(0);
      setTimelineSegment(0);
      setTimelineTotals({ estimated: 0, observed: 0, hours: 0 });
      setFinishedAt(null);
      setReset((v) => v + 1);
      setStats({ riders: 0, departures: 0, minutes: 0, fps: stats.fps });
      setHistorical(true);
      setPlaying(true);
      setFollow(false);
      edit(
        plan.rows[0].scenario,
        `${plan.mode === 'continuous' ? 'Continuous cycle' : 'Time range'} · ${plan.rows[0].partition}`,
        true,
      );
      setPanel(null);
      notify(
        plan.mode === 'continuous'
          ? 'Continuous playback started'
          : 'Time range started',
        `${plan.start.replace('T', ' ')} → ${plan.end.replace('T', ' ')}. ${plan.hours} recorded hours${plan.mode === 'continuous' ? ', repeated continuously' : ''}.`,
      );
    } catch (e) {
      if (requestId === timelineRequest.current)
        setTimelineError(
          e instanceof Error ? e.message : 'Unable to load this period.',
        );
    } finally {
      if (requestId === timelineRequest.current) setTimelineLoading(false);
    }
  };
  const startHistory = (index = 0) => {
    if (!historyData?.rows[index]) return;
    const row = historyData.rows[index];
    setHistoryIndex(index);
    void startTimeline({
      date: row.scenario.date,
      start: row.scenario.hour,
      endDate: row.scenario.date,
      end: 0,
      mode: 'range',
    });
  };
  const stopTimeline = () => {
    revision.current++;
    abort.current?.abort();
    timelineRequest.current++;
    skip.current = true;
    setDraft({ ...appliedRef.current });
    setPhase(resultRef.current ? 'applied' : 'calculating');
    setHistorical(false);
    setPlaying(false);
    setTimelineLoading(false);
    setSourceLabel('Time playback stopped · current hour retained');
  };
  const onTimeBoundary = () => {
    if (!historical || !timelinePlan || !result || phase !== 'applied') return;
    const totals = {
      estimated: timelineTotals.estimated + result.prediction,
      observed:
        timelineTotals.observed + timelinePlan.rows[timelineIndex].observed,
      hours: timelineTotals.hours + 1,
    };
    setTimelineTotals(totals);
    if (
      timelineIndex === timelinePlan.rows.length - 1 &&
      timelinePlan.mode === 'range'
    ) {
      setHistorical(false);
      setPlaying(false);
      setFinishedAt(timelinePlan.end);
      notify(
        'Time range complete',
        `${Math.round(totals.estimated).toLocaleString()} estimated rentals across ${totals.hours} hours. Observed total: ${totals.observed.toLocaleString()}. Finished at ${timelinePlan.end.replace('T', ' ')}.`,
      );
      return;
    }
    const next = (timelineIndex + 1) % timelinePlan.rows.length;
    setTimelineIndex(next);
    setTimelineSegment((v) => v + 1);
    edit(
      timelinePlan.rows[next].scenario,
      `${timelinePlan.mode === 'continuous' ? 'Continuous cycle' : 'Time range'} · ${timelinePlan.rows[next].partition}`,
      true,
    );
  };
  const togglePlayback = () => {
    if (finishedAt && timelinePlan) {
      void startTimeline({
        date: timelinePlan.start.slice(0, 10),
        start: Number(timelinePlan.start.slice(11, 13)),
        endDate: timelinePlan.end.slice(0, 10),
        end: Number(timelinePlan.end.slice(11, 13)),
        mode: timelinePlan.mode,
      });
      return;
    }
    setPlaying((v) => !v);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.matches(
          'input,textarea,select,[role=slider]',
        ) ||
        panel
      )
        return;
      if (e.key === 'Escape') {
        setCinematic(false);
        setFollow(false);
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayback();
      }
      if (e.key.toLowerCase() === 'o') {
        setCityView('overview');
        setOverview((v) => v + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, finishedAt, timelinePlan]);
  const toolState = useRef<any>({});
  toolState.current = {
    draft,
    applied,
    result,
    phase,
    edit,
    setPlaying,
    timeline: {
      active: historical,
      playing,
      mode: timelinePlan?.mode,
      index: timelineIndex,
      totals: timelineTotals,
      finishedAt,
    },
  };
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    const register = (tool: any) => {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: life.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: 'read_seoulbike_scenario',
      description:
        'Read the edited and applied scenario, prediction, and calculation status.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => {
        const s = toolState.current;
        return {
          draft: s.draft,
          applied: s.applied,
          prediction: s.result,
          phase: s.phase,
          timeline: s.timeline,
        };
      },
    });
    register({
      name: 'apply_seoulbike_scenario',
      description:
        'Apply a complete scenario to the visible city and wait for the actual trained-model prediction.',
      inputSchema: {
        type: 'object',
        properties: { scenario: { type: 'object' } },
        required: ['scenario'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input: any) => {
        const errors = validateScenario(input?.scenario);
        if (errors.length) throw Error(errors.join(' '));
        const s = input.scenario;
        toolState.current.edit(s, 'Agent scenario');
        for (let i = 0; i < 100; i++) {
          await new Promise((r) => setTimeout(r, 100));
          const current = toolState.current;
          if (current.phase === 'error')
            throw Error('Prediction failed; previous city activity retained.');
          if (
            current.phase === 'applied' &&
            JSON.stringify(current.applied) === JSON.stringify(s)
          )
            return { scenario: current.applied, prediction: current.result };
        }
        throw Error('Scenario calculation was interrupted or timed out.');
      },
    });
    return () => life.abort();
  }, []);
  const weather =
      draft.snowfall > 0
        ? 'Snow on the ground'
        : draft.rainfall > 0
          ? 'Rainy skies'
          : draft.hour < 6 || draft.hour > 19
            ? 'Night in Seoul'
            : 'Clear skies',
    WeatherIcon =
      draft.snowfall > 0
        ? Snowflake
        : draft.rainfall > 0
          ? CloudRain
          : draft.hour < 6 || draft.hour > 19
            ? Moon
            : Sun;
  const changed = baseline
    ? Object.keys(applied).filter(
        (k) =>
          baseline.scenario[k as keyof Scenario] !==
          applied[k as keyof Scenario],
      )
    : [];
  const delta =
    baseline && result ? result.prediction - baseline.result.prediction : 0;
  const shownError = error || worldError;
  const titles: Record<string, string> = {
    conditions: 'Change the conditions',
    compare: 'A different kind of city',
    explain: 'Behind the estimate',
    history: 'The city’s event log',
    settings: 'Make yourself at home',
    about: 'A model beneath the city',
    playback: 'A day in the data',
    timeline: 'Let the hours unfold',
    explore: 'Explore Seoul',
    details: 'Your city right now',
    tools: 'More ways to explore',
  };
  const runStatus = (
    <div className="run-status">
      {comparison && (
        <div className="comparison-tag glass">
          <Layers size={15} />
          <button
            className={comparison === 'A' ? 'active' : ''}
            onClick={() => replay('A')}
          >
            A · Baseline
          </button>
          <button
            className={comparison === 'B' ? 'active' : ''}
            onClick={() => replay('B')}
          >
            B · Scenario
          </button>
          <span>
            {stats.minutes.toFixed(1)} min · {stats.departures} starts
          </span>
        </div>
      )}
      {follow && (
        <div className="follow-tag glass">
          <Bike size={14} />
          {followId !== null
            ? `Following cyclist ${followId + 1}`
            : 'Waiting for a cyclist'}
          <button aria-label="Stop following" onClick={() => setFollow(false)}>
            <X size={14} />
          </button>
        </div>
      )}
      {historical && timelinePlan && (
        <div className="timeline-running glass">
          <span className="status-dot" />
          {timelinePlan.mode === 'continuous' ? (
            <Repeat2 size={14} />
          ) : (
            <CalendarClock size={14} />
          )}
          <span>
            {timelinePlan.rows[timelineIndex].scenario.date} ·{' '}
            {timelineIndex + 1}/{timelinePlan.hours} hours
            {timelinePlan.mode === 'continuous'
              ? ` · cycle ${Math.floor(timelineSegment / timelinePlan.hours) + 1}`
              : ''}
          </span>
          <button
            aria-label="Stop time playback"
            title="Stop time playback"
            onClick={stopTimeline}
          >
            <Square size={13} />
          </button>
        </div>
      )}
    </div>
  );
  return (
    <main
      className={`world-app ${cinematic ? 'cinematic' : ''} ${panel ? 'panel-open' : ''} ${applied.hour < 6 || applied.hour > 19 ? 'night-ui' : ''}`}
    >
      <div className="world-view">
        <div className="city-stage">
          <City
            view={cityView}
            activity={activity}
            trails={trails}
            emphasize={emphasize}
            waterMotion={waterMotion}
            scenario={applied}
            prediction={result?.prediction ?? 0}
            playing={playing && (!historical || phase === 'applied')}
            stopAtSeconds={
              historical ? (timelineSegment + 1) * 3600 : undefined
            }
            onTimeBoundary={onTimeBoundary}
            speed={speed}
            reduced={reduced}
            quality={quality}
            reset={reset}
            overview={overview}
            follow={follow}
            labels={labels && !cinematic}
            onStats={setStats}
            onFollow={(id) => {
              setFollowId(id);
              setFollow(id !== null);
            }}
            onReady={() => setReady(true)}
            onError={setWorldError}
          />
          {!ready && !worldError && (
            <div className="loading-world">
              <span>Bringing the city to life…</span>
            </div>
          )}
          <div className="world-notices">
            {!cinematic && (
              <div
                className="toast-stack"
                aria-live="polite"
                aria-atomic="false"
              >
                {(mobileUi ? visibleEvents.slice(-1) : visibleEvents).map(
                  (e) => (
                    <div
                      className="toast glass"
                      key={e.id}
                      style={{
                        animation: persistent
                          ? 'toast-in .3s ease'
                          : `toast-in .3s ease, toast-out .4s ease ${extended ? 11.6 : 5.1}s forwards`,
                      }}
                    >
                      <b>{e.title}</b>
                      {e.change && (
                        <div className={`toast-change ${e.change.direction}`}>
                          <span className="toast-number">
                            {e.change.difference > 0 ? (
                              <TrendingUp size={23} />
                            ) : e.change.difference < 0 ? (
                              <TrendingDown size={23} />
                            ) : (
                              <Bike size={23} />
                            )}
                            {e.change.headline}
                          </span>
                          <span className="toast-comparison">
                            {e.change.detail} · vs previous scenario
                          </span>
                        </div>
                      )}
                      <p>{e.body}</p>
                      <button
                        className="toast-details"
                        aria-label="View notification details"
                        onClick={() => setPanel('history')}
                      >
                        <ChevronRight size={18} />
                      </button>
                      <button
                        aria-label="Dismiss notification"
                        onClick={() =>
                          setVisibleEvents((v) =>
                            v.filter((x) => x.id !== e.id),
                          )
                        }
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ),
                )}
              </div>
            )}
            {shownError && (
              <div className="error-banner" role="alert">
                {shownError}
                {error && (
                  <button
                    className="secondary"
                    style={{ marginLeft: 8, padding: '4px 9px' }}
                    onClick={() => edit(draft, sourceLabel, historical)}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <header className="brand glass">
          <span className="brand-icon">
            <Bike size={26} />
          </span>
          <div>
            <h1>
              SeoulBike <span>World</span>
            </h1>
            <p>A city in motion.</p>
          </div>
          <span className="version">V.05</span>
          <button
            className="mobile-fullscreen"
            aria-label="Show city fullscreen"
            onClick={() => setCinematic(true)}
          >
            <Maximize size={18} />
          </button>
        </header>
        <button
          className="mobile-summary"
          aria-label="Show current conditions and rental details"
          aria-haspopup="dialog"
          onClick={() => setPanel('details')}
        >
          <span className="mobile-weather">
            <WeatherIcon size={21} />
            <b>{Math.round(draft.temperature)}°</b>
          </span>
          <span className="mobile-estimate">
            <strong>
              {result ? Math.round(result.prediction).toLocaleString() : '—'}
            </strong>
            <span>rentals / hour</span>
          </span>
          <span className="mobile-summary-action">
            Details <ChevronRight size={16} />
          </span>
          {phase !== 'applied' && (
            <span className="mobile-model-status">
              {phase === 'error'
                ? 'Update failed · showing previous estimate'
                : 'Updating · showing previous estimate'}
            </span>
          )}
        </button>
        <aside className="scenario-summary" aria-label="Current conditions">
          <div className="scenario-card glass">
            <div className="eyebrow">
              <span className="status-dot" />{' '}
              {phase === 'editing'
                ? 'EDITING SCENARIO'
                : phase === 'calculating'
                  ? 'CALCULATING'
                  : 'SCENARIO EXPLORER'}
            </div>
            <div className="weather-line">
              <WeatherIcon size={31} />
              <strong>{Math.round(draft.temperature)}°</strong>
              <div>
                <b>{weather}</b>
                <span>
                  {new Date(`${draft.date}T00:00:00Z`).toLocaleDateString(
                    'en',
                    {
                      weekday: 'short',
                      timeZone: 'UTC',
                    },
                  )}{' '}
                  · {String(draft.hour).padStart(2, '0')}:00
                </span>
              </div>
            </div>
            <div className="weather-meta">
              <span>{draft.season} in Seoul</span>
              <span>
                <Wind size={13} />
                {draft.windSpeed} m/s
              </span>
            </div>
            <button className="primary" onClick={() => setPanel('conditions')}>
              <SlidersHorizontal size={16} /> Adjust conditions
            </button>
          </div>
          <div className="status-caption">
            {phase === 'editing' ? (
              'Editing · cycling reflects the last estimate.'
            ) : phase === 'calculating' ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle size={12} className="animate-spin" /> Calculating
                ·
                {historical
                  ? 'time playback paused.'
                  : 'previous activity continues.'}
              </span>
            ) : phase === 'error' ? (
              'Update failed · previous estimate retained.'
            ) : !applied.functioning ? (
              'Service closed · no new rental starts.'
            ) : (
              sourceLabel
            )}
            {historical && timelinePlan && (
              <p>
                Observed:{' '}
                {timelinePlan.rows[timelineIndex].observed.toLocaleString()}{' '}
                rentals · {timelinePlan.rows[timelineIndex].scenario.date} ·
                hour {timelineIndex + 1}/{timelinePlan.hours}
              </p>
            )}
          </div>
          <div className="world-caption">
            <div className="eyebrow">SEOUL · 서울</div>
            <p>One river. A city of neighborhoods.</p>
            <button
              className="city-explore glass"
              onClick={() => setPanel('explore')}
            >
              <Map size={16} /> Explore Seoul <ChevronRight size={14} />
            </button>
            <a className="world-demo-link" href="/demo">
              <Play size={14} /> Watch the 20-second demo
            </a>
          </div>
        </aside>
        <aside
          className="rental-summary"
          aria-label="Rental estimate and activity"
        >
          <button
            className="estimate-card glass"
            onClick={() => setPanel('explain')}
            aria-label="Explain rental estimate"
          >
            <span className="eyebrow">
              ESTIMATED RENTALS / HOUR <ArrowUpRight size={14} />
            </span>
            <span className="estimate-number">
              {result ? Math.round(result.prediction).toLocaleString() : '—'}
            </span>
            <span className="estimate-sub">
              {result && baseline
                ? Math.abs(delta) < 0.001
                  ? 'Your pinned baseline'
                  : deltaText(result.prediction, baseline.result.prediction)
                : 'Calculating the first scenario'}
            </span>
            <span className="estimate-foot">
              <span className="status-dot" />{' '}
              {phase === 'error'
                ? 'Previous estimate'
                : phase !== 'applied'
                  ? 'Waiting for updated prediction'
                  : 'Model applied'}{' '}
              <ChevronRight size={12} style={{ marginLeft: 'auto' }} />
            </span>
          </button>
          {activity && result && (
            <div
              className="activity-readout glass"
              aria-label="Cycling activity"
            >
              <div className="activity-heading">
                <span className="eyebrow">NEW DEPARTURE RATE</span>
                <button
                  aria-label="Activity display options"
                  onClick={() => setPanel('explore')}
                >
                  <SlidersHorizontal size={14} />
                </button>
              </div>
              <div className="activity-rate">
                <strong>{(result.prediction / VISUAL_SCALE).toFixed(1)}</strong>
                <span>visual trips / hour</span>
              </div>
              <div
                className="activity-gauge"
                role="meter"
                aria-label="Citywide rental rate"
                aria-valuemin={0}
                aria-valuemax={3000}
                aria-valuenow={Math.min(3000, Math.round(result.prediction))}
              >
                <i
                  style={{
                    width: `${Math.min(100, (result.prediction / 3000) * 100)}%`,
                  }}
                />
              </div>
              <div className="activity-count">
                <span>{stats.riders} riding now</span>
                <span>1 cyclist = {VISUAL_SCALE} rentals</span>
              </div>
              <p>
                {!playing
                  ? 'Paused · press play to see the response.'
                  : historical && phase !== 'applied'
                    ? 'Waiting for the next hourly estimate.'
                    : !applied.functioning
                      ? 'No new starts. Existing rides finish.'
                      : 'The new rate applies now. Existing rides finish.'}
              </p>
            </div>
          )}
        </aside>
      </div>
      <div className="world-dock">
        {runStatus}
        <div className="control-bar">
          <nav className="tool-rail glass" aria-label="World tools">
            <button
              title="Overview (O)"
              aria-label="Restore overview"
              onClick={() => {
                setFollow(false);
                setCityView('overview');
                setOverview((v) => v + 1);
              }}
            >
              <Compass />
            </button>
            <button
              title="Follow a cyclist"
              aria-label="Follow a cyclist"
              aria-pressed={follow}
              onClick={() => {
                setFollow((v) => !v);
                if (!stats.riders)
                  notify(
                    'Waiting for a cyclist',
                    'The follow camera will begin when the next journey starts.',
                  );
              }}
            >
              <Focus />
            </button>
            <button
              title="Explore Seoul"
              aria-label="Explore Seoul"
              onClick={() => setPanel('explore')}
            >
              <Map />
            </button>
            <button
              title="Compare scenarios"
              aria-label="Compare scenarios"
              onClick={() => setPanel('compare')}
            >
              <Layers />
            </button>
            <button
              title="Event history"
              aria-label="Event history"
              onClick={() => setPanel('history')}
            >
              <History />
            </button>
            <button
              title="World settings"
              aria-label="World settings"
              onClick={() => setPanel('settings')}
            >
              <Settings />
            </button>
            <button
              title="About the model"
              aria-label="About the model"
              onClick={() => setPanel('about')}
            >
              <Info />
            </button>
            <button
              title="Cinematic mode"
              aria-label="Cinematic mode"
              onClick={() => setCinematic(true)}
            >
              <Maximize />
            </button>
          </nav>
          <div className="playback glass">
            <button
              aria-label={
                finishedAt
                  ? 'Replay time range'
                  : playing
                    ? 'Pause simulation'
                    : 'Play simulation'
              }
              title="Play / pause (Space)"
              onClick={togglePlayback}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              className="play-time clock-button"
              onClick={() => setPanel('timeline')}
              aria-label="Configure time playback"
            >
              <b>
                {finishedAt
                  ? finishedAt.slice(11)
                  : historical
                    ? timelineClock(
                        timelinePlan!.rows[timelineIndex].scenario.hour,
                        stats.minutes * 60 - timelineSegment * 3600,
                      )
                    : `${String(applied.hour).padStart(2, '0')}:00`}
              </b>
              <span>
                {finishedAt
                  ? 'COMPLETED'
                  : historical
                    ? phase !== 'applied'
                      ? 'WAITING'
                      : playing
                        ? timelinePlan?.mode === 'continuous'
                          ? 'CONTINUOUS'
                          : 'TIME RANGE'
                        : 'PAUSED'
                    : playing
                      ? 'FIXED HOUR'
                      : 'PAUSED'}
              </span>
            </button>
            <div className="speed-options" aria-label="Simulation speed">
              {[1, 5, 15].map((n) => (
                <button
                  key={n}
                  aria-pressed={speed === n}
                  className={speed === n ? 'active' : ''}
                  onClick={() => setSpeed(n)}
                >
                  {n}×
                </button>
              ))}
            </div>
            <button
              className="time-range-button"
              aria-label="Time range and continuous playback"
              title="Time range & continuous playback"
              onClick={() => setPanel('timeline')}
            >
              <CalendarClock size={17} />
              <span>Time range</span>
            </button>
            <span className="rider-count">
              <Bike size={16} />
              {stats.riders} riding
            </span>
          </div>
        </div>
        <nav className="mobile-nav" aria-label="City controls">
          <button aria-haspopup="dialog" onClick={() => setPanel('conditions')}>
            <SlidersHorizontal size={20} />
            <span>Conditions</span>
          </button>
          <button aria-haspopup="dialog" onClick={() => setPanel('explore')}>
            <Map size={20} />
            <span>Views</span>
          </button>
          <button aria-haspopup="dialog" onClick={() => setPanel('timeline')}>
            <CalendarClock size={20} />
            <span>Time range</span>
          </button>
          <button aria-haspopup="dialog" onClick={() => setPanel('tools')}>
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </nav>
        <footer className="world-footer">
          <span>Seoul-inspired geography · Routes & docks: illustrative</span>
          <span>
            Drag to orbit <i /> Right-drag to pan <i /> Scroll to explore
          </span>
        </footer>
      </div>
      {cinematic && (
        <button className="cinematic-exit" onClick={() => setCinematic(false)}>
          <Minimize size={16} /> Exit cinematic
        </button>
      )}
      <Sheet
        modal={mobileUi}
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <SheetContent
          className={`inspector-panel ${mobileUi ? 'mobile-inspector' : ''}`}
          side={mobileUi ? 'bottom' : 'right'}
        >
          {mobileUi && panel !== 'tools' && panel !== 'details' && (
            <button
              className="mobile-panel-back"
              onClick={() => setPanel('tools')}
            >
              <ChevronLeft size={16} /> More tools
            </button>
          )}
          <SheetHeader>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              SEOULBIKE WORLD
            </div>
            <SheetTitle className="panel-title">
              {titles[panel || '']}
            </SheetTitle>
            <SheetDescription className="panel-copy">
              {panel === 'details'
                ? 'Current conditions, rental estimates and cycling activity.'
                : panel === 'tools'
                  ? 'Choose a tool, then return to the city.'
                  : panel === 'conditions'
                    ? 'Small changes. A different rhythm.'
                    : panel === 'compare'
                      ? 'Pin a moment, change the inputs, and replay both.'
                      : panel === 'explain'
                        ? 'What changed in this particular scenario.'
                        : panel === 'history'
                          ? 'The latest 1,000 committed changes from this visit.'
                          : panel === 'settings'
                            ? 'Visual preferences never change the prediction.'
                            : panel === 'timeline'
                              ? 'Choose a period or keep a recorded day running.'
                              : panel === 'explore'
                                ? 'Choose a viewpoint and adjust cycling visibility.'
                                : panel === 'playback'
                                  ? 'Observed rentals alongside model estimates.'
                                  : 'Evaluated on real observations. Brought to life with illustrative routes.'}
            </SheetDescription>
          </SheetHeader>
          <div className="panel-body" ref={panelBody}>
            {panel === 'details' && (
              <>
                <div className="mobile-detail-estimate">
                  <span>Estimated rentals / hour</span>
                  <strong>
                    {result
                      ? Math.round(result.prediction).toLocaleString()
                      : '—'}
                  </strong>
                  <p>
                    {phase === 'applied'
                      ? sourceLabel
                      : phase === 'error'
                        ? 'Update failed. The previous estimate is retained.'
                        : 'Updating. The city reflects the previous estimate.'}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setPanel('explain')}
                  >
                    Explain this estimate <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="panel-section">
                  <h3>Current conditions</h3>
                  <p className="panel-copy">
                    {weather} · {Math.round(draft.temperature)}°C ·{' '}
                    {draft.season}
                  </p>
                  <p className="panel-copy">
                    {draft.date} · {String(draft.hour).padStart(2, '0')}:00 ·{' '}
                    {draft.functioning ? 'Service open' : 'Service closed'}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setPanel('conditions')}
                  >
                    <SlidersHorizontal size={16} /> Adjust conditions
                  </button>
                </div>
                <div className="panel-section">
                  <h3>Cycling activity</h3>
                  <div className="changed-row">
                    <span>Riding now</span>
                    <b>{stats.riders}</b>
                  </div>
                  <div className="changed-row">
                    <span>Visual starts / hour</span>
                    <b>
                      {result
                        ? (result.prediction / VISUAL_SCALE).toFixed(1)
                        : '—'}
                    </b>
                  </div>
                  <p className="panel-copy">
                    One cyclist represents {VISUAL_SCALE} rentals. Existing
                    rides finish when the estimate changes.
                  </p>
                  {!applied.functioning && (
                    <p className="note">
                      Service is closed. No new rides start.
                    </p>
                  )}
                </div>
                {historical && timelinePlan && (
                  <p className="note">
                    Observed:{' '}
                    {timelinePlan.rows[timelineIndex].observed.toLocaleString()}{' '}
                    rentals · {timelinePlan.rows[timelineIndex].scenario.date} ·
                    hour {timelineIndex + 1} of {timelinePlan.hours}
                  </p>
                )}
                {runStatus}
              </>
            )}
            {panel === 'tools' && (
              <>
                <div className="mobile-tool-list">
                  <button onClick={() => setPanel('details')}>
                    <Bike size={20} />
                    <span>
                      Current details
                      <small>Conditions, rentals and riding activity</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button
                    onClick={() => {
                      setFollow(false);
                      setCityView('overview');
                      setOverview((v) => v + 1);
                      setPanel(null);
                    }}
                  >
                    <Compass size={20} />
                    <span>
                      Reset view<small>Return to the city overview</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button
                    onClick={() => {
                      setFollow((v) => !v);
                      setPanel(null);
                      if (!follow && !stats.riders)
                        notify(
                          'Waiting for a cyclist',
                          'The follow camera will begin when the next journey starts.',
                        );
                    }}
                  >
                    <Focus size={20} />
                    <span>
                      {follow ? 'Stop following' : 'Follow a cyclist'}
                      <small>Travel through the city with a rider</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => setPanel('compare')}>
                    <Layers size={20} />
                    <span>
                      Compare scenarios
                      <small>Pin a baseline and replay A / B</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => setPanel('history')}>
                    <History size={20} />
                    <span>
                      Event history
                      <small>Full rental changes and notifications</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => setPanel('settings')}>
                    <Settings size={20} />
                    <span>
                      Settings<small>Graphics, labels and notifications</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <button onClick={() => setPanel('about')}>
                    <Info size={20} />
                    <span>
                      About the model
                      <small>Data, evaluation and limitations</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <a href="/demo">
                    <Play size={20} />
                    <span>
                      Watch the demo<small>A 20-second screen recording</small>
                    </span>
                    <ChevronRight size={18} />
                  </a>
                </div>
                {runStatus}
              </>
            )}

            {panel === 'conditions' && (
              <>
                <Tabs value={mode} onValueChange={(v) => setMode(String(v))}>
                  <TabsList style={{ width: '100%', height: 38 }}>
                    <TabsTrigger value="guided">Guided scenarios</TabsTrigger>
                    <TabsTrigger value="single">Single factor</TabsTrigger>
                  </TabsList>
                </Tabs>
                {mode === 'guided' ? (
                  <>
                    <p className="panel-copy">
                      Start with a real historical hour. Each preset applies its
                      complete weather and calendar bundle.
                    </p>
                    <div className="preset-grid">
                      {presets.map((p, i) => (
                        <button
                          className="preset"
                          key={p.id}
                          onClick={() =>
                            edit(p.scenario, `${p.label} · historical preset`)
                          }
                        >
                          {i === 1 ? (
                            <CloudRain size={19} />
                          ) : i === 2 ? (
                            <Snowflake size={19} />
                          ) : i === 4 ? (
                            <Moon size={19} />
                          ) : (
                            <Sun size={19} />
                          )}
                          <b>{p.label}</b>
                          <span>
                            {p.scenario.temperature}°C · {p.scenario.hour}:00 ·{' '}
                            {p.scenario.rainfall} mm
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="note">
                      Presets replace all 14 inputs together, including date,
                      season, dew point and visibility. They are demonstrations
                      from the training period, not test results.
                    </div>
                    <button
                      className="secondary"
                      style={{ width: '100%' }}
                      onClick={() => setMode('single')}
                    >
                      Fine-tune one input <ArrowRight size={14} />
                    </button>
                    <button
                      className="secondary"
                      style={{ width: '100%', marginTop: 9 }}
                      onClick={() => setPanel('playback')}
                    >
                      <History size={14} /> Explore a held-out day
                    </button>
                  </>
                ) : (
                  <>
                    <div className="note warning">
                      Experimental mode. Only the input you edit changes; all
                      other values stay fixed. Changing date also updates
                      season. Correlated weather inputs can form unrealistic
                      combinations.
                    </div>
                    {controls.slice(0, 6).map((c) => (
                      <div className="form-row" key={c.key}>
                        <label id={`label-${c.key}`}>
                          <span>{c.label}</span>
                          <output>
                            {c.key === 'hour'
                              ? `${String(draft.hour).padStart(2, '0')}:00`
                              : `${draft[c.key]} ${c.unit}`}
                          </output>
                        </label>
                        <Slider
                          aria-labelledby={`label-${c.key}`}
                          value={[draft[c.key] as number]}
                          min={c.min}
                          max={c.max}
                          step={c.step}
                          onValueChange={(v) => {
                            sliderEditing.current = true;
                            edit({
                              ...draft,
                              [c.key]: Array.isArray(v) ? v[0] : v,
                            });
                          }}
                          onValueCommitted={() => {
                            sliderEditing.current = false;
                            setCommitTick((v) => v + 1);
                          }}
                        />
                      </div>
                    ))}
                    <div className="panel-section">
                      <h3>Calendar & availability</h3>
                      <label className="field-hint" htmlFor="scenario-date">
                        Seoul calendar date
                      </label>
                      <input
                        className="input-field"
                        id="scenario-date"
                        type="date"
                        min="2017-12-01"
                        max="2030-12-31"
                        value={draft.date}
                        onChange={(e) => {
                          if (e.target.value)
                            edit({
                              ...draft,
                              date: e.target.value,
                              season: seasonForDate(e.target.value),
                            });
                        }}
                      />
                      <p className="field-hint">
                        Season: {draft.season}. Holiday is a manual scenario
                        override.
                      </p>
                      <Toggle
                        label="Public holiday override"
                        checked={draft.holiday}
                        onChange={(v) => edit({ ...draft, holiday: v })}
                      />
                      <Toggle
                        label="Bike service operating"
                        checked={draft.functioning}
                        onChange={(v) => edit({ ...draft, functioning: v })}
                      />
                    </div>
                    <details className="panel-section">
                      <summary>Advanced weather inputs</summary>
                      {controls.slice(6).map((c) => (
                        <div className="form-row" key={c.key}>
                          <label id={`label-${c.key}`}>
                            <span>{c.label}</span>
                            <output>
                              {draft[c.key]} {c.unit}
                            </output>
                          </label>
                          <Slider
                            aria-labelledby={`label-${c.key}`}
                            value={[draft[c.key] as number]}
                            min={c.min}
                            max={c.max}
                            step={c.step}
                            onValueChange={(v) => {
                              sliderEditing.current = true;
                              edit({
                                ...draft,
                                [c.key]: Array.isArray(v) ? v[0] : v,
                              });
                            }}
                            onValueCommitted={() => {
                              sliderEditing.current = false;
                              setCommitTick((v) => v + 1);
                            }}
                          />
                        </div>
                      ))}
                      <p className="field-hint">
                        Visibility is measured in 10 m units: 2,000 = 20 km. Dew
                        point and solar radiation remain fixed when another
                        slider changes.
                      </p>
                    </details>
                  </>
                )}
                {result?.warnings.map((w, i) => (
                  <div className="note warning" key={i}>
                    {w}
                  </div>
                ))}
                <div className="action-row">
                  <button
                    className="secondary"
                    disabled={!baseline}
                    onClick={restore}
                  >
                    <RotateCcw size={14} /> Restore
                  </button>
                  <button
                    className="primary"
                    disabled={!result || phase !== 'applied'}
                    onClick={pin}
                  >
                    <Pin size={14} /> Pin baseline
                  </button>
                </div>
                <p className="field-hint" role="status">
                  {phase === 'applied'
                    ? '✓ Prediction applied'
                    : phase === 'error'
                      ? 'Update failed. Previous cycling activity retained.'
                      : phase === 'editing'
                        ? 'Editing scenario…'
                        : 'Calculating… cycling uses the previous prediction.'}
                </p>
              </>
            )}
            {panel === 'compare' && (
              <>
                {baseline && result ? (
                  <>
                    <div className="metric-pair">
                      <div>
                        <small>A · PINNED BASELINE</small>
                        <strong>
                          {Math.round(
                            baseline.result.prediction,
                          ).toLocaleString()}
                        </strong>
                        <small>rentals/hour</small>
                      </div>
                      <div>
                        <small>B · SCENARIO</small>
                        <strong>
                          {Math.round(
                            (scenarioB.current?.result ?? result).prediction,
                          ).toLocaleString()}
                        </strong>
                        <small>rentals/hour</small>
                      </div>
                    </div>
                    <p className="panel-copy">
                      {deltaText(
                        (scenarioB.current?.result ?? result).prediction,
                        baseline.result.prediction,
                      )}{' '}
                      ·{' '}
                      {Math.round(
                        (scenarioB.current?.result ?? result).prediction -
                          baseline.result.prediction,
                      ) >= 0
                        ? '+'
                        : ''}
                      {Math.round(
                        (scenarioB.current?.result ?? result).prediction -
                          baseline.result.prediction,
                      ).toLocaleString()}{' '}
                      rentals/hour.
                    </p>
                    <div className="action-row">
                      <button
                        className="primary"
                        disabled={phase !== 'applied'}
                        onClick={() => {
                          replay('A');
                          setPanel(null);
                        }}
                      >
                        <Play size={14} /> Replay A
                      </button>
                      <button
                        className="primary"
                        disabled={phase !== 'applied'}
                        onClick={() => {
                          replay('B');
                          setPanel(null);
                        }}
                      >
                        <Play size={14} /> Replay B
                      </button>
                    </div>
                    <div className="note">
                      Both replays start with an empty network and seed 42317.
                      Camera, routes and the fixed scale of 1 visual journey per{' '}
                      {VISUAL_SCALE} predicted rentals stay aligned. Compare
                      departures after the same simulated time.
                    </div>
                    <div className="panel-section">
                      <h3>Your pinned moment</h3>
                      <p className="panel-copy">
                        {baseline.scenario.date} · {baseline.scenario.hour}:00 ·{' '}
                        {baseline.scenario.temperature}°C ·{' '}
                        {baseline.scenario.rainfall} mm rain
                      </p>
                      <div className="action-row">
                        <button
                          className="secondary"
                          disabled={phase !== 'applied'}
                          onClick={pin}
                        >
                          <Pin size={14} /> Pin current
                        </button>
                        <button className="secondary" onClick={restore}>
                          <RotateCcw size={14} /> Restore inputs
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="panel-copy">
                    A baseline will be pinned when the first model estimate is
                    ready.
                  </p>
                )}
                <button
                  className="secondary"
                  style={{ width: '100%', marginTop: 16 }}
                  disabled={!result}
                  onClick={download}
                >
                  <Download size={15} /> Download complete scenario
                </button>
                <p className="field-hint">
                  Includes every input, model version, prediction, seed and
                  visual scale. Pinned baselines are saved on this device.
                </p>
              </>
            )}
            {panel === 'explain' && (
              <>
                {result && baseline ? (
                  <>
                    <div className="metric-pair">
                      <div>
                        <small>BASELINE</small>
                        <strong>
                          {Math.round(
                            baseline.result.prediction,
                          ).toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <small>THIS SCENARIO</small>
                        <strong>
                          {Math.round(result.prediction).toLocaleString()}
                        </strong>
                      </div>
                    </div>
                    <p className="panel-copy">
                      {delta >= 0 ? '+' : ''}
                      {Math.round(delta).toLocaleString()} rentals/hour ·{' '}
                      {deltaText(result.prediction, baseline.result.prediction)}
                      .
                    </p>
                    <div className="panel-section">
                      <h3>Changed inputs</h3>
                      {changed.length ? (
                        changed.map((k) => (
                          <div className="changed-row" key={k}>
                            <span>{featureLabels[k]}</span>
                            <span>
                              {fmt(baseline.scenario, k)} → {fmt(applied, k)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="panel-copy">
                          You’re at the pinned baseline. Change a condition to
                          explore the model’s response.
                        </p>
                      )}
                    </div>
                    {changed.length > 0 && result.explanation && (
                      <div className="panel-section">
                        <h3>Local model response</h3>
                        {result.explanation.contributions.map((c, i) => (
                          <div className="changed-row" key={i}>
                            <span>{featureLabels[c.label] || c.label}</span>
                            <span>
                              {c.delta >= 0 ? '+' : ''}
                              {Math.round(c.delta).toLocaleString()} rentals/h
                            </span>
                          </div>
                        ))}
                        <p className="field-hint">
                          Ordered input replacement: calendar → hour →
                          temperature → humidity → wind → visibility → dew point
                          → solar → rain → snow → service. Values are rounded;
                          contributions depend on this order and the
                          intermediate input combinations.
                        </p>
                        <div className="note">
                          This explains the model’s prediction for this
                          scenario. It does not establish what changing the
                          weather would cause in the real world.
                        </div>
                      </div>
                    )}
                    <details className="panel-section">
                      <summary>All applied model inputs</summary>
                      {Object.keys(applied).map((k) => (
                        <div className="changed-row" key={k}>
                          <span>{featureLabels[k]}</span>
                          <span>{fmt(applied, k)}</span>
                        </div>
                      ))}
                    </details>
                    {result.warnings.map((w, i) => (
                      <div className="note warning" key={i}>
                        {w}
                      </div>
                    ))}
                    <p className="field-hint">
                      Model: {result.modelVersion}. Hourly rentals are trip
                      starts, not the number of bikes simultaneously riding.
                    </p>
                    <button
                      className="secondary"
                      onClick={() => setPanel('about')}
                    >
                      View model evaluation <ArrowUpRight size={14} />
                    </button>
                  </>
                ) : (
                  <p className="panel-copy">
                    Waiting for the first prediction.
                  </p>
                )}
              </>
            )}
            {panel === 'history' && (
              <>
                <button
                  className="secondary"
                  style={{ width: '100%' }}
                  onClick={() => setPanel('playback')}
                >
                  <History size={14} /> Play a historical day
                </button>
                {events.length ? (
                  events.map((e) => (
                    <article className="event-item" key={e.id}>
                      <small>{e.time}</small>
                      <b>{e.title}</b>
                      {e.change && (
                        <p>
                          <strong>{e.change.headline}</strong>
                          <br />
                          {e.change.detail} · vs previous scenario
                        </p>
                      )}
                      <p>{e.body}</p>
                    </article>
                  ))
                ) : (
                  <p className="panel-copy">
                    Committed scenario changes will appear here.
                  </p>
                )}
              </>
            )}
            {panel === 'explore' && (
              <>
                <a className="demo-panel-link" href="/demo">
                  <Play size={16} /> Watch the 20-second demo{' '}
                  <ArrowUpRight size={15} />
                </a>
                <p className="panel-copy">
                  Explore the wider city: new western neighborhoods, eastern
                  river parks and northern hills, linked by five bridges.
                </p>
                <div className="city-view-options">
                  {CITY_VIEWS.map((v) => (
                    <button
                      key={v.id}
                      className={cityView === v.id ? 'selected' : ''}
                      aria-pressed={cityView === v.id}
                      onClick={() => {
                        setCityView(v.id);
                        setOverview((n) => n + 1);
                        setFollow(false);
                        setPanel(null);
                      }}
                    >
                      <Map size={18} />
                      <span>
                        <b>{v.name}</b>
                        <small>{v.description}</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
                <div className="panel-section">
                  <h3>Make rental changes visible</h3>
                  <Toggle
                    label="Departure-rate columns"
                    checked={activity}
                    onChange={setActivity}
                  />
                  <Toggle
                    label="Cyclist route trails"
                    checked={trails}
                    onChange={setTrails}
                  />
                  <Toggle
                    label="Emphasize cyclists"
                    checked={emphasize}
                    onChange={setEmphasize}
                  />
                  <div className="note">
                    Columns change immediately with the citywide rental
                    estimate. Dock allocation is illustrative. Riders already on
                    trips keep going; fewer starts take time to become fewer
                    riders.
                  </div>
                  <div className="activity-legend">
                    <i />
                    <span>
                      Column height: 0–3,000 estimated rentals/hour.
                      <br />A ring flashes when a visual trip starts.
                    </span>
                  </div>
                </div>
                <div className="panel-section">
                  <h3>River & seasons</h3>
                  <Toggle
                    label="River surface motion"
                    checked={waterMotion}
                    onChange={setWaterMotion}
                  />
                  <Toggle
                    label="Place labels"
                    checked={labels}
                    onChange={setLabels}
                  />
                  <p className="panel-copy">
                    <TreePine size={16} /> Cherry blossoms in spring, golden
                    ginkgo in autumn, and evergreen pines on Namsan. The trees
                    follow your selected season.
                  </p>
                </div>
                <div className="note">
                  A compressed, Seoul-inspired miniature. Landmarks and
                  districts follow the city's broad structure; roads and bike
                  docks are illustrative, not a navigation map.
                </div>
                <div className="action-row">
                  <a
                    className="text-link"
                    href="https://english.seoul.go.kr/wp-content/uploads/2025/01/2025-seoul-tourist-mapENG.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official Seoul map ↗
                  </a>
                  <a
                    className="text-link"
                    href="https://english.seoul.go.kr/service/amusement/hangang/islands/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Han River islands ↗
                  </a>
                </div>
              </>
            )}
            {panel === 'settings' && (
              <>
                <button
                  className="secondary"
                  style={{ width: '100%', marginBottom: 16 }}
                  onClick={() => setPanel('explore')}
                >
                  <Map size={16} /> City views & activity layers
                </button>
                <Toggle
                  label="Detailed shadows"
                  checked={quality}
                  onChange={setQuality}
                />
                <Toggle
                  label="Reduce weather & camera motion"
                  checked={reduced}
                  onChange={setReduced}
                />
                <Toggle
                  label="Neighborhood labels"
                  checked={labels}
                  onChange={setLabels}
                />
                <div className="panel-section">
                  <h3>Notifications</h3>
                  <Toggle
                    label="Keep messages until dismissed"
                    checked={persistent}
                    onChange={(v) => {
                      setPersistent(v);
                      timers.current.forEach(clearTimeout);
                      timers.current.clear();
                      if (!v) setVisibleEvents([]);
                    }}
                  />
                  <Toggle
                    label="Extend messages to 12 seconds"
                    checked={extended}
                    onChange={setExtended}
                  />
                  <p className="field-hint">
                    Normally visible for 5.5 seconds. Mobile shows one compact
                    message; larger screens show up to two. The latest 1,000
                    events remain in the event log.
                  </p>
                </div>
                <div className="panel-section">
                  <h3>Getting around</h3>
                  <p className="panel-copy">
                    Drag to orbit. Right-drag to pan. Scroll or pinch to zoom.
                    Select a rider to follow them. Press O for overview, Space
                    to pause, or Escape to leave cinematic mode.
                  </p>
                  <p className="field-hint">
                    At 1×, one real second represents one simulated minute. In
                    time playback, each model hour runs for 60 simulated
                    minutes. Use 5× or 15× to move faster. The city pauses at
                    hour boundaries while the next prediction is calculated.
                  </p>
                </div>
                <div className="note">
                  {stats.fps} frames/second measured in your current browser.{' '}
                  {stats.riders} active riders · {stats.departures} illustrative
                  departures · {stats.minutes.toFixed(1)} simulated minutes.
                  Quality settings affect rendering only.
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setPanel(null);
                    setCinematic(true);
                  }}
                >
                  <Maximize size={15} /> Enter cinematic mode
                </button>
              </>
            )}
            {panel === 'about' && (
              <>
                <div className="note">
                  Citywide rental estimate: model-based.
                  <br />
                  Routes and station activity: illustrative.
                </div>
                <p className="panel-copy">
                  A gradient-boosted model estimates recorded hourly rentals
                  using weather and calendar inputs. The scene samples 1 visual
                  trip per {VISUAL_SCALE} rentals on a fixed, illustrative
                  network of 24 docks and five river bridges. More estimated
                  rentals create more departures. Existing riders finish their
                  routes.
                </p>
                {report ? (
                  <>
                    <div className="panel-section">
                      <h3>Evaluation on later, unseen observations</h3>
                      <p className="field-hint">
                        Final test: 19 Sep – 30 Nov 2018 · 1,752 hourly
                        observations. Models were selected using earlier
                        validation data.
                      </p>
                      <table className="info-table">
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th>MAE ↓</th>
                            <th>RMSE ↓</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            ['Calendar baseline', 'calendar_baseline'],
                            ['Regularized regression', 'ridge_alpha100'],
                            [
                              'Boosted trees · selected',
                              'gradient_boosting_depth4',
                            ],
                          ].map(([name, key]) => (
                            <tr key={key}>
                              <td>{name}</td>
                              <td>{report.finalTest[key].mae.toFixed(1)}</td>
                              <td>{report.finalTest[key].rmse.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="field-hint">
                        Both metrics are rentals/hour; lower is better. MAE is
                        the average absolute error. RMSE gives greater weight to
                        large errors. Closed hours use an explicit zero-rental
                        operating rule.
                      </p>
                    </div>
                    <details className="panel-section">
                      <summary>Performance by condition and hour</summary>
                      <table className="info-table">
                        <thead>
                          <tr>
                            <th>Test group</th>
                            <th>Hours</th>
                            <th>MAE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(report.selectedFinalTestSlices).map(
                            ([key, v]: [string, any]) => (
                              <tr key={key}>
                                <td>{key.replaceAll('_', ' ')}</td>
                                <td>{v.n}</td>
                                <td>{v.mae.toFixed(1)}</td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </details>
                    <div className="panel-section">
                      <h3>What the model cannot tell you</h3>
                      <p className="panel-copy">
                        The data covers December 2017 to November 2018. It does
                        not represent present-day operations, individual trips,
                        station availability or neighborhood demand. A
                        cold-weather or rush-hour estimate can be less reliable;
                        small test groups deserve caution.
                      </p>
                      <p className="field-hint">
                        No prediction interval is shown. Similarity warnings
                        compare weather combinations with training examples;
                        they are not confidence scores. Closed service does not
                        imply zero unmet demand.
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="panel-copy">
                    Evaluation report is loading. The full report is available
                    below.
                  </p>
                )}
                <p className="panel-copy">
                  Source:{' '}
                  <a
                    className="text-link"
                    href="https://archive.ics.uci.edu/dataset/560/seoul+bike+sharing+demand"
                    target="_blank"
                    rel="noreferrer"
                  >
                    UCI Seoul Bike Sharing Demand
                  </a>{' '}
                  (2020),{' '}
                  <a
                    className="text-link"
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    CC BY 4.0
                  </a>
                  . Data were parsed, chronologically sorted and used to train
                  the model.
                </p>
                <div className="action-row">
                  <a
                    className="text-link"
                    href="/data/evaluation.json"
                    download
                  >
                    Evaluation report
                  </a>
                  <a className="text-link" href="/data/metadata.json" download>
                    Source & provenance
                  </a>
                </div>
              </>
            )}
            {panel === 'timeline' && (
              <>
                <Tabs
                  value={timelineMode}
                  onValueChange={(v) =>
                    setTimelineMode(v as 'range' | 'continuous')
                  }
                >
                  <TabsList className="timeline-tabs">
                    <TabsTrigger value="range">
                      <CalendarClock size={14} /> Time range
                    </TabsTrigger>
                    <TabsTrigger value="continuous">
                      <Repeat2 size={14} /> Continuous
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <p className="panel-copy">
                  {timelineMode === 'range'
                    ? 'Run through your chosen period. Weather, daylight and rental predictions advance hour by hour.'
                    : 'Keep a recorded 24-hour cycle running. Cyclists continue their journeys when the cycle repeats.'}
                </p>
                <div className="timeline-date-row">
                  <label htmlFor="timeline-start-date">
                    Start date
                    <input
                      id="timeline-start-date"
                      type="date"
                      className="input-field"
                      min="2017-12-01"
                      max="2018-11-30"
                      value={timelineDate}
                      onChange={(e) => {
                        if (timelineEndDate === timelineDate)
                          setTimelineEndDate(e.target.value);
                        setTimelineDate(e.target.value);
                      }}
                    />
                  </label>
                  <label htmlFor="timeline-start-hour">
                    Start time
                    <NativeSelect
                      id="timeline-start-hour"
                      value={timelineStart}
                      onChange={(e) => setTimelineStart(Number(e.target.value))}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <NativeSelectOption key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </label>
                </div>
                {timelineMode === 'range' && (
                  <>
                    <div className="timeline-date-row">
                      <label htmlFor="timeline-end-date">
                        End date
                        <input
                          id="timeline-end-date"
                          type="date"
                          className="input-field"
                          min="2017-12-01"
                          max="2018-12-01"
                          value={timelineEndDate}
                          onChange={(e) => setTimelineEndDate(e.target.value)}
                        />
                      </label>
                      <label htmlFor="timeline-end-hour">
                        End time
                        <NativeSelect
                          id="timeline-end-hour"
                          value={timelineEnd}
                          onChange={(e) =>
                            setTimelineEnd(Number(e.target.value))
                          }
                        >
                          {Array.from({ length: 24 }, (_, h) => (
                            <NativeSelectOption key={h} value={h}>
                              {String(h).padStart(2, '0')}:00
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </label>
                    </div>
                    <div className="timeline-presets">
                      {[
                        ['Morning', 6, 10],
                        ['Daytime', 6, 22],
                        ['Overnight', 22, 6],
                        ['Full day', 0, 0],
                      ].map(([label, start, end]) => (
                        <button
                          className="secondary"
                          key={label}
                          onClick={() => {
                            setTimelineStart(Number(start));
                            setTimelineEnd(Number(end));
                            setTimelineEndDate(timelineDate);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="field-hint">
                      On the same date, an end time at or before the start means
                      the following day. The end time is exclusive.
                    </p>
                  </>
                )}
                <div className="note">
                  {timelineMode === 'continuous'
                    ? 'Continuous playback repeats the selected recorded day; it does not invent future weather.'
                    : 'Each hour uses its complete recorded input bundle, including operating status.'}{' '}
                  Observations span December 2017–November 2018. Hours from 19
                  September onward are held out; earlier hours are training
                  demonstrations. Editing a weather control exits time playback.
                </div>
                <div className="form-row">
                  <label>
                    Playback speed <output>{speed}×</output>
                  </label>
                  <div className="timeline-speeds">
                    {[1, 5, 15].map((n) => (
                      <button
                        key={n}
                        aria-pressed={speed === n}
                        className={speed === n ? 'selected' : ''}
                        onClick={() => setSpeed(n)}
                      >
                        <b>{n}×</b>
                        <span>{60 / n} sec / hour</span>
                      </button>
                    ))}
                  </div>
                </div>
                {timelineError && (
                  <div className="note warning" role="alert">
                    {timelineError}
                  </div>
                )}
                <button
                  className="primary"
                  disabled={timelineLoading}
                  onClick={() => void startTimeline()}
                >
                  {timelineLoading ? (
                    <LoaderCircle size={15} className="animate-spin" />
                  ) : timelineMode === 'continuous' ? (
                    <Repeat2 size={15} />
                  ) : (
                    <Play size={15} />
                  )}{' '}
                  {timelineLoading
                    ? 'Loading recorded hours…'
                    : timelineMode === 'continuous'
                      ? 'Start continuous playback'
                      : 'Run this time range'}
                </button>
                {historical && (
                  <div className="action-row">
                    <button className="secondary" onClick={togglePlayback}>
                      {playing ? <Pause size={14} /> : <Play size={14} />}{' '}
                      {playing ? 'Pause' : 'Resume'}
                    </button>
                    <button className="secondary" onClick={stopTimeline}>
                      <Square size={13} /> Stop playback
                    </button>
                  </div>
                )}
                {timelinePlan && (
                  <div className="panel-section">
                    <h3>
                      {finishedAt
                        ? 'Completed period'
                        : historical
                          ? 'Current run'
                          : 'Last run'}
                    </h3>
                    <p className="field-hint">
                      {timelinePlan.start.replace('T', ' ')} →{' '}
                      {timelinePlan.end.replace('T', ' ')}
                      {timelinePlan.mode === 'continuous' ? ' · repeating' : ''}
                    </p>
                    <div className="metric-pair">
                      <div>
                        <small>ESTIMATED RENTALS</small>
                        <strong>
                          {Math.round(
                            timelineTotals.estimated,
                          ).toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <small>OBSERVED RENTALS</small>
                        <strong>
                          {timelineTotals.observed.toLocaleString()}
                        </strong>
                      </div>
                    </div>
                    <p className="field-hint">
                      Totals for {timelineTotals.hours} completed hours. Partial
                      hours are excluded.
                    </p>
                  </div>
                )}
                <button
                  className="secondary"
                  style={{ width: '100%', marginTop: 14 }}
                  onClick={() => setPanel('playback')}
                >
                  <History size={15} /> Inspect a held-out day
                </button>
              </>
            )}
            {panel === 'playback' && (
              <>
                {historyData ? (
                  <>
                    <p className="eyebrow">{historyData.label}</p>
                    <div
                      className="hour-chart"
                      aria-label="24 hourly observed rentals and model estimates"
                    >
                      {historyData.rows.map((row, i) => {
                        const max = Math.max(
                          ...historyData.rows.flatMap((r) => [
                            r.observed,
                            r.prediction,
                          ]),
                        );
                        return (
                          <div
                            className="hour-bar"
                            key={i}
                            title={`${i}:00 — observed ${row.observed}, estimated ${Math.round(row.prediction)}`}
                          >
                            <i
                              style={{
                                height: `${(row.observed / max) * 100}%`,
                              }}
                            />
                            <i
                              style={{
                                height: `${(row.prediction / max) * 100}%`,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                    <p className="field-hint">
                      00:00 <span style={{ float: 'right' }}>23:00</span>
                      <br />
                      Dark: observed · Light: model estimate
                    </p>
                    <div className="form-row">
                      <label id="historical-hour">
                        <span>Historical hour</span>
                        <output>{historyIndex}:00</output>
                      </label>
                      <Slider
                        aria-labelledby="historical-hour"
                        value={[historyIndex]}
                        min={0}
                        max={23}
                        step={1}
                        onValueChange={(v) => {
                          if (historical) stopTimeline();
                          setHistoryIndex(Array.isArray(v) ? v[0] : v);
                        }}
                      />
                    </div>
                    <div className="metric-pair">
                      <div>
                        <small>OBSERVED</small>
                        <strong>
                          {historyData.rows[
                            historyIndex
                          ].observed.toLocaleString()}
                        </strong>
                      </div>
                      <div>
                        <small>MODEL ESTIMATE</small>
                        <strong>
                          {Math.round(
                            historyData.rows[historyIndex].prediction,
                          ).toLocaleString()}
                        </strong>
                      </div>
                    </div>
                    <p className="panel-copy">
                      Error:{' '}
                      {Math.round(
                        historyData.rows[historyIndex].prediction -
                          historyData.rows[historyIndex].observed,
                      ) >= 0
                        ? '+'
                        : ''}
                      {Math.round(
                        historyData.rows[historyIndex].prediction -
                          historyData.rows[historyIndex].observed,
                      )}{' '}
                      rentals.
                    </p>
                    <div className="action-row">
                      <button
                        className="primary"
                        onClick={() => {
                          startHistory(historyIndex);
                        }}
                      >
                        <Play size={14} /> Play from this hour
                      </button>
                      {historical && (
                        <button className="secondary" onClick={stopTimeline}>
                          Stop
                        </button>
                      )}
                    </div>
                    <div className="note">
                      Each hour applies its complete observed weather bundle and
                      runs the model. Each hour lasts 60 seconds at 1×, 12
                      seconds at 5×, or 4 seconds at 15×. This sequence was
                      excluded from model fitting; the graph shows its errors as
                      well as successes.
                    </div>
                  </>
                ) : (
                  <p className="panel-copy">
                    Historical data is unavailable. Reload the page to retry
                    loading the held-out observations.
                  </p>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
