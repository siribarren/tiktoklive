import { useEffect, useState } from 'react';
import {
  type Lead,
  type LiveSession,
  type Message,
} from './mockData';
import { readJsonResponse } from '../../lib/http';
import { registerClientAccounts } from '../dashboard/client-users.mjs';
import { authFetch } from '../auth/auth';

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
  accountUniqueId?: string;
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
  campaign?: string;
  displayName?: string;
  clientName?: string;
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
    campaign?: string;
    displayName?: string;
    clientName?: string;
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
  const resolvedStatus = resolveAccountStatus(account, runningTargetSet, hasControlStatus);
  const startTime = account.startTime
    ? new Date(account.startTime)
    : account.updatedAt
    ? new Date(account.updatedAt)
    : new Date();
  const endTime = account.endTime ? new Date(account.endTime) : undefined;
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
    messagesCount: account.messagesCount ?? 0,
    leadsDetected: account.leadsDetected ?? 0,
    viewers: account.viewers ?? 0,
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
        normalizeUniqueId(lead.accountUniqueId) ||
        lead.messages
          .map((message) => leadSessionAccountMap.get(String(message.sessionId ?? '').trim()) ?? '')
          .find(Boolean) ||
        undefined,
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
    nickname:
      String(account.displayName ?? '').trim() ||
      (normalizeUniqueId(account.uniqueId) || '@sin_cuenta').replace(/^@/, ''),
    campaign: String(account.campaign ?? '').trim() || undefined,
    displayName: String(account.displayName ?? '').trim() || undefined,
    clientName: String(account.clientName ?? '').trim() || undefined,
    status: resolveAccountStatus(account, runningTargetSet, hasControlStatus),
    updatedAt: account.updatedAt ? new Date(account.updatedAt) : null,
    startTime: account.startTime ? new Date(account.startTime) : null,
    endTime: account.endTime
      ? new Date(account.endTime)
      : null,
    messagesCount: account.messagesCount ?? 0,
    leadsDetected: account.leadsDetected ?? 0,
    viewers: account.viewers ?? 0,
  }));
  for (const account of accounts) {
    const currentStatus = liveStatuses[account.uniqueId];
    if (currentStatus) {
      continue;
    }
    liveStatuses[account.uniqueId] = {
      isLive: false,
      status: runningTargetSet.has(account.uniqueId) ? 'unknown' : 'offline',
      checkedAt: loadedAt,
      liveStartedAt: null,
      playbackUrl: null,
      error: null,
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

export function useRecorderBridge() {
  const [data, setData] = useState<RecorderBridgeData>(buildFallbackData);

  useEffect(() => {
    let active = true;
    let pollingIntervalId: number | null = null;

    const loadFromPolling = async () => {
      try {
        const response = await authFetch(`/recorder-api/db-snapshot?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (response.status === 401) {
          registerClientAccounts([]);
          if (active) {
            setData(buildFallbackData());
          }
          return;
        }
        if (!response.ok) {
          throw new Error(`DB snapshot fetch failed: ${response.status}`);
        }
        const snapshot = await readJsonResponse<RealtimeSnapshotPayload>(response);
        if (!snapshot?.bridgePayload) {
          throw new Error('DB snapshot vacío o inválido.');
        }
        registerClientAccounts(snapshot.bridgePayload.accounts ?? []);
        setData(mapPayload(snapshot.bridgePayload, snapshot.controlStatus ?? null, new Date()));
      } catch (error) {
        console.error('Failed to load recorder DB snapshot', error);
        if (active) {
          registerClientAccounts([]);
          setData(buildFallbackData());
        }
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

    startPolling();

    return () => {
      active = false;
      stopPolling();
    };
  }, []);

  return data;
}
