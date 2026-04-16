import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { MoreVertical } from 'lucide-react';
import { useRecorderBridge } from '../data/useRecorderBridge';

export function Accounts() {
  const { accounts } = useRecorderBridge();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Cuentas de TikTok
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cuentas configuradas y sus metricas guardadas por sesion
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cuenta TikTok
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Prioridad
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mensajes
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Leads
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Usuarios
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ultima actividad
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr
                    key={account.uniqueId}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-4 px-4">
                      <p className="text-sm font-medium text-gray-900">
                        {account.uniqueId}
                      </p>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-gray-600">{account.nickname}</p>
                    </td>
                    <td className="py-4 px-4">
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        Alta
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      <Badge
                        variant="outline"
                        className={
                          account.status === 'Active'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }
                      >
                        {account.status === 'Active' ? 'Activa' : 'Finalizada'}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-gray-900">{account.messagesCount}</p>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-gray-900">{account.leadsDetected}</p>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-gray-900">{account.viewers}</p>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-gray-600">
                        {account.updatedAt
                          ? account.updatedAt.toLocaleString('es-CL', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Sin actividad'}
                      </p>
                    </td>
                    <td className="py-4 px-4">
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-500">
              Mostrando {accounts.length} cuentas configuradas
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
