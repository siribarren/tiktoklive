const TIKTOK_USERNAME_ALLOWED_CHARACTERS = /[^a-zA-Z0-9._-]/g;
const MIN_TIKTOK_USERNAME_LENGTH = 2;
const MAX_TIKTOK_USERNAME_LENGTH = 24;
const DEFAULT_POPUP_WIDTH = 390;
const DEFAULT_POPUP_HEIGHT = 844;

function normalizeTikTokInput(input: string): string {
  return input.replace(/\s+/g, '').replace(/^@+/, '');
}

function buildPopupWindowName(username: string): string {
  const safeWindowToken = username.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `ember_tiktok_live_${safeWindowToken || 'unknown'}`;
}

export function sanitizeTikTokUsername(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  const normalizedInput = normalizeTikTokInput(input);
  const sanitized = normalizedInput.replace(TIKTOK_USERNAME_ALLOWED_CHARACTERS, '');
  return sanitized;
}

export function isValidTikTokUsername(input: string): boolean {
  const sanitized = sanitizeTikTokUsername(input);
  return (
    sanitized.length >= MIN_TIKTOK_USERNAME_LENGTH &&
    sanitized.length <= MAX_TIKTOK_USERNAME_LENGTH
  );
}

export function buildTikTokLiveUrl(username: string): string {
  const sanitized = sanitizeTikTokUsername(username);
  return `https://www.tiktok.com/@${sanitized}/live`;
}

export function buildTikTokProfileUrl(username: string): string {
  const sanitized = sanitizeTikTokUsername(username);
  return `https://www.tiktok.com/@${sanitized}`;
}

export function buildChromeAppModeCommand(username: string): string {
  const sanitized = sanitizeTikTokUsername(username);
  const liveUrl = buildTikTokLiveUrl(sanitized);

  return `open -na "Google Chrome" --args --new-window --app="${liveUrl}" --window-size=${DEFAULT_POPUP_WIDTH},${DEFAULT_POPUP_HEIGHT}`;
}

export function openTikTokLivePopup(username: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!isValidTikTokUsername(username)) {
    return;
  }

  const sanitized = sanitizeTikTokUsername(username);
  if (!sanitized) {
    return;
  }

  const features = [
    `width=${DEFAULT_POPUP_WIDTH}`,
    `height=${DEFAULT_POPUP_HEIGHT}`,
    'resizable=yes',
    'scrollbars=yes',
    'toolbar=no',
    'menubar=no',
    'location=no',
    'status=no',
  ].join(',');

  const popup = window.open(
    buildTikTokLiveUrl(sanitized),
    buildPopupWindowName(sanitized),
    features,
  );

  if (popup) {
    popup.focus();
  }
}
