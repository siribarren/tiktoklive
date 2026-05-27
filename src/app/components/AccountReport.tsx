import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Clock3, Eye, MessageSquare, Sparkles } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { AiReviewPanels } from './AiReviewPanels';

const normalizeUniqueId = (value?: string) => {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
};

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

const formatDay = (value: Date) =>
  value.toLocaleDateString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const formatTime = (value?: Date) =>
  value
    ? value.toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '--:--';

export function AccountReport() {
  const { accountId } = useParams();
  const { liveSessions } = useRecorderBridge();
  const decodedAccountId = accountId ? decodeURIComponent(accountId) : '';
  const accountLabel = normalizeUniqueId(decodedAccountId);

  const accountSessions = useMemo(
    () =>
      liveSessions
        .filter((session) => normalizeUniqueId(session.accountName) === accountLabel)
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime()),
    [accountLabel, liveSessions]
  );

  const sessionTotals = {
    totalSessions: accountSessions.length,
    totalMessages: accountSessions.reduce((sum, session) => sum + session.messagesCount, 0),
    totalLeads: accountSessions.reduce((sum, session) => sum + session.leadsDetected, 0),
    totalUsers: accountSessions.reduce((sum, session) => sum + session.viewers, 0),
  };

  const aiSummaryText = useMemo(() => {
    if (accountSessions.length === 0) {
      return `La cuenta ${accountLabel || 'seleccionada'} no tiene sesiones registradas en el periodo visible, por lo que no se puede evaluar aún su performance de lives e interacciones.`;
    }

    const sessionDurations = accountSessions.map((session) => {
      const endTime = session.endTime?.getTime() ?? Date.now();
      const minutes = Math.max(1, Math.floor((endTime - session.startTime.getTime()) / (1000 * 60)));
      return minutes;
    });
    const totalDurationMinutes = sessionDurations.reduce((sum, value) => sum + value, 0);
    const averageDurationMinutes = Math.round(totalDurationMinutes / accountSessions.length);
    const averageMessagesPerSession = Math.round(sessionTotals.totalMessages / accountSessions.length);
    const averageLeadsPerSession = Number(
      (sessionTotals.totalLeads / accountSessions.length).toFixed(1)
    );
    const leadConversionRate =
      sessionTotals.totalMessages > 0
        ? ((sessionTotals.totalLeads / sessionTotals.totalMessages) * 100).toFixed(1)
        : '0.0';
    const topSession = accountSessions.reduce((currentTop, session) =>
      session.messagesCount > currentTop.messagesCount ? session : currentTop
    );

    return `La cuenta ${accountLabel} acumula ${sessionTotals.totalSessions} sesiones con ${sessionTotals.totalMessages} mensajes, ${sessionTotals.totalLeads} leads y ${sessionTotals.totalUsers} usuarios únicos. La duración promedio por live fue de ${averageDurationMinutes} minutos, con ${averageMessagesPerSession} mensajes por sesión y ${averageLeadsPerSession} leads por sesión. La tasa estimada de conversión de mensajes a leads es de ${leadConversionRate}%. La sesión con mayor actividad fue ${topSession.id}, concentrando el mayor volumen de interacciones.`;
  }, [accountLabel, accountSessions, sessionTotals.totalLeads, sessionTotals.totalMessages, sessionTotals.totalSessions, sessionTotals.totalUsers]);

  const aiRecommendations = useMemo(() => {
    if (accountSessions.length === 0) {
      return [
        'Programar nuevas sesiones para construir una línea base de performance.',
        'Definir objetivos mínimos de mensajes, leads y usuarios para el próximo live.',
        'Revisar guion de transmisión y llamados a la acción antes de retomar emisiones.',
      ];
    }

    const recommendations: string[] = [];
    const leadConversion =
      sessionTotals.totalMessages > 0
        ? sessionTotals.totalLeads / sessionTotals.totalMessages
        : 0;
    const averageMessagesPerSession = sessionTotals.totalMessages / accountSessions.length;

    if (leadConversion < 0.05) {
      recommendations.push('Mejorar CTAs comerciales para elevar la conversión de mensajes a leads.');
    } else {
      recommendations.push('Mantener la estructura comercial actual y reforzar respuestas rápidas a usuarios con intención.');
    }

    if (averageMessagesPerSession < 30) {
      recommendations.push('Incrementar acciones de atracción previa al live para subir el volumen de interacción.');
    } else {
      recommendations.push('Documentar los formatos de contenido que generan mayor interacción y replicarlos.');
    }

    recommendations.push('Realizar retroalimentación semanal del desempeño de esta cuenta con seguimiento de KPIs por sesión.');
    return recommendations;
  }, [accountSessions, sessionTotals.totalLeads, sessionTotals.totalMessages]);

  if (!accountLabel) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Cuenta no encontrada</h1>
        <Link to="/accounts">
          <Button variant="outline">Volver a cuentas</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/accounts">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reporte de cuenta</h1>
          <p className="text-sm text-gray-500 mt-1">
            Resumen de todas las sesiones registradas para {accountLabel}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Sesiones</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">
                  {sessionTotals.totalSessions}
                </p>
              </div>
              <Clock3 className="w-6 h-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total de mensajes</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">
                  {sessionTotals.totalMessages}
                </p>
              </div>
              <MessageSquare className="w-6 h-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Leads</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">
                  {sessionTotals.totalLeads}
                </p>
              </div>
              <Sparkles className="w-6 h-6 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Usuarios únicos</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">
                  {sessionTotals.totalUsers}
                </p>
              </div>
              <Eye className="w-6 h-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Día
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Inicio
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fin
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duración
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total de mensajes
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Leads
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuarios únicos
                  </th>
                </tr>
              </thead>
              <tbody>
                {accountSessions.map((session) => {
                  const durationMinutes = session.endTime
                    ? Math.max(
                        1,
                        Math.floor(
                          (session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60)
                        )
                      )
                    : Math.max(
                        1,
                        Math.floor((Date.now() - session.startTime.getTime()) / (1000 * 60))
                      );

                  return (
                    <tr key={session.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4 text-sm text-gray-700">
                        {formatDay(session.startTime)}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700">
                        {formatTime(session.startTime)}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700">
                        {formatTime(session.endTime)}
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-xs font-mono text-gray-700 break-all">{session.id}</p>
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700">
                        {formatSessionDuration(durationMinutes)}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-900">{session.messagesCount}</td>
                      <td className="py-4 px-4 text-sm text-gray-900">{session.leadsDetected}</td>
                      <td className="py-4 px-4 text-sm text-gray-900">
                        {session.viewers.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {accountSessions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 px-4 text-center text-sm text-gray-500">
                      No hay sesiones registradas para esta cuenta.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <AiReviewPanels
        summaryText={aiSummaryText}
        recommendations={aiRecommendations}
        notesStorageKey={`ember:account-report:${accountLabel}:reviewer-notes`}
      />
    </div>
  );
}
