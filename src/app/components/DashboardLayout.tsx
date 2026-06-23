import { Outlet, Link, useLocation, useNavigate } from 'react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Radio,
  Clock,
  MessageSquare,
  Building2,
  Settings,
  User,
  Sparkles,
  Bell,
  CheckCircle2,
  X,
  LogOut,
} from 'lucide-react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Button } from './ui/button';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { useAuth } from '../auth/auth';

const LIVE_STATUS_FRESHNESS_MS = 12 * 60 * 1000;
const NOTIFICATION_AUTO_DISMISS_MS = 5 * 1000;
const NOTIFICATION_FADE_MS = 450;
const ACCOUNTS_FOCUS_TARGET_STORAGE_KEY = 'ember:accounts-focus-target';

const normalizeUniqueId = (value?: string) => {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
};

const formatNotificationTime = (value: Date | null | undefined) => {
  if (!value) {
    return '--:--';
  }
  return value.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

type OnlineNotification = {
  id: string;
  target: string;
  title: string;
  description: string;
  startedAtLabel: string;
  isClosing?: boolean;
};

type NotificationTimerEntry = {
  timerId: number;
  phase: 'auto' | 'removal';
};

const dedupeNotificationsByTarget = (entries: OnlineNotification[]) => {
  const seenTargets = new Set<string>();
  return entries.filter((entry) => {
    if (seenTargets.has(entry.target)) {
      return false;
    }
    seenTargets.add(entry.target);
    return true;
  });
};

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Sesiones en vivo', href: '/live-sessions', icon: Radio },
  { name: 'Sesiones finalizadas', href: '/finished-sessions', icon: Clock },
  { name: 'Mensajes', href: '/messages', icon: MessageSquare },
  { name: 'Leads', href: '/leads', icon: Sparkles },
  { name: 'Cuentas', href: '/accounts', icon: Building2 },
  { name: 'Reglas', href: '/rules', icon: Settings, adminOnly: true },
  { name: 'Configuración', href: '/settings', icon: Settings, adminOnly: true },
];

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { runningTargets, configuredTargets, liveStatuses, updatedAt, liveSessions } = useRecorderBridge();
  const [onlineNotifications, setOnlineNotifications] = useState<OnlineNotification[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<OnlineNotification[]>([]);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const previousOnlineTargetsRef = useRef<Set<string> | null>(null);
  const hasInitializedNotificationBaselineRef = useRef(false);
  const dismissedNotificationsRef = useRef<Set<string>>(new Set());
  const notificationTimersRef = useRef<Map<string, NotificationTimerEntry>>(new Map());
  const onlineRunningTargets = useMemo(() => {
    const now = Date.now();
    return runningTargets
      .map((target) => normalizeUniqueId(target))
      .filter(Boolean)
      .filter((target) => {
        const liveStatus = liveStatuses[target];
        if (!liveStatus || liveStatus.status !== 'online') {
          return false;
        }
        const checkedAtMs = liveStatus.checkedAt?.getTime() ?? 0;
        return checkedAtMs > 0 && now - checkedAtMs <= LIVE_STATUS_FRESHNESS_MS;
      });
  }, [runningTargets, liveStatuses]);
  const onlineRegisteredTargets = useMemo(() => {
    const now = Date.now();
    const configuredSet = new Set(configuredTargets.map((target) => normalizeUniqueId(target)).filter(Boolean));
    return Object.entries(liveStatuses)
      .map(([target, status]) => ({ target: normalizeUniqueId(target), status }))
      .filter(({ target }) => Boolean(target))
      .filter(({ target }) => configuredSet.size === 0 || configuredSet.has(target))
      .filter(({ status }) => status.status === 'online')
      .filter(({ status }) => {
        const checkedAtMs = status.checkedAt?.getTime() ?? 0;
        return checkedAtMs > 0 && now - checkedAtMs <= LIVE_STATUS_FRESHNESS_MS;
      })
      .map(({ target }) => target);
  }, [configuredTargets, liveStatuses]);
  const activeSessionCount = onlineRunningTargets.length;
  const activeSessionStartByTarget = useMemo(() => {
    const startsByTarget = new Map<string, Date>();
    for (const session of liveSessions) {
      if (session.status !== 'Active') {
        continue;
      }
      const target = normalizeUniqueId(session.accountName);
      if (!target) {
        continue;
      }
      const currentStart = startsByTarget.get(target);
      if (!currentStart || session.startTime.getTime() > currentStart.getTime()) {
        startsByTarget.set(target, session.startTime);
      }
    }
    return startsByTarget;
  }, [liveSessions]);
  const activeSessionLabel =
    activeSessionCount === 0
      ? 'Sin sesiones activas'
      : `${activeSessionCount} ${activeSessionCount === 1 ? 'sesión activa' : 'sesiones activas'}`;
  const lastUpdatedLabel = (() => {
    if (!updatedAt) {
      return '--:--';
    }
    const hours = String(updatedAt.getHours()).padStart(2, '0');
    const minutes = String(updatedAt.getMinutes()).padStart(2, '0');
    const meridiem = updatedAt.getHours() >= 12 ? 'pm' : 'am';
    return `${hours}:${minutes}${meridiem}`;
  })();
  const resolveStartedAtLabel = (target: string, fallbackLabel = '--:--') => {
    const liveStatus = liveStatuses[target];
    const sessionStart = activeSessionStartByTarget.get(target) ?? null;
    const resolved = formatNotificationTime(
      liveStatus?.liveStartedAt ?? sessionStart ?? liveStatus?.checkedAt ?? null
    );
    return resolved === '--:--' ? fallbackLabel : resolved;
  };

  useEffect(() => {
    const currentOnlineSet = new Set(onlineRegisteredTargets);
    if (!updatedAt) {
      previousOnlineTargetsRef.current = currentOnlineSet;
      return;
    }
    if (!hasInitializedNotificationBaselineRef.current) {
      previousOnlineTargetsRef.current = currentOnlineSet;
      hasInitializedNotificationBaselineRef.current = true;
      return;
    }
    const previousOnlineSet = previousOnlineTargetsRef.current ?? new Set<string>();
    const newlyOnlineTargets =
      onlineRegisteredTargets.filter((target) => !previousOnlineSet.has(target));
    dismissedNotificationsRef.current.forEach((target) => {
      if (!currentOnlineSet.has(target)) {
        dismissedNotificationsRef.current.delete(target);
      }
    });

    if (newlyOnlineTargets.length > 0) {
      const newItems = newlyOnlineTargets
        .filter((target) => !dismissedNotificationsRef.current.has(target))
        .map((target) => {
          const startedAtLabel = resolveStartedAtLabel(target);
          return {
            id: `${target}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            target,
            title: 'Cuenta online detectada',
            description: `La cuenta ${target} está Online`,
            startedAtLabel,
          };
        });
        if (newItems.length > 0) {
        setOnlineNotifications((current) => {
          const uniqueCurrent = dedupeNotificationsByTarget(current).map((entry) =>
            entry.startedAtLabel
              ? entry
              : {
                  ...entry,
                  startedAtLabel: resolveStartedAtLabel(entry.target, entry.startedAtLabel),
                }
          );
          const currentWithoutUpdatedTargets = uniqueCurrent.filter(
            (entry) => !newItems.some((newEntry) => newEntry.target === entry.target)
          );
          const nextEntries = [...newItems, ...currentWithoutUpdatedTargets];
          const uniqueNext = dedupeNotificationsByTarget(nextEntries);
          if (uniqueNext.length === current.length && uniqueNext.every((entry, index) => entry.id === current[index]?.id)) {
            return current;
          }
          return uniqueNext;
        });
        setNotificationHistory((current) =>
          dedupeNotificationsByTarget([...newItems, ...current]).slice(0, 50)
        );
      }
    } else {
      setOnlineNotifications((current) => {
        const normalized = dedupeNotificationsByTarget(current).map((entry) =>
          entry.startedAtLabel
            ? entry
            : {
                ...entry,
                startedAtLabel: resolveStartedAtLabel(entry.target, entry.startedAtLabel),
              }
        );
        if (
          normalized.length === current.length &&
          normalized.every((entry, index) => entry.id === current[index]?.id)
        ) {
          return current;
        }
        return normalized;
      });
    }

    previousOnlineTargetsRef.current = currentOnlineSet;
  }, [onlineRegisteredTargets, liveStatuses, activeSessionStartByTarget, updatedAt]);

  const dismissNotification = useCallback(
    (
      notificationId: string,
      targetHint?: string,
      options?: { navigateToAccounts?: boolean; keepHistory?: boolean }
    ) => {
      const timerEntry = notificationTimersRef.current.get(notificationId);
      const currentTarget =
        targetHint ?? onlineNotifications.find((entry) => entry.id === notificationId)?.target;

      if (timerEntry?.phase === 'removal') {
        if (options?.navigateToAccounts && currentTarget) {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(ACCOUNTS_FOCUS_TARGET_STORAGE_KEY, currentTarget);
          }
          setIsNotificationPanelOpen(false);
          navigate('/accounts', {
            state: {
              focusAccount: currentTarget,
            },
          });
        }
        if (options?.keepHistory === false) {
          setNotificationHistory((current) => current.filter((entry) => entry.id !== notificationId));
        }
        return;
      }
      if (timerEntry) {
        window.clearTimeout(timerEntry.timerId);
        notificationTimersRef.current.delete(notificationId);
      }

      if (currentTarget) {
        dismissedNotificationsRef.current.add(currentTarget);
      }

      setOnlineNotifications((current) =>
        current.map((entry) =>
          entry.id === notificationId ? { ...entry, isClosing: true } : entry
        )
      );

      const removalTimerId = window.setTimeout(() => {
        setOnlineNotifications((current) => current.filter((entry) => entry.id !== notificationId));
        if (!options?.keepHistory) {
          setNotificationHistory((current) => current.filter((entry) => entry.id !== notificationId));
        }
        const activeTimerEntry = notificationTimersRef.current.get(notificationId);
        if (activeTimerEntry?.timerId === removalTimerId) {
          notificationTimersRef.current.delete(notificationId);
        }
      }, NOTIFICATION_FADE_MS);

      notificationTimersRef.current.set(notificationId, {
        timerId: removalTimerId,
        phase: 'removal',
      });

      if (options?.navigateToAccounts && currentTarget) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(ACCOUNTS_FOCUS_TARGET_STORAGE_KEY, currentTarget);
        }
        setIsNotificationPanelOpen(false);
        navigate('/accounts', {
          state: {
            focusAccount: currentTarget,
          },
        });
      }
    },
    [navigate, onlineNotifications]
  );

  useEffect(() => {
    for (const notification of onlineNotifications) {
      if (notification.isClosing || notificationTimersRef.current.has(notification.id)) {
        continue;
      }

      const timerId = window.setTimeout(() => {
        dismissNotification(notification.id, notification.target, {
          keepHistory: false,
        });
      }, NOTIFICATION_AUTO_DISMISS_MS);
      notificationTimersRef.current.set(notification.id, {
        timerId,
        phase: 'auto',
      });
    }

    for (const [notificationId, timerId] of notificationTimersRef.current.entries()) {
      const stillPresent = onlineNotifications.some((entry) => entry.id === notificationId);
      if (!stillPresent) {
        window.clearTimeout(timerId.timerId);
        notificationTimersRef.current.delete(notificationId);
      }
    }
  }, [onlineNotifications, dismissNotification]);

  useEffect(() => {
    return () => {
      for (const timerEntry of notificationTimersRef.current.values()) {
        window.clearTimeout(timerEntry.timerId);
      }
      notificationTimersRef.current.clear();
    };
  }, []);

  const latestFiveNotifications = dedupeNotificationsByTarget(notificationHistory).slice(0, 5);
  const isAdminUser = user?.role === 'administrator';
  const visibleNavigation = navigation.filter((item) => !item.adminOnly || isAdminUser);
  const userRoleLabel =
    user?.role === 'administrator'
      ? 'Administrador'
      : user?.role === 'supervisor'
        ? 'Supervisor'
        : user?.role === 'client'
          ? 'Cliente'
          : user?.role === 'executive'
            ? 'Ejecutivo'
            : 'Usuario';
  const userScopeLabel = user?.clientCode ? user.clientCode : 'Todos los clientes';

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-hidden border-r border-gray-200 bg-white">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Logo Ember"
              className="w-8 h-8 rounded-lg object-contain"
            />
            <div>
              <h1 className="font-semibold text-gray-900">Ember</h1>
              <p className="text-xs text-gray-500">Monitor de Leads</p>
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
          {visibleNavigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-gray-200">
                <User className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.displayName ?? 'Usuario'}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.login ?? ''}</p>
              <p className="text-[11px] text-gray-400 truncate">
                {userRoleLabel} · {userScopeLabel}
              </p>
            </div>
          </div>
          <div className="mt-3 px-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="ml-64 flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-end px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <div
                className={`w-2 h-2 rounded-full ${
                  activeSessionCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span className="text-gray-600">{activeSessionLabel}</span>
            </div>
            <div className="relative flex items-center gap-2">
              <span className="text-xs text-gray-600">
                Última actualización · {lastUpdatedLabel}
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsNotificationPanelOpen((current) => !current)}
                  className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-800"
                  aria-label="Abrir notificaciones"
                >
                  <Bell className="h-4 w-4" />
                  {latestFiveNotifications.length > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold leading-none text-white">
                      {Math.min(latestFiveNotifications.length, 5)}
                    </span>
                  ) : null}
                </button>
                {isNotificationPanelOpen ? (
                  <div className="absolute right-0 top-full z-30 mt-2 w-[24rem] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">Notificaciones</p>
                      <span className="text-xs text-slate-500">Últimas 5</span>
                    </div>
                    {latestFiveNotifications.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                        No hay notificaciones recientes.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {latestFiveNotifications.map((notification) => (
                          <div
                            key={notification.id}
                            role="button"
                            tabIndex={0}
                            className={`flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-all duration-500 ease-out ${
                              notification.isClosing
                                ? 'pointer-events-none translate-y-1 opacity-0'
                                : 'cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/50'
                            }`}
                            onClick={() =>
                              dismissNotification(notification.id, notification.target, {
                                navigateToAccounts: true,
                                keepHistory: false,
                              })
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                dismissNotification(notification.id, notification.target, {
                                  navigateToAccounts: true,
                                  keepHistory: false,
                                });
                              }
                            }}
                          >
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-5 text-slate-800">
                                {notification.title}
                              </p>
                              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                                {notification.description}
                              </p>
                              <p className="mt-1 text-[11px] font-medium text-emerald-700">
                                Inicio: {resolveStartedAtLabel(notification.target, notification.startedAtLabel)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                dismissNotification(notification.id, notification.target);
                              }}
                              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                              aria-label={`Cerrar notificación de ${notification.target}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
              {onlineNotifications.length > 0 ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-[24rem] space-y-2">
                  {onlineNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      role="button"
                      tabIndex={0}
                      className={`flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-all duration-500 ease-out ${
                        notification.isClosing
                          ? 'pointer-events-none translate-y-1 opacity-0'
                          : 'cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/70'
                      }`}
                      onClick={() =>
                        dismissNotification(notification.id, notification.target, {
                          navigateToAccounts: true,
                          keepHistory: false,
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          dismissNotification(notification.id, notification.target, {
                            navigateToAccounts: true,
                            keepHistory: false,
                          });
                        }
                      }}
                    >
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold leading-5 text-slate-800">
                          {notification.title}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-slate-500">
                          {notification.description}
                        </p>
                        <p className="mt-1 text-xs font-medium text-emerald-700">
                          Inicio: {resolveStartedAtLabel(notification.target, notification.startedAtLabel)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          dismissNotification(notification.id, notification.target);
                        }}
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        aria-label={`Cerrar notificación de ${notification.target}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
