import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Copy, Check, Trash2 } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { readJsonResponse, resolveApiErrorMessage } from '../../lib/http';
import { authFetch, useAuth } from '../auth/auth';

type EndedSessionRange = 'day' | 'week' | 'month' | 'quarter' | 'to_date';

const formatSessionDuration = (totalMinutes: number) => {
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    return remainingMinutes > 0
      ? `${hours} hora${hours === 1 ? '' : 's'} ${remainingMinutes} min`
      : `${hours} hora${hours === 1 ? '' : 's'}`;
  }
  return `${totalMinutes} minutos`;
};

export function FinishedSessions() {
  const { user } = useAuth();
  const { liveSessions: sessions } = useRecorderBridge();
  const [endedSessionRange, setEndedSessionRange] = useState<EndedSessionRange>('to_date');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deletedSessionKeys, setDeletedSessionKeys] = useState<Set<string>>(new Set());
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const canManageSessions = user?.role === 'administrator';

  const buildSessionKey = (session: (typeof sessions)[number]) =>
    session.rawSessionId?.trim()
      ? `raw:${session.rawSessionId.trim()}`
      : `fallback:${session.accountName}|${session.startTime.toISOString()}`;

  const endedSessions = sessions.filter(
    (session) => session.status === 'Ended' && !deletedSessionKeys.has(buildSessionKey(session))
  );
  const availableAccounts = useMemo(
    () => Array.from(new Set(endedSessions.map((session) => session.accountName))).sort((a, b) => a.localeCompare(b)),
    [endedSessions]
  );

  const filteredEndedSessions = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    return endedSessions.filter((session) => {
      const matchesAccount = selectedAccount === 'all' || session.accountName === selectedAccount;
      if (!matchesAccount) {
        return false;
      }
      const referenceDate = session.endTime ?? session.startTime;
      if (endedSessionRange === 'day') {
        return referenceDate >= dayStart && referenceDate <= now;
      }
      if (endedSessionRange === 'to_date') {
        return referenceDate.getTime() <= now.getTime();
      }
      if (endedSessionRange === 'week') {
        return referenceDate >= weekStart && referenceDate <= now;
      }
      if (endedSessionRange === 'month') {
        return referenceDate >= monthStart && referenceDate <= now;
      }
      return referenceDate >= quarterStart && referenceDate <= now;
    });
  }, [endedSessionRange, endedSessions, selectedAccount]);

  const endedReport = {
    totalSessions: filteredEndedSessions.length,
    totalMessages: filteredEndedSessions.reduce((sum, session) => sum + session.messagesCount, 0),
    totalLeads: filteredEndedSessions.reduce((sum, session) => sum + session.leadsDetected, 0),
    totalViewers: filteredEndedSessions.reduce((sum, session) => sum + session.viewers, 0),
  };

  const copySessionId = async (sessionId: string) => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopiedSessionId(sessionId);
      window.setTimeout(() => {
        setCopiedSessionId((current) => (current === sessionId ? null : current));
      }, 1500);
    } catch {
      // Intentionally silent for now; the UI remains usable even if clipboard fails.
    }
  };

  const deleteEndedSession = async (session: (typeof filteredEndedSessions)[number]) => {
    const shouldDelete = window.confirm(
      `¿Deseas borrar la sesión finalizada de ${session.accountName}?`
    );
    if (!shouldDelete) {
      return;
    }

    setDeletingSessionId(session.id);
    setActionMessage(null);
    const sessionKey = buildSessionKey(session);
    try {
      const response = await authFetch('/recorder-api/sessions', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          unique_id: session.accountName,
          session_id: session.rawSessionId ?? undefined,
          start_time: session.startTime.toISOString(),
        }),
      });

      const payload = await readJsonResponse<{
        ok?: boolean;
        deleted?: boolean;
        unique_id?: string;
        session_id?: string;
        error?: string;
      }>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(resolveApiErrorMessage(response, payload, 'No se pudo borrar la sesión finalizada.'));
      }

      setDeletedSessionKeys((previous) => new Set(previous).add(sessionKey));
      setActionMessage(`Sesión eliminada para ${session.accountName}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo conectar con el recorder local.';
      setActionMessage(message);
    } finally {
      setDeletingSessionId((current) => (current === session.id ? null : current));
    }
  };

  const renderSessionActions = (
    session: (typeof filteredEndedSessions)[number],
    compact = false
  ) => {
    const sessionMessagesTarget = session.rawSessionId ?? session.id;
    const actionButtonClassName = compact
      ? 'h-9 w-full justify-center whitespace-nowrap'
      : 'whitespace-nowrap';
    const deleteButtonClassName = compact
      ? 'h-9 w-full justify-center whitespace-nowrap border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800'
      : 'whitespace-nowrap border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800';

    return (
      <div className={compact ? 'grid gap-2 sm:grid-cols-3' : 'flex flex-wrap items-center gap-2'}>
        <Link to={`/live-sessions/${session.id}`} className={compact ? 'block' : undefined}>
          <Button
            variant={compact ? 'outline' : 'ghost'}
            size="sm"
            className={actionButtonClassName}
          >
            Ver detalle
          </Button>
        </Link>
        <Link
          to={`/messages?sessionId=${encodeURIComponent(sessionMessagesTarget)}&account=${encodeURIComponent(
            session.accountName
          )}`}
          className={compact ? 'block' : undefined}
        >
          <Button variant="outline" size="sm" className={actionButtonClassName}>
            Mensajes
          </Button>
        </Link>
        {canManageSessions ? (
          <Button
            variant="outline"
            size="sm"
            className={deleteButtonClassName}
            disabled={deletingSessionId !== null}
            onClick={() => {
              void deleteEndedSession(session);
            }}
          >
            <Trash2 className={`${compact ? 'h-4 w-4' : 'h-3.5 w-3.5'} mr-1`} />
            {deletingSessionId === session.id ? 'Borrando...' : 'Borrar'}
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-gray-900">Sesiones finalizadas</h1>
          <p className="max-w-2xl text-sm text-gray-500">
            Vista optimizada para revisar cierres, copiar IDs y entrar a mensajes rápidamente.
          </p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-4 xl:items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 whitespace-nowrap">Periodo</span>
            <Select
              value={endedSessionRange}
              onValueChange={(value) => setEndedSessionRange(value as EndedSessionRange)}
            >
              <SelectTrigger className="w-full bg-white sm:w-[180px]">
                <SelectValue placeholder="Seleccionar periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Día</SelectItem>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="month">Mes</SelectItem>
                <SelectItem value="quarter">Trimestre</SelectItem>
                <SelectItem value="to_date">Acumulado a hoy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 whitespace-nowrap">Cuenta</span>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-full bg-white sm:w-[220px]">
                <SelectValue placeholder="Seleccionar cuenta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {availableAccounts.map((accountName) => (
                  <SelectItem key={accountName} value={accountName}>
                    {accountName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {actionMessage ? <p className="text-sm text-gray-700">{actionMessage}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Sesiones cerradas</p>
            <p className="text-3xl font-semibold text-gray-900 mt-2">
              {endedReport.totalSessions}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Mensajes acumulados</p>
            <p className="text-3xl font-semibold text-gray-900 mt-2">
              {endedReport.totalMessages}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Leads detectados</p>
            <p className="text-3xl font-semibold text-gray-900 mt-2">
              {endedReport.totalLeads}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Usuarios únicos</p>
            <p className="text-3xl font-semibold text-gray-900 mt-2">
              {endedReport.totalViewers}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4 2xl:hidden">
            {filteredEndedSessions.length > 0 ? (
              filteredEndedSessions.map((session) => {
                const duration = session.endTime
                  ? Math.floor(
                      (session.endTime.getTime() - session.startTime.getTime()) /
                        (1000 * 60)
                    )
                  : 0;

                return (
                  <Card key={session.id} className="border-gray-200 shadow-sm">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900" title={session.accountName}>
                            {session.accountName}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
                              ID sesión
                            </span>
                            <span
                              className="block min-w-0 max-w-full truncate font-mono text-xs text-gray-600"
                              title={session.id}
                            >
                              {session.id}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                              onClick={() => {
                                void copySessionId(session.id);
                              }}
                            >
                              {copiedSessionId === session.id ? (
                                <>
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Copiado
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-1 h-3.5 w-3.5" />
                                  Copiar
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-gray-50 text-gray-700">
                          Finalizada
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
                            Duración
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {formatSessionDuration(duration)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
                            Mensajes
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {session.messagesCount}
                          </p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
                            Leads detectados
                          </p>
                          <Badge
                            variant="outline"
                            className="mt-1 bg-green-50 text-green-700 border-green-200"
                          >
                            {session.leadsDetected}
                          </Badge>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
                            Usuarios únicos
                          </p>
                          <p className="mt-1 text-sm font-semibold text-gray-900">
                            {session.viewers.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                          Acciones
                        </p>
                        {renderSessionActions(session, true)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">
                No hay sesiones finalizadas para el periodo seleccionado.
              </div>
            )}
          </div>

          <div className="hidden 2xl:block">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[17%]" />
                  <col className="w-[23%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[8%]" />
                  <col className="w-[11%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Cuenta
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      ID sesión
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Duracion
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Mensajes
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Leads detectados
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Usuarios únicos
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEndedSessions.map((session) => {
                    const duration = session.endTime
                      ? Math.floor(
                          (session.endTime.getTime() - session.startTime.getTime()) /
                            (1000 * 60)
                        )
                      : 0;

                    return (
                      <tr key={session.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-4 align-top">
                          <p className="truncate text-sm font-medium text-gray-900" title={session.accountName}>
                            {session.accountName}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-center gap-2">
                            <p className="min-w-0 truncate font-mono text-xs text-gray-600" title={session.id}>
                              {session.id}
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 whitespace-nowrap px-2 text-xs text-gray-500 hover:text-gray-700"
                              onClick={() => {
                                void copySessionId(session.id);
                              }}
                            >
                              {copiedSessionId === session.id ? (
                                <>
                                  <Check className="mr-1 h-3.5 w-3.5" />
                                  Copiado
                                </>
                              ) : (
                                <>
                                  <Copy className="mr-1 h-3.5 w-3.5" />
                                  Copiar
                                </>
                              )}
                            </Button>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Badge variant="outline" className="bg-gray-50 text-gray-700">
                            Finalizada
                          </Badge>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="text-sm text-gray-600">{formatSessionDuration(duration)}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="text-sm text-gray-900">{session.messagesCount}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Badge
                            variant="outline"
                            className="bg-green-50 text-green-700 border-green-200"
                          >
                            {session.leadsDetected}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="text-sm text-gray-900">{session.viewers.toLocaleString()}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          {renderSessionActions(session, false)}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredEndedSessions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 px-4 text-center text-sm text-gray-500">
                        No hay sesiones finalizadas para el periodo seleccionado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
