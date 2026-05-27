import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Radio,
  MessageSquare,
  Sparkles,
  TrendingUp,
  ArrowRight,
  Play,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Link } from 'react-router';
import { type FormEvent, useState } from 'react';
import { useRecorderBridge } from '../data/useRecorderBridge';

export function Dashboard() {
  const { messages, leads, liveSessions, accountLabel, isLive, updatedAt } = useRecorderBridge();
  const [newTarget, setNewTarget] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const recentLeads = leads.slice(0, 5);
  const activeSessions = liveSessions.filter((session) => session.status === 'Active').length;
  const qualifiedLeads = leads.filter((lead) => lead.totalScore >= 7).length;

  const messagesByMinute = new Map<string, number>();
  for (const message of messages) {
    const bucket = message.timestamp.toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    messagesByMinute.set(bucket, (messagesByMinute.get(bucket) ?? 0) + 1);
  }
  const messagesData = Array.from(messagesByMinute.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([time, total], idx) => ({
      id: `msg-${idx}`,
      time,
      messages: total,
    }));

  const categoryTotals = new Map<string, number>();
  for (const lead of leads) {
    for (const category of lead.categories) {
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + 1);
    }
  }
  const categoriesData = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, count], idx) => ({
      id: `cat-${idx}`,
      category,
      count,
    }));

  const handleStartMonitoring = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = newTarget.trim();
    if (!trimmed) {
      setSubmissionMessage('Ingresa un usuario de TikTok para comenzar a monitorearlo.');
      return;
    }

    setIsSubmitting(true);
    setSubmissionMessage(null);

    try {
      const response = await fetch('http://127.0.0.1:8765/targets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ unique_id: trimmed }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        started?: boolean;
        unique_id?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'No se pudo iniciar el monitoreo.');
      }

      setSubmissionMessage(
        payload.started
          ? `Se inicio el monitoreo para ${payload.unique_id}.`
          : `${payload.unique_id} ya estaba siendo monitoreado.`
      );
      setNewTarget('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo conectar con el recorder local.';
      setSubmissionMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Resumen operativo de {accountLabel}
          {updatedAt
            ? ` · actualizado ${updatedAt.toLocaleTimeString('es-CL', {
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : ''}
        </p>
      </div>

      <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-700">Cuenta destacada</p>
              <div className="flex items-center gap-3 mt-2">
                <h2 className="text-2xl font-semibold text-gray-900">{accountLabel}</h2>
                <Badge
                  variant="outline"
                  className={
                    isLive
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-gray-50 text-gray-700 border-gray-200'
                  }
                >
                  {isLive ? 'Analizando en vivo' : 'Analizando metricas archivadas'}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Este dashboard muestra el detalle de la cuenta actualmente priorizada en el bridge.
              </p>
            </div>
            <Link to="/live-sessions">
              <Button variant="outline">Ver sesiones</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-white">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-amber-700">Iniciar monitoreo en vivo</p>
              <h2 className="text-2xl font-semibold text-gray-900 mt-2">
                Agregar usuario de TikTok
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                Ingresa un `@usuario` y el recorder local comenzara a grabar, puntuar y analizar esa cuenta.
              </p>
            </div>
            <form className="flex items-center gap-3" onSubmit={handleStartMonitoring}>
              <Input
                value={newTarget}
                onChange={(event) => setNewTarget(event.target.value)}
                placeholder="@usuario.tiktok"
                className="max-w-sm bg-white"
              />
              <Button className="gap-2 bg-amber-600 hover:bg-amber-700" disabled={isSubmitting}>
                <Play className="w-4 h-4" />
                {isSubmitting ? 'Iniciando...' : 'Empezar a grabar'}
              </Button>
            </form>
            {submissionMessage ? (
              <p className="text-sm text-gray-700">{submissionMessage}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Sesiones activas</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">
                  {activeSessions}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <div
                    className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`}
                  />
                  <span className={`text-xs ${isLive ? 'text-green-600' : 'text-slate-500'}`}>
                    {isLive ? `${accountLabel} en vivo` : 'Sin live activo'}
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <Radio className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Mensajes capturados</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">
                  {messages.length.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  En la sesion actual publicada por el listener
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Leads detectados</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">
                  {leads.length}
                </p>
                <div className="flex items-center gap-1 mt-2 text-green-600">
                  <TrendingUp className="w-3 h-3" />
                  <span className="text-xs">Mensajes con score acumulado positivo</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Leads calificados</p>
                <p className="text-3xl font-semibold text-gray-900 mt-2">
                  {qualifiedLeads}
                </p>
                <p className="text-xs text-gray-500 mt-2">Score acumulado ≥ 7</p>
              </div>
              <div className="w-12 h-12 bg-violet-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Mensajes por minuto</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={messagesData}>
                <XAxis
                  dataKey="time"
                  stroke="#9ca3af"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="messages"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categorias de lead</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoriesData}>
                <XAxis
                  dataKey="category"
                  stroke="#9ca3af"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Leads recientes</CardTitle>
          <Link to="/leads">
            <Button variant="ghost" size="sm" className="gap-2">
              Ver todos
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Score
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categorias
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ultimo mensaje
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ultima actividad
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => {
                  const scoreColor =
                    lead.totalScore >= 7
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : lead.totalScore >= 5
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-gray-50 text-gray-700 border-gray-200';

                  return (
                    <tr
                      key={lead.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <Badge
                          variant="outline"
                          className={
                            lead.status === 'New'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : lead.status === 'Qualified'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : lead.status === 'Contacted'
                              ? 'bg-violet-50 text-violet-700 border-violet-200'
                              : 'bg-gray-50 text-gray-700 border-gray-200'
                          }
                        >
                          {lead.status === 'New'
                            ? 'Nuevo'
                            : lead.status === 'Qualified'
                            ? 'Calificado'
                            : lead.status === 'Contacted'
                            ? 'Contactado'
                            : 'Revisado'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {lead.username}
                          </p>
                          <p className="text-xs text-gray-500">{lead.nickname}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className={scoreColor}>
                          {lead.totalScore}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1 flex-wrap">
                          {lead.categories.slice(0, 3).map((cat) => (
                            <Badge
                              key={cat}
                              variant="secondary"
                              className="text-xs bg-gray-100 text-gray-700"
                            >
                              {cat}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-600 truncate max-w-xs">
                          {lead.lastMessage}
                        </p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-sm text-gray-500">
                          {new Date(lead.lastActivity).toLocaleTimeString('es-CL', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
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
  );
}
