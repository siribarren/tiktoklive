import { Link, useParams } from 'react-router';
import { ArrowLeft, Clock3, Eye, MessageSquare, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { useRecorderBridge } from '../data/useRecorderBridge';

export function SessionReport() {
  const { id } = useParams();
  const { liveSessions, accountLabel, messages, leads } = useRecorderBridge();
  const session = liveSessions.find((item) => item.id === id);

  if (!session) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Sesion no encontrada</h1>
        <Link to="/live-sessions">
          <Button variant="outline">Volver a sesiones</Button>
        </Link>
      </div>
    );
  }

  const isCurrentAccount = session.accountName === accountLabel;
  const sessionMessages = isCurrentAccount
    ? messages.filter((message) => message.sessionId === session.id)
    : [];
  const sessionLeads = isCurrentAccount ? leads : [];
  const durationMinutes = session.endTime
    ? Math.max(
        1,
        Math.floor((session.endTime.getTime() - session.startTime.getTime()) / (1000 * 60))
      )
    : Math.max(
        1,
        Math.floor((Date.now() - session.startTime.getTime()) / (1000 * 60))
      );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/live-sessions">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Reporte de sesion
            </h1>
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
                <p className="text-sm text-gray-500">Duracion</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">{durationMinutes}</p>
                <p className="text-xs text-gray-500 mt-2">minutos</p>
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
              <MessageSquare className="w-6 h-6 text-blue-600" />
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
                <p className="text-sm text-gray-500">Usuarios unicos</p>
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
                ? 'Esta sesion corresponde a la cuenta actualmente analizada en tiempo real.'
                : 'Esta sesion viene desde metricas archivadas. Se conserva el resumen, aunque no todo el detalle mensaje a mensaje.'}
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
    </div>
  );
}
