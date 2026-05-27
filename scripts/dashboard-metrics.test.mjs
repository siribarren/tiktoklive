import { buildStandardDashboardModel } from '../src/app/dashboard/metric-engine.mjs';
import { METRIC_DEFINITIONS } from '../src/app/dashboard/metric-definitions.mjs';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFiniteNumber(value, message) {
  assert(Number.isFinite(Number(value)), message);
}

function buildFixture(client) {
  const now = new Date('2026-05-11T12:00:00Z');
  const isWom = client === 'WOM';
  const accountA = isWom ? '@ejecutivawomfabi' : '@hmarcelo.beneficios';
  const accountB = isWom ? '@ejecutivawomnejanai' : '@bbysalooo';
  const accountC = isWom ? '@ejecutivawommari' : '@ada_rengifo1012';

  return {
    updatedAt: now,
    runningTargets: [accountA, accountB],
    accounts: [
      { uniqueId: accountA },
      { uniqueId: accountB },
      { uniqueId: accountC },
    ],
    liveSessions: [
      {
        id: 'session-a-1',
        rawSessionId: 'ra1',
        accountName: accountA,
        startTime: new Date('2026-05-10T10:00:00Z'),
        endTime: new Date('2026-05-10T12:00:00Z'),
        viewers: 100,
      },
      {
        id: 'session-b-1',
        rawSessionId: 'rb1',
        accountName: accountB,
        startTime: new Date('2026-05-11T11:00:00Z'),
        endTime: new Date('2026-05-11T12:00:00Z'),
        viewers: 80,
      },
    ],
    allMessages: [
      { username: '@user_1', nickname: 'User 1', score: 2 },
      { username: '@user_2', nickname: 'User 2', score: 0 },
      { username: '@user_3', nickname: 'User 3', score: 1 },
      { username: '@user_1', nickname: 'User 1', score: 3 },
    ],
    allLeads: [
      {
        id: 'l1',
        status: 'Qualified',
        accountUniqueId: accountA,
        categories: ['Condicion'],
        lastActivity: new Date('2026-05-10T11:00:00Z'),
        messages: [{ sessionId: 'session-a-1' }],
      },
      {
        id: 'l2',
        status: 'Contacted',
        accountUniqueId: accountB,
        categories: ['Precio'],
        lastActivity: new Date('2026-05-11T11:30:00Z'),
        messages: [{ sessionId: 'session-b-1' }],
      },
      {
        id: 'l3',
        status: 'New',
        accountUniqueId: accountB,
        categories: ['Portabilidad'],
        lastActivity: new Date('2026-05-11T11:45:00Z'),
        messages: [{ sessionId: 'session-b-1' }],
      },
      {
        id: 'l4',
        status: 'Reviewed',
        accountUniqueId: accountC,
        categories: ['Sin interes'],
        lastActivity: new Date('2026-05-11T11:50:00Z'),
        messages: [{ sessionId: 'session-b-1' }],
      },
    ],
  };
}

function validateCommonModel(model) {
  assert(Array.isArray(model.kpiCards) && model.kpiCards.length > 0, 'Debe construir KPI cards.');
  assert(Array.isArray(model.dailyTrend) && model.dailyTrend.length > 0, 'Debe construir tendencia diaria.');
  assert(Array.isArray(model.agentRows) && model.agentRows.length > 0, 'Debe construir tabla de agentes.');
  assert(Array.isArray(model.alerts) && model.alerts.length > 0, 'Debe construir alertas.');

  const metrics = model.metrics;
  ['leadLikeCount', 'salesTotal', 'conversionRate', 'liveHours', 'adherenceRate', 'views', 'peakViewers'].forEach((key) => {
    assertFiniteNumber(metrics[key], `Metrica ${key} debe ser numerica y finita.`);
  });

  assert(metrics.conversionRate >= 0, 'La conversion no debe ser negativa.');
  assert(metrics.conversionRate <= 999.99, 'La conversion no debe exceder el maximo esperado.');
  assert(metrics.adherenceRate >= 0, 'La adherencia no debe ser negativa.');

  model.metricDefinitions.forEach((metricDefinition) => {
    const value = metrics[metricDefinition.key];

    if (metricDefinition.format === 'text') {
      assert(value !== undefined, `Metrica de texto ${metricDefinition.key} debe existir.`);
      return;
    }

    assert(value !== undefined, `Metrica ${metricDefinition.key} debe existir.`);

    if (Array.isArray(value)) {
      return;
    }

    if (typeof value === 'object' && value !== null) {
      return;
    }

    assertFiniteNumber(value, `Metrica ${metricDefinition.key} debe ser finita.`);
  });
}

function run() {
  const womFixture = buildFixture('WOM');
  const claroFixture = buildFixture('CLARO');

  const womModel = buildStandardDashboardModel(womFixture, 'WOM');
  const claroModel = buildStandardDashboardModel(claroFixture, 'CLARO');

  validateCommonModel(womModel);
  validateCommonModel(claroModel);

  assert(womModel.metrics.prospectsTotal === womFixture.allLeads.length, 'WOM debe usar prospectos como base.');
  assert(claroModel.metrics.leadsTotal === claroFixture.allLeads.length, 'Claro debe usar leads como base.');
  assert(womModel.metrics.leadLikeCount === womModel.metrics.prospectsTotal, 'WOM leadLikeCount debe igualar prospectsTotal.');
  assert(claroModel.metrics.leadLikeCount === claroModel.metrics.leadsTotal, 'Claro leadLikeCount debe igualar leadsTotal.');

  const expectedSales = 2;
  assert(womModel.metrics.salesTotal === expectedSales, 'El calculo de ventas debe usar estados Qualified/Contacted.');
  assert(round(womModel.metrics.conversionRate, 2) === round((expectedSales / 4) * 100, 2), 'La conversion WOM debe seguir la formula.');

  const womDefinitions = METRIC_DEFINITIONS.filter((metric) => metric.appliesTo.includes('WOM')).map((metric) => metric.key);
  womDefinitions.forEach((key) => {
    assert(key in womModel.metrics, `Metrica WOM ${key} debe existir en el modelo.`);
  });

  const claroDefinitions = METRIC_DEFINITIONS.filter((metric) => metric.appliesTo.includes('CLARO')).map((metric) => metric.key);
  claroDefinitions.forEach((key) => {
    assert(key in claroModel.metrics, `Metrica CLARO ${key} debe existir en el modelo.`);
  });

  console.log('Dashboard metrics tests passed.');
}

function round(value, decimals = 2) {
  const safeValue = Number(value) || 0;
  const factor = 10 ** decimals;
  return Math.round(safeValue * factor) / factor;
}

run();
