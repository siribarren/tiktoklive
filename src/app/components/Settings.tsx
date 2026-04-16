import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Settings as SettingsIcon, Bell, Shield, Database } from 'lucide-react';

export function Settings() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Configuracion</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configura preferencias y parametros de la plataforma
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="w-5 h-5" />
              Ajustes generales
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre de la organizacion</Label>
              <Input defaultValue="LeadIntel Corp" />
            </div>
            <div className="space-y-2">
              <Label>Zona horaria</Label>
              <Input defaultValue="America/Santiago (GMT-3)" />
            </div>
            <div className="space-y-2">
              <Label>Idioma predeterminado</Label>
              <Input defaultValue="Espanol" />
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700">
              Guardar cambios
            </Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notificaciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Alertas de nuevos leads
                </p>
                <p className="text-xs text-gray-500">
                  Recibe avisos cuando se detecten leads de alto score
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Inicio de live
                </p>
                <p className="text-xs text-gray-500">
                  Avisa cuando una cuenta monitoreada entre en vivo
                </p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Resumen diario por correo
                </p>
                <p className="text-xs text-gray-500">Recibe un reporte diario de metricas</p>
              </div>
              <Switch />
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Seguridad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Clave API</Label>
              <Input type="password" defaultValue="••••••••••••••••" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Autenticacion de dos factores
                </p>
                <p className="text-xs text-gray-500">Agrega una capa extra de seguridad</p>
              </div>
              <Switch />
            </div>
            <Button variant="outline" className="w-full">
              Cambiar contrasena
            </Button>
          </CardContent>
        </Card>

        {/* Data & Storage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Datos y almacenamiento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Retencion de datos
                </p>
                <p className="text-xs text-gray-500">Conservar mensajes durante 90 dias</p>
              </div>
              <Button variant="outline" size="sm">
                Configurar
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  Archivado automatico de leads
                </p>
                <p className="text-xs text-gray-500">
                  Archiva leads contactados despues de 30 dias
                </p>
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
