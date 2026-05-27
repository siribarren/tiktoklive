import { Link, useParams } from 'react-router';
import { ArrowLeft, Clock3, Eye, MessageSquare, Sparkles, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { useState } from 'react';

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
  const { liveSessions, accountLabel, messages, leads } = useRecorderBridge();
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
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
  const sessionReferenceId = session.rawSessionId ?? session.id;
  const messagesBySessionHref = `/messages?sessionId=${encodeURIComponent(
    sessionReferenceId
  )}&account=${encodeURIComponent(session.accountName)}`;
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
  const copySessionId = async () => {
    try {
      await navigator.clipboard.writeText(session.id);
      setCopiedSessionId(session.id);
      window.setTimeout(() => {
        setCopiedSessionId((current) => (current === session.id ? null : current));
      }, 1500);
    } catch {
      // Intentionally silent: report remains usable without clipboard support.
    }
  };

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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">Reporte de sesión</h1>
              <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
                ID: <span className="ml-1 font-mono">{session.id}</span>
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-gray-500 hover:text-gray-700"
                onClick={() => {
                  void copySessionId();
                }}
              >
                {copiedSessionId === session.id ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copiar
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm text-gray-500 mt-1">{session.accountName}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            session.status === 'Active'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-50 text-gray-700 border-gray-200'
          }
        >
          {session.status === 'Active' ? 'Activa' : 'Finalizada'}
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
              <span>Fin</span>
              <span className="font-medium text-gray-900">
                {session.endTime ? session.endTime.toLocaleString('es-CL') : 'Sigue activa'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cuenta analizada</span>
              <span className="font-medium text-gray-900">{session.accountName}</span>
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
