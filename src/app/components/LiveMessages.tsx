import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search, Filter } from 'lucide-react';

import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { useAuth } from '../auth/auth';
import { getDefaultDisplayNameForAccount, getUsersForClient } from '../dashboard/client-users.mjs';
import type { LiveSession, Message } from '../data/mockData';

const DASHBOARD_CLIENT_STORAGE_KEY = 'ember:dashboard:selected-client';
const ALL_AGENTS_VALUE = 'all';
type SessionClientFilter = 'WOM' | 'CLARO';

function normalizeUniqueId(value?: string | null): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function matchesMessageToSession(message: Message, session: LiveSession): boolean {
  const messageSessionId = message.sessionId.toLowerCase();
  const rawSessionId = (session.rawSessionId ?? '').toLowerCase();
  if (
    messageSessionId === session.id.toLowerCase() ||
    (rawSessionId.length > 0 && messageSessionId === rawSessionId)
  ) {
    return true;
  }

  const startTime = session.startTime.getTime();
  const endTime = session.endTime?.getTime() ?? Number.POSITIVE_INFINITY;
  return message.timestamp.getTime() >= startTime && message.timestamp.getTime() <= endTime;
}

export function LiveMessages() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { allMessages, liveSessions, runningTargets } = useRecorderBridge();
  const isAdminUser = user?.role === 'administrator';
  const requestedSessionId = (searchParams.get('sessionId') ?? '').trim();
  const requestedAgentAccount = normalizeUniqueId(searchParams.get('account'));
  const [messageSearch, setMessageSearch] = useState(requestedSessionId);
  const [sortByScore, setSortByScore] = useState(false);
  const [selectedClient, setSelectedClient] = useState<SessionClientFilter>(() => {
    const fallbackClient: SessionClientFilter = user?.clientCode === 'CLARO' ? 'CLARO' : 'WOM';
    if (!isAdminUser || typeof window === 'undefined') {
      return fallbackClient;
    }

    const storedClient = window.localStorage.getItem(DASHBOARD_CLIENT_STORAGE_KEY);
    if (storedClient === 'CLARO_PHOENIX') {
      return 'CLARO';
    }
    if (storedClient === 'WOM' || storedClient === 'CLARO') {
      return storedClient;
    }
    return fallbackClient;
  });
  const [selectedAgentAccount, setSelectedAgentAccount] = useState<string>(
    requestedAgentAccount || ALL_AGENTS_VALUE
  );
  const onlyLeads = searchParams.get('onlyLeads') === '1';
  const updateOnlyLeadsFilter = (enabled: boolean) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (enabled) {
      nextSearchParams.set('onlyLeads', '1');
    } else {
      nextSearchParams.delete('onlyLeads');
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  useEffect(() => {
    if (!requestedSessionId) {
      return;
    }
    setMessageSearch(requestedSessionId);
  }, [requestedSessionId]);

  useEffect(() => {
    if (!requestedAgentAccount) {
      return;
    }
    setSelectedAgentAccount(requestedAgentAccount);
  }, [requestedAgentAccount]);

  useEffect(() => {
    if (!isAdminUser) {
      setSelectedClient(user?.clientCode === 'CLARO' ? 'CLARO' : 'WOM');
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    const syncSelectedClient = () => {
      const storedClient = window.localStorage.getItem(DASHBOARD_CLIENT_STORAGE_KEY);
      if (storedClient === 'CLARO_PHOENIX') {
        setSelectedClient('CLARO');
        return;
      }
      if (storedClient === 'WOM' || storedClient === 'CLARO') {
        setSelectedClient(storedClient);
      }
    };

    syncSelectedClient();
    window.addEventListener('storage', syncSelectedClient);
    return () => {
      window.removeEventListener('storage', syncSelectedClient);
    };
  }, [isAdminUser, user?.clientCode]);

  const availableAgentOptions = useMemo(() => {
    const selectedClientAccounts = getUsersForClient(selectedClient)
      .map((account) => {
        const normalizedAccount = normalizeUniqueId(account);
        if (!normalizedAccount) {
          return null;
        }

        const displayName = getDefaultDisplayNameForAccount(normalizedAccount) ?? normalizedAccount;
        const label =
          displayName === normalizedAccount
            ? normalizedAccount
            : `${displayName} (${normalizedAccount})`;

        return {
          value: normalizedAccount,
          label,
        };
      })
      .filter(Boolean) as Array<{ value: string; label: string }>;

    return selectedClientAccounts.sort((left, right) =>
      left.label.localeCompare(right.label, 'es-CL')
    );
  }, [selectedClient]);
  const selectedClientAccountSet = useMemo(
    () => new Set(availableAgentOptions.map((option) => option.value)),
    [availableAgentOptions]
  );
  const scopedRunningTargets = useMemo(
    () =>
      runningTargets.filter((target) => selectedClientAccountSet.has(normalizeUniqueId(target))),
    [runningTargets, selectedClientAccountSet]
  );
  const hasMonitoredAccounts = scopedRunningTargets.length > 0;

  useEffect(() => {
    if (selectedAgentAccount === ALL_AGENTS_VALUE) {
      return;
    }

    const isValidSelection = availableAgentOptions.some(
      (option) => option.value === selectedAgentAccount
    );
    if (!isValidSelection) {
      setSelectedAgentAccount(ALL_AGENTS_VALUE);
    }
  }, [availableAgentOptions, selectedAgentAccount]);

  const sessionByToken = useMemo(() => {
    const entries = new Map<string, LiveSession>();
    for (const session of liveSessions) {
      if (!selectedClientAccountSet.has(normalizeUniqueId(session.accountName))) {
        continue;
      }
      entries.set(session.id.toLowerCase(), session);
      const rawSessionId = (session.rawSessionId ?? '').toLowerCase();
      if (rawSessionId) {
        entries.set(rawSessionId, session);
      }
    }
    return entries;
  }, [liveSessions, selectedClientAccountSet]);

  const resolveMessageSession = (message: Message) => {
    const token = message.sessionId.toLowerCase();
    const directMatch = sessionByToken.get(token);
    if (directMatch) {
      return directMatch;
    }

    return selectedClientSessions.find((session) => matchesMessageToSession(message, session));
  };

  const trimmedSearch = messageSearch.trim();
  const normalizedSearch = trimmedSearch.toLowerCase();
  const normalizedSearchAccount = normalizeUniqueId(trimmedSearch);
  const hasSearchQuery = normalizedSearch.length > 0;
  const selectedClientSessions = useMemo(
    () =>
      liveSessions.filter((session) =>
        selectedClientAccountSet.has(normalizeUniqueId(session.accountName))
      ),
    [liveSessions, selectedClientAccountSet]
  );
  const filteredSessionsByAgent = useMemo(() => {
    if (selectedAgentAccount === ALL_AGENTS_VALUE) {
      return selectedClientSessions;
    }

    const normalizedSelectedAgent = normalizeUniqueId(selectedAgentAccount);
    return selectedClientSessions.filter(
      (session) => normalizeUniqueId(session.accountName) === normalizedSelectedAgent
    );
  }, [selectedAgentAccount, selectedClientSessions]);
  const filteredActiveSessionsByAgent = useMemo(
    () => filteredSessionsByAgent.filter((session) => session.status === 'Active'),
    [filteredSessionsByAgent]
  );
  const selectedAgentLabel = useMemo(() => {
    if (selectedAgentAccount === ALL_AGENTS_VALUE) {
      return 'Todas las cuentas';
    }

    return (
      availableAgentOptions.find((option) => option.value === selectedAgentAccount)?.label ??
      selectedAgentAccount
    );
  }, [availableAgentOptions, selectedAgentAccount]);
  const activeSessionTokens = useMemo(() => {
    const tokens = new Set<string>();
    filteredActiveSessionsByAgent.forEach((session) => {
      tokens.add(session.id.toLowerCase());
      const rawSessionId = (session.rawSessionId ?? '').toLowerCase();
      if (rawSessionId) {
        tokens.add(rawSessionId);
      }
    });
    return tokens;
  }, [filteredActiveSessionsByAgent]);
  const isRealtimeMode = hasMonitoredAccounts && !hasSearchQuery && filteredActiveSessionsByAgent.length > 0;

  const filteredBySearch = hasMonitoredAccounts && hasSearchQuery
    ? allMessages.filter((message) => {
        const matchesSelectedAgent =
          selectedAgentAccount === ALL_AGENTS_VALUE ||
          filteredSessionsByAgent.some((session) => matchesMessageToSession(message, session));
        if (!matchesSelectedAgent) {
          return false;
        }

        const matchedSession = resolveMessageSession(message);
        const sessionAccount = normalizeUniqueId(matchedSession?.accountName);
        const matchedSessionId = (matchedSession?.id ?? '').toLowerCase();
        const matchedRawSessionId = (matchedSession?.rawSessionId ?? '').toLowerCase();

        const matchesId =
          message.id.toLowerCase().includes(normalizedSearch) ||
          message.sessionId.toLowerCase().includes(normalizedSearch);
        const matchesSessionId =
          matchedSessionId.includes(normalizedSearch) ||
          matchedRawSessionId.includes(normalizedSearch);

        const matchesUsername = normalizeUniqueId(message.username).includes(normalizedSearchAccount);
        const matchesNickname = message.nickname.toLowerCase().includes(normalizedSearch);
        const matchesAccount = sessionAccount.includes(normalizedSearchAccount);

        return matchesId || matchesSessionId || matchesUsername || matchesNickname || matchesAccount;
      })
    : [];

  const realtimeMessages = hasMonitoredAccounts && isRealtimeMode
    ? allMessages.filter((message) => {
        const matchesSelectedAgent =
          selectedAgentAccount === ALL_AGENTS_VALUE ||
          filteredActiveSessionsByAgent.some((session) => matchesMessageToSession(message, session));
        if (!matchesSelectedAgent) {
          return false;
        }

        const directSessionToken = message.sessionId.toLowerCase();
        if (activeSessionTokens.has(directSessionToken)) {
          return true;
        }

        return filteredActiveSessionsByAgent.some((session) => matchesMessageToSession(message, session));
      })
    : [];

  const visibleMessages = hasSearchQuery ? filteredBySearch : realtimeMessages;

  const filteredByLead = onlyLeads
    ? visibleMessages.filter((message) => message.score > 0)
    : visibleMessages;

  const orderedMessages = sortByScore
    ? [...filteredByLead].sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return b.timestamp.getTime() - a.timestamp.getTime();
      })
    : filteredByLead;

  const headerText = hasSearchQuery
    ? selectedAgentAccount === ALL_AGENTS_VALUE
      ? `Resultados para "${trimmedSearch}"`
      : `Resultados para "${trimmedSearch}" en ${selectedAgentLabel}.`
    : !hasMonitoredAccounts
    ? 'Sin cuentas monitoreadas: inicia el monitoreo para ver mensajes.'
    : isRealtimeMode
    ? selectedAgentAccount === ALL_AGENTS_VALUE
      ? 'Mensajes en tiempo real de transmisiones activas.'
      : `Mensajes en tiempo real de ${selectedAgentLabel}.`
    : selectedAgentAccount === ALL_AGENTS_VALUE
    ? 'Sin mensajes: busca por @usuario o ID para consultar historial.'
    : `Sin transmisión activa para ${selectedAgentLabel}: busca por @usuario o ID para consultar su historial.`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mensajes</h1>
          <p className="text-sm text-gray-500 mt-1">{headerText}</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  value={messageSearch}
                  onChange={(event) => setMessageSearch(event.target.value)}
                  placeholder={
                    hasMonitoredAccounts
                      ? 'Buscar mensajes por @usuario o ID de session'
                      : 'No hay cuentas monitoreadas'
                  }
                  className="pl-10 bg-gray-50"
                  disabled={!hasMonitoredAccounts}
                />
              </div>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setMessageSearch((current) => current.trim())}
                disabled={!hasMonitoredAccounts}
              >
                Buscar
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 whitespace-nowrap">Agente</span>
                <Select
                  value={selectedAgentAccount}
                  onValueChange={setSelectedAgentAccount}
                >
                  <SelectTrigger
                    className="w-full bg-white sm:w-[260px]"
                    disabled={!hasMonitoredAccounts || availableAgentOptions.length === 0}
                  >
                    <SelectValue placeholder="Seleccionar agente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_AGENTS_VALUE}>Todas las cuentas</SelectItem>
                    {availableAgentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMonitoredAccounts || (!hasSearchQuery && !isRealtimeMode)}
                className={`gap-2 ${sortByScore ? 'border-blue-300 bg-blue-50 text-blue-700' : ''}`}
                onClick={() => setSortByScore((current) => !current)}
              >
                <Filter className="w-4 h-4" />
                {sortByScore ? 'Puntaje: mayor a menor' : 'Filtrar por puntaje'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {hasMonitoredAccounts ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">Filtro</span>
              <Button
                type="button"
                size="sm"
                variant={onlyLeads ? 'default' : 'outline'}
                className={onlyLeads ? 'bg-blue-600 hover:bg-blue-700' : ''}
                onClick={() => updateOnlyLeadsFilter(true)}
              >
                Mostrar solo leads
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!onlyLeads ? 'default' : 'outline'}
                className={!onlyLeads ? 'bg-blue-600 hover:bg-blue-700' : ''}
                onClick={() => updateOnlyLeadsFilter(false)}
              >
                Mostrar todos
              </Button>
            </div>
          ) : null}

          {!hasMonitoredAccounts ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
              No hay cuentas monitoreadas para este cliente. Ve a{' '}
              <span className="font-medium">Cuentas</span> y comienza un monitoreo para habilitar mensajes.
            </div>
          ) : !hasSearchQuery && !isRealtimeMode ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
              No hay transmisión activa para este cliente. Ingresa un{' '}
              <span className="font-medium">@usuario</span> o un <span className="font-medium">ID</span>{' '}
              para buscar mensajes.
            </div>
          ) : (
            <div className="space-y-3">
              {orderedMessages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
                  {isRealtimeMode
                    ? selectedAgentAccount === ALL_AGENTS_VALUE
                      ? 'Esperando mensajes en tiempo real para la transmisión activa.'
                      : `Esperando mensajes en tiempo real para ${selectedAgentLabel}.`
                    : selectedAgentAccount === ALL_AGENTS_VALUE
                    ? `No se encontraron mensajes para "${trimmedSearch}".`
                    : `No se encontraron mensajes para "${trimmedSearch}" en ${selectedAgentLabel}.`}
                </div>
              ) : null}
              {orderedMessages.map((message) => {
                const matchedSession = resolveMessageSession(message);
                const sessionAccount = matchedSession?.accountName ?? '@sin_cuenta';
                const sessionId = message.sessionId || matchedSession?.rawSessionId || matchedSession?.id;
                const isHighScore = message.score >= 3;
                const bgColor = isHighScore ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200';

                const scoreColor =
                  message.score >= 4
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : message.score >= 2
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200';

                return (
                  <div
                    key={message.id}
                    className={`p-4 rounded-lg border ${bgColor} transition-all hover:shadow-sm`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-16 pt-1">
                        <p className="text-xs text-gray-500">
                          {new Date(message.timestamp).toLocaleTimeString('es-CL', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-4 min-w-0">
                          <div className="min-w-0 w-40 flex-shrink">
                            <p className="text-sm font-medium text-gray-900 truncate" title={message.username}>
                              {message.username}
                            </p>
                            <p className="text-xs text-gray-500 truncate" title={message.nickname}>
                              {message.nickname}
                            </p>
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 break-words">{message.message}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-slate-50 text-slate-700 border-slate-300"
                              >
                                Cuenta: {sessionAccount}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                              >
                                Session ID: <span className="ml-1 font-mono">{sessionId || 'sin_id'}</span>
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        <Badge variant="outline" className={`${scoreColor} font-semibold`}>
                          Puntaje: {message.score}
                        </Badge>
                      </div>

                      <div className="flex-shrink-0 min-w-0 max-w-xs">
                        {message.categories.length > 0 ? (
                          <div className="flex gap-1 flex-wrap justify-end">
                            {message.categories.map((category) => (
                              <Badge
                                key={category}
                                variant="secondary"
                                className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                              >
                                {category}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 text-right">Sin categorías</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <p>Mostrando {orderedMessages.length} mensajes</p>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-50 border border-green-200 rounded" />
                  <span>Alta prioridad (≥4)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-50 border border-amber-200 rounded" />
                  <span>Interés medio (2-3)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-50 border border-gray-200 rounded" />
                  <span>Ruido o bajo interés (0-1)</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
