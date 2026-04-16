import { useEffect, useState } from 'react';
import {
  mockLeads,
  mockLiveSessions,
  mockMessages,
  type Lead,
  type LiveSession,
  type Message,
} from './mockData';

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

interface BridgePayload {
  account?: {
    uniqueId?: string;
    sessionId?: string;
    status?: string;
    updatedAt?: string;
  };
  accounts?: Array<{
    uniqueId?: string;
    sessionId?: string;
    status?: string;
    updatedAt?: string;
    startTime?: string;
    endTime?: string | null;
    messagesCount?: number;
    leadsDetected?: number;
    viewers?: number;
  }>;
  liveSessions?: Array<{
    uniqueId?: string;
    sessionId?: string;
    status?: string;
    updatedAt?: string;
    startTime?: string;
    endTime?: string | null;
    messagesCount?: number;
    leadsDetected?: number;
    viewers?: number;
  }>;
  messages?: BridgeMessage[];
  leads?: BridgeLead[];
}

interface RecorderBridgeData {
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
}

const POLL_INTERVAL_MS = 2_000;
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
    categories: message.categories,
    sessionId: message.sessionId,
  };
}

function buildFallbackData(): RecorderBridgeData {
  return {
    messages: mockMessages,
    leads: mockLeads,
    liveSessions: mockLiveSessions,
    accounts: [
      {
        uniqueId: '@f.catalinaa777',
        nickname: 'f.catalinaa777',
        status: 'Ended',
        updatedAt: null,
        startTime: null,
        endTime: null,
        messagesCount: mockMessages.length,
        leadsDetected: mockLeads.length,
        viewers: new Set(mockMessages.map((message) => message.nickname)).size,
      },
    ],
    accountLabel: '@f.catalinaa777',
    isLive: false,
    updatedAt: null,
  };
}

function mapAccountToSession(account: NonNullable<BridgePayload['accounts']>[number]): LiveSession {
  const accountLabel = account.uniqueId || '@sin_cuenta';
  const archived = ARCHIVED_ACCOUNT_OVERRIDES[accountLabel];
  const resolvedStatus =
    archived && (account.messagesCount ?? 0) === 0 && (account.leadsDetected ?? 0) === 0
      ? archived.status
      : account.status === 'Active'
      ? 'Active'
      : 'Ended';
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
  return {
    id: account.sessionId || `${accountLabel}-session`,
    accountId: accountLabel.replace(/^@/, ''),
    accountName: accountLabel,
    status: resolvedStatus,
    startTime,
    endTime,
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

function mapPayload(payload: BridgePayload): RecorderBridgeData {
  const messages = (payload.messages ?? []).map(mapMessage).sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  const leads: Lead[] = (payload.leads ?? []).map((lead) => ({
    id: lead.id,
    status: normalizeLeadStatus(lead.totalScore, lead.status),
    username: lead.username,
    nickname: lead.nickname,
    totalScore: lead.totalScore,
    categories: lead.categories,
    lastMessage: lead.lastMessage,
    lastActivity: new Date(lead.lastActivity),
    messages: lead.messages.map(mapMessage),
  }));

  const rawAccounts = payload.accounts ?? (payload.account ? [payload.account] : []);
  const accounts = rawAccounts.map((account) => ({
    uniqueId: account.uniqueId || '@sin_cuenta',
    nickname: (account.uniqueId || '@sin_cuenta').replace(/^@/, ''),
    status:
      ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || ''] &&
      (account.messagesCount ?? 0) === 0 &&
      (account.leadsDetected ?? 0) === 0
        ? 'Ended' as const
        : account.status === 'Active'
        ? 'Active' as const
        : 'Ended' as const,
    updatedAt: account.updatedAt
      ? new Date(account.updatedAt)
      : ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || '']?.updatedAt
      ? new Date(ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || ''].updatedAt)
      : null,
    startTime: account.startTime
      ? new Date(account.startTime)
      : ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || '']?.startTime
      ? new Date(ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || ''].startTime)
      : null,
    endTime: account.endTime
      ? new Date(account.endTime)
      : ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || '']?.endTime
      ? new Date(ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || ''].endTime)
      : null,
    messagesCount:
      ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || ''] &&
      (account.messagesCount ?? 0) === 0
        ? ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || ''].messagesCount
        : account.messagesCount ?? 0,
    leadsDetected:
      ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || ''] &&
      (account.leadsDetected ?? 0) === 0
        ? ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || ''].leadsDetected
        : account.leadsDetected ?? 0,
    viewers:
      ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || ''] &&
      (account.viewers ?? 0) === 0
        ? ARCHIVED_ACCOUNT_OVERRIDES[account.uniqueId || ''].viewers
        : account.viewers ?? 0,
  }));

  const primaryAccount = payload.account ?? rawAccounts[0];
  const accountLabel = primaryAccount?.uniqueId || '@f.catalinaa777';
  const isLive = primaryAccount?.status === 'Active';
  const updatedAt = primaryAccount?.updatedAt ? new Date(primaryAccount.updatedAt) : null;
  const sessionsSource = payload.liveSessions ?? rawAccounts;
  const sessions = sessionsSource.length > 0 ? sessionsSource.map(mapAccountToSession) : mockLiveSessions;

  return {
    messages: messages.length > 0 ? messages : mockMessages,
    leads: leads.length > 0 ? leads : mockLeads,
    liveSessions: sessions,
    accounts: accounts.length > 0 ? accounts : buildFallbackData().accounts,
    accountLabel,
    isLive,
    updatedAt,
  };
}

export function useRecorderBridge() {
  const [data, setData] = useState<RecorderBridgeData>(buildFallbackData);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(`/current_messages.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error(`Bridge fetch failed: ${response.status}`);
        }
        const payload = (await response.json()) as BridgePayload;
        if (active) {
          setData(mapPayload(payload));
        }
      } catch (error) {
        console.error('Failed to load recorder bridge JSON', error);
        if (active) {
          setData(buildFallbackData());
        }
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return data;
}
