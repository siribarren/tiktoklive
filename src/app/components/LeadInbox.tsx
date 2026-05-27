import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  CheckCircle2,
  Download,
  Filter,
  Info,
  Search,
  UserPlus,
} from 'lucide-react';

import { useRecorderBridge } from '../data/useRecorderBridge';
import { buildLeadVisualIdMap } from '@/lib/lead-visual-id';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const ALL_ACCOUNTS_VALUE = '__all_accounts__';

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

type LeadStatus = 'New' | 'Reviewed' | 'Qualified' | 'Contacted';
type LeadActionMode = 'derivar' | 'calificar';

type LeadActionDialogState = {
  leadId: string;
  mode: LeadActionMode;
};

const normalizeUniqueId = (value?: string) => {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
};

function mapCalificarToLeadStatus(value: string): LeadStatus {
  if (
    value === 'Alta intención' ||
    value === 'Aprobado comercialmente' ||
    value === 'En cierre' ||
    value === 'Cliente convertido'
  ) {
    return 'Qualified';
  }

  if (value === 'Contactado') {
    return 'Contacted';
  }

  return 'Reviewed';
}

function isDerivarOption(value: string): value is (typeof DERIVAR_STATE_OPTIONS)[number] {
  return DERIVAR_STATE_OPTIONS.includes(value as (typeof DERIVAR_STATE_OPTIONS)[number]);
}

function isCalificarOption(value: string): value is (typeof CALIFICAR_STATE_OPTIONS)[number] {
  return CALIFICAR_STATE_OPTIONS.includes(value as (typeof CALIFICAR_STATE_OPTIONS)[number]);
}

function resolveProfileRole(): string {
  if (typeof window === 'undefined') {
    return 'analista';
  }
  return window.localStorage.getItem('ember:user-profile') || 'analista';
}

export function LeadInbox() {
  const { allLeads, accounts, liveSessions } = useRecorderBridge();
  const [statusOverrides, setStatusOverrides] = useState<Record<string, LeadStatus>>({});
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedAccount, setSelectedAccount] = useState<string>(ALL_ACCOUNTS_VALUE);
  const [derivationStateByLead, setDerivationStateByLead] = useState<Record<string, string>>({});
  const [qualificationStateByLead, setQualificationStateByLead] = useState<Record<string, string>>({});
  const [editableLeadIds, setEditableLeadIds] = useState<Record<string, boolean>>({});
  const [actionDialog, setActionDialog] = useState<LeadActionDialogState | null>(null);
  const [selectedActionState, setSelectedActionState] = useState('');
  const userProfile = resolveProfileRole();
  const isSupervisor = userProfile === 'supervisor';

  const effectiveLeads = useMemo(
    () =>
      allLeads.map((lead) => ({
        ...lead,
        status: statusOverrides[lead.id] ?? lead.status,
        assignedTo: assignments[lead.id] ?? lead.assignedTo,
      })),
    [allLeads, assignments, statusOverrides]
  );

  const accountOptions = useMemo(() => {
    const values = new Set<string>();
    accounts.forEach((account) => {
      const normalized = normalizeUniqueId(account.uniqueId);
      if (normalized) {
        values.add(normalized);
      }
    });
    liveSessions.forEach((session) => {
      const normalized = normalizeUniqueId(session.accountName);
      if (normalized) {
        values.add(normalized);
      }
    });
    effectiveLeads.forEach((lead) => {
      const normalized = normalizeUniqueId(lead.accountUniqueId);
      if (normalized) {
        values.add(normalized);
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [accounts, effectiveLeads, liveSessions]);

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

  const leadAccountById = useMemo(() => {
    const map = new Map<string, string>();
    effectiveLeads.forEach((lead) => {
      const directAccount = normalizeUniqueId(lead.accountUniqueId);
      if (directAccount) {
        map.set(lead.id, directAccount);
        return;
      }
      const matchedAccount = lead.messages
        .map((message) => sessionToAccountMap.get(String(message.sessionId)) || '')
        .find(Boolean);
      if (matchedAccount) {
        map.set(lead.id, matchedAccount);
      }
    });
    return map;
  }, [effectiveLeads, sessionToAccountMap]);

  const displayedLeads = useMemo(() => {
    if (selectedAccount === ALL_ACCOUNTS_VALUE) {
      return effectiveLeads;
    }
    if (!accountOptions.includes(selectedAccount)) {
      return effectiveLeads;
    }
    return effectiveLeads.filter((lead) => leadAccountById.get(lead.id) === selectedAccount);
  }, [accountOptions, effectiveLeads, leadAccountById, selectedAccount]);

  const leadVisualIdById = useMemo(() => buildLeadVisualIdMap(effectiveLeads), [effectiveLeads]);

  const activeLead = useMemo(() => {
    if (!actionDialog) {
      return null;
    }
    return effectiveLeads.find((lead) => lead.id === actionDialog.leadId) || null;
  }, [actionDialog, effectiveLeads]);
  const actionLeadId = actionDialog?.leadId ?? '';

  const openActionDialog = (leadId: string, mode: LeadActionMode) => {
    const savedState =
      mode === 'derivar'
        ? derivationStateByLead[leadId] || ''
        : qualificationStateByLead[leadId] || '';

    setSelectedActionState(savedState);
    setActionDialog({ leadId, mode });
  };

  const closeActionDialog = () => {
    setActionDialog(null);
    setSelectedActionState('');
  };

  const confirmDialogSelection = () => {
    if (!actionDialog || !selectedActionState) {
      return;
    }

    const leadId = actionDialog.leadId;

    if (actionDialog.mode === 'derivar') {
      if (!isDerivarOption(selectedActionState)) {
        return;
      }

      setDerivationStateByLead((current) => ({
        ...current,
        [leadId]: selectedActionState,
      }));

      if (selectedActionState === 'Asignar a ejecutivo') {
        setAssignments((current) => ({
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
      setStatusOverrides((current) => ({
        ...current,
        [leadId]: mapCalificarToLeadStatus(selectedActionState),
      }));
    }

    setEditableLeadIds((current) => ({
      ...current,
      [leadId]: false,
    }));
    closeActionDialog();
  };

  const quickAssignBackoffice = (leadId: string, assigneeName: string) => {
    setAssignments((current) => ({
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-1">
            Leads detectados automáticamente desde la transmision
          </p>
        </div>
        <Button className="h-8 px-2.5 text-[11px] gap-1.5 self-start bg-blue-600 hover:bg-blue-700 sm:self-auto">
          <Download className="w-3.5 h-3.5" />
          Exportar leads
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:flex-1 sm:max-w-md">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <Input
                type="text"
                placeholder="Buscar leads..."
                className="h-8 pl-8 text-[12px] bg-gray-50"
              />
            </div>
            <Button variant="outline" size="sm" className="h-8 px-2 text-[11px] gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              Estado
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-2 text-[11px] gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              Rango de puntaje
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-2 text-[11px] gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              Categorías
            </Button>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 h-8">
              <span className="text-[11px] text-gray-500 whitespace-nowrap">Cuenta</span>
              <select
                value={selectedAccount}
                onChange={(event) => setSelectedAccount(event.target.value)}
                className="bg-transparent text-[11px] text-gray-700 outline-none"
              >
                <option value={ALL_ACCOUNTS_VALUE}>Todas</option>
                {accountOptions.map((account) => (
                  <option key={account} value={account}>
                    {account}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">ID Lead</th>
                  <th className="text-left py-2.5 px-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Cuenta propietaria</th>
                  <th className="text-left py-2.5 px-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Usuario TikTok</th>
                  <th className="text-left py-2.5 px-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Puntaje total</th>
                  <th className="text-left py-2.5 px-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Nickname</th>
                  <th className="text-left py-2.5 px-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Categorías</th>
                  <th className="text-left py-2.5 px-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Último mensaje</th>
                  <th className="text-left py-2.5 px-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Fecha origen</th>
                  <th className="text-left py-2.5 px-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Asignado a</th>
                  <th className="text-left py-2.5 px-2.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {displayedLeads.map((lead) => {
                  const scoreColor =
                    lead.totalScore >= 7
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : lead.totalScore >= 5
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-gray-50 text-gray-700 border-gray-200';

                  const rowBg =
                    lead.totalScore >= 7
                      ? 'bg-green-50/30'
                      : lead.totalScore >= 5
                        ? 'bg-amber-50/30'
                        : '';
                  const leadOwnerAccount = leadAccountById.get(lead.id) || 'Sin cuenta';

                  const leadCategories =
                    lead.categories.length > 0
                      ? lead.categories
                      : Array.from(new Set(lead.messages.flatMap((message) => message.categories)));

                  const derivarLabel = derivationStateByLead[lead.id] || 'Derivar';
                  const calificarLabel = qualificationStateByLead[lead.id] || 'Calificar';
                  const isEditable = editableLeadIds[lead.id] === true;
                  const derivarLocked = Boolean(derivationStateByLead[lead.id]) && !isEditable;
                  const calificarLocked = Boolean(qualificationStateByLead[lead.id]) && !isEditable;

                  return (
                    <tr key={lead.id} className={`border-b border-gray-100 hover:bg-gray-50 ${rowBg}`}>
                      <td className="py-2.5 px-2.5">
                        <p className="font-mono text-[11px] font-medium text-gray-700">
                          {leadVisualIdById[lead.id] || lead.id}
                        </p>
                      </td>
                      <td className="py-2.5 px-2.5">
                        <p className="text-[12px] text-gray-700">{leadOwnerAccount}</p>
                      </td>
                      <td className="py-2.5 px-2.5">
                        <p className="text-[12px] font-medium text-gray-900 break-all">{lead.username}</p>
                      </td>
                      <td className="py-2.5 px-2.5">
                        <Badge variant="outline" className={`${scoreColor} h-6 px-1.5 text-[10px] font-semibold`}>
                          {lead.totalScore}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2.5">
                        <p className="text-[12px] text-gray-600">{lead.nickname}</p>
                      </td>
                      <td className="py-2.5 px-2.5">
                        <div className="flex max-w-[190px] flex-wrap gap-1">
                          {leadCategories.slice(0, 3).map((cat) => (
                            <Badge
                              key={cat}
                              variant="secondary"
                              className="h-6 px-1.5 text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                            >
                              {cat}
                            </Badge>
                          ))}
                          {leadCategories.length > 3 ? (
                            <Badge
                              variant="secondary"
                              className="h-6 px-1.5 text-[10px] bg-gray-100 text-gray-600"
                            >
                              +{leadCategories.length - 3}
                            </Badge>
                          ) : null}
                          {leadCategories.length === 0 ? (
                            <Badge
                              variant="secondary"
                              className="h-6 px-1.5 text-[10px] bg-gray-100 text-gray-600"
                            >
                              Sin categoría
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5">
                        <p className="text-[11px] text-gray-600 truncate max-w-[180px]">{lead.lastMessage}</p>
                      </td>
                      <td className="py-2.5 px-2.5">
                        <p className="text-[11px] text-gray-500">
                          {new Date(lead.lastActivity).toLocaleTimeString('es-CL', {
                            hour12: false,
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(lead.lastActivity).toLocaleDateString('es-CL', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </td>
                      <td className="py-2.5 px-2.5">
                        {lead.assignedTo ? (
                          <Badge variant="outline" className="h-6 px-1.5 text-[10px] bg-gray-50 text-gray-700">
                            {lead.assignedTo}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-gray-400">Sin asignar</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <Link to={`/leads/${lead.id}`}>
                            <Button
                              size="sm"
                              className="h-7 px-2 text-[10px] gap-1 bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                            >
                              Ver
                            </Button>
                          </Link>

                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px] gap-1"
                              disabled={derivarLocked}
                              onClick={() => openActionDialog(lead.id, 'derivar')}
                              title={derivarLocked ? derivarLabel : undefined}
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              {derivarLabel}
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                                  aria-label="Información sobre Derivar"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent sideOffset={8}>
                                Quién toma el lead o dónde queda asignado.
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px] gap-1"
                              disabled={calificarLocked}
                              onClick={() => openActionDialog(lead.id, 'calificar')}
                              title={calificarLocked ? calificarLabel : undefined}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {calificarLabel}
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-blue-600 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                                  aria-label="Información sobre Calificar"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent sideOffset={8}>
                                En qué condición comercial queda el lead
                              </TooltipContent>
                            </Tooltip>
                          </div>

                          {isSupervisor ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              onClick={() =>
                                setEditableLeadIds((current) => ({
                                  ...current,
                                  [lead.id]: true,
                                }))
                              }
                            >
                              Editar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {displayedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 px-3 text-center text-[12px] text-gray-500">
                      No hay leads disponibles para la cuenta seleccionada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex flex-col gap-3 text-sm lg:flex-row lg:items-center lg:justify-between">
              <p className="text-gray-500">Mostrando {displayedLeads.length} leads</p>
              <div className="flex flex-wrap items-center gap-4 text-[10px] text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-50 border border-green-200 rounded" />
                  <span>Alta prioridad (puntaje ≥7)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-50 border border-amber-200 rounded" />
                  <span>Interés medio (puntaje 5-6)</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={actionDialog !== null} onOpenChange={(open) => (!open ? closeActionDialog() : null)}>
        <DialogContent className="border-gray-200 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{actionDialog?.mode === 'calificar' ? 'Calificar' : 'Derivar'}</DialogTitle>
            <DialogDescription>
              {actionDialog?.mode === 'calificar'
                ? 'Define la condición comercial del lead.'
                : 'Define cómo se deriva el lead y a quién se asigna.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              {actionDialog?.mode === 'calificar'
                ? (qualificationStateByLead[actionLeadId] || 'Lead sin calificar')
                : (derivationStateByLead[actionLeadId] || 'Lead no derivado')}
            </div>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div>
                <Input
                  list={actionDialog?.mode === 'calificar' ? 'calificar-states' : 'derivar-states'}
                  value={selectedActionState}
                  onChange={(event) => setSelectedActionState(event.target.value)}
                  placeholder={
                    actionDialog?.mode === 'calificar'
                      ? 'Selecciona estado de calificación'
                      : 'Selecciona estado de derivación'
                  }
                />
                <datalist id="derivar-states">
                  {DERIVAR_STATE_OPTIONS.map((state) => (
                    <option key={state} value={state} />
                  ))}
                </datalist>
                <datalist id="calificar-states">
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
                {actionDialog?.mode === 'calificar' ? 'Calificar' : 'Derivar'}
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
                        <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">
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
                        if (!actionDialog) {
                          return;
                        }
                        if (actionDialog.mode === 'derivar') {
                          quickAssignBackoffice(actionDialog.leadId, executive.name);
                          return;
                        }
                        setSelectedActionState('Contactado');
                      }}
                    >
                      {actionDialog?.mode === 'calificar' ? 'Calificar' : 'Derivar'}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {activeLead ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                Lead: <span className="font-medium text-gray-800">{activeLead.username}</span>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
