'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  buildTikTokLiveUrl,
  isValidTikTokUsername,
  openTikTokLivePopup,
  sanitizeTikTokUsername,
} from '@/lib/tiktok-live';
import { TikTokLiveViewerActions } from './tiktok-live-viewer-actions';

export type TikTokPhoneLiveModalProps = {
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isLive?: boolean;
  playbackUrl?: string | null;
  viewerCount?: number;
  leadCount?: number;
  messageCount?: number;
  streamStartedAt?: Date | null;
  confidenceScore?: number;
  lastMessage?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatValue(value?: number): string {
  if (typeof value !== 'number') {
    return 'Sin datos';
  }

  return new Intl.NumberFormat('es-CL').format(value);
}

function formatStartTime(value?: Date | null): string {
  if (!value || Number.isNaN(value.getTime())) {
    return 'Sin datos';
  }

  return value.toLocaleString('es-CL', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatElapsedTime(startedAt: Date | null | undefined, nowMs: number): string {
  if (!startedAt || Number.isNaN(startedAt.getTime())) {
    return 'Sin datos';
  }

  const diffMs = Math.max(0, nowMs - startedAt.getTime());
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function TikTokPhoneLiveModal({
  username,
  isLive = false,
  playbackUrl,
  viewerCount,
  leadCount,
  messageCount,
  streamStartedAt,
  open,
  onOpenChange,
}: TikTokPhoneLiveModalProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<'idle' | 'loading' | 'ready' | 'playing'>('idle');
  const [needsManualPlay, setNeedsManualPlay] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const sanitizedUsername = sanitizeTikTokUsername(username);
  const isValidUsername = isValidTikTokUsername(sanitizedUsername);
  const accountHandle = sanitizedUsername ? `@${sanitizedUsername}` : '@cuenta';
  const liveUrl = useMemo(
    () => buildTikTokLiveUrl(sanitizedUsername || username),
    [sanitizedUsername, username],
  );
  const elapsedTime = useMemo(
    () => formatElapsedTime(streamStartedAt, nowMs),
    [streamStartedAt, nowMs],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [open]);

  const handleOpenLive = () => {
    if (!isValidUsername) {
      return;
    }
    openTikTokLivePopup(sanitizedUsername || username);
  };

  const playVideo = async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    try {
      await video.play();
      setNeedsManualPlay(false);
      setPlayerState('playing');
    } catch {
      setNeedsManualPlay(true);
      setPlayerState('ready');
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    setPlayerError(null);
    setPlayerState('loading');
    setNeedsManualPlay(false);
    video.pause();
    video.removeAttribute('src');
    video.load();

    if (!isLive || !playbackUrl) {
      setPlayerState('idle');
      return;
    }

    const onVideoError = () => {
      const errorCode = video.error?.code ? ` Código ${video.error.code}.` : '';
      setPlayerError(`No se pudo cargar el stream en el reproductor.${errorCode}`);
      setPlayerState('idle');
    };
    const onLoadedMetadata = () => {
      setPlayerState('ready');
    };
    const onPlaying = () => {
      setNeedsManualPlay(false);
      setPlayerState('playing');
    };
    const onWaiting = () => {
      setPlayerState('loading');
    };
    video.addEventListener('error', onVideoError);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('waiting', onWaiting);

    const nativeHls = video.canPlayType('application/vnd.apple.mpegurl') !== '';
    if (nativeHls) {
      video.src = playbackUrl;
      void playVideo();
      return () => {
        video.removeEventListener('error', onVideoError);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('waiting', onWaiting);
      };
    }

    let disposed = false;
    let hlsInstance: {
      destroy: () => void;
      startLoad?: () => void;
      recoverMediaError?: () => void;
    } | null = null;

    void (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (disposed) {
          return;
        }

        if (!Hls.isSupported()) {
          setPlayerError('Tu navegador no soporta reproducción HLS en esta vista.');
          return;
        }

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });
        hlsInstance = hls;
        hls.loadSource(playbackUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setPlayerState('ready');
          void playVideo();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              hls.startLoad();
              return;
            }
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            setPlayerError(`No se pudo reproducir el stream HLS (${data.details ?? data.type}).`);
            setPlayerState('idle');
          }
        });
      } catch {
        setPlayerError('No se pudo inicializar el reproductor HLS.');
        setPlayerState('idle');
      }
    })();

    return () => {
      disposed = true;
      hlsInstance?.destroy();
      video.removeEventListener('error', onVideoError);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('waiting', onWaiting);
    };
  }, [open, isLive, playbackUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] overflow-hidden border-zinc-800 bg-zinc-950 p-5 text-zinc-100 sm:max-w-6xl sm:p-6">
        <div className="flex h-full min-h-0 w-full flex-col gap-4">
          <DialogHeader className="shrink-0 pr-10">
            <DialogTitle>Ver Live: {accountHandle}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Monitoreando a {accountHandle}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(300px,390px)_1fr]">
            <Card className="min-h-0 border-zinc-800 bg-zinc-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-zinc-100">Transmisión</CardTitle>
              </CardHeader>
              <CardContent className="h-full min-h-0 pt-0">
                <div className="mx-auto h-full w-full max-w-[390px]">
                  <div className="flex h-full min-h-[300px] items-center justify-center overflow-hidden rounded-3xl border border-zinc-700 bg-black p-4 text-center">
                    <div className="w-full">
                      {isValidUsername && isLive && playbackUrl ? (
                        <div className="w-full space-y-3">
                          <div className="relative overflow-hidden rounded-2xl bg-black">
                            <video
                              ref={videoRef}
                              className="aspect-[9/16] max-h-[62vh] min-h-[420px] w-full bg-black object-contain"
                              controls
                              playsInline
                              muted
                              autoPlay
                              crossOrigin="anonymous"
                            />
                            {needsManualPlay ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="bg-blue-600 hover:bg-blue-700"
                                  onClick={() => {
                                    void playVideo();
                                  }}
                                >
                                  Reproducir transmisión
                                </Button>
                              </div>
                            ) : null}
                          </div>
                          {playerError ? (
                            <p className="text-xs text-amber-200">{playerError}</p>
                          ) : (
                            <p className="text-xs text-zinc-400">
                              {playerState === 'playing'
                                ? 'Reproduciendo transmisión en vivo.'
                                : playerState === 'ready'
                                  ? 'Transmisión lista para reproducir.'
                                  : 'Cargando transmisión en vivo...'}
                            </p>
                          )}
                        </div>
                      ) : isValidUsername && isLive ? (
                        <div className="mx-auto max-w-[280px] space-y-3">
                          <p className="text-sm font-medium text-zinc-100">
                            La cuenta está en vivo, pero TikTok no entregó URL de playback.
                          </p>
                          <p className="text-xs text-zinc-400">
                            Esto suele pasar en lives con restricción de edad o permisos.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={handleOpenLive}
                          >
                            Abrir Live en ventana
                          </Button>
                        </div>
                      ) : isValidUsername ? (
                        <div className="mx-auto max-w-[280px] space-y-3">
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                          >
                            <a href={liveUrl} target="_blank" rel="noreferrer">
                              Abrir perfil
                            </a>
                          </Button>
                        </div>
                      ) : (
                        <div className="mx-auto max-w-[280px] space-y-3">
                          <p className="text-xs text-amber-200">
                            Username inválido para visualizar el Live.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="min-h-0 border-zinc-800 bg-zinc-900/60">
              <CardHeader className="pb-0">
                <CardTitle className="text-base text-zinc-100">Resumen de cuenta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Espectadores</p>
                    <p className="mt-1 text-sm font-medium text-zinc-100">{formatValue(viewerCount)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Leads detectados</p>
                    <p className="mt-1 text-sm font-medium text-zinc-100">{formatValue(leadCount)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Total de mensajes</p>
                    <p className="mt-1 text-sm font-medium text-zinc-100">{formatValue(messageCount)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Hora de inicio de transmisión</p>
                    <p className="mt-1 text-sm font-medium text-zinc-100">{formatStartTime(streamStartedAt)}</p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 sm:col-span-2">
                    <p className="text-xs uppercase tracking-wide text-zinc-400">Tiempo de transmisión transcurrido</p>
                    <p className="mt-1 text-sm font-medium text-zinc-100">{elapsedTime}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">Acciones</p>
                  <TikTokLiveViewerActions username={sanitizedUsername || username} />
                </div>

                {!isValidUsername ? (
                  <p className="text-xs text-amber-200">Username inválido: revisa la cuenta antes de abrir acciones.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
