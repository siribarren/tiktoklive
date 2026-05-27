'use client';

import { useMemo } from 'react';
import { AlertTriangle, BatteryFull, Eye, Radio, Signal, Wifi } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { cn } from '../ui/utils';
import {
  buildTikTokLiveUrl,
  buildTikTokProfileUrl,
  isValidTikTokUsername,
  sanitizeTikTokUsername,
} from '@/lib/tiktok-live';
import { TikTokLiveViewerActions } from './tiktok-live-viewer-actions';

export type TikTokPhoneLiveViewerProps = {
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isLive?: boolean;
  isLoading?: boolean;
  viewerCount?: number;
  leadCount?: number;
  confidenceScore?: number;
  lastMessage?: string;
  mode?: 'compact' | 'default' | 'expanded';
  showActions?: boolean;
  className?: string;
};

const modeClassMap: Record<NonNullable<TikTokPhoneLiveViewerProps['mode']>, string> = {
  compact: 'max-w-[220px]',
  default: 'max-w-[280px]',
  expanded: 'max-w-[370px]',
};

function formatCompactNumber(value?: number): string | null {
  if (typeof value !== 'number') {
    return null;
  }

  return new Intl.NumberFormat('es-CL').format(value);
}

function buildStatusTimeLabel(): string {
  const now = new Date();
  if (Number.isNaN(now.getTime())) {
    return '9:41';
  }

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function TikTokPhoneLiveViewer({
  username,
  displayName,
  avatarUrl,
  isLive = false,
  isLoading = false,
  viewerCount,
  mode = 'default',
  showActions = true,
  className,
}: TikTokPhoneLiveViewerProps) {
  const sanitizedUsername = useMemo(() => sanitizeTikTokUsername(username), [username]);
  const isValidUsername = useMemo(
    () => isValidTikTokUsername(sanitizedUsername),
    [sanitizedUsername],
  );
  const liveUrl = useMemo(() => buildTikTokLiveUrl(sanitizedUsername), [sanitizedUsername]);
  const profileUrl = useMemo(
    () => buildTikTokProfileUrl(sanitizedUsername),
    [sanitizedUsername],
  );
  const statusTime = useMemo(buildStatusTimeLabel, []);
  const viewerCountLabel = useMemo(() => formatCompactNumber(viewerCount), [viewerCount]);

  const accountName = displayName?.trim() || sanitizedUsername || 'Cuenta TikTok';
  const accountHandle = sanitizedUsername ? `@${sanitizedUsername}` : '@cuenta';
  const hasError = !isLoading && !isValidUsername;
  const isOffline = !isLoading && isValidUsername && !isLive;
  const isLiveState = !isLoading && isValidUsername && isLive;

  return (
    <div className={cn('w-full space-y-3', className)}>
      <div className={cn('mx-auto w-full', modeClassMap[mode])}>
        <div className="rounded-[2.8rem] bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-2 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ring-1 ring-white/10">
          <div className="relative aspect-[9/19.5] overflow-hidden rounded-[2.35rem] border border-white/15 bg-black">
            <div className="pointer-events-none absolute inset-[2px] rounded-[2.15rem] border border-white/10" />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 15% 10%, rgba(244,114,182,0.18), transparent 38%), radial-gradient(circle at 85% 15%, rgba(59,130,246,0.2), transparent 35%), radial-gradient(circle at 50% 75%, rgba(34,197,94,0.12), transparent 45%)',
              }}
            />

            <div
              className="absolute left-1/2 top-2 z-40 h-7 w-32 -translate-x-1/2 rounded-full bg-black/90 ring-1 ring-white/10"
              aria-hidden
            />

            <div className="absolute inset-x-0 top-0 z-30 px-5 pt-3 text-[11px] font-medium text-white">
              <div className="flex items-center justify-between">
                <span className="tracking-wide">{statusTime}</span>
                <div className="flex items-center gap-1.5">
                  <Signal className="size-3.5" aria-hidden />
                  <Wifi className="size-3.5" aria-hidden />
                  <BatteryFull className="size-3.5" aria-hidden />
                </div>
              </div>
            </div>

            <div className="relative z-20 flex h-full flex-col px-3 pb-3 pt-12">
              {isLoading ? (
                <Skeleton className="h-full rounded-[1.8rem] bg-white/15" />
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={cn(
                        'border px-2 py-0.5 text-[10px] font-semibold uppercase',
                        hasError
                          ? 'border-amber-200/70 bg-amber-500/15 text-amber-100'
                          : isLiveState
                            ? 'border-red-300/70 bg-red-500/20 text-red-100'
                            : 'border-zinc-400/60 bg-zinc-600/20 text-zinc-100',
                      )}
                    >
                      {hasError ? (
                        <>
                          <AlertTriangle className="mr-1 size-3" /> Error
                        </>
                      ) : isLiveState ? (
                        <>
                          <Radio className="mr-1 size-3" /> En vivo
                        </>
                      ) : (
                        'Offline'
                      )}
                    </Badge>

                    {viewerCountLabel ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-zinc-100 ring-1 ring-white/15">
                        <Eye className="size-3" aria-hidden />
                        {viewerCountLabel}
                      </span>
                    ) : null}
                  </div>

                  <div className="relative flex-1 overflow-hidden rounded-[1.8rem] border border-white/10 bg-black/60">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={accountName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{
                          background:
                            'linear-gradient(180deg, rgba(42,67,119,0.9) 0%, rgba(25,32,51,0.95) 52%, rgba(12,14,22,0.98) 100%)',
                        }}
                      />
                    )}

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/45" />

                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <div className="rounded-xl bg-black/45 px-3 py-2 backdrop-blur-sm ring-1 ring-white/10">
                        <p className="truncate text-sm font-semibold text-white">{accountName}</p>
                        <p className="truncate text-xs text-zinc-300">{accountHandle}</p>
                      </div>
                    </div>

                    {hasError ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4">
                        <div className="max-w-[220px] space-y-2 text-center">
                          <p className="text-sm font-medium text-amber-100">
                            No se pudo preparar el Live
                          </p>
                          <Button asChild size="sm" variant="outline" className="border-amber-300/50 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20">
                            <a href="https://www.tiktok.com/" target="_blank" rel="noreferrer">
                              Abrir en TikTok
                            </a>
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {isOffline ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-4">
                        <div className="max-w-[220px] space-y-2 text-center">
                          <p className="text-sm font-medium text-zinc-100">Live no disponible</p>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="border-zinc-300/30 bg-zinc-900/50 text-zinc-100 hover:bg-zinc-800"
                          >
                            <a href={profileUrl} target="_blank" rel="noreferrer">
                              Abrir perfil
                            </a>
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {showActions ? (
        <TikTokLiveViewerActions
          username={sanitizedUsername || username}
          variant={mode === 'compact' ? 'compact' : 'default'}
        />
      ) : null}

      {showActions && !isLoading && isValidUsername ? (
        <a
          href={liveUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-center text-xs text-zinc-500 hover:text-zinc-300"
        >
          Abrir {accountHandle} en TikTok
        </a>
      ) : null}
    </div>
  );
}
