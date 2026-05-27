import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import {
  ArrowLeft,
  User,
  CheckCircle2,
  UserPlus,
  MessageSquare,
  TrendingUp,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { useParams, Link } from 'react-router';

export function LeadDetail() {
  const { id } = useParams();
  const { leads } = useRecorderBridge();
  const lead = leads.find((l) => l.id === id);

  if (!lead) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Lead no encontrado</h2>
          <Link to="/leads">
            <Button className="mt-4">Volver a leads</Button>
          </Link>
        </div>
      </div>
    );
  }

  const analysis = lead.semanticAnalysis;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/leads">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {lead.username}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{lead.nickname}</p>
          </div>
          <Badge
            variant="outline"
            className={
              lead.status === 'New'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : lead.status === 'Qualified'
                ? 'bg-green-50 text-green-700 border-green-200'
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
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2">
            <UserPlus className="w-4 h-4" />
            Asignar a ejecutivo
          </Button>
          <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
            <CheckCircle2 className="w-4 h-4" />
            Marcar como calificado
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Conversation Timeline */}
        <div className="col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Historial de conversacion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {lead.messages.map((message, index) => (
                  <div key={message.id} className="flex gap-4">
                    {/* Timeline */}
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 bg-blue-600 rounded-full" />
                      {index < lead.messages.length - 1 && (
                        <div className="w-0.5 h-full bg-gray-200 mt-2" />
                      )}
                    </div>

                    {/* Message Bubble */}
                    <div className="flex-1">
                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-xs text-gray-500">
                            {new Date(message.timestamp).toLocaleTimeString('es-CL', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          <Badge
                            variant="outline"
                            className={
                              message.score >= 3
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            }
                          >
                            Puntaje: {message.score}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-900 mb-3">
                          "{message.message}"
                        </p>
                        {message.categories.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {message.categories.map((cat) => (
                              <Badge
                                key={cat}
                                variant="secondary"
                                className="text-xs bg-blue-50 text-blue-700"
                              >
                                {cat}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Note */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-3">
                  Notas internas
                </h4>
                <Textarea
                  placeholder="Agregar notas sobre este lead..."
                  className="min-h-[100px] mb-3"
                />
                <Button size="sm" variant="outline">
                  Agregar nota
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Analysis Panel */}
        <div className="space-y-6">
          {/* Scoring Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Scoring por reglas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-semibold text-gray-900">
                    {lead.totalScore}
                  </span>
                  <span className="text-sm text-gray-500">Puntaje total</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      lead.totalScore >= 7
                        ? 'bg-green-600'
                        : lead.totalScore >= 5
                        ? 'bg-amber-600'
                        : 'bg-gray-600'
                    }`}
                    style={{ width: `${(lead.totalScore / 10) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Categorias detectadas
                </h4>
                <div className="flex flex-wrap gap-2">
                  {lead.categories.map((cat) => (
                    <Badge
                      key={cat}
                      variant="outline"
                      className="bg-blue-50 text-blue-700 border-blue-200"
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-500">Mensajes</span>
                  <span className="font-medium text-gray-900">
                    {lead.messages.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Ultima actividad</span>
                  <span className="font-medium text-gray-900">
                    {new Date(lead.lastActivity).toLocaleTimeString('es-CL', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Semantic Analysis */}
          {analysis && (
            <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-900">
                  <Sparkles className="w-5 h-5" />
                  Analisis semantico
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-purple-600 font-medium mb-1">Intencion</p>
                    <p className="text-sm text-gray-900">{analysis.intent}</p>
                  </div>
                  <div>
                    <p className="text-xs text-purple-600 font-medium mb-1">
                      Nivel de interes
                    </p>
                    <Badge
                      variant="outline"
                      className={
                        analysis.interestLevel === 'Very High' ||
                        analysis.interestLevel === 'High'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }
                    >
                      {analysis.interestLevel === 'Very High'
                        ? 'Muy alto'
                        : analysis.interestLevel === 'High'
                        ? 'Alto'
                        : analysis.interestLevel === 'Medium'
                        ? 'Medio'
                        : analysis.interestLevel === 'Low'
                        ? 'Bajo'
                        : analysis.interestLevel}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-purple-600 font-medium mb-1">Categoria</p>
                  <p className="text-sm text-gray-900">{analysis.category}</p>
                </div>

                <div>
                  <p className="text-xs text-purple-600 font-medium mb-1">
                    Subcategoria
                  </p>
                  <p className="text-sm text-gray-900">{analysis.subcategory}</p>
                </div>

                <div>
                  <p className="text-xs text-purple-600 font-medium mb-1">
                    Confianza
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-purple-600"
                        style={{ width: `${analysis.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {(analysis.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t border-purple-200">
                  <p className="text-xs text-purple-600 font-medium mb-2">Resumen</p>
                  <div className="bg-white rounded-lg p-3 border border-purple-200">
                    <p className="text-sm text-gray-900 italic">
                      "{analysis.summary}"
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-purple-200">
                  <p className="text-xs text-purple-600 font-medium mb-3">Indicadores</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">Interes en portabilidad</span>
                      <Badge
                        variant={
                          analysis.flags.portabilityInterest
                            ? 'default'
                            : 'secondary'
                        }
                        className={
                          analysis.flags.portabilityInterest
                            ? 'bg-green-600'
                            : 'bg-gray-300'
                        }
                      >
                        {analysis.flags.portabilityInterest ? 'Si' : 'No'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">Interes en equipos</span>
                      <Badge
                        variant={
                          analysis.flags.deviceInterest ? 'default' : 'secondary'
                        }
                        className={
                          analysis.flags.deviceInterest
                            ? 'bg-green-600'
                            : 'bg-gray-300'
                        }
                      >
                        {analysis.flags.deviceInterest ? 'Si' : 'No'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">Interes en precio</span>
                      <Badge
                        variant={
                          analysis.flags.pricingInterest ? 'default' : 'secondary'
                        }
                        className={
                          analysis.flags.pricingInterest
                            ? 'bg-green-600'
                            : 'bg-gray-300'
                        }
                      >
                        {analysis.flags.pricingInterest ? 'Si' : 'No'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start gap-2" variant="outline">
                <CheckCircle2 className="w-4 h-4" />
                Marcar como calificado
              </Button>
              <Button className="w-full justify-start gap-2" variant="outline">
                <UserPlus className="w-4 h-4" />
                Asignar a ejecutivo
              </Button>
              <Button className="w-full justify-start gap-2" variant="outline">
                <Calendar className="w-4 h-4" />
                Programar seguimiento
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
