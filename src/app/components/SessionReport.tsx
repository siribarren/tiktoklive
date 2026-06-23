import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Clock3, Eye, MessageSquare, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useRecorderBridge } from '../data/useRecorderBridge';

function normalizeUniqueId(value?: string) {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

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

export function SessionReport() {
  const { id } = useParams();
  const { liveSessions, accountLabel, messages, leads, accounts } = useRecorderBridge();
  const session = liveSessions.find((item) => item.id === id);

  if (!session) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Sesión no encontrada</h1>
        <Link to="/finished-sessions">
          <Button variant="outline">Volver a sesiones finalizadas</Button>
        </Link>
      </div>
    );
  }

  const isCurrentAccount = session.accountName === accountLabel;
  const isEndedSession = session.status === 'Ended' || Boolean(session.endTime);
  const sessionReferenceId = session.rawSessionId ?? session.id;
  const messagesBySessionHref = `/messages?sessionId=${encodeURIComponent(
    sessionReferenceId
  )}&account=${encodeURIComponent(session.accountName)}`;
  const sessionAccount = accounts.find(
    (account) => normalizeUniqueId(account.uniqueId) === normalizeUniqueId(session.accountName)
  );
  const agentLabel = sessionAccount?.displayName?.trim() || 'Sin agente';
  const clientLabel = sessionAccount?.clientName?.trim() || 'Sin cliente';
  const sessionTimeStart = session.startTime.getTime();
  const sessionTimeEnd = session.endTime?.getTime() ?? Number.POSITIVE_INFINITY;
  const sessionMessages = isCurrentAccount
    ? messages.filter((message) => {
        const messageTime = message.timestamp.getTime();
        const inSessionWindow = messageTime >= sessionTimeStart && messageTime <= sessionTimeEnd;
        return message.sessionId === sessionReferenceId || inSessionWindow;
      })
    : [];
  const sessionLeads = isCurrentAccount
    ? leads.filter((lead) =>
        lead.messages.some((message) => {
          const messageTime = message.timestamp.getTime();
          const inSessionWindow = messageTime >= sessionTimeStart && messageTime <= sessionTimeEnd;
          return message.sessionId === sessionReferenceId || inSessionWindow;
        })
      )
    : [];
  const durationMinutes = session.endTime
    ? Math.max(
        1,
        Math.floor((session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60))
      )
    : Math.max(
        1,
        Math.floor((Date.now() - session.startTime.getTime()) / (1000 * 60))
      );
  const durationLabel = formatSessionDuration(durationMinutes);
  const endTimeLabel = session.endTime
    ? session.endTime.toLocaleString('es-CL')
    : isEndedSession
      ? 'Finalizada'
      : 'Sigue activa';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/finished-sessions">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Button>
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">Reporte de sesión</h1>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
              <span className="font-medium text-gray-900">{session.accountName}</span>
              <span aria-hidden="true">·</span>
              <span>
                Agente: <span className="font-medium text-gray-900">{agentLabel}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Cliente: <span className="font-medium text-gray-900">{clientLabel}</span>
              </span>
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className={isEndedSession ? 'bg-gray-50 text-gray-700 border-gray-200' : 'bg-green-50 text-green-700 border-green-200'}
        >
          {isEndedSession ? 'Finalizada' : 'Activa'}
        </Badge>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Duración</p>
                <p className="text-2xl font-semibold text-gray-900 mt-2">{durationLabel}</p>
              </div>
              <Clock3 className="w-6 h-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Mensajes</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">{session.messagesCount}</p>
              </div>
              <Link
                to={messagesBySessionHref}
                className="rounded-md p-1 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                aria-label={`Ver mensajes de la sesión ${sessionReferenceId}`}
                title="Ver mensajes de esta sesión"
              >
                <MessageSquare className="w-6 h-6" />
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Leads</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">{session.leadsDetected}</p>
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
                <p className="text-3xl font-semibold text-gray-900 mt-2">{session.viewers}</p>
              </div>
              <Eye className="w-6 h-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
        <CardHeader>
          <CardTitle>Detalle temporal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-600">
          <div className="flex items-center justify-between">
            <span>Inicio</span>
            <span className="font-medium text-gray-900">
              {session.startTime.toLocaleString('es-CL')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>FIN</span>
            <span className="font-medium text-gray-900">
              {endTimeLabel}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Tiempo de transmision</span>
            <span className="font-medium text-gray-900">{durationLabel}</span>
          </div>
        </CardContent>
      </Card>

        <Card>
          <CardHeader>
            <CardTitle>Disponibilidad de detalle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            <p>
              {isCurrentAccount
                ? 'Esta sesión corresponde a la cuenta actualmente analizada en tiempo real.'
                : 'Esta sesión viene desde métricas archivadas. Se conserva el resumen, aunque no todo el detalle mensaje a mensaje.'}
            </p>
            <p>
              Mensajes detallados disponibles: <span className="font-medium text-gray-900">{sessionMessages.length}</span>
            </p>
            <p>
              Leads detallados disponibles: <span className="font-medium text-gray-900">{sessionLeads.length}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Análisis general de la sesión</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-gray-700">
          <p>
            La sesión tuvo baja audiencia en general, poca interacción comercial y se generaron
            pocos leads. El tiempo promedio de permanencia por usuario fue menor a 3 segundos y
            los usuarios que interactuaron enviaron principalmente mensajes aleatorios sin foco
            comercial.
          </p>
          <div>
            <p className="font-medium text-gray-900 mb-2">Recomendaciones:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Revisar horario de transmisión.</li>
              <li>Revisar performance de la ejecutiva/o.</li>
              <li>Generar acciones previas (contenidos) invitando al Live.</li>
              <li>Generar CTA u ofertas tipo hook.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
