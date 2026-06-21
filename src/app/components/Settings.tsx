import { Bell, Database, Settings as SettingsIcon, Shield } from 'lucide-react';

import { UserManagementCard } from './UserManagementCard';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';

export function Settings() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Configuración</h1>
        <p className="mt-1 text-sm text-gray-500">Configura preferencias y parámetros de la plataforma</p>
      </div>

      <UserManagementCard />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              Ajustes generales
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Zona horaria</Label>
              <Input defaultValue="America/Santiago (GMT-3)" />
            </div>
            <div className="space-y-2">
              <Label>Idioma predeterminado</Label>
              <Input defaultValue="Español" />
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700">Guardar cambios</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificaciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Alertas de nuevos leads</p>
                <p className="text-xs text-gray-500">Recibe avisos cuando se detecten leads de alto puntaje</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Inicio de live</p>
                <p className="text-xs text-gray-500">Avisa cuando una cuenta monitoreada entre en vivo</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Resumen diario por correo</p>
                <p className="text-xs text-gray-500">Recibe un reporte diario de métricas</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Seguridad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Clave API</Label>
              <Input type="password" defaultValue="••••••••••••••••" />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Autenticación de dos factores</p>
                <p className="text-xs text-gray-500">Agrega una capa extra de seguridad</p>
              </div>
              <Switch />
            </div>
            <Button variant="outline" className="w-full">
              Cambiar contraseña
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Datos y almacenamiento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Retención de datos</p>
                <p className="text-xs text-gray-500">Conservar mensajes durante 90 días</p>
              </div>
              <Button variant="outline" size="sm">
                Configurar
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Archivado automático de leads</p>
                <p className="text-xs text-gray-500">Archiva leads contactados después de 30 días</p>
              </div>
              <Switch defaultChecked />
            </div>
            <Button variant="outline" className="w-full text-red-600 hover:text-red-700">
              Exportar todos los datos
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
