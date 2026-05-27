import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AiReviewPanels } from './AiReviewPanels';
import { TikTokPhoneLiveModal } from './tiktok/tiktok-phone-live-modal';
import { MoreHorizontal, Play, X } from 'lucide-react';
import { readJsonResponse, resolveApiErrorMessage } from '../../lib/http';
import {
  getDefaultDisplayNameForAccount,
  getUsersForClient,
  resolveClientByAccount,
} from '../dashboard/client-users.mjs';

const DELETED_ACCOUNTS_STORAGE_KEY = 'ember:deleted-accounts';
const ACCOUNT_OVERRIDES_STORAGE_KEY = 'ember:account-overrides';
const START_MONITORING_PROGRESS_STAGES = [
  'Validando la cuenta',
  'Conectando con TikTok',
  'Recopilando datos',
  'Listo!',
] as const;
const START_MONITORING_PROGRESS_TOTAL_MS = 3_000;
const START_MONITORING_PROGRESS_STEP_MS =
  START_MONITORING_PROGRESS_TOTAL_MS / START_MONITORING_PROGRESS_STAGES.length;
const STOP_MONITORING_PROGRESS_TOTAL_MS = 3_000;
const STOP_MONITORING_DONE_VISIBLE_MS = 1_000;

type AccountPriority = 'Alta' | 'Media' | 'Baja';
type AccountCampaign = 'WOM' | 'CLARO' | 'SIN_ASIGNAR';
type NewAccountCampaign = 'WOM' | 'CLARO';

interface AccountOverride {
  uniqueId: string;
  nickname: string;
  priority: AccountPriority;
  campaign: NewAccountCampaign;
}

type AccountOverridesMap = Record<string, AccountOverride>;
type LivePreviewAccount = {
  username: string;
  displayName: string;
  isLive: boolean;
  playbackUrl: string | null;
  viewerCount: number;
  leadCount: number;
  messageCount: number;
  streamStartedAt: Date | null;
};

const normalizeUniqueId = (value?: string) => {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
};

const normalizeUniqueIdKey = (value?: string) =>
  normalizeUniqueId(value).replace(/[^a-z0-9@]/g, '');

type AccountLiveStatusValue = {
  isLive: boolean;
  status: 'online' | 'offline' | 'unknown';
  checkedAt: Date | null;
  liveStartedAt: Date | null;
  playbackUrl: string | null;
  error: string | null;
};

const pickMostReliableLiveStatus = (
  current: AccountLiveStatusValue | undefined,
  candidate: AccountLiveStatusValue | undefined
) => {
  if (!current) {
    return candidate;
  }
  if (!candidate) {
    return current;
  }

  const currentOnline = current.status === 'online';
  const candidateOnline = candidate.status === 'online';
  if (currentOnline !== candidateOnline) {
    return candidateOnline ? candidate : current;
  }

  const currentCheckedAt = current.checkedAt?.getTime() ?? 0;
  const candidateCheckedAt = candidate.checkedAt?.getTime() ?? 0;
  return candidateCheckedAt > currentCheckedAt ? candidate : current;
};

const pickPreferredAccountRow = <
  T extends {
    status: 'Active' | 'Ended';
    updatedAt: Date | null;
    messagesCount: number;
    leadsDetected: number;
    viewers: number;
  }
>(
  current: T,
  candidate: T
) => {
  if (current.status !== candidate.status) {
    return candidate.status === 'Active' ? candidate : current;
  }

  const currentUpdatedAt = current.updatedAt?.getTime() ?? 0;
  const candidateUpdatedAt = candidate.updatedAt?.getTime() ?? 0;
  if (currentUpdatedAt !== candidateUpdatedAt) {
    return candidateUpdatedAt > currentUpdatedAt ? candidate : current;
  }

  const currentEngagement = current.messagesCount + current.leadsDetected + current.viewers;
  const candidateEngagement = candidate.messagesCount + candidate.leadsDetected + candidate.viewers;
  return candidateEngagement > currentEngagement ? candidate : current;
};

const normalizePriority = (value?: string): AccountPriority => {
  if (value === 'Media' || value === 'Baja') {
    return value;
  }
  return 'Alta';
};

const normalizeCampaign = (value?: string): AccountCampaign => {
  if (value === 'WOM' || value === 'CLARO') {
    return value;
  }
  return 'SIN_ASIGNAR';
};

const normalizeOverrideCampaign = (value?: string, accountUniqueId?: string): NewAccountCampaign => {
  if (value === 'WOM' || value === 'CLARO') {
    return value;
  }
  const inferred = resolveClientByAccount(accountUniqueId);
  if (inferred === 'WOM' || inferred === 'CLARO') {
    return inferred;
  }
  return 'WOM';
};

const getCampaignLabel = (campaign: AccountCampaign) => {
  if (campaign === 'CLARO') {
    return 'Claro';
  }
  if (campaign === 'WOM') {
    return 'WOM';
  }
  return 'Sin asignar';
};

const getCampaignBadgeClass = (campaign: AccountCampaign) => {
  if (campaign === 'WOM') {
    return 'bg-violet-50 text-violet-700 border-violet-200';
  }
  if (campaign === 'CLARO') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const getPriorityBadgeClass = (priority: AccountPriority) => {
  if (priority === 'Media') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (priority === 'Baja') {
    return 'bg-gray-50 text-gray-700 border-gray-200';
  }
  return 'bg-red-50 text-red-700 border-red-200';
};

function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );
}

export function Accounts() {
  const { accounts, configuredTargets, runningTargets, onlineTargets, liveStatuses } = useRecorderBridge();
  const navigate = useNavigate();
  const [deletingAccount, setDeletingAccount] = useState<string | null>(null);
  const [monitoringActionFor, setMonitoringActionFor] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [newTarget, setNewTarget] = useState('');
  const [newTargetCampaign, setNewTargetCampaign] = useState<NewAccountCampaign | ''>('');
  const [openActionsFor, setOpenActionsFor] = useState<string | null>(null);
  const [editingSourceAccount, setEditingSourceAccount] = useState<string | null>(null);
  const [livePreviewAccount, setLivePreviewAccount] = useState<LivePreviewAccount | null>(null);
  const [startProgress, setStartProgress] = useState<{
    account: string;
    stageIndex: number;
    completed: boolean;
  } | null>(null);
  const [stopProgress, setStopProgress] = useState<{
    account: string;
    completed: boolean;
    progressPercent: number;
  } | null>(null);
  const startProgressTimersRef = useRef<number[]>([]);
  const stopProgressTimersRef = useRef<number[]>([]);
  const [editForm, setEditForm] = useState<{
    uniqueId: string;
    nickname: string;
    priority: AccountPriority;
    campaign: NewAccountCampaign;
  }>({
    uniqueId: '',
    nickname: '',
    priority: 'Alta',
    campaign: 'WOM',
  });
  const [deletedAccounts, setDeletedAccounts] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') {
      return new Set<string>();
    }

    try {
      const rawValue = window.localStorage.getItem(DELETED_ACCOUNTS_STORAGE_KEY);
      if (!rawValue) {
        return new Set<string>();
      }
      const parsedValue = JSON.parse(rawValue) as string[];
      return new Set(parsedValue.map((item) => normalizeUniqueId(item)).filter(Boolean));
    } catch {
      return new Set<string>();
    }
  });
  const [accountOverrides, setAccountOverrides] = useState<AccountOverridesMap>(() => {
    if (typeof window === 'undefined') {
      return {};
    }

    try {
      const rawValue = window.localStorage.getItem(ACCOUNT_OVERRIDES_STORAGE_KEY);
      if (!rawValue) {
        return {};
      }

      const parsedValue = JSON.parse(rawValue) as Record<
        string,
        { uniqueId?: string; nickname?: string; priority?: string; campaign?: string }
      >;
      const normalizedEntries = Object.entries(parsedValue).map(([sourceId, value]) => {
        const normalizedSourceId = normalizeUniqueId(sourceId);
        const normalizedUniqueId = normalizeUniqueId(value?.uniqueId);
        const nickname = (value?.nickname ?? '').trim();
        if (!normalizedSourceId || !normalizedUniqueId) {
          return null;
        }
        return [
          normalizedSourceId,
          {
            uniqueId: normalizedUniqueId,
            nickname: nickname || normalizedUniqueId.replace(/^@/, ''),
            priority: normalizePriority(value?.priority),
            campaign: normalizeOverrideCampaign(value?.campaign, normalizedUniqueId),
          } satisfies AccountOverride,
        ] as const;
      });

      return Object.fromEntries(normalizedEntries.filter(Boolean) as Array<readonly [string, AccountOverride]>);
    } catch {
      return {};
    }
  });

  const campaignAccountCatalog = useMemo(
    () => [
      ...getUsersForClient('CLARO').map((uniqueId) => ({
        sourceUniqueId: normalizeUniqueId(uniqueId),
        uniqueId: normalizeUniqueId(uniqueId),
        campaign: 'CLARO' as const,
        nickname:
          getDefaultDisplayNameForAccount(uniqueId) ??
          normalizeUniqueId(uniqueId).replace(/^@/, ''),
      })),
      ...getUsersForClient('WOM').map((uniqueId) => ({
        sourceUniqueId: normalizeUniqueId(uniqueId),
        uniqueId: normalizeUniqueId(uniqueId),
        campaign: 'WOM' as const,
        nickname:
          getDefaultDisplayNameForAccount(uniqueId) ??
          normalizeUniqueId(uniqueId).replace(/^@/, ''),
      })),
    ],
    []
  );
  const campaignCatalogSourceSet = useMemo(
    () => new Set(campaignAccountCatalog.map((account) => account.sourceUniqueId)),
    [campaignAccountCatalog]
  );
  const campaignCatalogBySource = useMemo(
    () => new Map(campaignAccountCatalog.map((account) => [account.sourceUniqueId, account.campaign])),
    [campaignAccountCatalog]
  );

  useEffect(() => {
    setDeletedAccounts((previous) => {
      const next = new Set(
        Array.from(previous).filter((sourceUniqueId) =>
          campaignCatalogSourceSet.has(sourceUniqueId)
        )
      );
      return next.size === previous.size ? previous : next;
    });

    setAccountOverrides((previous) => {
      const nextEntries = Object.entries(previous).filter(([sourceUniqueId]) =>
        campaignCatalogSourceSet.has(normalizeUniqueId(sourceUniqueId))
      );
      return nextEntries.length === Object.keys(previous).length
        ? previous
        : Object.fromEntries(nextEntries);
    });
  }, [campaignCatalogSourceSet]);

  const accountsWithOverrides = useMemo(() => {
    const baseByUniqueId = new Map<
      string,
      {
        uniqueId: string;
        nickname: string;
        status: 'Active' | 'Ended';
        updatedAt: Date | null;
        startTime: Date | null;
        endTime: Date | null;
        messagesCount: number;
        leadsDetected: number;
        viewers: number;
      }
    >();

    for (const account of accounts) {
      const normalizedAccount = normalizeUniqueId(account.uniqueId);
      if (!normalizedAccount) {
        continue;
      }
      const current = baseByUniqueId.get(normalizedAccount);
      if (!current) {
        baseByUniqueId.set(normalizedAccount, account);
        continue;
      }
      baseByUniqueId.set(normalizedAccount, pickPreferredAccountRow(current, account));
    }

    return campaignAccountCatalog.map((catalogAccount) => {
      const sourceUniqueId = catalogAccount.sourceUniqueId;
      const override = accountOverrides[sourceUniqueId];
      const resolvedUniqueId = normalizeUniqueId(override?.uniqueId) || catalogAccount.uniqueId;
      const fallbackNickname =
        catalogAccount.nickname ||
        getDefaultDisplayNameForAccount(resolvedUniqueId) ||
        resolvedUniqueId.replace(/^@/, '');
      const baseAccount =
        baseByUniqueId.get(resolvedUniqueId) ||
        baseByUniqueId.get(sourceUniqueId) ||
        null;
      const normalizedAccountAlias = resolvedUniqueId.replace(/^@/, '').toLowerCase();
      const rawOverrideNickname = (override?.nickname ?? '').trim();
      const shouldUseDefaultDisplayName =
        Boolean(fallbackNickname) &&
        (!rawOverrideNickname || rawOverrideNickname.toLowerCase() === normalizedAccountAlias);
      const resolvedNickname = shouldUseDefaultDisplayName
        ? fallbackNickname
        : rawOverrideNickname;

      return {
        uniqueId: resolvedUniqueId,
        nickname: resolvedNickname,
        status: baseAccount?.status ?? 'Ended',
        updatedAt: baseAccount?.updatedAt ?? null,
        startTime: baseAccount?.startTime ?? null,
        endTime: baseAccount?.endTime ?? null,
        messagesCount: baseAccount?.messagesCount ?? 0,
        leadsDetected: baseAccount?.leadsDetected ?? 0,
        viewers: baseAccount?.viewers ?? 0,
        sourceUniqueId,
        priority: normalizePriority(override?.priority),
        campaign: normalizeCampaign(override?.campaign ?? catalogAccount.campaign),
      };
    });
  }, [accounts, accountOverrides, campaignAccountCatalog]);
  const configuredTargetKeySet = useMemo(
    () => new Set(configuredTargets.map((target) => normalizeUniqueIdKey(target)).filter(Boolean)),
    [configuredTargets]
  );
  const runningTargetKeySet = useMemo(
    () => new Set(runningTargets.map((target) => normalizeUniqueIdKey(target)).filter(Boolean)),
    [runningTargets]
  );
  const onlineTargetKeySet = useMemo(
    () => new Set(onlineTargets.map((target) => normalizeUniqueIdKey(target)).filter(Boolean)),
    [onlineTargets]
  );
  const liveStatusesByKey = useMemo(() => {
    const mapped = new Map<string, AccountLiveStatusValue>();
    for (const [uniqueId, status] of Object.entries(liveStatuses)) {
      const key = normalizeUniqueIdKey(uniqueId);
      if (!key) {
        continue;
      }
      const current = mapped.get(key);
      const preferred = pickMostReliableLiveStatus(current, status);
      if (preferred) {
        mapped.set(key, preferred);
      }
    }
    return mapped;
  }, [liveStatuses]);
  const LIVE_STATUS_FRESHNESS_MS = 90 * 1000;
  const monitoredTargetKeySet = useMemo(
    () => new Set(runningTargetKeySet),
    [runningTargetKeySet]
  );

  const visibleAccounts = useMemo(
    () => accountsWithOverrides.filter((account) => !deletedAccounts.has(account.sourceUniqueId)),
    [accountsWithOverrides, deletedAccounts]
  );
  const accountRealtimeState = useMemo(() => {
    const mapped = new Map<
      string,
      {
        isOnline: boolean;
        isMonitored: boolean;
        liveStatus: (typeof liveStatuses)[string] | undefined;
      }
    >();

    for (const account of visibleAccounts) {
      const normalizedSource = normalizeUniqueId(account.sourceUniqueId);
      const sourceKey = normalizeUniqueIdKey(account.sourceUniqueId);
      const displayKey = normalizeUniqueIdKey(account.uniqueId);
      const candidateKeys = Array.from(new Set([sourceKey, displayKey].filter(Boolean)));
      const liveStatus = candidateKeys.reduce<AccountLiveStatusValue | undefined>(
        (current, key) => pickMostReliableLiveStatus(current, liveStatusesByKey.get(key)),
        undefined
      );
      const liveStatusOnline = liveStatus?.status === 'online' || liveStatus?.isLive === true;
      const isOnline =
        liveStatusOnline || candidateKeys.some((key) => onlineTargetKeySet.has(key));
      const isMonitored = candidateKeys.some((key) => monitoredTargetKeySet.has(key));

      mapped.set(normalizedSource, {
        isOnline,
        isMonitored,
        liveStatus,
      });
    }

    return mapped;
  }, [
    visibleAccounts,
    liveStatusesByKey,
    onlineTargetKeySet,
    monitoredTargetKeySet,
  ]);
  const prioritizedVisibleAccounts = useMemo(
    () =>
      [...visibleAccounts].sort((left, right) => {
        const leftSource = normalizeUniqueId(left.sourceUniqueId);
        const rightSource = normalizeUniqueId(right.sourceUniqueId);
        const leftState = accountRealtimeState.get(leftSource);
        const rightState = accountRealtimeState.get(rightSource);

        const leftOnline = leftState?.isOnline === true;
        const rightOnline = rightState?.isOnline === true;
        if (leftOnline !== rightOnline) {
          return leftOnline ? -1 : 1;
        }

        const leftMonitored = leftState?.isMonitored === true;
        const rightMonitored = rightState?.isMonitored === true;
        if (leftMonitored !== rightMonitored) {
          return leftMonitored ? -1 : 1;
        }

        const leftUpdatedAt = left.updatedAt?.getTime() ?? 0;
        const rightUpdatedAt = right.updatedAt?.getTime() ?? 0;
        if (leftUpdatedAt !== rightUpdatedAt) {
          return rightUpdatedAt - leftUpdatedAt;
        }

        return left.uniqueId.localeCompare(right.uniqueId);
      }),
    [visibleAccounts, accountRealtimeState]
  );
  const groupedAccountsByCampaign = useMemo(() => {
    const grouped: Record<AccountCampaign, (typeof prioritizedVisibleAccounts)> = {
      WOM: [],
      CLARO: [],
      SIN_ASIGNAR: [],
    };

    prioritizedVisibleAccounts.forEach((account) => {
      const campaign = normalizeCampaign(account.campaign);
      grouped[campaign].push(account);
    });

    return [
      { key: 'WOM' as const, label: 'WOM', accounts: grouped.WOM },
      { key: 'CLARO' as const, label: 'Claro', accounts: grouped.CLARO },
      { key: 'SIN_ASIGNAR' as const, label: 'Sin asignar', accounts: grouped.SIN_ASIGNAR },
    ].filter((group) => group.accounts.length > 0);
  }, [prioritizedVisibleAccounts]);
  const clearStartProgressTimers = () => {
    startProgressTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    startProgressTimersRef.current = [];
  };
  const clearStopProgressTimers = () => {
    stopProgressTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    stopProgressTimersRef.current = [];
  };
  const closeStartProgress = () => {
    clearStartProgressTimers();
    setStartProgress(null);
  };
  const closeStopProgress = () => {
    clearStopProgressTimers();
    setStopProgress(null);
  };
  const beginStartProgress = (account: string) => {
    clearStartProgressTimers();
    setStartProgress({
      account,
      stageIndex: 0,
      completed: false,
    });

    return new Promise<void>((resolve) => {
      START_MONITORING_PROGRESS_STAGES.forEach((_, index) => {
        if (index === 0) {
          return;
        }
        const timerId = window.setTimeout(() => {
          setStartProgress((current) => {
            if (!current || current.account !== account) {
              return current;
            }
            return { ...current, stageIndex: index };
          });
        }, index * START_MONITORING_PROGRESS_STEP_MS);
        startProgressTimersRef.current.push(timerId);
      });

      const completionTimerId = window.setTimeout(() => {
        setStartProgress((current) => {
          if (!current || current.account !== account) {
            return current;
          }
          return { ...current, completed: true };
        });
        resolve();
      }, START_MONITORING_PROGRESS_TOTAL_MS);
      startProgressTimersRef.current.push(completionTimerId);
    });
  };
  const beginStopProgress = (account: string) => {
    clearStopProgressTimers();
    setStopProgress({
      account,
      completed: false,
      progressPercent: 0,
    });

    const kickOffTimerId = window.setTimeout(() => {
      setStopProgress((current) => {
        if (!current || current.account !== account) {
          return current;
        }
        return { ...current, progressPercent: 100 };
      });
    }, 40);
    stopProgressTimersRef.current.push(kickOffTimerId);

    const completedTimerId = window.setTimeout(() => {
      setStopProgress((current) => {
        if (!current || current.account !== account) {
          return current;
        }
        return { ...current, completed: true };
      });
    }, STOP_MONITORING_PROGRESS_TOTAL_MS);
    stopProgressTimersRef.current.push(completedTimerId);

    const dismissTimerId = window.setTimeout(() => {
      setStopProgress((current) => {
        if (!current || current.account !== account) {
          return current;
        }
        return null;
      });
    }, STOP_MONITORING_PROGRESS_TOTAL_MS + STOP_MONITORING_DONE_VISIBLE_MS);
    stopProgressTimersRef.current.push(dismissTimerId);
  };
  const aiSummaryText = useMemo(() => {
    if (visibleAccounts.length === 0) {
      return 'No hay cuentas disponibles para analizar. Al agregar o reactivar cuentas, este resumen mostrará automáticamente la performance general de los lives e interacciones.';
    }

    const totalAccounts = visibleAccounts.length;
    const activeAccounts = visibleAccounts.filter((account) => account.status === 'Active').length;
    const totalMessages = visibleAccounts.reduce((sum, account) => sum + account.messagesCount, 0);
    const totalLeads = visibleAccounts.reduce((sum, account) => sum + account.leadsDetected, 0);
    const totalViewers = visibleAccounts.reduce((sum, account) => sum + account.viewers, 0);
    const averageViewersPerAccount = Math.round(totalViewers / totalAccounts);
    const leadConversionRate = totalMessages > 0 ? ((totalLeads / totalMessages) * 100).toFixed(1) : '0.0';
    const topAccount = visibleAccounts.reduce((currentTop, account) =>
      account.messagesCount > currentTop.messagesCount ? account : currentTop
    );

    return `Se analizaron ${totalAccounts} cuentas TikTok, con ${activeAccounts} activas y ${totalAccounts - activeAccounts} finalizadas. En conjunto se registraron ${totalMessages} mensajes, ${totalLeads} leads detectados y ${totalViewers} usuarios únicos acumulados. El promedio de audiencia por cuenta fue de ${averageViewersPerAccount} usuarios, con una conversión aproximada de ${leadConversionRate}% de mensajes a leads. La cuenta con mayor volumen de interacción fue ${topAccount.uniqueId}, destacando por su nivel de actividad durante los lives.`;
  }, [visibleAccounts]);

  const aiRecommendations = useMemo(() => {
    if (visibleAccounts.length === 0) {
      return [
        'Reactivar o configurar al menos una cuenta para obtener métricas reales.',
        'Definir horarios de transmisión y responsables por cuenta antes del próximo live.',
        'Establecer objetivos mínimos de mensajes y leads por sesión para evaluar rendimiento.',
      ];
    }

    const totalMessages = visibleAccounts.reduce((sum, account) => sum + account.messagesCount, 0);
    const totalLeads = visibleAccounts.reduce((sum, account) => sum + account.leadsDetected, 0);
    const activeAccounts = visibleAccounts.filter((account) => account.status === 'Active').length;
    const recommendations: string[] = [];

    if (activeAccounts === 0) {
      recommendations.push('No hay cuentas activas: priorizar reanudar transmisiones para evitar pérdida de tracción.');
    } else {
      recommendations.push('Mantener un calendario fijo de lives para estabilizar el flujo de audiencia e interacción.');
    }

    if (totalMessages > 0 && totalLeads === 0) {
      recommendations.push('Ajustar guion comercial y llamados a la acción para convertir interacción en leads detectables.');
    } else if (totalMessages < 100) {
      recommendations.push('Reforzar la promoción previa al live para aumentar volumen de mensajes entrantes.');
    } else {
      recommendations.push('Replicar patrones de las cuentas con mayor interacción en el resto de las transmisiones.');
    }

    recommendations.push('Realizar revisión semanal de performance por cuenta con foco en mensajes, leads y retención de audiencia.');
    return recommendations;
  }, [visibleAccounts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      DELETED_ACCOUNTS_STORAGE_KEY,
      JSON.stringify(Array.from(deletedAccounts))
    );
  }, [deletedAccounts]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      ACCOUNT_OVERRIDES_STORAGE_KEY,
      JSON.stringify(accountOverrides)
    );
  }, [accountOverrides]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-account-actions-root="true"]')) {
        setOpenActionsFor(null);
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);
  useEffect(() => {
    return () => {
      clearStartProgressTimers();
      clearStopProgressTimers();
    };
  }, []);

  const openAccountReport = (sourceUniqueId: string) => {
    const accountId = normalizeUniqueId(sourceUniqueId);
    if (!accountId) {
      return;
    }
    navigate(`/accounts/${encodeURIComponent(accountId)}/report`);
  };

  const openLivePreview = (
    account: (typeof visibleAccounts)[number],
    isLive: boolean,
    playbackUrl: string | null
  ) => {
    setLivePreviewAccount({
      username: account.uniqueId,
      displayName: account.nickname,
      isLive,
      playbackUrl,
      viewerCount: account.viewers,
      leadCount: account.leadsDetected,
      messageCount: account.messagesCount,
      streamStartedAt: account.startTime,
    });
  };

  const openEditAccount = (account: (typeof visibleAccounts)[number]) => {
    setEditForm({
      uniqueId: account.uniqueId,
      nickname: account.nickname,
      priority: account.priority,
      campaign: account.campaign === 'CLARO' ? 'CLARO' : 'WOM',
    });
    setEditingSourceAccount(account.sourceUniqueId);
    setOpenActionsFor(null);
  };

  const closeEditAccount = () => {
    setEditingSourceAccount(null);
  };

  const saveAccountEdition = () => {
    if (!editingSourceAccount) {
      return;
    }

    const normalizedUniqueId = normalizeUniqueId(editForm.uniqueId);
    if (!normalizedUniqueId) {
      setActionMessage('Debes ingresar una cuenta de TikTok válida.');
      return;
    }

    const resolvedNickname = editForm.nickname.trim() || normalizedUniqueId.replace(/^@/, '');
    const resolvedPriority = normalizePriority(editForm.priority);
    const resolvedCampaign = normalizeOverrideCampaign(editForm.campaign, normalizedUniqueId);

    setAccountOverrides((previous) => ({
      ...previous,
      [editingSourceAccount]: {
        uniqueId: normalizedUniqueId,
        nickname: resolvedNickname,
        priority: resolvedPriority,
        campaign: resolvedCampaign,
      },
    }));

    setActionMessage(`Cuenta ${normalizedUniqueId} actualizada correctamente.`);
    setEditingSourceAccount(null);
  };

  const deleteAccount = async (account: (typeof visibleAccounts)[number]) => {
    const normalizedSource = normalizeUniqueId(account.sourceUniqueId);
    if (!normalizedSource) {
      return;
    }

    setOpenActionsFor(null);
    const shouldDelete = window.confirm(`¿Deseas borrar la cuenta ${account.uniqueId}?`);
    if (!shouldDelete) {
      return;
    }

    setDeletingAccount(normalizedSource);
    setActionMessage(null);
    try {
      const response = await fetch('/recorder-api/targets', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unique_id: normalizedSource }),
      });

      let payload: { ok?: boolean; unique_id?: string; error?: string } | null = null;
      try {
        payload = (await response.json()) as { ok?: boolean; unique_id?: string; error?: string };
      } catch {
        payload = null;
      }

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'No se pudo borrar la cuenta.');
      }

      const removedAccount =
        normalizeUniqueId(payload?.unique_id || normalizedSource) || normalizedSource;
      setDeletedAccounts((previous) => new Set(previous).add(removedAccount));
      setActionMessage(`Cuenta ${account.uniqueId} borrada correctamente.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo conectar con el recorder local.';
      setDeletedAccounts((previous) => new Set(previous).add(normalizedSource));
      setActionMessage(
        `${message} La cuenta ${account.uniqueId} se eliminó del listado local igualmente.`
      );
    } finally {
      setDeletingAccount(null);
    }
  };

  const startMonitoring = async (sourceUniqueId: string) => {
    const normalizedSource = normalizeUniqueId(sourceUniqueId);
    if (!normalizedSource) {
      setActionMessage('No se pudo identificar la cuenta a agregar.');
      return false;
    }

    const targetState = accountRealtimeState.get(normalizedSource);
    if (targetState?.isMonitored) {
      setActionMessage(`${normalizedSource} ya está en monitoreo.`);
      return true;
    }

    setMonitoringActionFor(normalizedSource);
    setActionMessage(null);
    closeStopProgress();
    const progressPromise = beginStartProgress(normalizedSource);
    try {
      const response = await fetch('/recorder-api/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unique_id: normalizedSource }),
      });

      const payload = await readJsonResponse<{
        ok?: boolean;
        started?: boolean;
        unique_id?: string;
        error?: string;
      }>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(resolveApiErrorMessage(response, payload, 'No se pudo iniciar el monitoreo.'));
      }

      const startedAccount = normalizeUniqueId(payload.unique_id || normalizedSource) || normalizedSource;
      setActionMessage(
        payload.started
          ? `Monitoreo iniciado para ${startedAccount}.`
          : `${startedAccount} ya estaba en monitoreo.`
      );
      await progressPromise;
      return true;
    } catch (error) {
      closeStartProgress();
      const message =
        error instanceof Error ? error.message : 'No se pudo conectar con el monitor local.';
      setActionMessage(message);
      return false;
    } finally {
      setMonitoringActionFor(null);
    }
  };
  const stopMonitoring = async (
    sourceUniqueId: string,
    options?: { automatic?: boolean }
  ) => {
    const normalizedSource = normalizeUniqueId(sourceUniqueId);
    if (!normalizedSource) {
      return;
    }

    closeStartProgress();
    beginStopProgress(normalizedSource);
    try {
      const response = await fetch('/recorder-api/targets', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unique_id: normalizedSource }),
      });

      let payload: { ok?: boolean; error?: string } | null = null;
      try {
        payload = (await response.json()) as { ok?: boolean; error?: string };
      } catch {
        payload = null;
      }

      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'No se pudo detener el monitoreo.');
      }
    } catch (error) {
      closeStopProgress();
      const message =
        error instanceof Error ? error.message : 'No se pudo conectar con el monitor local.';
      setActionMessage(message);
    } finally {
      if (options?.automatic !== true) {
        setActionMessage(`Monitoreo detenido para ${normalizedSource}.`);
      }
    }
  };

  const handleStartMonitoringSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTarget = newTarget.trim();
    if (!trimmedTarget) {
      setActionMessage('Ingresa un usuario de TikTok para agregarlo.');
      return;
    }

    if (!newTargetCampaign) {
      setActionMessage('Selecciona el cliente de la cuenta (WOM o Claro).');
      return;
    }

    const normalizedTarget = normalizeUniqueId(trimmedTarget);
    const catalogCampaign = campaignCatalogBySource.get(normalizedTarget);
    if (!catalogCampaign) {
      setActionMessage('La cuenta no pertenece al listado oficial de campañas.');
      return;
    }
    if (catalogCampaign !== newTargetCampaign) {
      setActionMessage(
        `La cuenta ${normalizedTarget} pertenece a ${getCampaignLabel(catalogCampaign)}. Ajusta el cliente.`
      );
      return;
    }
    const fallbackNickname =
      getDefaultDisplayNameForAccount(normalizedTarget) ??
      normalizedTarget.replace(/^@/, '');
    setAccountOverrides((previous) => {
      const current = previous[normalizedTarget];
      return {
        ...previous,
        [normalizedTarget]: {
          uniqueId: normalizedTarget,
          nickname: current?.nickname?.trim() || fallbackNickname,
          priority: normalizePriority(current?.priority),
          campaign: catalogCampaign,
        },
      };
    });

    const started = await startMonitoring(trimmedTarget);
    if (started) {
      setNewTarget('');
      setNewTargetCampaign('');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Cuentas de TikTok
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cuentas configuradas y sus métricas guardadas por sesión
          </p>
        </div>
        <form
          className="grid w-full max-w-2xl grid-cols-1 gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2 md:grid-cols-[1.4fr_1fr_auto]"
          onSubmit={handleStartMonitoringSubmit}
        >
          <Input
            value={newTarget}
            onChange={(event) => setNewTarget(event.target.value)}
            placeholder="@usuario.tiktok"
            className="bg-white"
          />
          <select
            value={newTargetCampaign}
            onChange={(event) => setNewTargetCampaign(event.target.value as NewAccountCampaign | '')}
            className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
            required
          >
            <option value="">Cliente</option>
            <option value="WOM">WOM</option>
            <option value="CLARO">Claro</option>
          </select>
          <Button
            type="submit"
            className="gap-2 bg-amber-600 hover:bg-amber-700"
            disabled={monitoringActionFor !== null}
          >
            <Play className="h-4 w-4" />
            {monitoringActionFor ? 'Iniciando...' : 'Agregar'}
          </Button>
        </form>
      </div>
      {startProgress ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-700">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <LoadingSpinner className="h-4 w-4" />
              <div>
                <p className="text-sm font-medium">
                  {START_MONITORING_PROGRESS_STAGES[startProgress.stageIndex]}
                </p>
                <p className="text-xs opacity-90">
                  Iniciando monitoreo para {startProgress.account}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Cerrar mensaje"
              className="rounded p-1 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800"
              onClick={closeStartProgress}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-emerald-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
              style={{
                width: `${Math.round(
                  ((startProgress.stageIndex + 1) / START_MONITORING_PROGRESS_STAGES.length) * 100
                )}%`,
              }}
            />
          </div>
        </div>
      ) : null}
      {stopProgress ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-red-700">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {!stopProgress.completed ? <LoadingSpinner className="h-4 w-4" /> : null}
              <div>
                <p className="text-sm font-medium">
                  {stopProgress.completed ? 'Listo' : 'Deteniendo monitoreo...'}
                </p>
                <p className="text-xs opacity-90">Cuenta: {stopProgress.account}</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Cerrar mensaje"
              className="rounded p-1 text-red-600 hover:bg-red-100 hover:text-red-800"
              onClick={closeStopProgress}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-red-100">
            <div
              className="h-full rounded-full bg-red-500 transition-[width] duration-3000 ease-linear"
              style={{ width: `${stopProgress.progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}
      {actionMessage ? <p className="text-sm text-gray-700">{actionMessage}</p> : null}

      <Card>
        <CardContent className="pt-6">
          <Accordion
            type="multiple"
            defaultValue={groupedAccountsByCampaign.map((group) => group.key)}
            className="w-full"
          >
            {groupedAccountsByCampaign.map((group) => (
              <AccordionItem key={group.key} value={group.key}>
                <AccordionTrigger className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      Campaña {group.label}
                    </span>
                    <Badge variant="outline" className="h-6 px-2 text-[11px]">
                      {group.accounts.length} cuenta(s)
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2.5 px-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Cuenta TikTok
                          </th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Nombre
                          </th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Campaña
                          </th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Prioridad
                          </th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Estado
                          </th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Mensajes
                          </th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Leads
                          </th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Usuarios
                          </th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Última actividad
                          </th>
                          <th className="text-left py-2.5 px-3 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.accounts.map((account) => {
                          const normalizedSource = normalizeUniqueId(account.sourceUniqueId);
                          const realtimeState = accountRealtimeState.get(normalizedSource);
                          const liveStatus = realtimeState?.liveStatus;
                          const isOnline = realtimeState?.isOnline === true;
                          const isMonitored = realtimeState?.isMonitored === true;
                          const canOpenLive = isMonitored && isOnline;
                          const monitorButtonDisabled =
                            monitoringActionFor !== null ||
                            deletingAccount === normalizedSource ||
                            isMonitored;
                          const monitorDisabledReason = isMonitored
                            ? 'Esta cuenta ya está agregada.'
                            : undefined;
                          return (
                            <tr
                              key={account.sourceUniqueId}
                              className={`border-b border-gray-100 ${
                                isOnline
                                  ? 'bg-emerald-50/60 hover:bg-emerald-100/60'
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <td className="py-3 px-3">
                                <p className="text-[13px] font-medium text-gray-900">
                                  {account.uniqueId}
                                </p>
                                {isOnline ? (
                                  <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                                    Online
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-3 px-3">
                                <p className="text-[13px] text-gray-600">{account.nickname}</p>
                              </td>
                              <td className="py-3 px-3">
                                <Badge
                                  variant="outline"
                                  className={`${getCampaignBadgeClass(account.campaign)} h-7 px-2 text-[11px] font-medium`}
                                >
                                  {getCampaignLabel(account.campaign)}
                                </Badge>
                              </td>
                              <td className="py-3 px-3">
                                <Badge
                                  variant="outline"
                                  className={`${getPriorityBadgeClass(account.priority)} h-7 px-2 text-[11px] font-medium`}
                                >
                                  {account.priority}
                                </Badge>
                              </td>
                              <td className="py-3 px-3">
                                <Badge
                                  variant="outline"
                                  className={`h-7 px-2 text-[11px] font-medium ${
                                    isOnline
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-sm'
                                      : 'bg-gray-50 text-gray-700 border-gray-200'
                                  }`}
                                >
                                  {isOnline ? 'Online' : 'Offline'}
                                </Badge>
                              </td>
                              <td className="py-3 px-3">
                                <p className="text-[13px] text-gray-900">{account.messagesCount}</p>
                              </td>
                              <td className="py-3 px-3">
                                <p className="text-[13px] text-gray-900">{account.leadsDetected}</p>
                              </td>
                              <td className="py-3 px-3">
                                <p className="text-[13px] text-gray-900">{account.viewers}</p>
                              </td>
                              <td className="py-3 px-3">
                                <p className="text-[10px] text-gray-600">
                                  {account.updatedAt
                                    ? account.updatedAt.toLocaleString('es-CL', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : 'Sin actividad'}
                                </p>
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className={`h-7 px-2 text-[11px] ${
                                      isMonitored
                                        ? 'bg-emerald-600 hover:bg-emerald-700'
                                        : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                                    disabled={monitorButtonDisabled}
                                    title={monitorDisabledReason}
                                    onClick={() => {
                                      void startMonitoring(account.sourceUniqueId);
                                    }}
                                  >
                                    {monitoringActionFor === normalizedSource
                                      ? 'Iniciando...'
                                      : isMonitored
                                      ? 'Agregado'
                                      : 'Agregar'}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 px-2 bg-indigo-600 hover:bg-indigo-700 text-[11px]"
                                    disabled={!canOpenLive}
                                    title={
                                      !canOpenLive
                                        ? !isMonitored
                                          ? 'Primero debes agregar esta cuenta.'
                                          : 'La cuenta debe estar Online para abrir Ver Live.'
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (!canOpenLive) {
                                        return;
                                      }
                                      openLivePreview(
                                        account,
                                        isOnline,
                                        liveStatus?.playbackUrl ?? null
                                      );
                                    }}
                                  >
                                    Ver Live
                                  </Button>
                                  <div className="relative" data-account-actions-root="true">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 w-7 p-0"
                                      aria-label={`Acciones para ${account.uniqueId}`}
                                      title="Acciones"
                                      onClick={() => {
                                        setOpenActionsFor((current) =>
                                          current === normalizedSource ? null : normalizedSource
                                        );
                                      }}
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                    {openActionsFor === normalizedSource ? (
                                      <div className="absolute right-0 z-20 mt-1 w-28 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
                                        <button
                                          type="button"
                                          className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-100"
                                          onClick={() => {
                                            openEditAccount(account);
                                          }}
                                        >
                                          Editar
                                        </button>
                                        <button
                                          type="button"
                                          className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                          disabled={deletingAccount === normalizedSource}
                                          onClick={() => {
                                            void deleteAccount(account);
                                          }}
                                        >
                                          Eliminar
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {group.accounts.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="py-8 px-3 text-center text-[13px] text-gray-500">
                              No hay cuentas disponibles.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
            {groupedAccountsByCampaign.length === 0 ? (
              <div className="py-8 px-3 text-center text-[13px] text-gray-500">
                No hay cuentas disponibles.
              </div>
            ) : null}
          </Accordion>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Mostrando {prioritizedVisibleAccounts.length} cuentas configuradas
            </p>
          </div>
        </CardContent>
      </Card>

      <AiReviewPanels
        summaryText={aiSummaryText}
        recommendations={aiRecommendations}
        notesStorageKey="ember:accounts:reviewer-notes"
      />

      <TikTokPhoneLiveModal
        username={livePreviewAccount?.username ?? ''}
        displayName={livePreviewAccount?.displayName}
        isLive={livePreviewAccount?.isLive}
        playbackUrl={livePreviewAccount?.playbackUrl}
        viewerCount={livePreviewAccount?.viewerCount}
        leadCount={livePreviewAccount?.leadCount}
        messageCount={livePreviewAccount?.messageCount}
        streamStartedAt={livePreviewAccount?.streamStartedAt}
        open={livePreviewAccount !== null}
        onOpenChange={(open) => {
          if (!open) {
            setLivePreviewAccount(null);
          }
        }}
      />

      {editingSourceAccount ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
          onClick={closeEditAccount}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-gray-900">Editar cuenta</h2>
            <p className="mt-1 text-sm text-gray-500">
              Edita la cuenta de TikTok, nombre, campaña y prioridad.
            </p>

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Cuenta TikTok</label>
                <Input
                  value={editForm.uniqueId}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, uniqueId: event.target.value }))
                  }
                  placeholder="@usuario"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Nombre</label>
                <Input
                  value={editForm.nickname}
                  onChange={(event) =>
                    setEditForm((current) => ({ ...current, nickname: event.target.value }))
                  }
                  placeholder="Nombre visible"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Campaña</label>
                <select
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  value={editForm.campaign}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      campaign: normalizeOverrideCampaign(event.target.value, current.uniqueId),
                    }))
                  }
                >
                  <option value="WOM">WOM</option>
                  <option value="CLARO">Claro</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Prioridad</label>
                <select
                  className="h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  value={editForm.priority}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      priority: normalizePriority(event.target.value),
                    }))
                  }
                >
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                  <option value="Baja">Baja</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeEditAccount}>
                Cancelar
              </Button>
              <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={saveAccountEdition}>
                Guardar cambios
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
