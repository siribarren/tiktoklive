import { FormEvent, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';

import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { useAuth } from '../auth/auth';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-3">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        <p className="text-sm text-white/70">Validando credenciales...</p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading, login } = useAuth();
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const redirectTo = useMemo(() => {
    const state = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
    const from = state?.from;
    const pathname = from?.pathname?.trim();
    if (!pathname) {
      return '/';
    }
    return `${pathname}${from?.search ?? ''}${from?.hash ?? ''}`;
  }, [location.state]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await login(loginValue.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('No se pudo iniciar sesión.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="relative isolate overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.26),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(59,130,246,0.28),_transparent_28%),linear-gradient(145deg,_#020617_0%,_#0f172a_45%,_#111827_100%)]" />
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:48px_48px]" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-6 py-8 lg:flex-row lg:items-center lg:gap-16 lg:px-10">
          <section className="max-w-2xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-white/85 backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-sky-300" />
              Gestión integral de Leads
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Ember
                <span className="block max-w-xl text-[0.72rem] font-thin italic leading-5 tracking-[0.02em] text-slate-400/75 sm:text-[0.8rem]">
                  "A piece of wood or coal, etc. that continues to burn after a fire has no more flames"
                  (Un trozo de madera o carbón, etc., que continúa ardiendo después de que el fuego ya no tiene llamas)
                </span>
                <span className="block text-sky-300">Operación de cuentas, leads y mensajes</span>
              </h1>
              <p className="max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
                Inicia sesión para entrar al dashboard, ver las cuentas de tu cliente y trabajar
                con una vista protegida por permisos.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  title: 'Administrador',
                  text: 'Acceso total a cuentas, reglas, configuración y sesión.',
                },
                {
                  title: 'Cliente',
                  text: 'Visión acotada a sus cuentas, mensajes, leads y métricas.',
                },
                {
                  title: 'Supervisor',
                  text: 'Monitoreo de un solo cliente, sin ver áreas globales.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/12 bg-white/6 p-4 backdrop-blur"
                >
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="w-full max-w-md">
            <Card className="border-white/10 bg-slate-900/80 text-white shadow-2xl shadow-sky-950/30 backdrop-blur-xl">
              <CardContent className="space-y-6 p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/20">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Inicio de sesión</p>
                    <h2 className="text-2xl font-semibold">Bienvenido</h2>
                  </div>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Login</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <Input
                        value={loginValue}
                        onChange={(event) => setLoginValue(event.target.value)}
                        className="h-11 border-white/10 bg-slate-950/70 pl-10 text-white placeholder:text-slate-500 focus:border-sky-400 focus:ring-sky-400/20"
                        placeholder="simon@phigital.cl"
                        autoComplete="username"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Contraseña</label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <Input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-11 border-white/10 bg-slate-950/70 pl-10 text-white placeholder:text-slate-500 focus:border-sky-400 focus:ring-sky-400/20"
                        placeholder="••••••••"
                        autoComplete="current-password"
                        required
                      />
                    </div>
                  </div>

                  {errorMessage ? (
                    <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                      {errorMessage}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    className="h-11 w-full bg-sky-500 font-semibold text-slate-950 hover:bg-sky-400"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Ingresando...' : 'Entrar'}
                  </Button>
                </form>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  La sesión se guarda en este navegador para mantener el acceso entre recargas.
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
