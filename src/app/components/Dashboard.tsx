import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Funnel,
  LayoutGrid,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { DateRange } from 'react-day-picker';

import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Calendar } from './ui/calendar';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './ui/accordion';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from './ui/chart';
import type { ChartConfig } from './ui/chart';
import { HeatmapCalendar } from './ui/heatmap-calendar';
import { useRecorderBridge } from '../data/useRecorderBridge';
import {
  buildStandardDashboardModel,
  formatMetricValue,
} from '../dashboard/metric-engine.mjs';
import {
  getDefaultDisplayNameForAccount,
  getUsersForClient,
  normalizeClientAccount,
} from '../dashboard/client-users.mjs';

type DashboardClient = 'WOM' | 'CLARO';
type DatePresetKey = 'today' | 'yesterday' | 'week' | 'month' | 'ytd';
type CalendarViewMode = 'preset' | 'custom';

type DashboardInput = {
  allMessages: any[];
  allLeads: any[];
  liveSessions: any[];
  accounts: any[];
  runningTargets: string[];
  updatedAt: Date | null;
};

const DASHBOARD_CLIENT_STORAGE_KEY = 'ember:dashboard:selected-client';
const DASHBOARD_CHART_PALETTE = {
  blue100: 'rgb(134, 190, 242)',
  blue300: 'rgb(65, 126, 243)',
  blue500: 'rgb(47, 127, 242)',
  blue700: 'rgb(32, 77, 226)',
  blue900: 'rgb(36, 62, 178)',
  white: 'rgb(255, 255, 255)',
  gray200: 'rgb(229, 229, 229)',
  gray600: 'rgb(115, 115, 115)',
  blackSoft: 'rgb(26, 26, 26)',
} as const;
const DONUT_COLORS = [
  DASHBOARD_CHART_PALETTE.blue900,
  DASHBOARD_CHART_PALETTE.blue700,
  DASHBOARD_CHART_PALETTE.blue500,
  DASHBOARD_CHART_PALETTE.blue300,
  DASHBOARD_CHART_PALETTE.blue100,
  DASHBOARD_CHART_PALETTE.gray600,
  DASHBOARD_CHART_PALETTE.gray200,
];
const CHART_AXIS_TICK_STYLE = { fontSize: 10, fill: DASHBOARD_CHART_PALETTE.gray600 };
const CHART_AXIS_LABEL_STYLE = { fontSize: 10, fill: DASHBOARD_CHART_PALETTE.blackSoft };
const CHART_LEGEND_STYLE = { fontSize: '11px', color: DASHBOARD_CHART_PALETTE.blackSoft };

const DATE_PRESET_OPTIONS: Array<{ key: DatePresetKey; label: string }> = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'ytd', label: 'Acumulado' },
];

function safeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function safeDivide(numerator: unknown, denominator: unknown) {
  const safeDenominator = safeNumber(denominator);
  if (safeDenominator <= 0) {
    return 0;
  }
  return safeNumber(numerator) / safeDenominator;
}

function round(value: unknown, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(safeNumber(value) * factor) / factor;
}

function clampPercentage(value: unknown) {
  const parsed = safeNumber(value);
  if (parsed < 0) {
    return 0;
  }
  if (parsed > 999.99) {
    return 999.99;
  }
  return parsed;
}

function resolveDisplayDate(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isFinite(value.getTime())) {
      return value;
    }
    return null;
  }
  const parsed = new Date(value as any);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function shiftDate(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function toDateKey(date: Date) {
  const value = startOfDay(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  const parsed = resolveDisplayDate(`${dateKey}T00:00:00`);
  if (!parsed) {
    return null;
  }
  return startOfDay(parsed);
}

function startOfWeekMonday(date: Date) {
  const day = date.getDay();
  const offset = day === 0 ? 6 : day - 1;
  return shiftDate(startOfDay(date), -offset);
}

function endOfWeekSunday(date: Date) {
  const monday = startOfWeekMonday(date);
  return shiftDate(monday, 6);
}

function buildHeatmapWeekWindows(dateKeys: string[], fallbackDate: Date) {
  const normalizedKeys = [...new Set(dateKeys.filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const minDate = normalizedKeys.length > 0 ? parseDateKey(normalizedKeys[0]) : null;
  const maxDate = normalizedKeys.length > 0 ? parseDateKey(normalizedKeys[normalizedKeys.length - 1]) : null;

  const rangeEnd = maxDate ?? startOfDay(fallbackDate);
  const minimumRangeStart = shiftDate(rangeEnd, -6);
  const rangeStart = minDate ? (minDate.getTime() <= minimumRangeStart.getTime() ? minDate : minimumRangeStart) : minimumRangeStart;

  const firstWeekStart = startOfWeekMonday(rangeStart);
  const effectiveRangeEnd = rangeEnd.getTime() >= shiftDate(rangeStart, 6).getTime()
    ? rangeEnd
    : shiftDate(rangeStart, 6);
  const lastWeekEnd = endOfWeekSunday(effectiveRangeEnd);

  const allDateKeys: string[] = [];
  for (
    let cursor = new Date(firstWeekStart);
    cursor.getTime() <= lastWeekEnd.getTime();
    cursor = shiftDate(cursor, 1)
  ) {
    allDateKeys.push(toDateKey(cursor));
  }

  const weeks: string[][] = [];
  for (let index = 0; index < allDateKeys.length; index += 7) {
    weeks.push(allDateKeys.slice(index, index + 7));
  }
  return weeks;
}

function formatHeatmapDayLabel(dateKey: string) {
  const date = parseDateKey(dateKey);
  if (!date) {
    return dateKey;
  }
  const monthNames = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]}`;
}

function formatDateLabel(date: Date | null) {
  if (!date) {
    return '--';
  }
  const monthNames = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];
  return `${String(date.getDate()).padStart(2, '0')} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDateRangeLabel(range: DateRange | undefined) {
  if (!range?.from && !range?.to) {
    return 'Seleccionar rango';
  }

  if (range?.from && !range?.to) {
    return formatDateLabel(range.from);
  }

  return `${formatDateLabel(range?.from ?? null)} - ${formatDateLabel(range?.to ?? null)}`;
}

function getPresetDateRange(preset: DatePresetKey, referenceDate: Date): DateRange {
  const referenceDay = startOfDay(referenceDate);

  if (preset === 'today') {
    return {
      from: referenceDay,
      to: referenceDay,
    };
  }

  if (preset === 'yesterday') {
    const yesterday = shiftDate(referenceDay, -1);
    return {
      from: yesterday,
      to: yesterday,
    };
  }

  if (preset === 'week') {
    const weekDay = referenceDay.getDay();
    const offsetToMonday = weekDay === 0 ? 6 : weekDay - 1;
    const thisWeekMonday = shiftDate(referenceDay, -offsetToMonday);
    const lastWeekMonday = shiftDate(thisWeekMonday, -7);
    const lastWeekFriday = shiftDate(lastWeekMonday, 4);
    return {
      from: lastWeekMonday,
      to: lastWeekFriday,
    };
  }

  if (preset === 'month') {
    const monthStart = new Date(referenceDay.getFullYear(), referenceDay.getMonth(), 1);
    return {
      from: monthStart,
      to: referenceDay,
    };
  }

  const yearStart = new Date(referenceDay.getFullYear(), 0, 1);
  return {
    from: yearStart,
    to: referenceDay,
  };
}

function normalizeDateRange(range: DateRange | undefined) {
  const fromDate = range?.from ? startOfDay(range.from) : null;
  const toSource = range?.to ?? range?.from;
  const toDate = toSource ? endOfDay(toSource) : null;
  return {
    fromDate,
    toDate,
  };
}

function isDateInRange(date: Date | null, fromDate: Date | null, toDate: Date | null) {
  if (!date) {
    return false;
  }
  const timestamp = date.getTime();
  if (fromDate && timestamp < fromDate.getTime()) {
    return false;
  }
  if (toDate && timestamp > toDate.getTime()) {
    return false;
  }
  return true;
}

function formatSigned(value: number, decimals = 1, suffix = '') {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${round(value, decimals).toLocaleString('es-CL')}${suffix}`;
}

function getSeverityClasses(severity: string) {
  if (severity === 'high') {
    return 'border-red-200 bg-red-50 text-red-800';
  }
  if (severity === 'medium') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function resolveMetricSummary(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0 ? `${value.length} registros` : 'Sin registros';
  }
  if (value && typeof value === 'object') {
    if ('gap' in (value as Record<string, unknown>) && 'actual' in (value as Record<string, unknown>)) {
      const current = value as { actual?: number; expected?: number; gap?: number };
      const actual = Number(current.actual ?? 0).toLocaleString('es-CL');
      const expected = Number(current.expected ?? 0).toLocaleString('es-CL');
      const gap = Number(current.gap ?? 0);
      const sign = gap >= 0 ? '+' : '';
      return `Real ${actual} / Esp ${expected} (${sign}${gap.toLocaleString('es-CL')})`;
    }
    return 'Disponible';
  }
  return String(value ?? '--');
}

function mergeStatusDistribution(left: Array<{ status: string; value: number }>, right: Array<{ status: string; value: number }>) {
  const buckets = new Map<string, number>();
  [...left, ...right].forEach((entry) => {
    const current = buckets.get(entry.status) ?? 0;
    buckets.set(entry.status, current + safeNumber(entry.value));
  });
  return Array.from(buckets.entries())
    .map(([status, value]) => ({ status, value }))
    .sort((a, b) => b.value - a.value);
}

function mergeTopReasons(left: Array<{ reason: string; value: number }>, right: Array<{ reason: string; value: number }>) {
  const buckets = new Map<string, number>();
  [...left, ...right].forEach((entry) => {
    const current = buckets.get(entry.reason) ?? 0;
    buckets.set(entry.reason, current + safeNumber(entry.value));
  });
  return Array.from(buckets.entries())
    .map(([reason, value]) => ({ reason, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
}

function mergeDailyRows(left: any[], right: any[]) {
  const buckets = new Map<string, any>();

  const upsert = (row: any) => {
    if (!row?.dateKey) {
      return;
    }
    const existing = buckets.get(row.dateKey) ?? {
      dateKey: row.dateKey,
      dayLabel: row.dayLabel,
      leadLikeCount: 0,
      leadsTotal: 0,
      prospectsTotal: 0,
      salesTotal: 0,
      conversionRate: 0,
      liveHours: 0,
      expectedLiveHours: 0,
      adherenceRate: 0,
      activeAgents: 0,
      views: 0,
      peakViewers: 0,
    };

    existing.dayLabel = row.dayLabel ?? existing.dayLabel;
    existing.leadLikeCount += safeNumber(row.leadLikeCount);
    existing.leadsTotal += safeNumber(row.leadsTotal);
    existing.prospectsTotal += safeNumber(row.prospectsTotal);
    existing.salesTotal += safeNumber(row.salesTotal);
    existing.liveHours += safeNumber(row.liveHours);
    existing.expectedLiveHours += safeNumber(row.expectedLiveHours);
    existing.activeAgents += safeNumber(row.activeAgents);
    existing.views += safeNumber(row.views);
    existing.peakViewers += safeNumber(row.peakViewers);

    buckets.set(row.dateKey, existing);
  };

  left.forEach(upsert);
  right.forEach(upsert);

  const mergedRows = Array.from(buckets.values()).sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
  return mergedRows.map((row) => ({
    ...row,
    conversionRate: clampPercentage(safeDivide(row.salesTotal, row.leadLikeCount) * 100),
    adherenceRate: clampPercentage(safeDivide(row.liveHours, row.expectedLiveHours) * 100),
    liveHours: round(row.liveHours, 2),
    expectedLiveHours: round(row.expectedLiveHours, 2),
  }));
}

function buildTopRanking(rows: any[], metricKey: string, limit = 5) {
  return [...rows]
    .sort((a, b) => {
      const delta = safeNumber(b?.[metricKey]) - safeNumber(a?.[metricKey]);
      if (delta !== 0) {
        return delta;
      }
      return String(a?.agentLabel ?? '').localeCompare(String(b?.agentLabel ?? ''));
    })
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      agent: row.agentLabel,
      value: safeNumber(row?.[metricKey]),
    }));
}

function buildComparisons(dailyRows: any[], metrics: Record<string, unknown>, expectedLeads: number, expectedSales: number, expectedConversion: number) {
  const dayCount = Math.max(1, dailyRows.length);
  const leadAvg = safeDivide(dailyRows.reduce((acc, row) => acc + safeNumber(row.leadLikeCount), 0), dayCount);
  const salesAvg = safeDivide(dailyRows.reduce((acc, row) => acc + safeNumber(row.salesTotal), 0), dayCount);
  const conversionAvg = safeDivide(dailyRows.reduce((acc, row) => acc + safeNumber(row.conversionRate), 0), dayCount);
  const liveHoursAvg = safeDivide(dailyRows.reduce((acc, row) => acc + safeNumber(row.liveHours), 0), dayCount);

  const lastRow = dailyRows[dailyRows.length - 1] ?? {
    leadLikeCount: 0,
    salesTotal: 0,
    conversionRate: 0,
    liveHours: 0,
  };

  const dayVsAverage = {
    leadLikeCount: round(safeNumber(lastRow.leadLikeCount) - leadAvg, 2),
    salesTotal: round(safeNumber(lastRow.salesTotal) - salesAvg, 2),
    conversionRate: round(safeNumber(lastRow.conversionRate) - conversionAvg, 2),
    liveHours: round(safeNumber(lastRow.liveHours) - liveHoursAvg, 2),
  };

  const liveHoursActual = round(metrics.liveHours, 2);
  const liveHoursExpected = round(metrics.expectedLiveHours, 2);
  const salesActual = round(metrics.salesTotal, 0);
  const leadsActual = round(metrics.leadsTotal, 0);
  const conversionActual = round(metrics.conversionRate, 2);

  const realVsExpected = {
    liveHours: {
      actual: liveHoursActual,
      expected: liveHoursExpected,
      gap: round(liveHoursActual - liveHoursExpected, 2),
    },
    leads: {
      actual: leadsActual,
      expected: round(expectedLeads, 0),
      gap: round(leadsActual - expectedLeads, 0),
    },
    sales: {
      actual: salesActual,
      expected: round(expectedSales, 0),
      gap: round(salesActual - expectedSales, 0),
    },
    conversion: {
      actual: conversionActual,
      expected: round(expectedConversion, 2),
      gap: round(conversionActual - expectedConversion, 2),
    },
  };

  return {
    dayVsAverage,
    realVsExpected,
    agentVsTeamAverage: {
      sales: round(safeDivide(metrics.salesTotal, Math.max(1, safeNumber(metrics.activeAgents))), 2),
      leadLikeCount: round(safeDivide(metrics.leadLikeCount, Math.max(1, safeNumber(metrics.activeAgents))), 2),
    },
  };
}

function resolveKpiDeltaLabel(metricKey: string, model: any) {
  const comparisons = model?.comparisons ?? {};
  const dayVsAverage = comparisons.dayVsAverage ?? {};
  const realVsExpected = comparisons.realVsExpected ?? {};

  if (metricKey === 'leadLikeCount') {
    return `${formatSigned(safeNumber(dayVsAverage.leadLikeCount), 1)} vs prom. diario`;
  }
  if (metricKey === 'salesTotal') {
    return `${formatSigned(safeNumber(dayVsAverage.salesTotal), 1)} vs prom. diario`;
  }
  if (metricKey === 'conversionRate') {
    return `${formatSigned(safeNumber(dayVsAverage.conversionRate), 1, ' pp')} vs prom. diario`;
  }
  if (metricKey === 'liveHours') {
    return `${formatSigned(safeNumber(realVsExpected.liveHours?.gap), 2, 'h')} vs esperado`;
  }
  if (metricKey === 'adherenceRate') {
    const target = safeNumber(model?.clientConfig?.adherenceTargetPercent ?? 85);
    return `Objetivo ${round(target, 0)}%`;
  }
  return 'Periodo actual';
}

function resolveMetricLabel(model: any, metricKey: string) {
  if (metricKey === 'leadLikeCount') {
    return model?.clientConfig?.commercialUnitLabel ?? 'Leads / Prospectos';
  }
  const definition = model?.metricDefinitions?.find((entry: any) => entry.key === metricKey);
  return definition?.label ?? metricKey;
}

const CLIENT_LOGO_ASSETS: Record<
  DashboardClient,
  { primary: string; fallback?: string }
> = {
  WOM: {
    primary: '/clients/logo-de-wom-chile.png',
    fallback: '/clients/wom-chile.svg',
  },
  CLARO: {
    primary: '/clients/logo-de-claro.svg',
  },
};

function ClientLogoBadge({ client }: { client: DashboardClient }) {
  const logoAsset = CLIENT_LOGO_ASSETS[client];

  return (
    <div className="flex h-12 w-32 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200">
      <img
        src={logoAsset.primary}
        alt={`Logo ${client === 'CLARO' ? 'Claro' : 'WOM'}`}
        className="h-9 w-24 object-contain"
        loading="lazy"
        onError={(event) => {
          if (!logoAsset.fallback) {
            return;
          }
          const image = event.currentTarget;
          if (image.dataset.fallbackApplied === 'true') {
            return;
          }
          image.dataset.fallbackApplied = 'true';
          image.src = logoAsset.fallback;
        }}
      />
    </div>
  );
}

function filterDashboardInputByDateRange(input: DashboardInput, fromDate: Date | null, toDate: Date | null): DashboardInput {
  if (!fromDate && !toDate) {
    return input;
  }

  const fallbackNow = resolveDisplayDate(input.updatedAt) ?? new Date();

  return {
    allMessages: input.allMessages.filter((message) => {
      const messageDate = resolveDisplayDate(message.timestamp);
      return isDateInRange(messageDate, fromDate, toDate);
    }),
    allLeads: input.allLeads.filter((lead) => {
      const leadDate = resolveDisplayDate(lead.lastActivity);
      return isDateInRange(leadDate, fromDate, toDate);
    }),
    liveSessions: input.liveSessions.filter((session) => {
      const startTime = resolveDisplayDate(session.startTime);
      const endTime = resolveDisplayDate(session.endTime) ?? fallbackNow;
      if (!startTime) {
        return false;
      }
      if (!fromDate && !toDate) {
        return true;
      }
      if (fromDate && endTime.getTime() < fromDate.getTime()) {
        return false;
      }
      if (toDate && startTime.getTime() > toDate.getTime()) {
        return false;
      }
      return true;
    }),
    accounts: input.accounts,
    runningTargets: input.runningTargets,
    updatedAt: input.updatedAt,
  };
}

function buildSessionAccountLookup(liveSessions: any[]) {
  const lookup = new Map<string, string>();
  liveSessions.forEach((session) => {
    const account = normalizeClientAccount(session?.accountName ?? session?.uniqueId ?? '');
    if (!account) {
      return;
    }
    [session?.id, session?.rawSessionId, session?.sessionId].forEach((token) => {
      const safeToken = String(token ?? '').trim();
      if (safeToken) {
        lookup.set(safeToken, account);
      }
    });
  });
  return lookup;
}

function filterDashboardInputByExecutive(input: DashboardInput, executiveAccount: string): DashboardInput {
  const normalizedExecutive = normalizeClientAccount(executiveAccount);
  if (!normalizedExecutive) {
    return input;
  }

  const allLiveSessions = Array.isArray(input.liveSessions) ? input.liveSessions : [];
  const sessionAccountLookup = buildSessionAccountLookup(allLiveSessions);
  const filteredLiveSessions = allLiveSessions.filter(
    (session) => normalizeClientAccount(session?.accountName ?? session?.uniqueId ?? '') === normalizedExecutive
  );

  const selectedSessionTokens = new Set<string>();
  filteredLiveSessions.forEach((session) => {
    [session?.id, session?.rawSessionId, session?.sessionId].forEach((token) => {
      const safeToken = String(token ?? '').trim();
      if (safeToken) {
        selectedSessionTokens.add(safeToken);
      }
    });
  });

  const filteredMessages = input.allMessages.filter((message) => {
    const sessionToken = String(message?.sessionId ?? '').trim();
    if (!sessionToken) {
      return false;
    }
    if (selectedSessionTokens.has(sessionToken)) {
      return true;
    }
    return sessionAccountLookup.get(sessionToken) === normalizedExecutive;
  });

  const filteredLeads = input.allLeads.filter((lead) => {
    const directAccount = normalizeClientAccount(lead?.accountUniqueId ?? '');
    if (directAccount) {
      return directAccount === normalizedExecutive;
    }
    if (!Array.isArray(lead?.messages)) {
      return false;
    }
    return lead.messages.some((message: any) => {
      const sessionToken = String(message?.sessionId ?? '').trim();
      if (!sessionToken) {
        return false;
      }
      if (selectedSessionTokens.has(sessionToken)) {
        return true;
      }
      return sessionAccountLookup.get(sessionToken) === normalizedExecutive;
    });
  });

  const filteredAccounts = input.accounts.filter(
    (account) => normalizeClientAccount(account?.uniqueId ?? '') === normalizedExecutive
  );

  const filteredRunningTargets = input.runningTargets.filter(
    (runningTarget) => normalizeClientAccount(runningTarget) === normalizedExecutive
  );

  return {
    allMessages: filteredMessages,
    allLeads: filteredLeads,
    liveSessions: filteredLiveSessions,
    accounts: filteredAccounts,
    runningTargets: filteredRunningTargets,
    updatedAt: input.updatedAt,
  };
}

export function Dashboard() {
  const {
    allMessages,
    allLeads,
    liveSessions,
    accounts,
    runningTargets,
    updatedAt,
  } = useRecorderBridge();

  const [selectedClient, setSelectedClient] = useState<DashboardClient>('WOM');
  const [calendarRange, setCalendarRange] = useState<DateRange | undefined>(undefined);
  const [draftCalendarRange, setDraftCalendarRange] = useState<DateRange | undefined>(undefined);
  const [selectedPreset, setSelectedPreset] = useState<DatePresetKey | null>(null);
  const [calendarViewMode, setCalendarViewMode] = useState<CalendarViewMode>('preset');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectedExecutiveAccount, setSelectedExecutiveAccount] = useState('ALL');
  const [selectedAgentLabel, setSelectedAgentLabel] = useState('ALL');
  const [selectedKpiKey, setSelectedKpiKey] = useState<string | null>(null);
  const [selectedHeatmapWeekIndex, setSelectedHeatmapWeekIndex] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storedClient = window.localStorage.getItem(DASHBOARD_CLIENT_STORAGE_KEY);
    if (storedClient === 'CLARO_PHOENIX') {
      setSelectedClient('CLARO');
      return;
    }
    if (storedClient === 'WOM' || storedClient === 'CLARO') {
      setSelectedClient(storedClient);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(DASHBOARD_CLIENT_STORAGE_KEY, selectedClient);
  }, [selectedClient]);

  const presetReferenceDate = useMemo(
    () => resolveDisplayDate(updatedAt) ?? new Date(),
    [updatedAt]
  );

  const dateRange = useMemo(
    () => normalizeDateRange(calendarRange),
    [calendarRange]
  );

  const rawInput = useMemo(
    () => ({
      allMessages,
      allLeads,
      liveSessions,
      accounts,
      runningTargets,
      updatedAt,
    }),
    [accounts, allLeads, allMessages, liveSessions, runningTargets, updatedAt]
  );

  const dateFilteredInput = useMemo(
    () => filterDashboardInputByDateRange(rawInput, dateRange.fromDate, dateRange.toDate),
    [rawInput, dateRange.fromDate, dateRange.toDate]
  );

  const executiveOptions = useMemo(() => {
    const users = getUsersForClient(selectedClient)
      .map((user: string) => normalizeClientAccount(user))
      .filter(Boolean);
    const uniqueUsers = [...new Set(users)];
    return uniqueUsers
      .map((account) => ({
        value: account,
        label: getDefaultDisplayNameForAccount(account) ?? account,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'es-CL'));
  }, [selectedClient]);

  useEffect(() => {
    if (selectedExecutiveAccount === 'ALL') {
      return;
    }
    const isValidSelection = executiveOptions.some((option) => option.value === selectedExecutiveAccount);
    if (!isValidSelection) {
      setSelectedExecutiveAccount('ALL');
    }
  }, [executiveOptions, selectedExecutiveAccount]);

  const executiveFilteredInput = useMemo(() => {
    if (selectedExecutiveAccount === 'ALL') {
      return dateFilteredInput;
    }
    return filterDashboardInputByExecutive(dateFilteredInput, selectedExecutiveAccount);
  }, [dateFilteredInput, selectedExecutiveAccount]);

  const applyDatePreset = (preset: DatePresetKey) => {
    const range = getPresetDateRange(preset, presetReferenceDate);
    setDraftCalendarRange(range);
    setSelectedPreset(preset);
    setCalendarViewMode('preset');
  };

  const resetDateFilterToAccumulated = () => {
    const accumulatedRange = getPresetDateRange('ytd', presetReferenceDate);
    setCalendarRange(accumulatedRange);
    setDraftCalendarRange(accumulatedRange);
    setSelectedPreset('ytd');
    setCalendarViewMode('preset');
    setIsCalendarOpen(false);
  };

  const applyVisualizedRange = () => {
    setCalendarRange(draftCalendarRange);
    setIsCalendarOpen(false);
  };

  const activateCustomRange = () => {
    setCalendarViewMode('custom');
    setSelectedPreset(null);
  };

  const womModel = useMemo(
    () => buildStandardDashboardModel(executiveFilteredInput, 'WOM'),
    [executiveFilteredInput]
  );

  const claroModel = useMemo(
    () => buildStandardDashboardModel(executiveFilteredInput, 'CLARO'),
    [executiveFilteredInput]
  );

  const dashboardModel =
    selectedClient === 'WOM'
      ? womModel
      : claroModel;
  const leadLikeLabel = resolveMetricLabel(dashboardModel, 'leadLikeCount');

  const dailyCommercialChartConfig = useMemo<ChartConfig>(
    () => ({
      leadLikeCount: { label: leadLikeLabel, color: DASHBOARD_CHART_PALETTE.blue700 },
      salesTotal: { label: 'Ventas', color: DASHBOARD_CHART_PALETTE.blue500 },
      conversionRate: { label: 'Conversion %', color: DASHBOARD_CHART_PALETTE.blue300 },
    }),
    [leadLikeLabel]
  );

  const dailyLiveHoursChartConfig = useMemo<ChartConfig>(
    () => ({
      liveHours: { label: 'Horas efectivas', color: DASHBOARD_CHART_PALETTE.blue700 },
      expectedLiveHours: { label: 'Objetivo KPI', color: DASHBOARD_CHART_PALETTE.gray600 },
    }),
    []
  );

  const agentVolumeChartConfig = useMemo<ChartConfig>(
    () => ({
      leadLikeCount: { label: leadLikeLabel, color: DASHBOARD_CHART_PALETTE.blue900 },
      salesTotal: { label: 'Ventas', color: DASHBOARD_CHART_PALETTE.blue500 },
    }),
    [leadLikeLabel]
  );

  const agentEfficiencyChartConfig = useMemo<ChartConfig>(
    () => ({
      liveHours: { label: 'Horas live', color: DASHBOARD_CHART_PALETTE.blue700 },
      conversionRate: { label: 'Conversion %', color: DASHBOARD_CHART_PALETTE.blue500 },
      adherenceRate: { label: 'Adherencia %', color: DASHBOARD_CHART_PALETTE.blue300 },
    }),
    []
  );

  const leadQualityChartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    dashboardModel.statusDistribution.forEach((entry: any, index: number) => {
      config[entry.status] = {
        label: entry.status,
        color: DONUT_COLORS[index % DONUT_COLORS.length],
      };
    });
    return config;
  }, [dashboardModel.statusDistribution]);

  const heatmapRows = useMemo(
    () => (Array.isArray(dashboardModel.heatmap?.rows) ? dashboardModel.heatmap.rows : []),
    [dashboardModel.heatmap]
  );

  const heatmapDateKeys = useMemo(() => {
    if (Array.isArray(dashboardModel.heatmap?.dateKeys) && dashboardModel.heatmap.dateKeys.length > 0) {
      return dashboardModel.heatmap.dateKeys
        .map((value: unknown) => String(value ?? '').trim())
        .filter(Boolean);
    }
    return [];
  }, [dashboardModel.heatmap]);

  const heatmapScoreByRow = useMemo(() => {
    const scoreMap = new Map<string, Map<string, number>>();
    heatmapRows.forEach((rowLabel: string, rowIndex: number) => {
      const rowValues = Array.isArray(dashboardModel.heatmap?.values?.[rowIndex])
        ? dashboardModel.heatmap.values[rowIndex]
        : [];
      const dateScoreMap = new Map<string, number>();
      heatmapDateKeys.forEach((dateKey: string, dateIndex: number) => {
        dateScoreMap.set(dateKey, safeNumber(rowValues[dateIndex]));
      });
      scoreMap.set(rowLabel, dateScoreMap);
    });
    return scoreMap;
  }, [dashboardModel.heatmap, heatmapDateKeys, heatmapRows]);

  const heatmapWeeks = useMemo(() => {
    const fallbackDate = dateRange.toDate ?? dateRange.fromDate ?? presetReferenceDate;
    return buildHeatmapWeekWindows(heatmapDateKeys, fallbackDate);
  }, [dateRange.fromDate, dateRange.toDate, heatmapDateKeys, presetReferenceDate]);

  const heatmapWeeksSignature = useMemo(
    () => heatmapWeeks.map((week) => week.join(',')).join('|'),
    [heatmapWeeks]
  );

  useEffect(() => {
    setSelectedHeatmapWeekIndex(Math.max(0, heatmapWeeks.length - 1));
  }, [heatmapWeeks.length, heatmapWeeksSignature, selectedClient]);

  const activeHeatmapWeekIndex = Math.max(
    0,
    Math.min(selectedHeatmapWeekIndex, Math.max(0, heatmapWeeks.length - 1))
  );
  const visibleHeatmapDateKeys = heatmapWeeks[activeHeatmapWeekIndex] ?? [];
  const visibleHeatmapCols = visibleHeatmapDateKeys.map(formatHeatmapDayLabel);
  const visibleHeatmapValues = heatmapRows.map((rowLabel: string) => {
    const rowScoreMap = heatmapScoreByRow.get(rowLabel) ?? new Map<string, number>();
    return visibleHeatmapDateKeys.map((dateKey: string) => safeNumber(rowScoreMap.get(dateKey)));
  });

  const heatmapPalette = useMemo(
    () => ([
      DASHBOARD_CHART_PALETTE.white,
      DASHBOARD_CHART_PALETTE.blue100,
      DASHBOARD_CHART_PALETTE.blue300,
      DASHBOARD_CHART_PALETTE.blue500,
      DASHBOARD_CHART_PALETTE.blue700,
      DASHBOARD_CHART_PALETTE.blue900,
    ]),
    []
  );

  const salesPipelineStages = useMemo(() => {
    const connectedUsers = round(safeNumber(dashboardModel.metrics.connectedUsers), 0);
    const potentialLeads = round(safeNumber(dashboardModel.metrics.potentialLeads), 0);
    const qualifiedLeads = round(safeNumber(dashboardModel.metrics.qualifiedLeads), 0);
    const sales = round(safeNumber(dashboardModel.metrics.salesTotal), 0);

    const baseStages = [
      {
        key: 'connectedUsers',
        label: 'Usuarios conectados',
        count: connectedUsers,
        fill: `linear-gradient(90deg, ${DASHBOARD_CHART_PALETTE.blue700}, ${DASHBOARD_CHART_PALETTE.blue500})`,
      },
      {
        key: 'potentialLeads',
        label: 'Potenciales leads',
        count: potentialLeads,
        fill: `linear-gradient(90deg, ${DASHBOARD_CHART_PALETTE.blue900}, ${DASHBOARD_CHART_PALETTE.blue700})`,
      },
      {
        key: 'qualifiedLeads',
        label: 'Leads calificados',
        count: qualifiedLeads,
        fill: `linear-gradient(90deg, ${DASHBOARD_CHART_PALETTE.blue500}, ${DASHBOARD_CHART_PALETTE.blue300})`,
      },
      {
        key: 'sales',
        label: 'Ventas',
        count: sales,
        fill: `linear-gradient(90deg, ${DASHBOARD_CHART_PALETTE.blue900}, ${DASHBOARD_CHART_PALETTE.blackSoft})`,
      },
    ];

    const baseCount = Math.max(1, safeNumber(baseStages[0]?.count ?? 0));

    return baseStages.map((stage, index) => {
      const previousCount = index > 0 ? Math.max(1, safeNumber(baseStages[index - 1]?.count ?? 0)) : 0;
      const conversion = index > 0 ? clampPercentage(safeDivide(stage.count, previousCount) * 100) : null;
      const widthPercent = Math.max(8, Math.round(clampPercentage(safeDivide(stage.count, baseCount) * 100)));

      return {
        ...stage,
        widthPercent,
        conversion,
      };
    });
  }, [dashboardModel.metrics.connectedUsers, dashboardModel.metrics.potentialLeads, dashboardModel.metrics.qualifiedLeads, dashboardModel.metrics.salesTotal]);

  const salesPipelineSummary = useMemo(() => {
    const topCount = Math.max(0, safeNumber(salesPipelineStages[0]?.count ?? 0));
    const finalCount = Math.max(0, safeNumber(salesPipelineStages[salesPipelineStages.length - 1]?.count ?? 0));
    return {
      pipelineTotal: topCount,
      winRate: clampPercentage(safeDivide(finalCount, Math.max(1, topCount)) * 100),
    };
  }, [salesPipelineStages]);

  const metricDefinitionByKey = useMemo(
    () => new Map(dashboardModel.metricDefinitions.map((definition: any) => [definition.key, definition])),
    [dashboardModel.metricDefinitions]
  );

  const extraMetricRows = dashboardModel.clientConfig.extraKpis
    .filter((metricKey: string) => metricDefinitionByKey.has(metricKey))
    .map((metricKey: string) => {
      const definition = metricDefinitionByKey.get(metricKey);
      const rawValue = dashboardModel.metrics[metricKey as keyof typeof dashboardModel.metrics];
      return {
        key: metricKey,
        label: definition?.label ?? metricKey,
        value:
          definition &&
          (definition.format === 'number' ||
            definition.format === 'decimal' ||
            definition.format === 'duration' ||
            definition.format === 'percentage')
            ? formatMetricValue(definition, rawValue as number)
            : resolveMetricSummary(rawValue),
        description: definition?.description ?? '',
      };
    });

  const agentOptions = useMemo(
    () => dashboardModel.agentRows.map((row: any) => row.agentLabel),
    [dashboardModel.agentRows]
  );

  useEffect(() => {
    if (selectedAgentLabel === 'ALL') {
      return;
    }
    if (!agentOptions.includes(selectedAgentLabel)) {
      setSelectedAgentLabel('ALL');
    }
  }, [agentOptions, selectedAgentLabel]);

  const performanceRows = useMemo(() => {
    if (selectedAgentLabel === 'ALL') {
      return dashboardModel.agentRows.slice(0, 10);
    }
    return dashboardModel.agentRows.filter((row: any) => row.agentLabel === selectedAgentLabel);
  }, [dashboardModel.agentRows, selectedAgentLabel]);

  const selectedKpiCard = dashboardModel.kpiCards.find((card: any) => card.key === selectedKpiKey) ?? null;

  const kpiDetailRows = useMemo(() => {
    if (!selectedKpiKey) {
      return [];
    }

    const metricDefinition = metricDefinitionByKey.get(selectedKpiKey);
    const formatValue = (value: number, metricKey: string) => {
      if (metricKey === 'conversionRate' || metricKey === 'adherenceRate') {
        return `${round(value, 2).toLocaleString('es-CL')}%`;
      }
      if (metricKey === 'liveHours') {
        return `${round(value, 2).toLocaleString('es-CL')}h`;
      }
      return Number.isFinite(value)
        ? Math.round(value).toLocaleString('es-CL')
        : '0';
    };

    const rows: Array<{ label: string; value: string; detail: string }> = [];

    if (selectedKpiKey === 'leadLikeCount') {
      rows.push({
        label: resolveMetricLabel(dashboardModel, 'leadLikeCount'),
        value: safeNumber(dashboardModel.metrics.leadLikeCount).toLocaleString('es-CL'),
        detail: 'Metrica comercial normalizada leadLikeCount.',
      });
    }

    if (selectedKpiKey === 'salesTotal') {
      rows.push({
        label: 'Ventas cerradas',
        value: safeNumber(dashboardModel.metrics.salesTotal).toLocaleString('es-CL'),
        detail: 'Conteo de registros con estado Qualified o Contacted.',
      });
    }

    if (selectedKpiKey === 'conversionRate') {
      const salesTotal = safeNumber(dashboardModel.metrics.salesTotal);
      const leadLikeCount = safeNumber(dashboardModel.metrics.leadLikeCount);
      rows.push({
        label: 'Ventas',
        value: salesTotal.toLocaleString('es-CL'),
        detail: 'Numerador de conversion.',
      });
      rows.push({
        label: resolveMetricLabel(dashboardModel, 'leadLikeCount'),
        value: leadLikeCount.toLocaleString('es-CL'),
        detail: 'Denominador de conversion.',
      });
      rows.push({
        label: 'Conversion',
        value: `${round(clampPercentage(safeDivide(salesTotal, leadLikeCount) * 100), 2).toLocaleString('es-CL')}%`,
        detail: 'Formula: salesTotal / leadLikeCount * 100.',
      });
    }

    if (selectedKpiKey === 'liveHours') {
      rows.push({
        label: 'Minutos live acumulados',
        value: safeNumber(dashboardModel.metrics.liveMinutes).toLocaleString('es-CL'),
        detail: 'Suma de minutos de sesiones live en el periodo.',
      });
      rows.push({
        label: 'Horas live efectivas',
        value: `${round(safeNumber(dashboardModel.metrics.liveHours), 2).toLocaleString('es-CL')}h`,
        detail: 'Formula: liveMinutes / 60.',
      });
    }

    if (selectedKpiKey === 'adherenceRate') {
      const liveHours = safeNumber(dashboardModel.metrics.liveHours);
      const expectedLiveHours = safeNumber(dashboardModel.metrics.expectedLiveHours);
      rows.push({
        label: 'Horas live efectivas',
        value: `${round(liveHours, 2).toLocaleString('es-CL')}h`,
        detail: 'Horas reales acumuladas.',
      });
      rows.push({
        label: 'Horas live esperadas',
        value: `${round(expectedLiveHours, 2).toLocaleString('es-CL')}h`,
        detail: 'Objetivo esperado para el periodo.',
      });
      rows.push({
        label: 'Adherencia',
        value: `${round(clampPercentage(safeDivide(liveHours, expectedLiveHours) * 100), 2).toLocaleString('es-CL')}%`,
        detail: 'Formula: liveHours / expectedLiveHours * 100.',
      });
    }

    if (selectedKpiKey === 'activeAgents') {
      rows.push({
        label: 'Agentes activos',
        value: safeNumber(dashboardModel.metrics.activeAgents).toLocaleString('es-CL'),
        detail: 'Agentes con actividad live o comercial.',
      });
      rows.push({
        label: 'Promedio comercial por agente',
        value: round(dashboardModel.comparisons.agentVsTeamAverage.leadLikeCount, 2).toLocaleString('es-CL'),
        detail: `${resolveMetricLabel(dashboardModel, 'leadLikeCount')} por agente activo.`,
      });
    }

    if (selectedKpiKey === 'views') {
      rows.push({
        label: 'Visualizaciones totales',
        value: safeNumber(dashboardModel.metrics.views).toLocaleString('es-CL'),
        detail: 'Suma de viewers por sesiones o fallback de mensajes.',
      });
      rows.push({
        label: 'Espectadores unicos',
        value: safeNumber(dashboardModel.metrics.uniqueViewers).toLocaleString('es-CL'),
        detail: 'Usuarios unicos en mensajes del periodo.',
      });
    }

    if (selectedKpiKey === 'peakViewers') {
      rows.push({
        label: 'Peak espectadores',
        value: safeNumber(dashboardModel.metrics.peakViewers).toLocaleString('es-CL'),
        detail: 'Maximo diario consolidado del periodo.',
      });
      rows.push({
        label: 'Visualizaciones',
        value: safeNumber(dashboardModel.metrics.views).toLocaleString('es-CL'),
        detail: 'Contexto de volumen total de audiencia.',
      });
    }

    if (rows.length === 0) {
      rows.push({
        label: 'Valor',
        value: formatValue(safeNumber(dashboardModel.metrics[selectedKpiKey]), selectedKpiKey),
        detail: 'Detalle no disponible para esta metrica.',
      });
    }

    if (metricDefinition) {
      rows.push({
        label: 'Formula declarada',
        value: metricDefinition.formula,
        detail: `Fuente: ${metricDefinition.source}`,
      });
    }

    return rows;
  }, [
    selectedKpiKey,
    metricDefinitionByKey,
    dashboardModel,
  ]);

  const selectedRangeLabel = useMemo(
    () => formatDateRangeLabel(calendarRange),
    [calendarRange]
  );

  const selectedAgentRow =
    selectedAgentLabel === 'ALL'
      ? null
      : dashboardModel.agentRows.find((row: any) => row.agentLabel === selectedAgentLabel) ?? null;

  return (
    <div className="space-y-6 p-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Dashboard TikTok Live</h1>
          </div>
          <ClientLogoBadge client={selectedClient} />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente</label>
            <select
              value={selectedClient}
              onChange={(event) => setSelectedClient(event.target.value as DashboardClient)}
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              <option value="WOM">WOM</option>
              <option value="CLARO">Claro</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ejecutivo</label>
            <select
              value={selectedExecutiveAccount}
              onChange={(event) => setSelectedExecutiveAccount(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              <option value="ALL">Ver todo</option>
              {executiveOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1 lg:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calendario</label>
            <Popover
              open={isCalendarOpen}
              onOpenChange={(open) => {
                setIsCalendarOpen(open);
                if (open) {
                  setDraftCalendarRange(calendarRange);
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="mt-1 h-10 w-full justify-start gap-2 text-left font-normal text-slate-900"
                >
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <span className="truncate">{selectedRangeLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <div className="flex flex-col gap-3 p-3 md:flex-row">
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
                    {DATE_PRESET_OPTIONS.map((preset) => (
                      <Button
                        key={preset.key}
                        type="button"
                        variant={selectedPreset === preset.key ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => applyDatePreset(preset.key)}
                        className="justify-start"
                      >
                        {preset.label}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant={calendarViewMode === 'custom' ? 'default' : 'outline'}
                      size="sm"
                      onClick={activateCustomRange}
                      className="justify-start"
                    >
                      Personalizar
                    </Button>
                  </div>
                  <Calendar
                    mode="range"
                    numberOfMonths={calendarViewMode === 'custom' ? 2 : 1}
                    selected={draftCalendarRange}
                    defaultMonth={draftCalendarRange?.from ?? calendarRange?.from ?? presetReferenceDate}
                    onSelect={(range) => {
                      setDraftCalendarRange(range);
                      setSelectedPreset(null);
                    }}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsCalendarOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" onClick={applyVisualizedRange}>
                    Visualizar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={resetDateFilterToAccumulated}
              className="h-10 w-full border-slate-200 text-slate-700"
            >
              Limpiar filtro
            </Button>
          </div>
        </div>
      </header>

      <Accordion
        type="multiple"
        className="rounded-2xl border border-slate-200 bg-white px-4"
      >
        <AccordionItem value="kpis">
          <AccordionTrigger>
            <span className="flex items-center gap-2 text-base text-slate-900">
              <LayoutGrid className="h-5 w-5" />
              KPI Principales
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {dashboardModel.kpiCards.map((card: any) => (
                <Card key={card.key}>
                  <CardContent className="pt-6">
                    <p className="text-sm text-gray-500">{card.label}</p>
                    <p className="mt-2 text-3xl font-semibold text-gray-900">{card.formattedValue}</p>
                    <p className="mt-2 text-xs text-gray-500">{card.deltaLabel}</p>
                    <button
                      type="button"
                      onClick={() => setSelectedKpiKey(card.key)}
                      className="mt-3 text-xs font-medium text-blue-700 underline decoration-dotted underline-offset-2"
                    >
                      Ver detalle de calculo
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Dia actual vs promedio periodo</p>
                    <p className="text-sm text-gray-700">
                      {resolveMetricLabel(dashboardModel, 'leadLikeCount')}: {formatSigned(safeNumber(dashboardModel.comparisons.dayVsAverage.leadLikeCount), 2)}
                    </p>
                    <p className="text-sm text-gray-700">
                      Ventas: {formatSigned(safeNumber(dashboardModel.comparisons.dayVsAverage.salesTotal), 2)}
                    </p>
                    <p className="text-sm text-gray-700">
                      Conversion: {formatSigned(safeNumber(dashboardModel.comparisons.dayVsAverage.conversionRate), 2)} pp
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Agente vs promedio equipo</p>
                    <p className="text-sm text-gray-700">
                      {resolveMetricLabel(dashboardModel, 'leadLikeCount')} prom/agente: {round(dashboardModel.comparisons.agentVsTeamAverage.leadLikeCount, 2).toLocaleString('es-CL')}
                    </p>
                    <p className="text-sm text-gray-700">
                      Ventas prom/agente: {round(dashboardModel.comparisons.agentVsTeamAverage.sales, 2).toLocaleString('es-CL')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-gray-500">Real vs KPI esperado</p>
                    <p className="text-sm text-gray-700">
                      Horas: {safeNumber(dashboardModel.comparisons.realVsExpected.liveHours.actual).toLocaleString('es-CL')} / {safeNumber(dashboardModel.comparisons.realVsExpected.liveHours.expected).toLocaleString('es-CL')}
                    </p>
                    <p className="text-sm text-gray-700">
                      Ventas: {safeNumber(dashboardModel.comparisons.realVsExpected.sales.actual).toLocaleString('es-CL')} / {safeNumber(dashboardModel.comparisons.realVsExpected.sales.expected).toLocaleString('es-CL')}
                    </p>
                    <p className="text-sm text-gray-700">
                      Conversion: {safeNumber(dashboardModel.comparisons.realVsExpected.conversion.actual).toLocaleString('es-CL')}% / {safeNumber(dashboardModel.comparisons.realVsExpected.conversion.expected).toLocaleString('es-CL')}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="trend">
          <AccordionTrigger>
            <span className="flex items-center gap-2 text-base text-slate-900">
              <TrendingUp className="h-5 w-5" />
              Tendencias
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Leads/Prospectos, Ventas y Conversion diaria</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={dailyCommercialChartConfig}
                    className="min-h-[320px] w-full"
                  >
                    <AreaChart accessibilityLayer data={dashboardModel.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="dayLabel"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tick={CHART_AXIS_TICK_STYLE}
                        label={{ value: 'Fecha (dia y mes)', position: 'insideBottom', offset: -2, ...CHART_AXIS_LABEL_STYLE }}
                      />
                      <YAxis
                        yAxisId="left"
                        tickLine={false}
                        axisLine={false}
                        tick={CHART_AXIS_TICK_STYLE}
                        label={{ value: 'Volumen comercial', angle: -90, position: 'insideLeft', ...CHART_AXIS_LABEL_STYLE }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickLine={false}
                        axisLine={false}
                        tick={CHART_AXIS_TICK_STYLE}
                        label={{ value: 'Conversion (%)', angle: 90, position: 'insideRight', ...CHART_AXIS_LABEL_STYLE }}
                      />
                      <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                      <ChartLegend content={<ChartLegendContent />} wrapperStyle={CHART_LEGEND_STYLE} />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="leadLikeCount"
                        fill="var(--color-leadLikeCount)"
                        fillOpacity={0.2}
                        stroke="var(--color-leadLikeCount)"
                        strokeWidth={2}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="salesTotal"
                        fill="var(--color-salesTotal)"
                        fillOpacity={0.18}
                        stroke="var(--color-salesTotal)"
                        strokeWidth={2}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="conversionRate"
                        stroke="var(--color-conversionRate)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Horas live efectivas vs objetivo KPI</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={dailyLiveHoursChartConfig}
                    className="min-h-[320px] w-full"
                  >
                    <BarChart accessibilityLayer data={dashboardModel.dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="dayLabel"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tick={CHART_AXIS_TICK_STYLE}
                        label={{ value: 'Fecha (dia y mes)', position: 'insideBottom', offset: -2, ...CHART_AXIS_LABEL_STYLE }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={CHART_AXIS_TICK_STYLE}
                        label={{ value: 'Horas live', angle: -90, position: 'insideLeft', ...CHART_AXIS_LABEL_STYLE }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} wrapperStyle={CHART_LEGEND_STYLE} />
                      <Bar dataKey="liveHours" fill="var(--color-liveHours)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="expectedLiveHours" fill="var(--color-expectedLiveHours)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="agents">
          <AccordionTrigger>
            <span className="flex items-center gap-2 text-base text-slate-900">
              <Users className="h-5 w-5" />
              Performance por agente
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Agente</label>
                <select
                  value={selectedAgentLabel}
                  onChange={(event) => setSelectedAgentLabel(event.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                >
                  <option value="ALL">Todos</option>
                  {agentOptions.map((agentLabel) => (
                    <option key={agentLabel} value={agentLabel}>{agentLabel}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedAgentRow ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="grid gap-3 md:grid-cols-5">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Agente</p>
                      <p className="text-sm font-semibold text-slate-900">{selectedAgentRow.agentLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{resolveMetricLabel(dashboardModel, 'leadLikeCount')}</p>
                      <p className="text-sm font-semibold text-slate-900">{safeNumber(selectedAgentRow.leadLikeCount).toLocaleString('es-CL')}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Ventas</p>
                      <p className="text-sm font-semibold text-slate-900">{safeNumber(selectedAgentRow.salesTotal).toLocaleString('es-CL')}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Conversion</p>
                      <p className="text-sm font-semibold text-slate-900">{round(selectedAgentRow.conversionRate, 2).toLocaleString('es-CL')}%</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Horas live</p>
                      <p className="text-sm font-semibold text-slate-900">{round(selectedAgentRow.liveHours, 2).toLocaleString('es-CL')}h</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Leads/Prospectos y Ventas por agente</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={agentVolumeChartConfig}
                    className="min-h-[320px] w-full"
                  >
                    <BarChart
                      accessibilityLayer
                      data={performanceRows}
                      layout="vertical"
                      margin={{
                        left: -20,
                        right: 12,
                      }}
                    >
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        hide
                      />
                      <YAxis
                        dataKey="agentLabel"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        tick={CHART_AXIS_TICK_STYLE}
                        width={140}
                        tickFormatter={(value: string) => {
                          const label = String(value ?? '');
                          return label.length > 18 ? `${label.slice(0, 18)}...` : label;
                        }}
                      />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} wrapperStyle={CHART_LEGEND_STYLE} />
                      <Bar dataKey="leadLikeCount" fill="var(--color-leadLikeCount)" radius={5} />
                      <Bar dataKey="salesTotal" fill="var(--color-salesTotal)" radius={5} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Conversion, horas live y adherencia por agente</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={agentEfficiencyChartConfig}
                    className="min-h-[320px] w-full"
                  >
                    <LineChart accessibilityLayer data={performanceRows}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="agentLabel"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        tick={CHART_AXIS_TICK_STYLE}
                        interval={0}
                        angle={-15}
                        textAnchor="end"
                        height={70}
                        label={{ value: 'Agente', position: 'insideBottom', offset: -2, ...CHART_AXIS_LABEL_STYLE }}
                      />
                      <YAxis
                        yAxisId="left"
                        tickLine={false}
                        axisLine={false}
                        tick={CHART_AXIS_TICK_STYLE}
                        label={{ value: 'Horas live', angle: -90, position: 'insideLeft', ...CHART_AXIS_LABEL_STYLE }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tickLine={false}
                        axisLine={false}
                        tick={CHART_AXIS_TICK_STYLE}
                        label={{ value: 'Porcentaje (%)', angle: 90, position: 'insideRight', ...CHART_AXIS_LABEL_STYLE }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} wrapperStyle={CHART_LEGEND_STYLE} />
                      <Line yAxisId="left" type="monotone" dataKey="liveHours" stroke="var(--color-liveHours)" />
                      <Line yAxisId="right" type="monotone" dataKey="conversionRate" stroke="var(--color-conversionRate)" />
                      <Line yAxisId="right" type="monotone" dataKey="adherenceRate" stroke="var(--color-adherenceRate)" />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Top agentes por ventas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dashboardModel.rankings.topSales.map((entry: any) => (
                    <div key={`sales-${entry.rank}-${entry.agent}`} className="flex items-center justify-between text-sm">
                      <span>{entry.rank}. {entry.agent}</span>
                      <strong>{entry.value.toLocaleString('es-CL')}</strong>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top agentes por conversion</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dashboardModel.rankings.topConversion.map((entry: any) => (
                    <div key={`conversion-${entry.rank}-${entry.agent}`} className="flex items-center justify-between text-sm">
                      <span>{entry.rank}. {entry.agent}</span>
                      <strong>{entry.value.toLocaleString('es-CL')}%</strong>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top agentes por horas live</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dashboardModel.rankings.topLiveHours.map((entry: any) => (
                    <div key={`live-${entry.rank}-${entry.agent}`} className="flex items-center justify-between text-sm">
                      <span>{entry.rank}. {entry.agent}</span>
                      <strong>{entry.value.toLocaleString('es-CL')}h</strong>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Heatmap operativo (conexion por dia y ejecutivo)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedHeatmapWeekIndex((current) => Math.max(0, current - 1))}
                    disabled={activeHeatmapWeekIndex <= 0}
                    className="h-8 px-2"
                    aria-label="Semana anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <p className="text-xs text-slate-600">
                    Semana {activeHeatmapWeekIndex + 1} de {Math.max(1, heatmapWeeks.length)}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setSelectedHeatmapWeekIndex((current) =>
                        Math.min(Math.max(0, heatmapWeeks.length - 1), current + 1)
                      )
                    }
                    disabled={activeHeatmapWeekIndex >= Math.max(0, heatmapWeeks.length - 1)}
                    className="h-8 px-2"
                    aria-label="Semana siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                {visibleHeatmapCols.length > 0 ? (
                  <HeatmapCalendar
                    rows={heatmapRows}
                    cols={visibleHeatmapCols}
                    values={visibleHeatmapValues}
                    palette={heatmapPalette}
                    emptyCellColor="rgb(250, 250, 250)"
                    emptyCellBorderColor={DASHBOARD_CHART_PALETTE.gray200}
                    cellSize={28}
                    cellGap={2}
                    rowLabelWidth={140}
                    showCellValues={false}
                    showIntensityAverages
                    intensityLabel="INTENSIDAD MEDIA"
                    lessText="Bajo"
                    moreText="Alto"
                    renderTooltip={(cell) => (
                      <div className="space-y-1 text-slate-900">
                        <p className="text-[11px] tracking-[0.04em]">
                          {cell.row} • {cell.col}
                        </p>
                        <p className="text-sm font-semibold">Score hot: {cell.value}</p>
                      </div>
                    )}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    Sin dias de conexion en el rango seleccionado.
                  </div>
                )}
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="funnel">
          <AccordionTrigger>
            <span className="flex items-center gap-2 text-base text-slate-900">
              <Funnel className="h-5 w-5" />
              Funnel comercial
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Card>
              <CardContent className="pt-6">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Sales Pipeline</h4>
                      <p className="text-xs text-slate-500">Embudo comercial por etapa operativa</p>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.04em] text-slate-500">Pipeline Total</p>
                        <p className="text-lg font-semibold text-slate-900">
                          {safeNumber(salesPipelineSummary.pipelineTotal).toLocaleString('es-CL')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.04em] text-slate-500">Win Rate</p>
                        <p className="text-lg font-semibold text-slate-900">
                          {round(salesPipelineSummary.winRate, 1).toLocaleString('es-CL')}%
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {salesPipelineStages.map((stage, index) => (
                      <div key={stage.key} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">{stage.label}</span>
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                              {safeNumber(stage.count).toLocaleString('es-CL')} registros
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-slate-900">
                            {safeNumber(stage.count).toLocaleString('es-CL')}
                          </span>
                        </div>

                        <div className="h-7 rounded-[4px] bg-slate-100">
                          <div
                            className="flex h-7 items-center rounded-[4px] px-3 text-xs font-semibold text-white transition-all duration-300"
                            style={{
                              width: `${stage.widthPercent}%`,
                              background: stage.fill,
                            }}
                          >
                            {safeNumber(stage.count).toLocaleString('es-CL')}
                          </div>
                        </div>

                        {index > 0 ? (
                          <p className="pl-2 text-[11px] text-slate-500">
                            → {round(safeNumber(stage.conversion), 1).toLocaleString('es-CL')}% conversion
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="leadQuality">
          <AccordionTrigger>
            <span className="flex items-center gap-2 text-base text-slate-900">
              <Target className="h-5 w-5" />
              Calidad de Leads
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Distribucion de estados de lead/prospecto</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer
                    config={leadQualityChartConfig}
                    className="min-h-[320px] w-full"
                  >
                    <PieChart accessibilityLayer>
                      <Pie
                        data={dashboardModel.statusDistribution}
                        dataKey="value"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={110}
                        label={{ fontSize: 10, fill: DASHBOARD_CHART_PALETTE.blackSoft }}
                      >
                        {dashboardModel.statusDistribution.map((entry: any, index: number) => (
                          <Cell key={`status-${entry.status}`} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <ChartLegend
                        content={<ChartLegendContent nameKey="status" />}
                        wrapperStyle={CHART_LEGEND_STYLE}
                      />
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Detalle de calidad comercial</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {dashboardModel.statusDistribution.map((entry: any, index: number) => (
                    <div key={entry.status} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                        <span>{entry.status}</span>
                      </div>
                      <strong>{safeNumber(entry.value).toLocaleString('es-CL')}</strong>
                    </div>
                  ))}

                  {dashboardModel.topNonSaleReasons.length > 0 ? (
                    <div className="pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top causales de no venta</p>
                      <div className="mt-2 space-y-2">
                        {dashboardModel.topNonSaleReasons.map((entry: any) => (
                          <div key={entry.reason} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                            <span>{entry.reason}</span>
                            <strong>{safeNumber(entry.value).toLocaleString('es-CL')}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="tiktok">
          <AccordionTrigger>
            <span className="flex items-center gap-2 text-base text-slate-900">
              <Eye className="h-5 w-5" />
              Metricas TikTok Live
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <Card><CardContent className="pt-6"><p className="text-xs text-gray-500">Visualizaciones</p><p className="mt-2 text-xl font-semibold">{safeNumber(dashboardModel.metrics.views).toLocaleString('es-CL')}</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-xs text-gray-500">Espectadores unicos</p><p className="mt-2 text-xl font-semibold">{safeNumber(dashboardModel.metrics.uniqueViewers).toLocaleString('es-CL')}</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-xs text-gray-500">Espectadores activos</p><p className="mt-2 text-xl font-semibold">{safeNumber(dashboardModel.metrics.activeViewers).toLocaleString('es-CL')}</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-xs text-gray-500">Duracion promedio</p><p className="mt-2 text-xl font-semibold">{safeNumber(dashboardModel.metrics.avgWatchDuration).toLocaleString('es-CL')}m</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-xs text-gray-500">Peak espectadores</p><p className="mt-2 text-xl font-semibold">{safeNumber(dashboardModel.metrics.peakViewers).toLocaleString('es-CL')}</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-xs text-gray-500">Bloques live</p><p className="mt-2 text-xl font-semibold">{safeNumber(dashboardModel.metrics.liveBlocks).toLocaleString('es-CL')}</p></CardContent></Card>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="tables">
          <AccordionTrigger>
            <span className="flex items-center gap-2 text-base text-slate-900">
              <BarChart3 className="h-5 w-5" />
              Tabla Operativa
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Operacion diaria</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="py-2">Dia</th>
                        <th className="py-2">{resolveMetricLabel(dashboardModel, 'leadLikeCount')}</th>
                        <th className="py-2">Ventas</th>
                        <th className="py-2">Conversion</th>
                        <th className="py-2">Horas live</th>
                        <th className="py-2">Horas objetivo</th>
                        <th className="py-2">Adherencia</th>
                        <th className="py-2">Agentes activos</th>
                        <th className="py-2">Visualizaciones</th>
                        <th className="py-2">Peak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardModel.dailyOperationalRows.map((row: any) => (
                        <tr key={row.dateKey} className="border-b border-gray-100">
                          <td className="py-2">{row.dayLabel}</td>
                          <td className="py-2">{safeNumber(row.leadLikeCount).toLocaleString('es-CL')}</td>
                          <td className="py-2">{safeNumber(row.salesTotal).toLocaleString('es-CL')}</td>
                          <td className="py-2">{safeNumber(row.conversionRate).toLocaleString('es-CL')}%</td>
                          <td className="py-2">{safeNumber(row.liveHours).toLocaleString('es-CL')}h</td>
                          <td className="py-2">{safeNumber(row.expectedLiveHours).toLocaleString('es-CL')}h</td>
                          <td className="py-2">{safeNumber(row.adherenceRate).toLocaleString('es-CL')}%</td>
                          <td className="py-2">{safeNumber(row.activeAgents).toLocaleString('es-CL')}</td>
                          <td className="py-2">{safeNumber(row.views).toLocaleString('es-CL')}</td>
                          <td className="py-2">{safeNumber(row.peakViewers).toLocaleString('es-CL')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detalle por agente</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="py-2">Agente</th>
                        <th className="py-2">EPS</th>
                        <th className="py-2">{resolveMetricLabel(dashboardModel, 'leadLikeCount')}</th>
                        <th className="py-2">Ventas</th>
                        <th className="py-2">Conversion</th>
                        <th className="py-2">Horas live</th>
                        <th className="py-2">Adherencia</th>
                        <th className="py-2">Visualizaciones</th>
                        <th className="py-2">Peak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedAgentLabel === 'ALL'
                        ? dashboardModel.agentRows
                        : dashboardModel.agentRows.filter((row: any) => row.agentLabel === selectedAgentLabel)
                      ).map((row: any) => (
                        <tr key={row.agentLabel} className="border-b border-gray-100">
                          <td className="py-2 font-medium">{row.agentLabel}</td>
                          <td className="py-2">{row.eps}</td>
                          <td className="py-2">{safeNumber(row.leadLikeCount).toLocaleString('es-CL')}</td>
                          <td className="py-2">{safeNumber(row.salesTotal).toLocaleString('es-CL')}</td>
                          <td className="py-2">{safeNumber(row.conversionRate).toLocaleString('es-CL')}%</td>
                          <td className="py-2">{safeNumber(row.liveHours).toLocaleString('es-CL')}h</td>
                          <td className="py-2">{safeNumber(row.adherenceRate).toLocaleString('es-CL')}%</td>
                          <td className="py-2">{safeNumber(row.views).toLocaleString('es-CL')}</td>
                          <td className="py-2">{safeNumber(row.peakViewers).toLocaleString('es-CL')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="extras">
          <AccordionTrigger>
            <span className="flex items-center gap-2 text-base text-slate-900">
              <Clock className="h-5 w-5" />
              Metricas adicionales
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {extraMetricRows.map((metric) => (
                    <div key={metric.key} className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs text-gray-500">{metric.label}</p>
                      <p className="mt-2 text-lg font-semibold text-gray-900">{metric.value}</p>
                      {metric.description ? <p className="mt-1 text-xs text-gray-500">{metric.description}</p> : null}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="alerts">
          <AccordionTrigger>
            <span className="flex items-center gap-2 text-base text-slate-900">
              <AlertTriangle className="h-5 w-5" />
              Alertas, brechas y sugerencias
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-4 md:grid-cols-2">
              {dashboardModel.alerts.map((alert: any, index: number) => (
                <Card key={`${alert.title}-${index}`} className={getSeverityClasses(alert.severity)}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{alert.title}</p>
                        <p className="mt-1 text-sm">{alert.description}</p>
                      </div>
                      <Badge variant="outline" className="text-xs uppercase">
                        {alert.severity}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog
        open={Boolean(selectedKpiKey)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedKpiKey(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              Detalle de calculo KPI: {selectedKpiCard?.label ?? selectedKpiKey}
            </DialogTitle>
            <DialogDescription>
              Desglose en tabla de como se obtuvo el valor mostrado en la tarjeta.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Concepto</th>
                  <th className="py-2 pr-3">Valor</th>
                  <th className="py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {kpiDetailRows.map((row) => (
                  <tr key={`${row.label}-${row.value}`} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-900">{row.label}</td>
                    <td className="py-2 pr-3 text-slate-900">{row.value}</td>
                    <td className="py-2 text-slate-600">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
