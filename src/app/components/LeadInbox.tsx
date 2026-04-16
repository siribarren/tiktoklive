import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Search, Filter, Download, ArrowRight } from 'lucide-react';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { Link } from 'react-router';

export function LeadInbox() {
  const { leads, accountLabel } = useRecorderBridge();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            Leads detectados automaticamente desde los mensajes de {accountLabel}
          </p>
        </div>
        <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
          <Download className="w-4 h-4" />
          Exportar leads
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Buscar leads..."
                className="pl-10 bg-gray-50"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Estado
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Rango de score
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Categorias
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Leads Table */}
      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuario TikTok
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nickname
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Puntaje total
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Categories
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ultimo mensaje
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ultima actividad
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Asignado a
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const scoreColor =
                    lead.totalScore >= 7
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : lead.totalScore >= 5
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-gray-50 text-gray-700 border-gray-200';

                  const statusColor =
                    lead.status === 'New'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : lead.status === 'Qualified'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : lead.status === 'Contacted'
                      ? 'bg-violet-50 text-violet-700 border-violet-200'
                      : 'bg-gray-50 text-gray-700 border-gray-200';

                  const rowBg =
                    lead.totalScore >= 7
                      ? 'bg-green-50/30'
                      : lead.totalScore >= 5
                      ? 'bg-amber-50/30'
                      : '';

                  return (
                    <tr
                      key={lead.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${rowBg}`}
                    >
                      <td className="py-4 px-4">
                          <Badge variant="outline" className={statusColor}>
                          {lead.status === 'New'
                            ? 'Nuevo'
                            : lead.status === 'Qualified'
                            ? 'Calificado'
                            : lead.status === 'Contacted'
                            ? 'Contactado'
                            : 'Revisado'}
                        </Badge>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-sm font-medium text-gray-900">
                          {lead.username}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-sm text-gray-600">{lead.nickname}</p>
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant="outline" className={`${scoreColor} font-semibold`}>
                          {lead.totalScore}
                        </Badge>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex gap-1 flex-wrap max-w-xs">
                          {lead.categories.slice(0, 3).map((cat) => (
                            <Badge
                              key={cat}
                              variant="secondary"
                              className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                            >
                              {cat}
                            </Badge>
                          ))}
                          {lead.categories.length > 3 && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-gray-100 text-gray-600"
                            >
                              +{lead.categories.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-sm text-gray-600 truncate max-w-xs">
                          {lead.lastMessage}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-sm text-gray-500">
                          {new Date(lead.lastActivity).toLocaleTimeString('en-US', {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(lead.lastActivity).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        {lead.assignedTo ? (
                          <Badge variant="outline" className="bg-gray-50 text-gray-700">
                            {lead.assignedTo}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">Sin asignar</span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <Link to={`/leads/${lead.id}`}>
                          <Button variant="ghost" size="sm" className="gap-2">
                            Ver
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm">
              <p className="text-gray-500">
                Mostrando {leads.length} leads
              </p>
              <div className="flex items-center gap-6 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-50 border border-green-200 rounded" />
                  <span>Alta prioridad (score ≥7)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-50 border border-amber-200 rounded" />
                  <span>Interes medio (score 5-6)</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
