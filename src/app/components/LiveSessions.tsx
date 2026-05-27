import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Radio, Eye, MessageSquare, Users, Clock, Copy, Check, X } from 'lucide-react';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { Link, useNavigate } from 'react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TikTokLivePreviewButton } from './TikTokLivePreviewButton';
import { readJsonResponse, resolveApiErrorMessage } from '../../lib/http';
import { resolveClientByAccount } from '../dashboard/client-users.mjs';

const normalizeUniqueId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('@') ? trimmed.toLowerCase() : `@${trimmed.toLowerCase()}`;
};
const LIVE_STATUS_FRESHNESS_MS = 90 * 1000;
const DELETED_ACCOUNTS_STORAGE_KEY = 'ember:deleted-accounts';
const START_MONITORING_PROGRESS_STAGES = [
  'Validando la cuenta',
  'Conectando con TikTok',
  'Recopilando datos',
  'Listo!',
] as const;
const START_MONITORING_PROGRESS_TOTAL_MS = 3_000;
const START_MONITORING_PROGRESS_STEP_MS =
  START_MONITORING_PROGRESS_TOTAL_MS / START_MONITORING_PROGRESS_STAGES.length;
const START_MONITORING_PANEL_COUNTDOWN_SECONDS = 5;
const START_MONITORING_ERROR_VISIBLE_MS = 3_000;
const STOP_MONITORING_PROGRESS_TOTAL_MS = 3_000;
const STOP_MONITORING_DONE_VISIBLE_MS = 1_000;
type SessionClientFilter = 'WOM' | 'CLARO';
const SESSION_CLIENT_LOGO_ASSETS: Record<
  SessionClientFilter,
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

function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );
}

function SessionClientLogoBadge({ client }: { client: SessionClientFilter }) {
  const logoAsset = SESSION_CLIENT_LOGO_ASSETS[client];

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

const formatSessionDate = (value?: Date) =>
  value
    ? value.toLocaleDateString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'Sin registro';

const formatSessionTime = (value?: Date) =>
  value
    ? value.toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '--:--';

const formatSessionDuration = (start?: Date, end?: Date) => {
  if (!start || !end) {
    return '--';
  }

  const durationMs = end.getTime() - start.getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '--';
  }

  const totalMinutes = Math.floor(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
};

export function LiveSessions() {
  const navigate = useNavigate();
  const {
    liveSessions: sessions,
    accountLabel,
    accounts,
    configuredTargets,
    runningTargets,
    onlineTargets,
    liveStatuses,
    monitoringSince,
  } = useRecorderBridge();
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [submitAction, setSubmitAction] = useState<'start' | 'stop' | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [selectedClientFilter, setSelectedClientFilter] = useState<SessionClientFilter>('WOM');
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [startProgress, setStartProgress] = useState<{
    account: string;
    stageIndex: number;
    completed: boolean;
    succeeded: boolean;
    failed: boolean;
    panelCountdown: number | null;
  } | null>(null);
  const startProgressTimersRef = useRef<number[]>([]);
  const [stopProgress, setStopProgress] = useState<{
    account: string;
    completed: boolean;
    progressPercent: number;
  } | null>(null);
  const stopProgressTimersRef = useRef<number[]>([]);
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
  const hasMonitoring = runningTargets.length > 0;
  const runningTargetSet = useMemo(
    () => new Set(runningTargets.map((target) => normalizeUniqueId(target))),
    [runningTargets]
  );
  const onlineTargetSet = useMemo(
    () => new Set(onlineTargets.map((target) => normalizeUniqueId(target))),
    [onlineTargets]
  );
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncDeletedAccounts = () => {
      try {
        const rawValue = window.localStorage.getItem(DELETED_ACCOUNTS_STORAGE_KEY);
        if (!rawValue) {
          setDeletedAccounts(new Set<string>());
          return;
        }
        const parsedValue = JSON.parse(rawValue) as string[];
        setDeletedAccounts(new Set(parsedValue.map((item) => normalizeUniqueId(item)).filter(Boolean)));
      } catch {
        setDeletedAccounts(new Set<string>());
      }
    };

    syncDeletedAccounts();
    window.addEventListener('storage', syncDeletedAccounts);
    return () => {
      window.removeEventListener('storage', syncDeletedAccounts);
    };
  }, []);
  const registeredAccountSet = useMemo(() => {
    const configuredTargetSet = new Set(configuredTargets.map((target) => normalizeUniqueId(target)));
    const runningTargetSet = new Set(runningTargets.map((target) => normalizeUniqueId(target)));
    const registeredAccounts = accounts
      .map((account) => {
        const accountId = normalizeUniqueId(account.uniqueId);
        if (!accountId || deletedAccounts.has(accountId)) {
          return '';
        }

        const isConfigured = configuredTargetSet.has(accountId);
        const isRunning = runningTargetSet.has(accountId);
        const hasActivity =
          account.messagesCount > 0 || account.leadsDetected > 0 || account.viewers > 0;
        const hasSessionId = account.startTime !== null || account.endTime !== null;
        const isVisibleInAccountsMenu =
          account.status === 'Active' || isConfigured || isRunning || hasActivity || hasSessionId;

        return isVisibleInAccountsMenu ? accountId : '';
      })
      .filter(Boolean);
    return new Set(registeredAccounts);
  }, [accounts, configuredTargets, runningTargets, deletedAccounts]);
  const freshOnlineAccountSet = useMemo(() => {
    const now = Date.now();
    const onlineAccounts = accounts
      .map((account) => normalizeUniqueId(account.uniqueId))
      .filter((accountId) => {
        const liveStatus = liveStatuses[accountId];
        const checkedAtMs = liveStatus?.checkedAt?.getTime() ?? 0;
        const hasRecentValidation =
          checkedAtMs > 0 && now - checkedAtMs <= LIVE_STATUS_FRESHNESS_MS;
        return (
          onlineTargetSet.has(accountId) &&
          liveStatus?.status === 'online' &&
          hasRecentValidation
        );
      });

    return new Set(onlineAccounts);
  }, [accounts, liveStatuses, onlineTargetSet]);
  const liveAccounts = useMemo(() => {
    const byAccount = new Map<string, (typeof sessions)[number]>();
    for (const session of sessions) {
      const normalizedAccount = normalizeUniqueId(session.accountName);
      if (!normalizedAccount) {
        continue;
      }
      const isRegistered = registeredAccountSet.has(normalizedAccount);
      const isLiveByListener = freshOnlineAccountSet.has(normalizedAccount);
      if (!isRegistered || !isLiveByListener) {
        continue;
      }

      const current = byAccount.get(normalizedAccount);
      if (!current || session.startTime.getTime() > current.startTime.getTime()) {
        byAccount.set(normalizedAccount, session);
      }
    }
    return Array.from(byAccount.values()).sort((a, b) =>
      a.accountName.localeCompare(b.accountName)
    );
  }, [sessions, freshOnlineAccountSet, registeredAccountSet]);
  const clientFilteredLiveAccounts = useMemo(() => {
    return liveAccounts.filter((session) => {
      const accountClient = resolveClientByAccount(normalizeUniqueId(session.accountName));
      if (selectedClientFilter === 'CLARO') {
        return accountClient === 'CLARO';
      }
      return accountClient !== 'CLARO';
    });
  }, [liveAccounts, selectedClientFilter]);

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
      succeeded: false,
      failed: false,
      panelCountdown: null,
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
  const beginStartPanelCountdown = (account: string) => {
    clearStartProgressTimers();
    setStartProgress((current) => {
      if (!current || current.account !== account) {
        return current;
      }
      return {
        ...current,
        panelCountdown: START_MONITORING_PANEL_COUNTDOWN_SECONDS,
      };
    });

    for (let elapsedSeconds = 1; elapsedSeconds <= START_MONITORING_PANEL_COUNTDOWN_SECONDS; elapsedSeconds++) {
      const timerId = window.setTimeout(() => {
        setStartProgress((current) => {
          if (!current || current.account !== account) {
            return current;
          }
          const nextCountdown = START_MONITORING_PANEL_COUNTDOWN_SECONDS - elapsedSeconds;
          if (nextCountdown <= 0) {
            return null;
          }
          return { ...current, panelCountdown: nextCountdown };
        });
      }, elapsedSeconds * 1_000);
      startProgressTimersRef.current.push(timerId);
    }
  };
  const failStartProgress = (account: string) => {
    clearStartProgressTimers();
    setStartProgress((current) => {
      if (!current || current.account !== account) {
        return current;
      }
      return {
        ...current,
        stageIndex: START_MONITORING_PROGRESS_STAGES.length - 1,
        completed: true,
        succeeded: false,
        failed: true,
        panelCountdown: null,
      };
    });
    const dismissTimerId = window.setTimeout(() => {
      setStartProgress((current) => {
        if (!current || current.account !== account) {
          return current;
        }
        return null;
      });
    }, START_MONITORING_ERROR_VISIBLE_MS);
    startProgressTimersRef.current.push(dismissTimerId);
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

  useEffect(() => {
    return () => {
      clearStartProgressTimers();
      clearStopProgressTimers();
    };
  }, []);

  const startMonitoring = async (accountName: string) => {
    const normalized = normalizeUniqueId(accountName);
    if (!normalized) {
      setActionMessage('No se pudo identificar la cuenta a monitorear.');
      return;
    }

    setIsSubmitting(normalized);
    setSubmitAction('start');
    setActionMessage(null);
    closeStopProgress();
    const progressPromise = beginStartProgress(normalized);
    try {
      const response = await fetch('/recorder-api/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unique_id: normalized }),
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

      const startedAccount = normalizeUniqueId(payload.unique_id || normalized) || normalized;
      setStartProgress((current) => {
        if (!current || current.account !== normalized) {
          return current;
        }
        return { ...current, succeeded: true, failed: false };
      });
      await progressPromise;
      beginStartPanelCountdown(startedAccount);
    } catch (error) {
      failStartProgress(normalized);
      const message =
        error instanceof Error ? error.message : 'No se pudo conectar con el monitor local.';
      setActionMessage(message);
    } finally {
      setIsSubmitting(null);
      setSubmitAction(null);
    }
  };

  const stopMonitoring = async (accountName: string) => {
    const normalized = normalizeUniqueId(accountName);
    if (!normalized) {
      setActionMessage('No se pudo identificar la cuenta a detener.');
      return;
    }

    closeStartProgress();
    setIsSubmitting(normalized);
    setSubmitAction('stop');
    setActionMessage(null);
    beginStopProgress(normalized);
    try {
      let response = await fetch(`/recorder-api/targets?unique_id=${encodeURIComponent(normalized)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unique_id: normalized }),
      });

      let payload = await readJsonResponse<{
        ok?: boolean;
        stopped?: boolean;
        unique_id?: string;
        error?: string;
      }>(response);

      if (!response.ok || !payload?.ok) {
        // Fallback defensivo para entornos donde DELETE con body no se procesa bien.
        response = await fetch('/recorder-api/targets', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ unique_id: normalized }),
        });
        payload = await readJsonResponse<{
          ok?: boolean;
          stopped?: boolean;
          unique_id?: string;
          error?: string;
        }>(response);
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(resolveApiErrorMessage(response, payload, 'No se pudo detener el monitoreo.'));
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo conectar con el monitor local.';
      setActionMessage(message);
    } finally {
      setIsSubmitting(null);
      setSubmitAction(null);
    }
  };

  const copySessionId = async (sessionId: string) => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopiedSessionId(sessionId);
      window.setTimeout(() => {
        setCopiedSessionId((current) => (current === sessionId ? null : current));
      }, 1500);
    } catch {
      setActionMessage('No se pudo copiar el ID de sesión.');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="w-full max-w-xs">
          <h1 className="text-2xl font-semibold text-gray-900">Sesiones en vivo</h1>
          <div className="mt-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cliente
            </label>
            <select
              value={selectedClientFilter}
              onChange={(event) => setSelectedClientFilter(event.target.value as SessionClientFilter)}
              className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              <option value="WOM">WOM</option>
              <option value="CLARO">Claro</option>
            </select>
          </div>
        </div>
        <SessionClientLogoBadge client={selectedClientFilter} />
      </div>

      {/* Active Sessions */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Cuentas transmitiendo en vivo
          </h2>
          <p className="text-sm text-gray-500">
            Se muestran solo cuentas registradas que están en vivo según el listener.
          </p>
        </div>
        {startProgress ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-700">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <LoadingSpinner className="h-4 w-4" />
                <div>
                  <p className="text-sm font-medium">
                    {startProgress.failed
                      ? 'No se pudo iniciar el monitoreo'
                      : START_MONITORING_PROGRESS_STAGES[startProgress.stageIndex]}
                  </p>
                  <p className="text-xs opacity-90">
                    {startProgress.failed
                      ? `Revisa el monitor local para ${startProgress.account} e intenta nuevamente.`
                      : `Iniciando monitoreo para ${startProgress.account}`}
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
            {startProgress.completed && startProgress.succeeded ? (
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700"
                  onClick={() =>
                    navigate(`/?account=${encodeURIComponent(startProgress.account)}`)
                  }
                >
                  Ver Dashboard
                  {startProgress.panelCountdown !== null ? ` (${startProgress.panelCountdown})` : ''}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {stopProgress ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-red-700">
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
        {actionMessage ? (
          <p className="text-sm text-gray-700 mb-4">{actionMessage}</p>
        ) : null}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {clientFilteredLiveAccounts.map((session) => {
            const normalizedAccount = normalizeUniqueId(session.accountName);
            const isMonitored = runningTargetSet.has(normalizedAccount);
            const isAccountLive = freshOnlineAccountSet.has(normalizedAccount);
            const liveStartedAt = liveStatuses[normalizedAccount]?.liveStartedAt ?? session.startTime;
            const liveStartedAtLabel = formatSessionTime(liveStartedAt);
            const monitoredSince = monitoringSince[normalizedAccount] ?? null;
            const monitoredSinceLabel = monitoredSince
              ? formatSessionTime(monitoredSince)
              : null;
            const previousSession = session.previousSession;
            const canOpenLive = isMonitored && isAccountLive;
            const isStarting = isSubmitting === normalizedAccount && submitAction === 'start';
            const isStopping = isSubmitting === normalizedAccount && submitAction === 'stop';
            return (
              <Card
                key={session.id}
                className={
                  isMonitored
                    ? 'border-2 border-green-200 bg-green-50/30'
                    : 'border-2 border-gray-200 bg-gray-50/30'
                }
              >
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                            isMonitored ? 'bg-green-100' : 'bg-gray-100'
                          }`}
                        >
                          <Radio
                            className={`w-6 h-6 ${isMonitored ? 'text-green-600' : 'text-gray-600'}`}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-lg font-semibold leading-tight text-gray-900 break-all">
                            {session.accountName}
                          </p>
                          <div className="mt-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  isAccountLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
                                }`}
                              />
                              {isAccountLive ? (
                                <>
                                  <Badge className="h-7 px-2 text-[11px] bg-green-600 hover:bg-green-600 text-white">
                                    ONLINE
                                  </Badge>
                                  <span className="text-[11px] text-gray-500 whitespace-nowrap">
                                    Online desde {liveStartedAtLabel}
                                  </span>
                                </>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="h-7 px-2 text-[11px] bg-gray-50 text-gray-700 border-gray-300"
                                >
                                  OFFLINE
                                </Badge>
                              )}
                            </div>
                            {isMonitored ? (
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full opacity-0" />
                                <Badge className="h-7 px-2 text-[11px] bg-blue-600">
                                  Monitoreando
                                </Badge>
                                {monitoredSinceLabel ? (
                                  <span className="text-[11px] text-gray-500 whitespace-nowrap">
                                    desde {monitoredSinceLabel}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:self-start sm:shrink-0">
                        <TikTokLivePreviewButton
                          username={session.accountName}
                          label="Ver Live"
                          className="h-7 min-w-[124px] justify-center px-2 text-[11px]"
                          onFeedback={setActionMessage}
                          disabled={!canOpenLive}
                          disabledReason={
                            !isMonitored
                              ? 'Primero debes iniciar el monitoreo de esta cuenta.'
                              : 'La cuenta debe estar ONLINE para abrir Ver Live.'
                          }
                        />
                        {isMonitored ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 min-w-[124px] justify-center px-2 text-[11px] text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                            onClick={() => {
                              void stopMonitoring(session.accountName);
                            }}
                            disabled={isSubmitting !== null}
                          >
                            {isStopping ? (
                              <>
                                <LoadingSpinner className="w-3 h-3" />
                                Deteniendo...
                              </>
                            ) : (
                              'Detener monitoreo'
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 min-w-[124px] justify-center px-2 text-[11px] bg-blue-600 hover:bg-blue-700"
                            disabled={isSubmitting !== null}
                            onClick={() => startMonitoring(session.accountName)}
                          >
                            {isStarting ? (
                              <>
                                <LoadingSpinner className="w-3 h-3" />
                                Iniciando...
                              </>
                            ) : (
                              'Iniciar Monitoreo'
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                        <div className="flex items-center justify-center gap-2 text-gray-500 mb-1">
                          <Eye className="w-4 h-4" />
                        </div>
                        <p className="text-2xl font-semibold text-gray-900">
                          {session.viewers.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Usuarios</p>
                      </div>

                      <Link
                        to={`/messages?sessionId=${encodeURIComponent(session.rawSessionId ?? session.id)}&account=${encodeURIComponent(
                          session.accountName
                        )}&onlyLeads=1`}
                        className="text-center p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                        title="Ir al stream de mensajes (solo leads) de esta sesión"
                      >
                        <div className="flex items-center justify-center gap-2 text-gray-500 mb-1">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <p className="text-2xl font-semibold text-gray-900">
                          {session.messagesCount}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Mensajes</p>
                      </Link>

                      <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                        <div className="flex items-center justify-center gap-2 text-gray-500 mb-1">
                          <Users className="w-4 h-4" />
                        </div>
                        <p className="text-2xl font-semibold text-gray-900">
                          {session.leadsDetected}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Leads</p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-gray-200 space-y-2">
                      <div className="flex items-center gap-2 text-gray-500">
                        <p className="min-w-0 truncate text-[10px]">
                          ID sesión: <span className="font-mono">{session.id}</span>
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[10px] text-gray-500 hover:text-gray-700 shrink-0"
                          onClick={() => {
                            void copySessionId(session.id);
                          }}
                        >
                          {copiedSessionId === session.id ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 mr-1" />
                              Copiar
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="bg-slate-50 text-slate-700 border-slate-300 text-[10px] leading-4 px-1.5 py-0.5"
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            Fecha última sesión: {formatSessionDate(previousSession?.endTime)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] leading-4 px-1.5 py-0.5"
                          >
                            Inicio: {formatSessionTime(previousSession?.startTime)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="bg-violet-50 text-violet-700 border-violet-200 text-[10px] leading-4 px-1.5 py-0.5"
                          >
                            Fin: {formatSessionTime(previousSession?.endTime)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] leading-4 px-1.5 py-0.5"
                          >
                            Duración: {formatSessionDuration(previousSession?.startTime, previousSession?.endTime)}
                          </Badge>
                        </div>
                        <Link to={`/live-sessions/${session.id}`} className="shrink-0 self-start sm:self-auto">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                            Ver detalle
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {clientFilteredLiveAccounts.length === 0 ? (
          <p className="text-sm text-gray-500 mt-4">
            No hay cuentas de {selectedClientFilter === 'CLARO' ? 'Claro' : 'WOM'} transmitiendo en vivo en este momento.
          </p>
        ) : null}
      </div>
    </div>
  );
}
