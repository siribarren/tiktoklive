import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { authFetch, type AuthRole, useAuth } from '../auth/auth';
import { readJsonResponse, resolveApiErrorMessage } from '../../lib/http';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

type ManagedUser = {
  id: string;
  login: string;
  displayName: string;
  role: AuthRole;
  clientCode: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type UserFormState = {
  login: string;
  displayName: string;
  role: AuthRole;
  clientCode: string;
  password: string;
  isActive: boolean;
};

type UsersResponse = {
  ok?: boolean;
  users?: unknown[];
  error?: string;
  message?: string;
};

type UserResponse = {
  ok?: boolean;
  user?: unknown;
  deleted?: boolean;
  error?: string;
  message?: string;
};

const ROLE_OPTIONS: Array<{ value: AuthRole; label: string; description: string }> = [
  {
    value: 'administrator',
    label: 'Administrador',
    description: 'Acceso total a todas las cuentas y configuraciones.',
  },
  {
    value: 'client',
    label: 'Cliente',
    description: 'Vista restringida al cliente asignado.',
  },
  {
    value: 'executive',
    label: 'Ejecutivo',
    description: 'Trabajo operativo dentro del cliente asignado.',
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    description: 'Monitoreo y seguimiento de un solo cliente.',
  },
];

const CLIENT_OPTIONS = [
  { value: 'WOM', label: 'WOM' },
  { value: 'CLARO', label: 'Claro' },
];

const EMPTY_FORM: UserFormState = {
  login: '',
  displayName: '',
  role: 'client',
  clientCode: 'WOM',
  password: '',
  isActive: true,
};

function normalizeManagedUser(value: unknown): ManagedUser | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<ManagedUser>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.login !== 'string' ||
    typeof candidate.displayName !== 'string' ||
    typeof candidate.role !== 'string'
  ) {
    return null;
  }

  if (!['administrator', 'client', 'executive', 'supervisor'].includes(candidate.role)) {
    return null;
  }

  return {
    id: candidate.id,
    login: candidate.login,
    displayName: candidate.displayName,
    role: candidate.role as AuthRole,
    clientCode: typeof candidate.clientCode === 'string' ? candidate.clientCode : null,
    isActive: candidate.isActive !== false,
    lastLoginAt: typeof candidate.lastLoginAt === 'string' ? candidate.lastLoginAt : null,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : null,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
  };
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Nunca';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Nunca';
  }

  return date.toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function roleLabel(role: AuthRole) {
  const roleEntry = ROLE_OPTIONS.find((option) => option.value === role);
  return roleEntry?.label ?? role;
}

function clientLabel(user: ManagedUser) {
  if (user.role === 'administrator') {
    return null;
  }

  return user.clientCode === 'CLARO' || user.clientCode === 'WOM' ? user.clientCode : null;
}

function createFormFromUser(user: ManagedUser): UserFormState {
  return {
    login: user.login,
    displayName: user.displayName,
    role: user.role,
    clientCode: user.clientCode ?? 'WOM',
    password: '',
    isActive: user.isActive,
  };
}

function selectClientCodeForRole(role: AuthRole, currentClientCode: string) {
  if (role === 'administrator') {
    return '';
  }

  return currentClientCode === 'CLARO' ? 'CLARO' : 'WOM';
}

export function UserManagementCard() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);

  const activeAdminCount = useMemo(
    () => users.filter((candidate) => candidate.role === 'administrator' && candidate.isActive).length,
    [users]
  );

  const loadUsers = async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const response = await authFetch('/recorder-api/users', {
        method: 'GET',
      });
      const payload = await readJsonResponse<UsersResponse>(response);

      if (!response.ok || !payload?.ok || !Array.isArray(payload.users)) {
        throw new Error(resolveApiErrorMessage(response, payload, 'No se pudo cargar la lista de usuarios.'));
      }

      setUsers(payload.users.map(normalizeManagedUser).filter((candidate): candidate is ManagedUser => Boolean(candidate)));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo conectar con el recorder local.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const openCreateDialog = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsEditorOpen(true);
  };

  const openEditDialog = (candidate: ManagedUser) => {
    setEditingUser(candidate);
    setForm(createFormFromUser(candidate));
    setFormError(null);
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    if (isSubmitting) {
      return;
    }
    setIsEditorOpen(false);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const login = form.login.trim();
    const displayName = form.displayName.trim();
    const password = form.password.trim();
    const clientCode = form.role === 'administrator' ? null : form.clientCode.trim().toUpperCase();

    if (!login) {
      setFormError('Debes escribir un login.');
      return;
    }

    if (!displayName) {
      setFormError('Debes escribir un nombre visible.');
      return;
    }

    if (!editingUser && !password) {
      setFormError('Debes escribir una clave para el nuevo usuario.');
      return;
    }

    if (form.role !== 'administrator' && !CLIENT_OPTIONS.some((option) => option.value === clientCode)) {
      setFormError('Selecciona un cliente válido para este perfil.');
      return;
    }

    setIsSubmitting(true);

    try {
      const body: Record<string, unknown> = {
        login,
        displayName,
        role: form.role,
        clientCode,
        isActive: form.isActive,
      };

      if (password) {
        body.password = password;
      }

      const response = await authFetch(
        editingUser ? `/recorder-api/users/${editingUser.id}` : '/recorder-api/users',
        {
          method: editingUser ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      const payload = await readJsonResponse<UserResponse>(response);
      if (!response.ok || !payload?.ok) {
        throw new Error(resolveApiErrorMessage(response, payload, 'No se pudo guardar el usuario.'));
      }

      toast.success(editingUser ? 'Usuario actualizado' : 'Usuario creado');
      setIsEditorOpen(false);
      setEditingUser(null);
      setForm(EMPTY_FORM);
      await loadUsers(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo conectar con el recorder local.';
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    if (deleteTarget.id === currentUser?.id) {
      toast.error('No puedes eliminar tu propio usuario.');
      setDeleteTarget(null);
      return;
    }

    if (deleteTarget.role === 'administrator' && activeAdminCount <= 1) {
      toast.error('Debe existir al menos un administrador activo.');
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);

    try {
      const response = await authFetch(`/recorder-api/users/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      const payload = await readJsonResponse<UserResponse>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(resolveApiErrorMessage(response, payload, 'No se pudo eliminar el usuario.'));
      }

      toast.success('Usuario eliminado');
      setDeleteTarget(null);
      await loadUsers(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'No se pudo conectar con el recorder local.';
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="border-slate-200 bg-white/95 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <ShieldCheck className="h-5 w-5 text-sky-600" />
          Usuarios y permisos
        </CardTitle>
        <CardAction className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => void loadUsers(true)} disabled={isLoading || isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
          <Button type="button" className="bg-sky-600 text-white hover:bg-sky-700" onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar usuario
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-5">
        {errorMessage ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-[230px]">Usuario</TableHead>
                <TableHead className="w-[160px]">Rol</TableHead>
                <TableHead className="w-[140px]">Cliente</TableHead>
                <TableHead className="w-[170px]">Estado</TableHead>
                <TableHead className="w-[170px] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-slate-500">
                    Cargando usuarios...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-sm text-slate-500">
                    Aún no hay usuarios creados.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((candidate) => {
                  const isCurrentUser = candidate.id === currentUser?.id;
                  const canDelete =
                    !isCurrentUser && !(candidate.role === 'administrator' && activeAdminCount <= 1);

                  return (
                    <TableRow key={candidate.id} className={isCurrentUser ? 'bg-sky-50/60' : undefined}>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900">{candidate.displayName}</p>
                            {isCurrentUser ? (
                              <Badge variant="secondary" className="bg-sky-100 text-sky-800">
                                Tú
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">{candidate.login}</p>
                          <p className="text-xs text-slate-400">Último ingreso: {formatDateTime(candidate.lastLoginAt)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant={candidate.role === 'administrator' ? 'default' : 'outline'}
                          className="capitalize"
                        >
                          {roleLabel(candidate.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        {clientLabel(candidate) ? (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                            {clientLabel(candidate)}
                          </Badge>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="space-y-1">
                          <Badge variant={candidate.isActive ? 'default' : 'outline'} className="capitalize">
                            {candidate.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                          <p className="text-xs text-slate-500">Última conexión {formatDateTime(candidate.updatedAt)}</p>
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => openEditDialog(candidate)}>
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Editar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                            disabled={!canDelete || isDeleting}
                            onClick={() => setDeleteTarget(candidate)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Eliminar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={isEditorOpen} onOpenChange={(open) => (open ? setIsEditorOpen(true) : closeEditor())}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Editar usuario' : 'Agregar usuario'}</DialogTitle>
            <DialogDescription>
              {editingUser
                ? 'Actualiza el perfil, su alcance y su estado. Si dejas la clave vacía, se mantiene la actual.'
                : 'Crea un nuevo perfil con login, rol y cliente asignado.'}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-login">Login</Label>
                <Input
                  id="user-login"
                  value={form.login}
                  onChange={(event) => setForm((current) => ({ ...current, login: event.target.value }))}
                  placeholder="simon@phigital.cl"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-display-name">Nombre visible</Label>
                <Input
                  id="user-display-name"
                  value={form.displayName}
                  onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                  placeholder="Simón Phigital"
                  autoComplete="name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-role">Rol</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) =>
                    setForm((current) => {
                      const nextRole = value as AuthRole;
                      return {
                        ...current,
                        role: nextRole,
                        clientCode: selectClientCodeForRole(nextRole, current.clientCode),
                      };
                    })
                  }
                >
                  <SelectTrigger id="user-role">
                    <SelectValue placeholder="Selecciona un rol" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-client">Cliente</Label>
                <Select
                  value={form.role === 'administrator' ? '' : form.clientCode}
                  onValueChange={(value) => setForm((current) => ({ ...current, clientCode: value }))}
                  disabled={form.role === 'administrator'}
                >
                  <SelectTrigger id="user-client">
                    <SelectValue placeholder={form.role === 'administrator' ? 'No aplica' : 'Selecciona un cliente'} />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="user-password">
                  {editingUser ? 'Nueva contraseña' : 'Contraseña inicial'}
                </Label>
                <Input
                  id="user-password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder={editingUser ? 'Dejar vacío para mantener la actual' : 'Clave temporal'}
                  autoComplete={editingUser ? 'new-password' : 'current-password'}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">Usuario activo</p>
                  <p className="text-xs text-slate-500">Solo los usuarios activos pueden iniciar sesión.</p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
                />
              </div>
            </div>

            {formError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {formError}
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeEditor} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-sky-600 text-white hover:bg-sky-700" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : editingUser ? 'Guardar cambios' : 'Crear usuario'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  Vas a eliminar a <strong>{deleteTarget.displayName}</strong> ({deleteTarget.login}).
                  Esta acción borra su acceso y sus sesiones activas.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                void confirmDelete();
              }}
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
