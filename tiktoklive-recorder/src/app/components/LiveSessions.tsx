import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Radio, Eye, MessageSquare, Users, Clock } from 'lucide-react';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { Link } from 'react-router';

export function LiveSessions() {
  const { liveSessions: sessions, accountLabel, isLive, updatedAt } = useRecorderBridge();
  const endedSessions = sessions.filter((s) => s.status === 'Ended');
  const endedReport = {
    totalSessions: endedSessions.length,
    totalMessages: endedSessions.reduce((sum, session) => sum + session.messagesCount, 0),
    totalLeads: endedSessions.reduce((sum, session) => sum + session.leadsDetected, 0),
    totalViewers: endedSessions.reduce((sum, session) => sum + session.viewers, 0),
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sesiones en vivo</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitoreo de sesiones de TikTok para {accountLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
          <span className="text-sm text-gray-600">
            {isLive ? 'Live activo' : `Ultima actualizacion${updatedAt ? ` · ${updatedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
          </span>
        </div>
      </div>

      {/* Active Sessions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Cuentas monitoreadas
        </h2>
        <div className="grid grid-cols-2 gap-6">
          {sessions
            .filter((s) => s.status === 'Active')
            .map((session) => (
              <Card
                key={session.id}
                className="border-2 border-green-200 bg-green-50/30"
              >
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                          <Radio className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-gray-900">
                            {session.accountName}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <Badge className="bg-green-600">LIVE</Badge>
                          </div>
                        </div>
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

                      <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                        <div className="flex items-center justify-center gap-2 text-gray-500 mb-1">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <p className="text-2xl font-semibold text-gray-900">
                          {session.messagesCount}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Mensajes</p>
                      </div>

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

                    <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        Inicio{' '}
                        {new Date(session.startTime).toLocaleTimeString('es-CL', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <Link to={`/live-sessions/${session.id}`}>
                        <Button size="sm" variant="outline">
                          Ver detalle
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      {/* Past Sessions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Sesiones finalizadas
        </h2>
        <div className="grid grid-cols-4 gap-4 mb-6">
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
              <p className="text-sm text-gray-500">Usuarios unicos</p>
              <p className="text-3xl font-semibold text-gray-900 mt-2">
                {endedReport.totalViewers}
              </p>
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
                      Cuenta
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duracion
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mensajes
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Leads Detected
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usuarios unicos
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sessions
                    .filter((s) => s.status === 'Ended')
                    .map((session) => {
                      const duration = session.endTime
                        ? Math.floor(
                            (session.endTime.getTime() -
                              session.startTime.getTime()) /
                              (1000 * 60)
                          )
                        : 0;

                      return (
                        <tr
                          key={session.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-4 px-4">
                            <p className="text-sm font-medium text-gray-900">
                              {session.accountName}
                            </p>
                          </td>
                          <td className="py-4 px-4">
                            <Badge variant="outline" className="bg-gray-50 text-gray-700">
                              Finalizada
                            </Badge>
                          </td>
                          <td className="py-4 px-4">
                            <p className="text-sm text-gray-600">
                              {duration} minutos
                            </p>
                          </td>
                          <td className="py-4 px-4">
                            <p className="text-sm text-gray-900">
                              {session.messagesCount}
                            </p>
                          </td>
                          <td className="py-4 px-4">
                            <Badge
                              variant="outline"
                              className="bg-green-50 text-green-700 border-green-200"
                            >
                              {session.leadsDetected}
                            </Badge>
                          </td>
                          <td className="py-4 px-4">
                            <p className="text-sm text-gray-900">
                              {session.viewers.toLocaleString()}
                            </p>
                          </td>
                          <td className="py-4 px-4">
                            <Link to={`/live-sessions/${session.id}`}>
                              <Button variant="ghost" size="sm">
                                Ver reporte
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
