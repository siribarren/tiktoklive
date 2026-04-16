import { Outlet, Link, useLocation } from 'react-router';
import {
  LayoutDashboard,
  Radio,
  MessageSquare,
  Users,
  Building2,
  Settings,
  Search,
  Filter,
  User,
  Sparkles,
} from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Sesiones en vivo', href: '/live-sessions', icon: Radio },
  { name: 'Mensajes', href: '/messages', icon: MessageSquare },
  { name: 'Leads', href: '/leads', icon: Sparkles },
  { name: 'Cuentas', href: '/accounts', icon: Building2 },
  { name: 'Reglas', href: '/rules', icon: Settings },
  { name: 'Configuracion', href: '/settings', icon: Settings },
];

export function DashboardLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">LeadIntel</h1>
              <p className="text-xs text-gray-500">TikTok LIVE</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-gray-200">
                <User className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                Usuario administrador
              </p>
              <p className="text-xs text-gray-500 truncate">admin@leadintel.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div className="flex items-center gap-4 flex-1 max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Buscar usuarios, mensajes o leads..."
                className="pl-10 bg-gray-50 border-gray-200"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="w-4 h-4" />
              Filtros
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-gray-600">2 sesiones activas</span>
            </div>
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-blue-600 text-white">
                <User className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
