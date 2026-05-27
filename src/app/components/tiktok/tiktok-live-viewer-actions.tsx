'use client';

import { useMemo } from 'react';
import {
  Copy,
  ExternalLink,
  Terminal,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../ui/utils';
import {
  buildChromeAppModeCommand,
  buildTikTokLiveUrl,
  isValidTikTokUsername,
  openTikTokLivePopup,
  sanitizeTikTokUsername,
} from '@/lib/tiktok-live';

export type TikTokLiveViewerActionsProps = {
  username: string;
  variant?: 'default' | 'compact';
};

async function copyToClipboard(value: string): Promise<boolean> {
  if (typeof navigator === 'undefined') {
    return false;
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function TikTokLiveViewerActions({
  username,
  variant = 'default',
}: TikTokLiveViewerActionsProps) {
  const sanitizedUsername = useMemo(() => sanitizeTikTokUsername(username), [username]);
  const isValidUsername = useMemo(
    () => isValidTikTokUsername(sanitizedUsername),
    [sanitizedUsername],
  );
  const liveUrl = useMemo(
    () => buildTikTokLiveUrl(sanitizedUsername),
    [sanitizedUsername],
  );
  const appModeCommand = useMemo(
    () => buildChromeAppModeCommand(sanitizedUsername),
    [sanitizedUsername],
  );

  const notifyInvalidUsername = () => {
    toast.error('Username inválido');
  };

  const handleOpenLive = () => {
    if (!isValidUsername) {
      notifyInvalidUsername();
      return;
    }

    openTikTokLivePopup(sanitizedUsername);
  };

  const handleCopyLink = async () => {
    if (!isValidUsername) {
      notifyInvalidUsername();
      return;
    }

    const wasCopied = await copyToClipboard(liveUrl);
    if (!wasCopied) {
      toast.error('No se pudo copiar el enlace');
      return;
    }

    toast.success('Enlace copiado');
  };

  const handleCopyAppModeCommand = async () => {
    if (!isValidUsername) {
      notifyInvalidUsername();
      return;
    }

    const wasCopied = await copyToClipboard(appModeCommand);
    if (!wasCopied) {
      toast.error('No se pudo copiar el comando');
      return;
    }

    toast.success('Comando modo app copiado');
  };

  const isCompact = variant === 'compact';
  const buttonSize = isCompact ? 'icon' : 'sm';
  const liveLabel = isCompact ? null : 'Abrir Live';
  const linkLabel = isCompact ? null : 'Copiar enlace';
  const appLabel = isCompact ? null : 'Copiar modo app';

  return (
    <div className={cn('flex flex-wrap items-center gap-2')}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={buttonSize}
            disabled={!isValidUsername}
            onClick={handleOpenLive}
            className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
            aria-label="Abrir Live"
          >
            <ExternalLink className="size-4" />
            {liveLabel}
          </Button>
        </TooltipTrigger>
        <TooltipContent sideOffset={8}>Abrir ventana 390x844</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={buttonSize}
            disabled={!isValidUsername}
            onClick={() => void handleCopyLink()}
            className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
            aria-label="Copiar enlace del Live"
          >
            <Copy className="size-4" />
            {linkLabel}
          </Button>
        </TooltipTrigger>
        <TooltipContent sideOffset={8}>Copiar URL del Live</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={buttonSize}
            disabled={!isValidUsername}
            onClick={() => void handleCopyAppModeCommand()}
            className="border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white"
            aria-label="Copiar comando modo app"
          >
            <Terminal className="size-4" />
            {appLabel}
          </Button>
        </TooltipTrigger>
        <TooltipContent sideOffset={8}>Copiar comando de Chrome en modo app</TooltipContent>
      </Tooltip>
    </div>
  );
}
