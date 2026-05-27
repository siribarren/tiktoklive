import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Search, Filter } from 'lucide-react';

import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useRecorderBridge } from '../data/useRecorderBridge';
import type { LiveSession, Message } from '../data/mockData';

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
  const [searchParams] = useSearchParams();
  const { allMessages, liveSessions, runningTargets } = useRecorderBridge();
  const requestedSessionId = (searchParams.get('sessionId') ?? '').trim();
  const [messageSearch, setMessageSearch] = useState(requestedSessionId);
  const [sortByScore, setSortByScore] = useState(false);
  const onlyLeads = searchParams.get('onlyLeads') === '1';
  const hasMonitoredAccounts = runningTargets.length > 0;

  useEffect(() => {
    if (!requestedSessionId) {
      return;
    }
    setMessageSearch(requestedSessionId);
  }, [requestedSessionId]);

  const sessionByToken = useMemo(() => {
    const entries = new Map<string, LiveSession>();
    for (const session of liveSessions) {
      entries.set(session.id.toLowerCase(), session);
      const rawSessionId = (session.rawSessionId ?? '').toLowerCase();
      if (rawSessionId) {
        entries.set(rawSessionId, session);
      }
    }
    return entries;
  }, [liveSessions]);

  const resolveMessageSession = (message: Message) => {
    const token = message.sessionId.toLowerCase();
    const directMatch = sessionByToken.get(token);
    if (directMatch) {
      return directMatch;
    }

    return liveSessions.find((session) => matchesMessageToSession(message, session));
  };

  const trimmedSearch = messageSearch.trim();
  const normalizedSearch = trimmedSearch.toLowerCase();
  const normalizedSearchAccount = normalizeUniqueId(trimmedSearch);
  const hasSearchQuery = normalizedSearch.length > 0;
  const activeSessions = useMemo(
    () => liveSessions.filter((session) => session.status === 'Active'),
    [liveSessions]
  );
  const activeSessionTokens = useMemo(() => {
    const tokens = new Set<string>();
    activeSessions.forEach((session) => {
      tokens.add(session.id.toLowerCase());
      const rawSessionId = (session.rawSessionId ?? '').toLowerCase();
      if (rawSessionId) {
        tokens.add(rawSessionId);
      }
    });
    return tokens;
  }, [activeSessions]);
  const isRealtimeMode = hasMonitoredAccounts && !hasSearchQuery && activeSessions.length > 0;

  const filteredBySearch = hasMonitoredAccounts && hasSearchQuery
    ? allMessages.filter((message) => {
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
        const directSessionToken = message.sessionId.toLowerCase();
        if (activeSessionTokens.has(directSessionToken)) {
          return true;
        }

        return activeSessions.some((session) => matchesMessageToSession(message, session));
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
    ? `Resultados para "${trimmedSearch}"`
    : !hasMonitoredAccounts
    ? 'Sin cuentas monitoreadas: inicia el monitoreo para ver mensajes.'
    : isRealtimeMode
    ? 'Mensajes en tiempo real de transmisiones activas.'
    : 'Sin mensajes: busca por @usuario o ID para consultar historial.';

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
          <div className="flex items-center gap-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {onlyLeads ? (
            <div className="mb-4">
              <Badge className="bg-blue-600">Mostrando solo leads</Badge>
            </div>
          ) : null}

          {!hasMonitoredAccounts ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
              No hay cuentas monitoreadas. Ve a <span className="font-medium">Cuentas</span> y comienza un monitoreo para habilitar mensajes.
            </div>
          ) : !hasSearchQuery && !isRealtimeMode ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
              No hay transmisión activa. Ingresa un <span className="font-medium">@usuario</span> o un <span className="font-medium">ID</span> para buscar mensajes.
            </div>
          ) : (
            <div className="space-y-3">
              {orderedMessages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
                  {isRealtimeMode
                    ? 'Esperando mensajes en tiempo real para la transmisión activa.'
                    : `No se encontraron mensajes para "${trimmedSearch}".`}
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
