import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Search, Filter, Clock } from 'lucide-react';
import { useRecorderBridge } from '../data/useRecorderBridge';

export function LiveMessages() {
  const { messages, accountLabel, isLive, updatedAt } = useRecorderBridge();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mensajes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Mensajes del chat para {accountLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
          <span className="text-sm text-gray-600">
            {isLive ? 'Leyendo en vivo' : 'Ultima lectura'}
            {updatedAt ? ` · ${updatedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Buscar mensajes..."
                className="pl-10 bg-gray-50"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Filtrar por score
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Clock className="w-4 h-4" />
              Ultima hora
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Messages Feed */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {messages.map((message) => {
              const isHighScore = message.score >= 3;
              const bgColor = isHighScore
                ? 'bg-amber-50 border-amber-200'
                : 'bg-white border-gray-200';

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
                    {/* Timestamp */}
                    <div className="flex-shrink-0 w-16 pt-1">
                      <p className="text-xs text-gray-500">
                        {new Date(message.timestamp).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-4 min-w-0">
                        {/* User Info */}
                        <div className="min-w-0 w-40 flex-shrink">
                          <p
                            className="text-sm font-medium text-gray-900 truncate"
                            title={message.username}
                          >
                            {message.username}
                          </p>
                          <p
                            className="text-xs text-gray-500 truncate"
                            title={message.nickname}
                          >
                            {message.nickname}
                          </p>
                        </div>

                        {/* Message */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 break-words">
                            {message.message}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="flex-shrink-0">
                      <Badge variant="outline" className={`${scoreColor} font-semibold`}>
                        Puntaje: {message.score}
                      </Badge>
                    </div>

                    {/* Categories */}
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
                        <p className="text-xs text-gray-400 text-right">Sin categorias</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stats Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm text-gray-500">
          <p>Mostrando {messages.length} mensajes</p>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-50 border border-green-200 rounded" />
                  <span>Alta prioridad (≥4)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-50 border border-amber-200 rounded" />
                  <span>Interes medio (2-3)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-50 border border-gray-200 rounded" />
                  <span>Ruido o bajo interes (0-1)</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
