function normalizeUniqueId(value) {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function normalizeClientKey(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'WOM' || normalized === 'CLARO') {
    return normalized;
  }
  if (normalized.includes('WOM')) {
    return 'WOM';
  }
  if (normalized.includes('CLARO')) {
    return 'CLARO';
  }
  return '';
}

const CLIENT_ACCOUNT_REGISTRY = new Map();

export function registerClientAccounts(accounts = []) {
  CLIENT_ACCOUNT_REGISTRY.clear();

  for (const account of accounts) {
    const uniqueId = normalizeUniqueId(
      account?.uniqueId ?? account?.accountUniqueId ?? account?.username ?? account?.id
    );
    if (!uniqueId) {
      continue;
    }

    const campaign = normalizeClientKey(
      account?.campaign ?? account?.client ?? account?.clientCode ?? account?.clientName
    );
    const displayName = String(account?.displayName ?? account?.nickname ?? '').trim() || null;

    CLIENT_ACCOUNT_REGISTRY.set(uniqueId, {
      campaign,
      displayName,
    });
  }
}

export function clearClientAccounts() {
  CLIENT_ACCOUNT_REGISTRY.clear();
}

export function getUsersForClient(client) {
  const normalizedClient = normalizeClientKey(client);
  if (!normalizedClient) {
    return [];
  }

  return Array.from(CLIENT_ACCOUNT_REGISTRY.entries())
    .filter(([, entry]) => entry.campaign === normalizedClient)
    .map(([uniqueId]) => uniqueId)
    .sort((left, right) => left.localeCompare(right));
}

export function isAccountInClient(accountUniqueId, client) {
  const normalizedClient = normalizeClientKey(client);
  const normalizedAccount = normalizeUniqueId(accountUniqueId);
  if (!normalizedClient || !normalizedAccount) {
    return false;
  }

  return CLIENT_ACCOUNT_REGISTRY.get(normalizedAccount)?.campaign === normalizedClient;
}

export function resolveClientByAccount(accountUniqueId) {
  const normalizedAccount = normalizeUniqueId(accountUniqueId);
  if (!normalizedAccount) {
    return null;
  }

  return CLIENT_ACCOUNT_REGISTRY.get(normalizedAccount)?.campaign ?? null;
}

export function normalizeClientAccount(value) {
  return normalizeUniqueId(value);
}

export function getDefaultDisplayNameForAccount(accountUniqueId) {
  const normalizedAccount = normalizeUniqueId(accountUniqueId);
  if (!normalizedAccount) {
    return null;
  }

  return CLIENT_ACCOUNT_REGISTRY.get(normalizedAccount)?.displayName ?? null;
}
