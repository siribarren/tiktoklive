import { METRIC_DEFINITIONS, metricAppliesToClient } from './metric-definitions.mjs';
import {
  CLIENT_DASHBOARD_CONFIG,
  resolveClientDashboardConfig,
  DEFAULT_ADHERENCE_TARGET_PERCENT,
  DEFAULT_EXPECTED_CONVERSION_PERCENT,
  DEFAULT_EXPECTED_HOURS_PER_AGENT_PER_DAY,
  DEFAULT_EXPECTED_LEADS_PER_AGENT_PER_DAY,
  DEFAULT_EXPECTED_SALES_PER_AGENT_PER_DAY,
} from './client-config.mjs';
import {
  getDefaultDisplayNameForAccount,
  getUsersForClient,
  isAccountInClient,
  resolveClientByAccount,
} from './client-users.mjs';

const QUALIFIED_LEAD_SCORE_THRESHOLD = 7;

function safeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function safeNonNegative(value) {
  return Math.max(0, safeNumber(value));
}

function safeDivide(numerator, denominator) {
  const safeDenominator = safeNumber(denominator);
  if (!Number.isFinite(safeDenominator) || safeDenominator <= 0) {
    return 0;
  }
  return safeNumber(numerator) / safeDenominator;
}

function clampPercentage(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 999.99) {
    return 999.99;
  }
  return value;
}

function round(value, decimals = 2) {
  const safeValue = safeNumber(value);
  const factor = 10 ** decimals;
  return Math.round(safeValue * factor) / factor;
}

function normalizeUniqueId(value) {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function resolveDisplayDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date;
}

function toDateKey(value) {
  const date = resolveDisplayDate(value);
  if (!date) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDayLabel(dateKey) {
  const date = resolveDisplayDate(`${dateKey}T00:00:00`);
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

function resolveSessionDurationMinutes(session, now) {
  const startTime = resolveDisplayDate(session.startTime);
  if (!startTime) {
    return 0;
  }
  const endTime = resolveDisplayDate(session.endTime) ?? now;
  const durationMs = endTime.getTime() - startTime.getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 0;
  }
  return durationMs / (1000 * 60);
}

function inferEps(agentKey, clientKey) {
  const resolvedClient = resolveClientByAccount(agentKey);
  if (resolvedClient === 'WOM') {
    return 'WOM';
  }
  if (resolvedClient === 'CLARO') {
    return 'Claro';
  }
  return clientKey === 'WOM' ? 'WOM' : 'Claro';
}

function isSaleLead(lead) {
  const status = String(lead?.status ?? '').toLowerCase();
  return status === 'qualified' || status === 'contacted';
}

function safeCategory(category) {
  const normalized = String(category ?? '').trim();
  return normalized || 'Sin causal';
}

function createDailyAccumulator() {
  return {
    leadsTotal: 0,
    prospectsTotal: 0,
    salesTotal: 0,
    conversionRate: 0,
    liveMinutes: 0,
    liveHours: 0,
    liveBlocks: 0,
    views: 0,
    peakViewers: 0,
    activeAgentsSet: new Set(),
  };
}

function createAgentAccumulator(agentKey, clientKey) {
  const defaultDisplayName = getDefaultDisplayNameForAccount(agentKey);
  return {
    agentKey,
    agentLabel: defaultDisplayName ?? agentKey,
    eps: inferEps(agentKey, clientKey),
    leadsTotal: 0,
    prospectsTotal: 0,
    salesTotal: 0,
    conversionRate: 0,
    liveMinutes: 0,
    liveHours: 0,
    liveBlocks: 0,
    adherenceRate: 0,
    views: 0,
    peakViewers: 0,
    leadLikeCount: 0,
    hasConnection: false,
    hasSales: false,
    noSaleReasons: {},
    daily: {},
  };
}

function createAgentDailyAccumulator() {
  return {
    leads: 0,
    sales: 0,
    liveHours: 0,
    liveBlocks: 0,
    peakViewers: 0,
    conversionRate: 0,
  };
}

function calculateHeatmapHotScore(dailyMetrics) {
  let score = 0;
  if (safeNonNegative(dailyMetrics.liveBlocks) >= 2) {
    score += 1;
  }
  if (safeNonNegative(dailyMetrics.liveHours) >= 3) {
    score += 1;
  }
  if (safeNonNegative(dailyMetrics.leads) >= 6) {
    score += 1;
  }
  if (safeNonNegative(dailyMetrics.peakViewers) >= 10) {
    score += 1;
  }
  if (safeNonNegative(dailyMetrics.sales) >= 2) {
    score += 1;
  }
  return score;
}

function pushReason(bucket, reason) {
  const safeReason = safeCategory(reason);
  bucket[safeReason] = (bucket[safeReason] ?? 0) + 1;
}

function buildTopRanking(rows, key, limit = 5) {
  return [...rows]
    .sort((left, right) => {
      const delta = safeNumber(right[key]) - safeNumber(left[key]);
      if (delta !== 0) {
        return delta;
      }
      return String(left.agentLabel).localeCompare(String(right.agentLabel));
    })
    .slice(0, limit)
    .map((row, index) => ({
      rank: index + 1,
      agent: row.agentLabel,
      value: safeNumber(row[key]),
    }));
}

function aggregateStatusDistribution(leads) {
  const buckets = new Map();
  leads.forEach((lead) => {
    const status = String(lead.status ?? 'Unknown').trim() || 'Unknown';
    buckets.set(status, (buckets.get(status) ?? 0) + 1);
  });
  return Array.from(buckets.entries())
    .map(([status, value]) => ({ status, value }))
    .sort((left, right) => right.value - left.value);
}

function ensureDateKeys(dateKeys, now) {
  const sortedUnique = [...new Set(dateKeys.filter(Boolean))].sort((left, right) => left.localeCompare(right));
  if (sortedUnique.length > 0) {
    return sortedUnique;
  }
  return [toDateKey(now)];
}

function formatDurationFromMinutes(minutesValue) {
  const minutes = Math.max(0, Math.round(safeNumber(minutesValue)));
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours <= 0) {
    return `${restMinutes}m`;
  }
  return `${hours}h ${String(restMinutes).padStart(2, '0')}m`;
}

export function formatMetricValue(metricDefinition, rawValue) {
  const metricFormat = metricDefinition?.format ?? 'number';
  const value = safeNumber(rawValue);

  if (metricFormat === 'percentage') {
    return `${round(clampPercentage(value), 1)}%`;
  }

  if (metricFormat === 'duration') {
    return formatDurationFromMinutes(value);
  }

  if (metricFormat === 'decimal') {
    return round(value, 2).toLocaleString('es-CL');
  }

  if (metricFormat === 'text') {
    return String(rawValue ?? '--');
  }

  return Math.round(value).toLocaleString('es-CL');
}

function calculateMetricDictionary(context) {
  const {
    clientConfig,
    now,
    allMessages,
    allLeads,
    liveSessions,
    accounts,
    runningTargets,
  } = context;

  const sessionAccountById = new Map();
  liveSessions.forEach((session) => {
    const accountKey = normalizeUniqueId(session.accountName) || '@sin_cuenta';
    const tokens = [session.id, session.rawSessionId];
    tokens.forEach((token) => {
      const normalizedToken = String(token ?? '').trim();
      if (normalizedToken) {
        sessionAccountById.set(normalizedToken, accountKey);
      }
    });
  });

  const dateKeys = [];
  const dailyBuckets = new Map();
  const agents = new Map();
  const noSaleReasonCounter = {};
  const rosterAgentKeys = getUsersForClient(clientConfig.clientKey)
    .map(normalizeUniqueId)
    .filter(Boolean);

  function getDailyBucket(dateKey) {
    if (!dailyBuckets.has(dateKey)) {
      dailyBuckets.set(dateKey, createDailyAccumulator());
    }
    return dailyBuckets.get(dateKey);
  }

  function getAgentBucket(agentKey) {
    if (!agents.has(agentKey)) {
      agents.set(agentKey, createAgentAccumulator(agentKey, clientConfig.clientKey));
    }
    return agents.get(agentKey);
  }

  rosterAgentKeys.forEach((agentKey) => {
    getAgentBucket(agentKey);
  });

  liveSessions.forEach((session) => {
    const accountKey = normalizeUniqueId(session.accountName) || '@sin_cuenta';
    const sessionDate = resolveDisplayDate(session.startTime) ?? now;
    const dateKey = toDateKey(sessionDate);
    dateKeys.push(dateKey);

    const dailyBucket = getDailyBucket(dateKey);
    const agentBucket = getAgentBucket(accountKey);

    const sessionMinutes = resolveSessionDurationMinutes(session, now);
    const sessionHours = safeDivide(sessionMinutes, 60);
    const sessionViews = safeNonNegative(session.viewers);

    dailyBucket.liveMinutes += sessionMinutes;
    dailyBucket.liveHours += sessionHours;
    dailyBucket.liveBlocks += 1;
    dailyBucket.views += sessionViews;
    dailyBucket.peakViewers = Math.max(dailyBucket.peakViewers, sessionViews);
    dailyBucket.activeAgentsSet.add(accountKey);

    agentBucket.liveMinutes += sessionMinutes;
    agentBucket.liveHours += sessionHours;
    agentBucket.liveBlocks += 1;
    agentBucket.views += sessionViews;
    agentBucket.peakViewers = Math.max(agentBucket.peakViewers, sessionViews);
    agentBucket.hasConnection = agentBucket.liveMinutes > 0;

    if (!agentBucket.daily[dateKey]) {
      agentBucket.daily[dateKey] = createAgentDailyAccumulator();
    }
    agentBucket.daily[dateKey].liveHours += sessionHours;
    agentBucket.daily[dateKey].liveBlocks += 1;
    agentBucket.daily[dateKey].peakViewers = Math.max(
      safeNonNegative(agentBucket.daily[dateKey].peakViewers),
      sessionViews
    );
  });

  allLeads.forEach((lead) => {
    const leadDate = resolveDisplayDate(lead.lastActivity ?? now) ?? now;
    const dateKey = toDateKey(leadDate);
    dateKeys.push(dateKey);

    const fallbackMessageSessionId = lead.messages?.[lead.messages.length - 1]?.sessionId;
    const leadAccount = normalizeUniqueId(lead.accountUniqueId) || normalizeUniqueId(sessionAccountById.get(String(fallbackMessageSessionId ?? '').trim())) || '@sin_cuenta';

    const dailyBucket = getDailyBucket(dateKey);
    const agentBucket = getAgentBucket(leadAccount);

    const sold = isSaleLead(lead);

    dailyBucket.leadsTotal += 1;
    dailyBucket.prospectsTotal += 1;
    dailyBucket.salesTotal += sold ? 1 : 0;
    dailyBucket.activeAgentsSet.add(leadAccount);

    agentBucket.leadsTotal += 1;
    agentBucket.prospectsTotal += 1;
    agentBucket.salesTotal += sold ? 1 : 0;
    agentBucket.hasSales = agentBucket.salesTotal > 0;

    if (!agentBucket.daily[dateKey]) {
      agentBucket.daily[dateKey] = createAgentDailyAccumulator();
    }
    agentBucket.daily[dateKey].leads += 1;
    agentBucket.daily[dateKey].sales += sold ? 1 : 0;

    if (!sold) {
      const reason = safeCategory(lead.categories?.[0]);
      pushReason(noSaleReasonCounter, reason);
      pushReason(agentBucket.noSaleReasons, reason);
    }
  });

  const allDateKeys = ensureDateKeys(dateKeys, now);
  allDateKeys.forEach((dateKey) => {
    const dailyBucket = getDailyBucket(dateKey);
    dailyBucket.conversionRate = clampPercentage(safeDivide(dailyBucket.salesTotal, dailyBucket.prospectsTotal) * 100);
  });

  const uniqueViewersSet = new Set();
  const activeViewersSet = new Set();
  allMessages.forEach((message) => {
    const username = normalizeUniqueId(message.username) || normalizeUniqueId(message.nickname);
    if (!username) {
      return;
    }
    uniqueViewersSet.add(username);
    if (safeNumber(message.score) > 0) {
      activeViewersSet.add(username);
    }
  });

  const totalLiveMinutes = Array.from(dailyBuckets.values()).reduce((acc, bucket) => acc + bucket.liveMinutes, 0);
  const totalLiveHours = safeDivide(totalLiveMinutes, 60);
  const totalLiveBlocks = Array.from(dailyBuckets.values()).reduce((acc, bucket) => acc + bucket.liveBlocks, 0);
  const totalViewsFromSessions = Array.from(dailyBuckets.values()).reduce((acc, bucket) => acc + bucket.views, 0);
  const totalViews = totalViewsFromSessions > 0 ? totalViewsFromSessions : allMessages.length;
  const peakViewers = Array.from(dailyBuckets.values()).reduce((peak, bucket) => Math.max(peak, bucket.peakViewers), 0);

  const activeAgentsFromSessionsOrLeads = Array.from(agents.values()).filter((agent) => agent.liveMinutes > 0 || agent.leadsTotal > 0).length;
  const activeAgents = Math.max(activeAgentsFromSessionsOrLeads, runningTargets.length > 0 ? runningTargets.length : 0);
  const totalRoster = Math.max(accounts.length, activeAgents);
  const activeRoster = activeAgents;
  const inactiveRoster = Math.max(0, totalRoster - activeRoster);

  const dayCount = Math.max(1, allDateKeys.length);
  const expectedHoursPerAgentPerDay = safeNonNegative(clientConfig.expectedHoursPerAgentPerDay ?? DEFAULT_EXPECTED_HOURS_PER_AGENT_PER_DAY);
  const expectedLiveHours = activeAgents * expectedHoursPerAgentPerDay * dayCount;
  const adherenceRate = clampPercentage(safeDivide(totalLiveHours, expectedLiveHours) * 100);
  const liveHoursGap = round(totalLiveHours - expectedLiveHours, 2);

  const leadsTotal = allLeads.length;
  const prospectsTotal = allLeads.length;
  const salesTotal = allLeads.filter(isSaleLead).length;
  const potentialLeadsRaw = allLeads.filter((lead) => safeNumber(lead.totalScore) > 0).length;
  const qualifiedLeadsRaw = allLeads.filter(
    (lead) => safeNumber(lead.totalScore) >= QUALIFIED_LEAD_SCORE_THRESHOLD
  ).length;
  const qualifiedLeads = Math.max(qualifiedLeadsRaw, salesTotal);
  const potentialLeads = Math.max(potentialLeadsRaw, qualifiedLeads);
  const leadLikeCount = clientConfig.clientKey === 'WOM' ? prospectsTotal : leadsTotal;
  const conversionRate = clampPercentage(safeDivide(salesTotal, leadLikeCount) * 100);

  const avgConnectionPerAgent = safeDivide(totalLiveHours, activeAgents);
  const uniqueViewers = uniqueViewersSet.size;
  const activeViewers = activeViewersSet.size;
  const connectedUsers = Math.max(uniqueViewers, activeViewers, potentialLeads);
  const avgWatchDurationSeconds = safeDivide(totalLiveMinutes, totalViews) * 60;
  const avgWatchDurationMinutes = safeDivide(avgWatchDurationSeconds, 60);

  const prospectsPerAgent = safeDivide(prospectsTotal, activeAgents);
  const salesPerAgent = safeDivide(salesTotal, activeAgents);
  const conversionPerAgent = clampPercentage(safeDivide(salesPerAgent, prospectsPerAgent) * 100);
  const liveMinutesPerAgent = safeDivide(totalLiveMinutes, activeAgents);
  const liveBlocksPerAgent = safeDivide(totalLiveBlocks, activeAgents);
  const prospectsPerLiveHour = safeDivide(prospectsTotal, totalLiveHours);
  const salesPerLiveHour = safeDivide(salesTotal, totalLiveHours);
  const nonSaleRate = clampPercentage(safeDivide(leadLikeCount - salesTotal, leadLikeCount) * 100);
  const viewsToProspectsRate = clampPercentage(safeDivide(prospectsTotal, totalViews) * 100);
  const viewsToSalesRate = clampPercentage(safeDivide(salesTotal, totalViews) * 100);
  const uniqueViewersToProspectsRate = clampPercentage(safeDivide(prospectsTotal, uniqueViewers) * 100);
  const uniqueViewersToSalesRate = clampPercentage(safeDivide(salesTotal, uniqueViewers) * 100);

  const leadsPerActiveAgent = safeDivide(leadsTotal, activeAgents);
  const salesPerActiveAgent = safeDivide(salesTotal, activeAgents);
  const activeRosterRate = clampPercentage(safeDivide(activeRoster, totalRoster) * 100);
  const expectedConversionPercent = safeNonNegative(clientConfig.expectedConversionPercent ?? DEFAULT_EXPECTED_CONVERSION_PERCENT);

  const expectedLeads = activeAgents * safeNonNegative(clientConfig.expectedLeadsPerAgentPerDay ?? DEFAULT_EXPECTED_LEADS_PER_AGENT_PER_DAY) * dayCount;
  const expectedSales = activeAgents * safeNonNegative(clientConfig.expectedSalesPerAgentPerDay ?? DEFAULT_EXPECTED_SALES_PER_AGENT_PER_DAY) * dayCount;

  const kpiComplianceByAgent = Array.from(agents.values()).map((agent) => {
    const expectedAgentHours = expectedHoursPerAgentPerDay * dayCount;
    const compliancePercent = clampPercentage(safeDivide(agent.liveHours, expectedAgentHours) * 100);
    agent.leadLikeCount = clientConfig.clientKey === 'WOM' ? agent.prospectsTotal : agent.leadsTotal;
    agent.conversionRate = clampPercentage(safeDivide(agent.salesTotal, agent.leadLikeCount) * 100);
    agent.adherenceRate = compliancePercent;
    return {
      agent: agent.agentLabel,
      eps: agent.eps,
      compliancePercent,
    };
  });

  const kpiComplianceByEpsMap = new Map();
  kpiComplianceByAgent.forEach((row) => {
    const current = kpiComplianceByEpsMap.get(row.eps) ?? { total: 0, count: 0 };
    current.total += row.compliancePercent;
    current.count += 1;
    kpiComplianceByEpsMap.set(row.eps, current);
  });

  const kpiComplianceByEps = Array.from(kpiComplianceByEpsMap.entries()).map(([eps, values]) => ({
    eps,
    compliancePercent: clampPercentage(safeDivide(values.total, values.count)),
  }));

  const adherenceTargetPercent = safeNonNegative(clientConfig.adherenceTargetPercent ?? DEFAULT_ADHERENCE_TARGET_PERCENT);
  const agentsUnderAdherenceTarget = kpiComplianceByAgent.filter((agent) => agent.compliancePercent < adherenceTargetPercent).length;

  const agentsWithoutDailyRecords = Array.from(agents.values()).filter((agent) => {
    const leads = safeNonNegative(agent.leadsTotal);
    const minutes = safeNonNegative(agent.liveMinutes);
    return leads <= 0 && minutes <= 0;
  }).length;

  const agentsWithoutConnectionWithProspects = Array.from(agents.values()).filter((agent) => agent.prospectsTotal > 0 && agent.liveHours <= 0).length;
  const agentsConnectedWithoutSales = Array.from(agents.values()).filter((agent) => agent.liveHours > 0 && agent.salesTotal <= 0).length;

  const topNonSaleReasons = Object.entries(noSaleReasonCounter)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([reason, value]) => ({ reason, value }));

  const statusDistribution = aggregateStatusDistribution(allLeads);

  const agentRows = Array.from(agents.values())
    .map((agent) => ({
      ...agent,
      leadLikeCount: clientConfig.clientKey === 'WOM' ? agent.prospectsTotal : agent.leadsTotal,
      conversionRate: clampPercentage(safeDivide(agent.salesTotal, clientConfig.clientKey === 'WOM' ? agent.prospectsTotal : agent.leadsTotal) * 100),
      adherenceRate: clampPercentage(agent.adherenceRate),
      liveHours: round(agent.liveHours, 2),
      liveMinutes: round(agent.liveMinutes, 0),
      liveBlocks: round(agent.liveBlocks, 0),
      views: round(agent.views, 0),
      peakViewers: round(agent.peakViewers, 0),
      avgConnectionPerAgent: round(safeDivide(agent.liveHours, dayCount), 2),
    }))
    .sort((left, right) => {
      if (right.salesTotal !== left.salesTotal) {
        return right.salesTotal - left.salesTotal;
      }
      return right.leadLikeCount - left.leadLikeCount;
    });

  allDateKeys.forEach((dateKey) => {
    const dailyBucket = getDailyBucket(dateKey);
    const activeAgentCountByDay = dailyBucket.activeAgentsSet.size;
    const expectedHoursByDay = activeAgentCountByDay * expectedHoursPerAgentPerDay;

    dailyBucket.leadLikeCount = clientConfig.clientKey === 'WOM' ? dailyBucket.prospectsTotal : dailyBucket.leadsTotal;
    dailyBucket.expectedLiveHours = expectedHoursByDay;
    dailyBucket.adherenceRate = clampPercentage(safeDivide(dailyBucket.liveHours, expectedHoursByDay) * 100);
    dailyBucket.activeAgents = activeAgentCountByDay;
  });

  const dailyTrendRows = allDateKeys.map((dateKey) => {
    const bucket = getDailyBucket(dateKey);
    return {
      dateKey,
      dayLabel: toDayLabel(dateKey),
      leadLikeCount: safeNonNegative(bucket.leadLikeCount),
      leadsTotal: safeNonNegative(bucket.leadsTotal),
      prospectsTotal: safeNonNegative(bucket.prospectsTotal),
      salesTotal: safeNonNegative(bucket.salesTotal),
      conversionRate: clampPercentage(bucket.conversionRate),
      liveHours: round(bucket.liveHours, 2),
      expectedLiveHours: round(bucket.expectedLiveHours, 2),
      adherenceRate: clampPercentage(bucket.adherenceRate),
      activeAgents: safeNonNegative(bucket.activeAgents),
      views: safeNonNegative(bucket.views),
      peakViewers: safeNonNegative(bucket.peakViewers),
    };
  });

  const leadLikeDailyAverage = safeDivide(dailyTrendRows.reduce((acc, row) => acc + row.leadLikeCount, 0), dayCount);
  const salesDailyAverage = safeDivide(dailyTrendRows.reduce((acc, row) => acc + row.salesTotal, 0), dayCount);
  const conversionDailyAverage = safeDivide(dailyTrendRows.reduce((acc, row) => acc + row.conversionRate, 0), dayCount);
  const liveHoursDailyAverage = safeDivide(dailyTrendRows.reduce((acc, row) => acc + row.liveHours, 0), dayCount);

  const lastDailyRow = dailyTrendRows[dailyTrendRows.length - 1] ?? {
    leadLikeCount: 0,
    salesTotal: 0,
    conversionRate: 0,
    liveHours: 0,
  };

  const dayVsAverage = {
    leadLikeCount: round(lastDailyRow.leadLikeCount - leadLikeDailyAverage, 2),
    salesTotal: round(lastDailyRow.salesTotal - salesDailyAverage, 2),
    conversionRate: round(lastDailyRow.conversionRate - conversionDailyAverage, 2),
    liveHours: round(lastDailyRow.liveHours - liveHoursDailyAverage, 2),
  };

  const realVsExpected = {
    liveHours: {
      actual: round(totalLiveHours, 2),
      expected: round(expectedLiveHours, 2),
      gap: round(totalLiveHours - expectedLiveHours, 2),
    },
    leads: {
      actual: leadsTotal,
      expected: round(expectedLeads, 0),
      gap: round(leadsTotal - expectedLeads, 0),
    },
    sales: {
      actual: salesTotal,
      expected: round(expectedSales, 0),
      gap: round(salesTotal - expectedSales, 0),
    },
    conversion: {
      actual: round(conversionRate, 2),
      expected: round(expectedConversionPercent, 2),
      gap: round(conversionRate - expectedConversionPercent, 2),
    },
  };

  const rankings = {
    topSales: buildTopRanking(agentRows, 'salesTotal'),
    topConversion: buildTopRanking(agentRows, 'conversionRate'),
    topLiveHours: buildTopRanking(agentRows, 'liveHours'),
  };

  const connectionDateKeys = allDateKeys.filter(
    (dateKey) => safeNonNegative(getDailyBucket(dateKey).liveBlocks) > 0
  );
  const heatmapDateKeys = connectionDateKeys.length > 0 ? connectionDateKeys : allDateKeys;

  const heatmapAgentKeys = [
    ...rosterAgentKeys,
    ...Array.from(agents.keys()).filter(
      (agentKey) =>
        !rosterAgentKeys.includes(agentKey) &&
        agentKey !== '@sin_cuenta' &&
        isAccountInClient(agentKey, clientConfig.clientKey)
    ),
  ];

  const heatmapRows = heatmapAgentKeys.map((agentKey) => {
    return agentKey;
  });

  const heatmapCols = heatmapDateKeys.map((dateKey) => toDayLabel(dateKey));
  const heatmapValues = heatmapAgentKeys.map((agentKey) => {
    const agent = agents.get(agentKey) ?? createAgentAccumulator(agentKey, clientConfig.clientKey);
    return heatmapDateKeys.map((dateKey) => {
      const daily = agent.daily[dateKey] ?? createAgentDailyAccumulator();
      return calculateHeatmapHotScore(daily);
    });
  });

  const metrics = {
    leadLikeCount,
    leadsTotal,
    prospectsTotal,
    salesTotal,
    conversionRate,
    liveHours: round(totalLiveHours, 2),
    liveMinutes: round(totalLiveMinutes, 0),
    liveBlocks: round(totalLiveBlocks, 0),
    activeAgents,
    expectedLiveHours: round(expectedLiveHours, 2),
    adherenceRate,
    avgConnectionPerAgent: round(avgConnectionPerAgent, 2),
    views: round(totalViews, 0),
    totalViews: round(totalViews, 0),
    uniqueViewers,
    activeViewers,
    connectedUsers,
    potentialLeads,
    qualifiedLeads,
    avgWatchDuration: round(avgWatchDurationMinutes, 2),
    peakViewers,
    statusDistribution,
    agentRanking: rankings,
    prospectsPerAgent: round(prospectsPerAgent, 2),
    salesPerAgent: round(salesPerAgent, 2),
    conversionPerAgent: round(conversionPerAgent, 2),
    liveMinutesPerAgent: round(liveMinutesPerAgent, 0),
    liveBlocksPerAgent: round(liveBlocksPerAgent, 2),
    prospectsPerLiveHour: round(prospectsPerLiveHour, 2),
    salesPerLiveHour: round(salesPerLiveHour, 2),
    nonSaleRate: round(nonSaleRate, 2),
    topNonSaleReasons,
    agentsWithoutConnectionWithProspects,
    agentsConnectedWithoutSales,
    viewsToProspectsRate: round(viewsToProspectsRate, 2),
    viewsToSalesRate: round(viewsToSalesRate, 2),
    uniqueViewersToProspectsRate: round(uniqueViewersToProspectsRate, 2),
    uniqueViewersToSalesRate: round(uniqueViewersToSalesRate, 2),
    liveHoursGap,
    activeAgentsByDay: dailyTrendRows.map((row) => ({ day: row.dayLabel, value: row.activeAgents })),
    totalRoster,
    activeRoster,
    inactiveRoster,
    activeRosterRate: round(activeRosterRate, 2),
    leadsPerActiveAgent: round(leadsPerActiveAgent, 2),
    salesPerActiveAgent: round(salesPerActiveAgent, 2),
    kpiComplianceByEps,
    kpiComplianceByAgent,
    agentsUnderAdherenceTarget,
    agentsWithoutDailyRecords,
    realVsExpectedLiveHours: realVsExpected.liveHours,
    realVsExpectedLeads: realVsExpected.leads,
    realVsExpectedSales: realVsExpected.sales,
    realVsExpectedConversion: realVsExpected.conversion,
  };

  return {
    metrics,
    dailyTrendRows,
    dailyOperationalRows: dailyTrendRows,
    agentRows,
    statusDistribution,
    rankings,
    heatmap: {
      rows: heatmapRows,
      cols: heatmapCols,
      dateKeys: heatmapDateKeys,
      values: heatmapValues,
    },
    topNonSaleReasons,
    dayVsAverage,
    realVsExpected,
  };
}

function metricDeltaLabel(key, calculatedModel, clientConfig) {
  const { dayVsAverage, realVsExpected } = calculatedModel;
  if (key === 'leadLikeCount') {
    const delta = dayVsAverage.leadLikeCount;
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${round(delta, 1)} vs prom. diario`;
  }
  if (key === 'salesTotal') {
    const delta = dayVsAverage.salesTotal;
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${round(delta, 1)} vs prom. diario`;
  }
  if (key === 'conversionRate') {
    const delta = dayVsAverage.conversionRate;
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${round(delta, 1)} pp vs prom. diario`;
  }
  if (key === 'liveHours') {
    const gap = realVsExpected.liveHours.gap;
    const sign = gap >= 0 ? '+' : '';
    return `${sign}${round(gap, 2)}h vs esperado`;
  }
  if (key === 'adherenceRate') {
    return `Objetivo ${round(clientConfig.adherenceTargetPercent ?? DEFAULT_ADHERENCE_TARGET_PERCENT, 0)}%`;
  }
  return 'Periodo actual';
}

function resolveMetricLabel(key, clientConfig) {
  if (key === 'leadLikeCount') {
    return clientConfig.commercialUnitLabel;
  }
  const definition = METRIC_DEFINITIONS.find((metric) => metric.key === key);
  return definition?.label ?? key;
}

function resolveAlerts(calculatedModel, clientConfig) {
  const alerts = [];
  const adherenceTarget = safeNonNegative(clientConfig.adherenceTargetPercent ?? DEFAULT_ADHERENCE_TARGET_PERCENT);

  if (calculatedModel.metrics.adherenceRate < adherenceTarget) {
    alerts.push({
      severity: 'high',
      title: 'Brecha de adherencia live',
      description: `Adherencia en ${round(calculatedModel.metrics.adherenceRate, 1)}% (objetivo ${adherenceTarget}%).`,
    });
  }

  if (calculatedModel.metrics.agentsConnectedWithoutSales > 0) {
    alerts.push({
      severity: 'medium',
      title: 'Conexion sin conversion',
      description: `${calculatedModel.metrics.agentsConnectedWithoutSales} agente(s) transmitieron sin ventas.`,
    });
  }

  if (calculatedModel.metrics.conversionRate < safeNonNegative(clientConfig.expectedConversionPercent ?? DEFAULT_EXPECTED_CONVERSION_PERCENT)) {
    alerts.push({
      severity: 'medium',
      title: 'Conversion bajo objetivo',
      description: `Conversion actual ${round(calculatedModel.metrics.conversionRate, 1)}% vs objetivo ${round(clientConfig.expectedConversionPercent ?? DEFAULT_EXPECTED_CONVERSION_PERCENT, 1)}%.`,
    });
  }

  if (clientConfig.clientKey === 'WOM' && calculatedModel.metrics.topNonSaleReasons.length > 0) {
    const topReason = calculatedModel.metrics.topNonSaleReasons[0];
    alerts.push({
      severity: 'low',
      title: 'Principal causal de no venta',
      description: `${topReason.reason}: ${topReason.value} casos en el periodo.`,
    });
  }

  if (clientConfig.clientKey === 'CLARO' && calculatedModel.metrics.agentsUnderAdherenceTarget > 0) {
    alerts.push({
      severity: 'high',
      title: 'Agentes bajo adherencia objetivo',
      description: `${calculatedModel.metrics.agentsUnderAdherenceTarget} agente(s) bajo el umbral de adherencia.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      severity: 'low',
      title: 'Operacion estable',
      description: 'No se detectan brechas operativas criticas para el periodo.',
    });
  }

  return alerts;
}

export function getClientMetricLabel(client, metricKey) {
  const clientConfig = resolveClientDashboardConfig(client);
  return resolveMetricLabel(metricKey, clientConfig);
}

function buildSessionAccountLookup(liveSessions) {
  const lookup = new Map();
  liveSessions.forEach((session) => {
    const account = normalizeUniqueId(session.accountName);
    if (!account) {
      return;
    }
    const tokens = [session.id, session.rawSessionId];
    tokens.forEach((token) => {
      const safeToken = String(token ?? '').trim();
      if (safeToken) {
        lookup.set(safeToken, account);
      }
    });
  });
  return lookup;
}

function filterInputByClient(input, clientKey) {
  const allLiveSessions = Array.isArray(input.liveSessions) ? input.liveSessions : [];
  const allAccounts = Array.isArray(input.accounts) ? input.accounts : [];
  const allRunningTargets = Array.isArray(input.runningTargets) ? input.runningTargets : [];
  const allLeads = Array.isArray(input.allLeads) ? input.allLeads : [];
  const allMessages = Array.isArray(input.allMessages) ? input.allMessages : [];
  const sessionAccountLookup = buildSessionAccountLookup(allLiveSessions);

  const filteredLiveSessions = allLiveSessions.filter((session) =>
    isAccountInClient(session.accountName, clientKey)
  );

  const filteredAccounts = allAccounts.filter((account) =>
    isAccountInClient(account.uniqueId, clientKey)
  );

  const filteredRunningTargets = allRunningTargets.filter((target) =>
    isAccountInClient(target, clientKey)
  );

  const filteredLeads = allLeads.filter((lead) => {
    const directAccount = normalizeUniqueId(lead.accountUniqueId);
    if (directAccount) {
      return isAccountInClient(directAccount, clientKey);
    }

    if (!Array.isArray(lead.messages)) {
      return false;
    }

    return lead.messages.some((message) => {
      const token = String(message?.sessionId ?? '').trim();
      if (!token) {
        return false;
      }
      const account = sessionAccountLookup.get(token);
      return account ? isAccountInClient(account, clientKey) : false;
    });
  });

  const filteredMessages = allMessages.filter((message) => {
    const token = String(message?.sessionId ?? '').trim();
    if (!token) {
      return false;
    }
    const account = sessionAccountLookup.get(token);
    return account ? isAccountInClient(account, clientKey) : false;
  });

  return {
    allMessages: filteredMessages,
    allLeads: filteredLeads,
    liveSessions: filteredLiveSessions,
    accounts: filteredAccounts,
    runningTargets: filteredRunningTargets,
  };
}

export function buildStandardDashboardModel(input, client) {
  const clientConfig = resolveClientDashboardConfig(client);
  const now = resolveDisplayDate(input.updatedAt) ?? new Date();
  const filteredInput = filterInputByClient(input, clientConfig.clientKey);

  const context = {
    clientConfig,
    now,
    allMessages: filteredInput.allMessages,
    allLeads: filteredInput.allLeads,
    liveSessions: filteredInput.liveSessions,
    accounts: filteredInput.accounts,
    runningTargets: filteredInput.runningTargets,
  };

  const calculatedModel = calculateMetricDictionary(context);
  const availableMetricDefinitions = METRIC_DEFINITIONS.filter((metric) => metricAppliesToClient(metric, clientConfig.clientKey));
  const metricDefinitionByKey = new Map(availableMetricDefinitions.map((metric) => [metric.key, metric]));

  const kpiCards = clientConfig.kpiCardKeys
    .filter((metricKey) => metricDefinitionByKey.has(metricKey))
    .map((metricKey) => {
      const metricDefinition = metricDefinitionByKey.get(metricKey);
      const rawValue = calculatedModel.metrics[metricKey] ?? 0;
      return {
        key: metricKey,
        label: resolveMetricLabel(metricKey, clientConfig),
        rawValue,
        formattedValue: formatMetricValue(metricDefinition, rawValue),
        deltaLabel: metricDeltaLabel(metricKey, calculatedModel, clientConfig),
        format: metricDefinition?.format ?? 'number',
      };
    });

  const alerts = resolveAlerts(calculatedModel, clientConfig);

  return {
    client: clientConfig.clientKey,
    clientConfig,
    metricDefinitions: availableMetricDefinitions,
    metrics: calculatedModel.metrics,
    kpiCards,
    sections: clientConfig.enabledSections,
    dailyTrend: calculatedModel.dailyTrendRows,
    dailyOperationalRows: calculatedModel.dailyOperationalRows,
    agentRows: calculatedModel.agentRows,
    funnel: [
      { stage: clientConfig.commercialUnitLabel, value: calculatedModel.metrics.leadLikeCount },
      { stage: 'Ventas', value: calculatedModel.metrics.salesTotal },
    ],
    statusDistribution: calculatedModel.statusDistribution,
    rankings: calculatedModel.rankings,
    heatmap: calculatedModel.heatmap,
    topNonSaleReasons: calculatedModel.topNonSaleReasons,
    comparisons: {
      dayVsAverage: calculatedModel.dayVsAverage,
      realVsExpected: calculatedModel.realVsExpected,
      agentVsTeamAverage: {
        sales: round(safeDivide(calculatedModel.metrics.salesTotal, Math.max(1, calculatedModel.metrics.activeAgents)), 2),
        leadLikeCount: round(safeDivide(calculatedModel.metrics.leadLikeCount, Math.max(1, calculatedModel.metrics.activeAgents)), 2),
      },
    },
    alerts,
  };
}

export { CLIENT_DASHBOARD_CONFIG };
