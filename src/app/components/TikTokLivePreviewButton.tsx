import { Button } from './ui/button';

interface TikTokLivePreviewButtonProps {
  username: string;
  label?: string;
  onFeedback?: (message: string) => void;
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
}

function normalizeTikTokUsername(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/^@+/, '').trim();
}

function buildWindowName(username: string): string {
  const safeUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return `ember_tiktok_live_${safeUsername || 'unknown'}`;
}

export function TikTokLivePreviewButton({
  username,
  label = 'Ver Live',
  onFeedback,
  className,
  disabled = false,
  disabledReason,
}: TikTokLivePreviewButtonProps) {
  const handleOpenLive = () => {
    if (disabled) {
      if (disabledReason) {
        onFeedback?.(disabledReason);
      }
      return;
    }

    const normalizedUsername = normalizeTikTokUsername(username);
    if (!normalizedUsername) {
      onFeedback?.('No se pudo abrir el Live: la cuenta TikTok no es válida.');
      return;
    }

    const liveUrl = `https://www.tiktok.com/@${normalizedUsername}/live`;
    const windowName = buildWindowName(normalizedUsername);
    const windowFeatures = 'width=430,height=820,resizable=yes,scrollbars=yes';
    const previewWindow = window.open(liveUrl, windowName, windowFeatures);

    if (!previewWindow) {
      onFeedback?.('El navegador bloqueó la ventana emergente. Habilita popups para Ember.');
      return;
    }

    try {
      previewWindow.focus();
    } catch {
      // No-op: some browsers may restrict focus calls, but the window still opens/reuses.
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={handleOpenLive}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
    >
      {label}
    </Button>
  );
}
