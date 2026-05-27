import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  ArrowLeft,
  CheckCircle2,
  Pencil,
  UserPlus,
  MessageSquare,
  TrendingUp,
  Calendar as CalendarIcon,
  Sparkles,
} from 'lucide-react';
import { useRecorderBridge } from '../data/useRecorderBridge';
import { buildLeadVisualIdMap } from '@/lib/lead-visual-id';
import { useParams, Link } from 'react-router';
import { Calendar } from './ui/calendar';
import { useEffect, useMemo, useRef, useState } from 'react';

const DERIVAR_STATE_OPTIONS = [
  'Tomar lead',
  'Asignar a ejecutivo',
  'Enviar a cola Backoffice',
  'Escalar a supervisor',
  'Dejar en espera',
  'Reasignar',
  'Devolver a cola',
  'Cerrar sin derivar',
] as const;

const CALIFICAR_STATE_OPTIONS = [
  'Alta intención',
  'Interés medio',
  'Interés bajo',
  'Contacto pendiente',
  'Contactado',
  'En evaluación comercial',
  'Aprobado comercialmente',
  'En cierre',
  'Cliente convertido',
  'No califica',
  'No interesado',
  'No contactable',
  'Duplicado',
  'Consulta no comercial',
] as const;

const BACKOFFICE_TEAM = [
  { id: 'bk-1', name: 'Sofía Martínez', role: 'Ejecutiva Backoffice', initials: 'SM' },
  { id: 'bk-2', name: 'Carlos Rojas', role: 'Ejecutivo Backoffice', initials: 'CR' },
  { id: 'bk-3', name: 'Valentina Torres', role: 'Analista Comercial', initials: 'VT' },
  { id: 'bk-4', name: 'Diego Herrera', role: 'Supervisor Backoffice', initials: 'DH' },
] as const;

type LeadActionMode = 'derivar' | 'calificar';

function isDerivarOption(value: string): value is (typeof DERIVAR_STATE_OPTIONS)[number] {
  return DERIVAR_STATE_OPTIONS.includes(value as (typeof DERIVAR_STATE_OPTIONS)[number]);
}

function isCalificarOption(value: string): value is (typeof CALIFICAR_STATE_OPTIONS)[number] {
  return CALIFICAR_STATE_OPTIONS.includes(value as (typeof CALIFICAR_STATE_OPTIONS)[number]);
}

function normalizeUniqueId(value?: string): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function resolveProfileRole(): string {
  if (typeof window === 'undefined') {
    return 'analista';
  }
  return window.localStorage.getItem('ember:user-profile') || 'analista';
}

function formatDateInput(value: Date): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const year = String(value.getFullYear());
  return `${day}-${month}-${year}`;
}

function normalizeMessageForDedup(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return '';
  }
  return normalized.replace(/\s+/g, ' ');
}

export function LeadDetail() {
  const { id } = useParams();
  const { allLeads, liveSessions } = useRecorderBridge();
  const leadId = id ?? '';
  const [showNotFound, setShowNotFound] = useState(false);
  const cachedLeadByIdRef = useRef<Record<string, (typeof allLeads)[number]>>({});
  const [derivationStateByLead, setDerivationStateByLead] = useState<Record<string, string>>({});
  const [qualificationStateByLead, setQualificationStateByLead] = useState<Record<string, string>>({});
  const [editableLeadIds, setEditableLeadIds] = useState<Record<string, boolean>>({});
  const [actionDialog, setActionDialog] = useState<LeadActionMode | null>(null);
  const [selectedActionState, setSelectedActionState] = useState('');
  const [assignmentsByLead, setAssignmentsByLead] = useState<Record<string, string>>({});
  const [scheduledFollowUpByLead, setScheduledFollowUpByLead] = useState<
    Record<string, { date: string; time: string }>
  >({});
  const userProfile = resolveProfileRole();
  const isSupervisor = userProfile === 'supervisor';
  const lead = useMemo(
    () => allLeads.find((candidate) => candidate.id === leadId),
    [allLeads, leadId]
  );
  const stableLead = lead ?? (leadId ? cachedLeadByIdRef.current[leadId] : undefined);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [followUpDateText, setFollowUpDateText] = useState('');
  const [followUpTimeText, setFollowUpTimeText] = useState('');
  const derivarLabel = derivationStateByLead[leadId] || 'Derivar';
  const calificarLabel = qualificationStateByLead[leadId] || 'Calificar';
  const isEditable = editableLeadIds[leadId] === true;
  const derivarLocked = Boolean(derivationStateByLead[leadId]) && !isEditable;
  const calificarLocked = Boolean(qualificationStateByLead[leadId]) && !isEditable;

  const sessionToAccountMap = useMemo(() => {
    const map = new Map<string, string>();
    liveSessions.forEach((session) => {
      const normalizedAccount = normalizeUniqueId(session.accountName);
      if (!normalizedAccount) {
        return;
      }
      if (session.rawSessionId) {
        map.set(String(session.rawSessionId), normalizedAccount);
      }
      map.set(String(session.id), normalizedAccount);
    });
    return map;
  }, [liveSessions]);

  const leadOwnerAccount = useMemo(() => {
    if (!stableLead) {
      return 'Sin cuenta';
    }
    const directAccount = normalizeUniqueId(stableLead.accountUniqueId);
    if (directAccount) {
      return directAccount;
    }
    const matchedAccount = stableLead.messages
      .map((message) => sessionToAccountMap.get(String(message.sessionId)) || '')
      .find(Boolean);
    return matchedAccount || 'Sin cuenta';
  }, [sessionToAccountMap, stableLead]);

  const leadVisualIdById = useMemo(() => buildLeadVisualIdMap(allLeads), [allLeads]);
  const leadVisualId = leadVisualIdById[leadId] || leadId || 'ldx00000';
  const scheduledFollowUp = scheduledFollowUpByLead[leadId];
  const dedupedLeadMessages = useMemo(() => {
    const sourceMessages = stableLead?.messages ?? [];
    const seenMessageKeys = new Set<string>();
    return sourceMessages.filter((message) => {
      const normalizedKey = normalizeMessageForDedup(message.message ?? '');
      if (!normalizedKey) {
        return true;
      }
      if (seenMessageKeys.has(normalizedKey)) {
        return false;
      }
      seenMessageKeys.add(normalizedKey);
      return true;
    });
  }, [stableLead?.messages]);

  useEffect(() => {
    setShowNotFound(false);
    const timeoutId = window.setTimeout(() => {
      setShowNotFound(true);
    }, 3500);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [leadId]);

  useEffect(() => {
    if (!leadId || !lead) {
      return;
    }
    cachedLeadByIdRef.current[leadId] = lead;
    setShowNotFound(false);
  }, [lead, leadId]);

  useEffect(() => {
    const currentSchedule = scheduledFollowUpByLead[leadId];
    if (!currentSchedule) {
      setFollowUpDateText('');
      setFollowUpTimeText('');
      setFollowUpDate(undefined);
      return;
    }
    setFollowUpDateText(currentSchedule.date);
    setFollowUpTimeText(currentSchedule.time);
  }, [leadId, scheduledFollowUpByLead]);

  const openActionDialog = (mode: LeadActionMode) => {
    const savedState =
      mode === 'derivar' ? derivationStateByLead[leadId] || '' : qualificationStateByLead[leadId] || '';
    setSelectedActionState(savedState);
    setActionDialog(mode);
  };

  const closeActionDialog = () => {
    setActionDialog(null);
    setSelectedActionState('');
  };

  const confirmDialogSelection = () => {
    if (!actionDialog || !selectedActionState) {
      return;
    }

    if (actionDialog === 'derivar') {
      if (!isDerivarOption(selectedActionState)) {
        return;
      }

      setDerivationStateByLead((current) => ({
        ...current,
        [leadId]: selectedActionState,
      }));
      if (selectedActionState === 'Asignar a ejecutivo') {
        setAssignmentsByLead((current) => ({
          ...current,
          [leadId]: 'Backoffice',
        }));
      }
    } else {
      if (!isCalificarOption(selectedActionState)) {
        return;
      }

      setQualificationStateByLead((current) => ({
        ...current,
        [leadId]: selectedActionState,
      }));
    }

    setEditableLeadIds((current) => ({
      ...current,
      [leadId]: false,
    }));
    closeActionDialog();
  };

  const quickAssignBackoffice = (assigneeName: string) => {
    setAssignmentsByLead((current) => ({
      ...current,
      [leadId]: assigneeName,
    }));
    setDerivationStateByLead((current) => ({
      ...current,
      [leadId]: 'Asignar a ejecutivo',
    }));
    setEditableLeadIds((current) => ({
      ...current,
      [leadId]: false,
    }));
    closeActionDialog();
  };

  const canScheduleFollowUp =
    followUpDateText.trim().length > 0 && followUpTimeText.trim().length > 0;

  const scheduleFollowUp = () => {
    if (!canScheduleFollowUp) {
      return;
    }
    setScheduledFollowUpByLead((current) => ({
      ...current,
      [leadId]: {
        date: followUpDateText.trim(),
        time: followUpTimeText.trim(),
      },
    }));
    setIsScheduleOpen(false);
  };

  if (!stableLead && !showNotFound) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Cargando lead...</h2>
          <p className="mt-2 text-sm text-gray-500">
            Esperando datos de la sesión.
          </p>
        </div>
      </div>
    );
  }

  if (!stableLead) {
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

  const analysis = stableLead.semanticAnalysis;
  const totalScoreProgress = Math.max(0, Math.min(100, (stableLead.totalScore / 10) * 100));
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-start gap-3">
          <Link to="/leads">
            <Button variant="ghost" size="icon" aria-label="Volver a leads">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold text-gray-900">
              ID del Lead: {leadVisualId}
            </h1>
            <p className="text-sm text-gray-600">
              Usuario de @tiktok calificado como Lead: <span className="font-medium text-gray-900">{stableLead.username}</span>
            </p>
            <p className="text-sm text-gray-600">
              Nickname: <span className="font-medium text-gray-900">{stableLead.nickname}</span>
            </p>
            <p className="text-sm text-gray-600">
              Cuenta que transmitia donde se generó el lead:{' '}
              <span className="font-medium text-gray-900">{leadOwnerAccount}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="h-9 px-3 text-[12px] font-semibold">
            Puntaje: {stableLead.totalScore}
          </Badge>
          <Button
            variant="outline"
            className="gap-2"
            disabled={derivarLocked}
            onClick={() => openActionDialog('derivar')}
            title={derivarLocked ? derivarLabel : undefined}
          >
            <UserPlus className="w-4 h-4" />
            {derivarLabel}
          </Button>
          <Button
            className="gap-2 bg-blue-600 hover:bg-blue-700"
            disabled={calificarLocked}
            onClick={() => openActionDialog('calificar')}
            title={calificarLocked ? calificarLabel : undefined}
          >
            <CheckCircle2 className="w-4 h-4" />
            {calificarLabel}
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
                Historial de conversación
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dedupedLeadMessages.map((message, index) => (
                  <div key={message.id} className="flex gap-4">
                    {/* Timeline */}
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 bg-blue-600 rounded-full" />
                      {index < dedupedLeadMessages.length - 1 && (
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
                Puntaje por reglas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-3xl font-semibold text-gray-900">
                    {stableLead.totalScore}
                  </span>
                  <span className="text-sm text-gray-500">Puntaje total</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      stableLead.totalScore >= 7
                        ? 'bg-green-600'
                        : stableLead.totalScore >= 5
                        ? 'bg-amber-600'
                        : 'bg-gray-600'
                    }`}
                    style={{ width: `${totalScoreProgress}%` }}
                  />
                </div>
              </div>

              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Categorías detectadas
                </h4>
                <div className="flex flex-wrap gap-2">
                  {stableLead.categories.map((cat) => (
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
                    {dedupedLeadMessages.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Fecha/Hora del Lead</span>
                  <span className="font-medium text-gray-900">
                    {new Date(stableLead.lastActivity).toLocaleString('es-CL', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
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
                  Análisis semántico
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-purple-600 font-medium mb-1">Intención</p>
                    <p className="text-sm text-gray-900">{analysis.intent}</p>
                  </div>
                  <div>
                    <p className="text-xs text-purple-600 font-medium mb-1">
                      Nivel de interés
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
                  <p className="text-xs text-purple-600 font-medium mb-1">Categoría</p>
                  <p className="text-sm text-gray-900">{analysis.category}</p>
                </div>

                <div>
                  <p className="text-xs text-purple-600 font-medium mb-1">
                    Subcategoría
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
                      <span className="text-gray-700">Interés en portabilidad</span>
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
                        {analysis.flags.portabilityInterest ? 'Sí' : 'No'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">Interés en equipos</span>
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
                        {analysis.flags.deviceInterest ? 'Sí' : 'No'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">Interés en precio</span>
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
                        {analysis.flags.pricingInterest ? 'Sí' : 'No'}
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
              {assignmentsByLead[leadId] ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Derivado a: <span className="font-medium text-gray-900">{assignmentsByLead[leadId]}</span>
                </div>
              ) : null}
              {scheduledFollowUp ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  Seguimiento programado: <span className="font-medium">{scheduledFollowUp.date} {scheduledFollowUp.time}</span>
                </div>
              ) : null}
              <Button
                className="w-full justify-start gap-2"
                variant="outline"
                onClick={() => setIsScheduleOpen((current) => !current)}
              >
                <CalendarIcon className="w-4 h-4" />
                Programar seguimiento
              </Button>
              <Button
                className="w-full justify-start gap-2"
                variant="outline"
                disabled={!isSupervisor}
                title={!isSupervisor ? 'Disponible solo para supervisor' : undefined}
                onClick={() =>
                  setEditableLeadIds((current) => ({
                    ...current,
                    [leadId]: true,
                  }))
                }
              >
                <Pencil className="w-4 h-4" />
                Editar
              </Button>
              {isScheduleOpen ? (
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <Calendar
                    mode="single"
                    selected={followUpDate}
                    onSelect={(value) => {
                      setFollowUpDate(value);
                      setFollowUpDateText(value ? formatDateInput(value) : '');
                    }}
                    className="rounded-md border bg-white p-2"
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        Fecha (DD-MM-AAAA)
                      </label>
                      <Input
                        value={followUpDateText}
                        onChange={(event) => setFollowUpDateText(event.target.value)}
                        placeholder="DD-MM-AAAA"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-gray-600">
                        Hora (HH:MM)
                      </label>
                      <Input
                        value={followUpTimeText}
                        onChange={(event) => setFollowUpTimeText(event.target.value)}
                        placeholder="HH:MM"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsScheduleOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={scheduleFollowUp}
                      disabled={!canScheduleFollowUp}
                    >
                      Programar
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={actionDialog !== null} onOpenChange={(open) => (!open ? closeActionDialog() : null)}>
        <DialogContent className="border-gray-200 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{actionDialog === 'calificar' ? 'Calificar' : 'Derivar'}</DialogTitle>
            <DialogDescription>
              {actionDialog === 'calificar'
                ? 'Define la condición comercial del lead.'
                : 'Define cómo se deriva el lead y a quién se asigna.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              {actionDialog === 'calificar'
                ? (qualificationStateByLead[leadId] || 'Lead sin calificar')
                : (derivationStateByLead[leadId] || 'Lead no derivado')}
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div>
                <Input
                  list={actionDialog === 'calificar' ? 'calificar-states-detail' : 'derivar-states-detail'}
                  value={selectedActionState}
                  onChange={(event) => setSelectedActionState(event.target.value)}
                  placeholder={
                    actionDialog === 'calificar'
                      ? 'Selecciona estado de calificación'
                      : 'Selecciona estado de derivación'
                  }
                />
                <datalist id="derivar-states-detail">
                  {DERIVAR_STATE_OPTIONS.map((state) => (
                    <option key={state} value={state} />
                  ))}
                </datalist>
                <datalist id="calificar-states-detail">
                  {CALIFICAR_STATE_OPTIONS.map((state) => (
                    <option key={state} value={state} />
                  ))}
                </datalist>
              </div>
              <Button
                onClick={confirmDialogSelection}
                disabled={selectedActionState.trim().length === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {actionDialog === 'calificar' ? 'Calificar' : 'Derivar'}
              </Button>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-900">Recommendation Grid</h4>
              <div className="grid gap-2">
                {BACKOFFICE_TEAM.map((executive) => (
                  <div
                    key={executive.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-700">
                          {executive.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{executive.name}</p>
                        <p className="text-xs text-gray-500">{executive.role}</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (actionDialog === 'derivar') {
                          quickAssignBackoffice(executive.name);
                          return;
                        }
                        setSelectedActionState('Contactado');
                      }}
                    >
                      {actionDialog === 'calificar' ? 'Calificar' : 'Derivar'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
