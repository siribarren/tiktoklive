import { useEffect, useState } from 'react';
import {
  type Lead,
  type LiveSession,
  type Message,
} from './mockData';
import { readJsonResponse } from '../../lib/http';

interface BridgeMessage {
  id: string;
  timestamp: string;
  username: string;
  nickname: string;
  message: string;
  score: number;
  categories: string[];
  sessionId: string;
}

interface BridgeLead {
  id: string;
  status: string;
  username: string;
  nickname: string;
  totalScore: number;
  categories: string[];
  lastMessage: string;
  lastActivity: string;
  messages: BridgeMessage[];
}

interface BridgeAccount {
  uniqueId?: string;
  sessionId?: string;
  status?: string;
  updatedAt?: string;
  startTime?: string;
  endTime?: string | null;
  previousSession?: {
    sessionId?: string;
    startTime?: string;
    endTime?: string | null;
  } | null;
  messagesCount?: number;
  leadsDetected?: number;
  viewers?: number;
}

interface BridgePayload {
  currentAccount?: BridgeAccount;
  account?: BridgeAccount;
  accounts?: BridgeAccount[];
  liveSessions?: BridgeAccount[];
  messages?: BridgeMessage[];
  allMessages?: BridgeMessage[];
  leads?: BridgeLead[];
  allLeads?: BridgeLead[];
}

interface LiveStatusItem {
  uniqueId?: string;
  isLive?: boolean;
  status?: 'online' | 'offline' | 'unknown';
  checkedAt?: string;
  liveStartedAt?: string;
  playbackUrl?: string | null;
  error?: string | null;
}

interface LiveStatusPayload {
  ok?: boolean;
  statuses?: LiveStatusItem[];
  liveStatus?: LiveStatusItem[];
}

interface ControlStatusPayload extends LiveStatusPayload {
  configuredTargets?: string[];
  runningTargets?: string[];
  accounts?: BridgeAccount[];
  connectionErrors?: Record<string, string>;
  monitoringSince?: Record<string, string>;
}

interface RealtimeSnapshotPayload {
  type?: string;
  reason?: string;
  event?: Record<string, unknown> | null;
  bridgePayload?: BridgePayload;
  controlStatus?: ControlStatusPayload | null;
  emittedAt?: string;
}

type LiveStatusMap = Map<string, LiveStatusItem>;
type AccountLiveStatus = {
  isLive: boolean;
  status: 'online' | 'offline' | 'unknown';
  checkedAt: Date | null;
  liveStartedAt: Date | null;
  playbackUrl: string | null;
  error: string | null;
};

interface RecorderBridgeData {
  allMessages: Message[];
  allLeads: Lead[];
  messages: Message[];
  leads: Lead[];
  liveSessions: LiveSession[];
  accounts: Array<{
    uniqueId: string;
    nickname: string;
    status: 'Active' | 'Ended';
    updatedAt: Date | null;
    startTime: Date | null;
    endTime: Date | null;
    messagesCount: number;
    leadsDetected: number;
    viewers: number;
  }>;
  accountLabel: string;
  isLive: boolean;
  updatedAt: Date | null;
  configuredTargets: string[];
  runningTargets: string[];
  onlineTargets: string[];
  liveStatuses: Record<string, AccountLiveStatus>;
  monitoringSince: Record<string, Date | null>;
  connectionErrors: Record<string, string>;
}

const POLL_INTERVAL_MS = 2_000;
const CONTROL_STATUS_TIMEOUT_MS = 4_000;
const LIVE_ACTIVITY_FALLBACK_MS = 2 * 60 * 1000;
const WS_INITIAL_BACKOFF_MS = 1_000;
const WS_MAX_BACKOFF_MS = 15_000;
const ARCHIVED_ACCOUNT_OVERRIDES: Record<
  string,
  {
    status: 'Ended';
    updatedAt: string;
    startTime: string;
    endTime: string;
    messagesCount: number;
    leadsDetected: number;
    viewers: number;
  }
> = {
  '@f.catalinaa777': {
    status: 'Ended',
    updatedAt: '2026-04-16T17:00:55.233699',
    startTime: '2026-04-16T16:48:17.224387',
    endTime: '2026-04-16T17:00:55.233699',
    messagesCount: 43,
    leadsDetected: 3,
    viewers: 17,
  },
};

function normalizeUniqueId(value?: string): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function formatSessionTimestampKey(value: Date): string {
  const year = String(value.getFullYear());
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function buildSessionAccountAlias(accountLabel: string): string {
  const clean = accountLabel.replace(/^@/, '').toLowerCase();
  const parts = clean.split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.length === 0) {
    return 'cuenta';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 8);
  }
  return `${parts[0].slice(0, 6)}${parts[1].slice(0, 2)}`;
}

function buildLiveStatusMap(payload?: LiveStatusPayload | null): LiveStatusMap {
  const statuses = payload?.statuses ?? payload?.liveStatus ?? [];
  const liveStatusMap: LiveStatusMap = new Map();
  for (const status of statuses) {
    const uniqueId = normalizeUniqueId(status.uniqueId);
    if (uniqueId) {
      liveStatusMap.set(uniqueId, status);
    }
  }
  return liveStatusMap;
}

function firstNonEmptyArray<T>(
  ...candidates: Array<readonly T[] | null | undefined>
): T[] {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return [...candidate];
    }
  }
  return [];
}

function resolveAccountStatus(
  account: BridgeAccount,
  runningTargetSet: Set<string>,
  hasControlStatus: boolean
): 'Active' | 'Ended' {
  const accountLabel = normalizeUniqueId(account.uniqueId);
  if (hasControlStatus) {
    return runningTargetSet.has(accountLabel) ? 'Active' : 'Ended';
  }

  const archived = ARCHIVED_ACCOUNT_OVERRIDES[accountLabel];
  if (archived && (account.messagesCount ?? 0) === 0 && (account.leadsDetected ?? 0) === 0) {
    return archived.status;
  }

  return account.status === 'Active' ? 'Active' : 'Ended';
}

function normalizeCategory(category: string): string {
  const key = category.trim().toLowerCase();
  const categoryMap: Record<string, string> = {
    portability: 'Portabilidad',
    condición: 'Condición',
    condition: 'Condición',
    equipo: 'Equipo',
    device: 'Equipo',
    plan: 'Plan',
    precio: 'Precio',
    pricing: 'Precio',
  };
  return categoryMap[key] ?? category;
}

function normalizeMessageForScoring(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  return normalized.replace(/\s+/g, ' ');
}

function resolveLeadTotalScore(lead: BridgeLead): number {
  const baseTotalScore = Number(lead.totalScore) || 0;
  if (!Array.isArray(lead.messages) || lead.messages.length === 0) {
    return Math.max(0, baseTotalScore);
  }

  const seenMessageKeys = new Set<string>();
  let duplicatedScore = 0;
  for (const message of lead.messages) {
    const normalizedKey = normalizeMessageForScoring(message.message ?? '');
    if (!normalizedKey) {
      continue;
    }
    if (seenMessageKeys.has(normalizedKey)) {
      duplicatedScore += Number(message.score) || 0;
      continue;
    }
    seenMessageKeys.add(normalizedKey);
  }

  return Math.max(0, baseTotalScore - duplicatedScore);
}

function normalizeLeadStatus(score: number, status?: string): Lead['status'] {
  if (status === 'Contacted') {
    return 'Contacted';
  }
  if (status === 'Qualified' || score >= 7) {
    return 'Qualified';
  }
  if (status === 'Reviewed') {
    return 'Reviewed';
  }
  return 'New';
}

function mapMessage(message: BridgeMessage): Message {
  return {
    id: message.id,
    timestamp: new Date(message.timestamp),
    username: message.username,
    nickname: message.nickname,
    message: message.message,
    score: message.score,
    categories: message.categories.map(normalizeCategory),
    sessionId: message.sessionId,
  };
}

function buildFallbackData(): RecorderBridgeData {
  return {
    allMessages: [],
    allLeads: [],
    messages: [],
    leads: [],
    liveSessions: [],
    accounts: [],
    accountLabel: '',
    isLive: false,
    updatedAt: null,
    configuredTargets: [],
    runningTargets: [],
    onlineTargets: [],
    liveStatuses: {},
    monitoringSince: {},
    connectionErrors: {},
  };
}

function mapAccountToSession(
  account: BridgeAccount,
  runningTargetSet: Set<string>,
  hasControlStatus: boolean
): LiveSession {
  const accountLabel = normalizeUniqueId(account.uniqueId) || '@sin_cuenta';
  const archived = ARCHIVED_ACCOUNT_OVERRIDES[accountLabel];
  const resolvedStatus = resolveAccountStatus(account, runningTargetSet, hasControlStatus);
  const resolvedStartTime =
    archived && !account.startTime ? archived.startTime : account.startTime;
  const resolvedEndTime =
    archived && !account.endTime && resolvedStatus === 'Ended' ? archived.endTime : account.endTime;

  const startTime = resolvedStartTime
    ? new Date(resolvedStartTime)
    : account.updatedAt
    ? new Date(account.updatedAt)
    : new Date();
  const endTime = resolvedEndTime ? new Date(resolvedEndTime) : undefined;
  const previousSession = (() => {
    const rawPrevious = account.previousSession;
    if (!rawPrevious) {
      return undefined;
    }

    const previousStart = rawPrevious.startTime ? new Date(rawPrevious.startTime) : null;
    const previousEnd = rawPrevious.endTime ? new Date(rawPrevious.endTime) : null;
    if (
      !previousStart ||
      !previousEnd ||
      Number.isNaN(previousStart.getTime()) ||
      Number.isNaN(previousEnd.getTime())
    ) {
      return undefined;
    }

    return {
      sessionId: String(rawPrevious.sessionId ?? '').trim() || undefined,
      startTime: previousStart,
      endTime: previousEnd,
    };
  })();
  const explicitSessionId = String(account.sessionId ?? '').trim();
  const sessionTimestamp = formatSessionTimestampKey(startTime);
  const sessionAlias = buildSessionAccountAlias(accountLabel);
  const sessionId = `${sessionTimestamp}-${sessionAlias}`;
  return {
    id: sessionId,
    rawSessionId: explicitSessionId || undefined,
    accountId: accountLabel.replace(/^@/, ''),
    accountName: accountLabel,
    status: resolvedStatus,
    startTime,
    endTime,
    previousSession,
    messagesCount:
      archived && (account.messagesCount ?? 0) === 0
        ? archived.messagesCount
        : account.messagesCount ?? 0,
    leadsDetected:
      archived && (account.leadsDetected ?? 0) === 0
        ? archived.leadsDetected
        : account.leadsDetected ?? 0,
    viewers:
      archived && (account.viewers ?? 0) === 0
        ? archived.viewers
        : account.viewers ?? 0,
  };
}

function mapPayload(
  payload: BridgePayload,
  controlStatusPayload?: ControlStatusPayload | null,
  loadedAt: Date = new Date()
): RecorderBridgeData {
  const liveStatusMap = buildLiveStatusMap(controlStatusPayload);
  const liveStatuses: Record<string, AccountLiveStatus> = Object.fromEntries(
    Array.from(liveStatusMap.entries()).map(([uniqueId, status]) => {
      const parsedCheckedAt = status.checkedAt ? new Date(status.checkedAt) : null;
      return [
        uniqueId,
        {
          isLive: status.status === 'online' || status.isLive === true,
          status: status.status ?? (status.isLive ? 'online' : 'unknown'),
          checkedAt:
            parsedCheckedAt && !Number.isNaN(parsedCheckedAt.getTime()) ? parsedCheckedAt : null,
          liveStartedAt:
            status.liveStartedAt && !Number.isNaN(new Date(status.liveStartedAt).getTime())
              ? new Date(status.liveStartedAt)
              : null,
          playbackUrl: typeof status.playbackUrl === 'string' ? status.playbackUrl : null,
          error: status.error ?? null,
        } satisfies AccountLiveStatus,
      ];
    })
  );
  let configuredTargets = (controlStatusPayload?.configuredTargets ?? [])
    .map(normalizeUniqueId)
    .filter(Boolean);
  let runningTargets = (controlStatusPayload?.runningTargets ?? [])
    .map(normalizeUniqueId)
    .filter(Boolean);
  const connectionErrors = Object.fromEntries(
    Object.entries(controlStatusPayload?.connectionErrors ?? {})
      .map(([uniqueId, error]) => [normalizeUniqueId(uniqueId), error] as const)
      .filter(([uniqueId, error]) => Boolean(uniqueId && String(error).trim()))
  );
  const monitoringSince = Object.fromEntries(
    Object.entries(controlStatusPayload?.monitoringSince ?? {})
      .map(([uniqueId, startedAt]) => {
        const normalizedUniqueId = normalizeUniqueId(uniqueId);
        if (!normalizedUniqueId) {
          return null;
        }
        const parsedStartedAt = startedAt ? new Date(startedAt) : null;
        return [
          normalizedUniqueId,
          parsedStartedAt && !Number.isNaN(parsedStartedAt.getTime()) ? parsedStartedAt : null,
        ] as const;
      })
      .filter(Boolean) as Array<readonly [string, Date | null]>
  );
  const hasControlStatus = Boolean(controlStatusPayload);
  const singleAccounts = [payload.currentAccount, payload.account].filter(
    (account): account is NonNullable<typeof payload.account> => Boolean(account)
  );
  const rawAccounts = firstNonEmptyArray(
    controlStatusPayload?.accounts,
    payload.accounts,
    payload.liveSessions,
    singleAccounts
  );
  if (!hasControlStatus && runningTargets.length === 0) {
    const inferredRunningTargets = rawAccounts
      .map((account) => {
        const normalizedUniqueId = normalizeUniqueId(account.uniqueId);
        if (!normalizedUniqueId) {
          return '';
        }
        const normalizedStatus = String(account.status ?? '').trim().toLowerCase();
        const hasOpenSession = !account.endTime;
        if (normalizedStatus === 'active' || hasOpenSession) {
          return normalizedUniqueId;
        }
        return '';
      })
      .filter(Boolean);

    if (inferredRunningTargets.length > 0) {
      runningTargets = [...new Set(inferredRunningTargets)];
      if (configuredTargets.length === 0) {
        configuredTargets = [...runningTargets];
      }
    }
  }
  const runningTargetSet = new Set(runningTargets);
  const preferredAccountLabel = runningTargets[0] || configuredTargets[0] || '';
  const bridgeMessages = payload.allMessages ?? payload.messages ?? [];
  const allMessages = bridgeMessages.map(mapMessage).sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  const bridgeLeads = payload.allLeads ?? payload.leads ?? [];
  const leadSessionAccountMap = new Map<string, string>();
  rawAccounts.forEach((account) => {
    const accountKey = normalizeUniqueId(account.uniqueId);
    const sessionId = String(account.sessionId ?? '').trim();
    if (!accountKey || !sessionId) {
      return;
    }
    leadSessionAccountMap.set(sessionId, accountKey);
  });
  const allLeads: Lead[] = bridgeLeads.map((lead) => {
    const resolvedTotalScore = resolveLeadTotalScore(lead);
    return {
      accountUniqueId:
        lead.messages
          .map((message) => leadSessionAccountMap.get(String(message.sessionId ?? '').trim()) ?? '')
          .find(Boolean) || undefined,
      id: lead.id,
      status: normalizeLeadStatus(resolvedTotalScore, lead.status),
      username: lead.username,
      nickname: lead.nickname,
      totalScore: resolvedTotalScore,
      categories: lead.categories.map(normalizeCategory),
      lastMessage: lead.lastMessage,
      lastActivity: new Date(lead.lastActivity),
      messages: lead.messages.map(mapMessage),
    };
  });

  const accounts = rawAccounts.map((account) => ({
    uniqueId: normalizeUniqueId(account.uniqueId) || '@sin_cuenta',
    nickname: (normalizeUniqueId(account.uniqueId) || '@sin_cuenta').replace(/^@/, ''),
    status: resolveAccountStatus(account, runningTargetSet, hasControlStatus),
    updatedAt: account.updatedAt
      ? new Date(account.updatedAt)
      : ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)]?.updatedAt
      ? new Date(ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)].updatedAt)
      : null,
    startTime: account.startTime
      ? new Date(account.startTime)
      : ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)]?.startTime
      ? new Date(ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)].startTime)
      : null,
    endTime: account.endTime
      ? new Date(account.endTime)
      : ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)]?.endTime
      ? new Date(ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)].endTime)
      : null,
    messagesCount:
      ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)] &&
      (account.messagesCount ?? 0) === 0
        ? ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)].messagesCount
        : account.messagesCount ?? 0,
    leadsDetected:
      ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)] &&
      (account.leadsDetected ?? 0) === 0
        ? ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)].leadsDetected
        : account.leadsDetected ?? 0,
    viewers:
      ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)] &&
      (account.viewers ?? 0) === 0
        ? ARCHIVED_ACCOUNT_OVERRIDES[normalizeUniqueId(account.uniqueId)].viewers
        : account.viewers ?? 0,
  }));
  for (const account of accounts) {
    if (!runningTargetSet.has(account.uniqueId)) {
      continue;
    }

    const updatedAtMs = account.updatedAt?.getTime() ?? 0;
    const hasOpenSession = account.endTime === null;
    if (!hasOpenSession) {
      continue;
    }

    const currentStatus = liveStatuses[account.uniqueId];
    const currentCheckedAtMs = currentStatus?.checkedAt?.getTime() ?? 0;
    const hasFreshOnlineStatus =
      currentStatus?.status === 'online' &&
      currentCheckedAtMs > 0 &&
      loadedAt.getTime() - currentCheckedAtMs <= LIVE_ACTIVITY_FALLBACK_MS;
    if (hasFreshOnlineStatus) {
      continue;
    }

    liveStatuses[account.uniqueId] = {
      isLive: true,
      status: 'online',
      checkedAt: loadedAt,
      liveStartedAt: currentStatus?.liveStartedAt ?? account.startTime,
      playbackUrl: currentStatus?.playbackUrl ?? null,
      error: currentStatus?.error ?? null,
    };
  }
  const onlineTargets = Object.entries(liveStatuses)
    .filter(([, status]) => status.isLive)
    .map(([uniqueId]) => uniqueId);

  const primaryAccount =
    (preferredAccountLabel
      ? rawAccounts.find(
          (account) => normalizeUniqueId(account.uniqueId) === preferredAccountLabel
        )
      : undefined) ??
    rawAccounts.find(
      (account) => resolveAccountStatus(account, runningTargetSet, hasControlStatus) === 'Active'
    ) ??
    payload.currentAccount ??
    payload.account ??
    rawAccounts[0];
  const accountLabel = preferredAccountLabel || normalizeUniqueId(primaryAccount?.uniqueId) || '';
  const selectedSessionIds = new Set(
    rawAccounts
      .filter((account) => normalizeUniqueId(account.uniqueId) === accountLabel)
      .map((account) => String(account.sessionId ?? '').trim())
      .filter(Boolean)
  );
  const messages =
    selectedSessionIds.size > 0
      ? allMessages.filter((message) => selectedSessionIds.has(String(message.sessionId)))
      : allMessages;
  const leads =
    selectedSessionIds.size > 0
      ? allLeads.filter((lead) =>
          lead.messages.some((message) => selectedSessionIds.has(String(message.sessionId)))
        )
      : allLeads;
  const isLive = primaryAccount
    ? runningTargetSet.has(accountLabel) ||
      resolveAccountStatus(primaryAccount, runningTargetSet, hasControlStatus) === 'Active'
    : false;
  const updatedAt = loadedAt;
  const sessionsSource = firstNonEmptyArray(
    controlStatusPayload?.accounts,
    payload.accounts,
    payload.liveSessions,
    rawAccounts,
    singleAccounts
  );
  const sessions =
    sessionsSource.length > 0
      ? sessionsSource.map((account) =>
          mapAccountToSession(account, runningTargetSet, hasControlStatus)
        )
      : [];

  return {
    allMessages,
    allLeads,
    messages,
    leads,
    liveSessions: sessions,
    accounts,
    accountLabel,
    isLive,
    updatedAt,
    configuredTargets,
    runningTargets,
    onlineTargets,
    liveStatuses,
    monitoringSince,
    connectionErrors,
  };
}

function buildRecorderWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/recorder-api/ws`;
}

export function useRecorderBridge() {
  const [data, setData] = useState<RecorderBridgeData>(buildFallbackData);

  useEffect(() => {
    let active = true;
    let pollingIntervalId: number | null = null;
    let reconnectTimeoutId: number | null = null;
    let websocket: WebSocket | null = null;
    let reconnectAttempt = 0;
    let isClosingSocket = false;

    const applyBridgeData = (
      payload: BridgePayload,
      controlStatusPayload?: ControlStatusPayload | null,
      loadedAt: Date = new Date()
    ) => {
      if (!active) {
        return;
      }

      setData((previous) => {
        const mappedData = mapPayload(payload, controlStatusPayload, loadedAt);
        if (controlStatusPayload) {
          return mappedData;
        }

        const resolvedConfiguredTargets =
          mappedData.configuredTargets.length > 0
            ? mappedData.configuredTargets
            : previous.configuredTargets;
        const resolvedRunningTargets =
          mappedData.runningTargets.length > 0
            ? mappedData.runningTargets
            : previous.runningTargets;
        const resolvedOnlineTargets =
          mappedData.onlineTargets.length > 0
            ? mappedData.onlineTargets
            : previous.onlineTargets;
        const resolvedLiveStatuses =
          Object.keys(mappedData.liveStatuses).length > 0
            ? mappedData.liveStatuses
            : previous.liveStatuses;
        const resolvedMonitoringSince =
          Object.keys(mappedData.monitoringSince).length > 0
            ? mappedData.monitoringSince
            : previous.monitoringSince;
        const resolvedConnectionErrors =
          Object.keys(mappedData.connectionErrors).length > 0
            ? mappedData.connectionErrors
            : previous.connectionErrors;

        return {
          ...mappedData,
          configuredTargets: resolvedConfiguredTargets,
          runningTargets: resolvedRunningTargets,
          onlineTargets: resolvedOnlineTargets,
          liveStatuses: resolvedLiveStatuses,
          monitoringSince: resolvedMonitoringSince,
          connectionErrors: resolvedConnectionErrors,
        };
      });
    };

    const loadFromPolling = async () => {
      try {
        const controlStatusRequest = (() => {
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), CONTROL_STATUS_TIMEOUT_MS);
          return fetch(`/recorder-api/status?t=${Date.now()}`, {
            cache: 'no-store',
            signal: controller.signal,
          })
            .then(async (response) => {
              if (!response.ok) {
                return null;
              }
              return await readJsonResponse<ControlStatusPayload>(response);
            })
            .catch(() => null)
            .finally(() => {
              window.clearTimeout(timeoutId);
            });
        })();

        const [response, controlStatusPayload] = await Promise.all([
          fetch(`/current_messages.json?t=${Date.now()}`, {
            cache: 'no-store',
          }),
          controlStatusRequest,
        ]);
        if (!response.ok) {
          throw new Error(`Bridge fetch failed: ${response.status}`);
        }
        const payload = await readJsonResponse<BridgePayload>(response);
        if (!payload) {
          throw new Error('Bridge payload vacío o inválido.');
        }
        applyBridgeData(payload, controlStatusPayload, new Date());
      } catch (error) {
        console.error('Failed to load recorder bridge JSON', error);
      }
    };

    const startPolling = () => {
      if (pollingIntervalId !== null) {
        return;
      }
      void loadFromPolling();
      pollingIntervalId = window.setInterval(() => {
        void loadFromPolling();
      }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (pollingIntervalId === null) {
        return;
      }
      window.clearInterval(pollingIntervalId);
      pollingIntervalId = null;
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimeoutId !== null) {
        return;
      }
      const delay = Math.min(
        WS_MAX_BACKOFF_MS,
        WS_INITIAL_BACKOFF_MS * 2 ** reconnectAttempt
      );
      reconnectAttempt += 1;
      reconnectTimeoutId = window.setTimeout(() => {
        reconnectTimeoutId = null;
        connectWebSocket();
      }, delay);
    };

    const handleRealtimeSnapshot = (snapshot: RealtimeSnapshotPayload) => {
      if (!snapshot.bridgePayload) {
        return;
      }
      reconnectAttempt = 0;
      stopPolling();
      applyBridgeData(snapshot.bridgePayload, snapshot.controlStatus ?? null, new Date());
    };

    const connectWebSocket = () => {
      if (!active || websocket !== null) {
        return;
      }
      isClosingSocket = false;
      websocket = new WebSocket(buildRecorderWsUrl());

      websocket.onmessage = (event) => {
        try {
          const snapshot = JSON.parse(String(event.data)) as RealtimeSnapshotPayload;
          handleRealtimeSnapshot(snapshot);
        } catch (error) {
          console.error('Failed to parse recorder websocket payload', error);
        }
      };

      websocket.onerror = () => {
        // handled by onclose
      };

      websocket.onclose = () => {
        websocket = null;
        if (!active || isClosingSocket) {
          return;
        }
        startPolling();
        scheduleReconnect();
      };
    };

    startPolling();
    connectWebSocket();

    return () => {
      active = false;
      stopPolling();
      if (reconnectTimeoutId !== null) {
        window.clearTimeout(reconnectTimeoutId);
      }
      if (websocket !== null) {
        isClosingSocket = true;
        websocket.close();
        websocket = null;
      }
    };
  }, []);

  return data;
}
