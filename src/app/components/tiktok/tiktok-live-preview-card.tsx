'use client';

import { useMemo, useState } from 'react';
import { Eye } from 'lucide-react';

import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { cn } from '../ui/utils';
import {
  isValidTikTokUsername,
  sanitizeTikTokUsername,
} from '@/lib/tiktok-live';
import { TikTokPhoneLiveViewer } from './tiktok-phone-live-viewer';
import { TikTokPhoneLiveModal } from './tiktok-phone-live-modal';
import { TikTokLiveViewerActions } from './tiktok-live-viewer-actions';

export type TikTokLivePreviewCardProps = {
  username: string;
  displayName?: string;
  avatarUrl?: string;
  isLive?: boolean;
  viewerCount?: number;
  leadCount?: number;
  confidenceScore?: number;
  lastMessage?: string;
};

function formatNumber(value?: number): string {
  if (typeof value !== 'number') {
    return 'Sin datos';
  }

  return new Intl.NumberFormat('es-CL').format(value);
}

export function TikTokLivePreviewCard({
  username,
  displayName,
  avatarUrl,
  isLive = false,
  viewerCount,
  leadCount,
  lastMessage,
}: TikTokLivePreviewCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sanitizedUsername = useMemo(() => sanitizeTikTokUsername(username), [username]);
  const isValidUsername = useMemo(
    () => isValidTikTokUsername(sanitizedUsername),
    [sanitizedUsername],
  );
  const accountHandle = sanitizedUsername ? `@${sanitizedUsername}` : '@cuenta';

  return (
    <>
      <Card className="border-zinc-800 bg-zinc-950 text-zinc-100 shadow-lg">
        <CardHeader className="pb-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Vista previa TikTok Live</CardTitle>
              <p className="mt-1 text-sm text-zinc-400">
                Simulacion visual tipo smartphone para el dashboard.
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                'border px-2 py-1 text-xs',
                !isValidUsername
                  ? 'border-amber-300/40 bg-amber-400/10 text-amber-100'
                  : isLive
                    ? 'border-red-300/40 bg-red-500/10 text-red-100'
                    : 'border-zinc-600/50 bg-zinc-600/10 text-zinc-200',
              )}
            >
              {isValidUsername ? (isLive ? 'En vivo' : 'Offline') : 'Username invalido'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="mx-auto w-full max-w-[250px]">
            <TikTokPhoneLiveViewer
              username={sanitizedUsername || username}
              displayName={displayName}
              avatarUrl={avatarUrl}
              isLive={isLive}
              viewerCount={viewerCount}
              leadCount={leadCount}
              lastMessage={lastMessage}
              mode="compact"
              showActions={false}
            />
          </div>

          <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm sm:grid-cols-2">
            <p className="text-zinc-300">Cuenta: <span className="text-zinc-100">{accountHandle}</span></p>
            <p className="text-zinc-300">Nombre: <span className="text-zinc-100">{displayName || 'Sin nombre'}</span></p>
            <p className="text-zinc-300">Espectadores: <span className="text-zinc-100">{formatNumber(viewerCount)}</span></p>
            <p className="text-zinc-300">Leads: <span className="text-zinc-100">{formatNumber(leadCount)}</span></p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => setIsModalOpen(true)}
              aria-label="Ver Live en modal"
            >
              <Eye className="size-4" />
              Ver Live
            </Button>

            <div className="ml-auto">
              <TikTokLiveViewerActions
                username={sanitizedUsername || username}
                variant="compact"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <TikTokPhoneLiveModal
        username={sanitizedUsername || username}
        displayName={displayName}
        avatarUrl={avatarUrl}
        isLive={isLive}
        viewerCount={viewerCount}
        leadCount={leadCount}
        lastMessage={lastMessage}
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
      />
    </>
  );
}
