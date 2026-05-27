function normalizeUniqueId(value) {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

const WOM_USERS = [
  '@ejecutivadewom',
  '@janisvalentina77',
  '@ejecutivawomfabi',
  '@ejecutivawommari',
  '@ejecutivawomcynthia',
  '@tuejecutivadewom',
  '@ejecutivawomnejanai',
].map(normalizeUniqueId);

const CLARO_USERS = [
  '@claro_benficios',
  '@ada_rengifo1012',
  '@rafael_store_full_live',
  '@florloto20',
  '@paaalinnnaaa',
  '@hmarcelo.beneficios',
  '@anavaldees',
  '@mercado.claro88',
  '@bbysalooo',
].map(normalizeUniqueId);

const ACCOUNT_DISPLAY_NAMES = {
  '@claro_benficios': 'Daniela Baeza',
  '@ada_rengifo1012': 'Ada Rengifo',
  '@rafael_store_full_live': 'Rafael Cayrun',
  '@florloto20': 'Barbara Cruz',
  '@paaalinnnaaa': 'Paulina Cataldo',
  '@hmarcelo.beneficios': 'Marcelo Hueichaqueo',
  '@anavaldees': 'Ana Valdes',
  '@mercado.claro88': 'Alejandro mercado',
  '@bbysalooo': 'Salome Bustos',
  '@ejecutivawomcynthia': 'Cynthia Diaz',
  '@ejecutivadewom': 'Paz Ibañez Catalan',
  '@ejecutivawomfabi': 'Fabiola Corro Cortes',
  '@janisvalentina77': 'Janis Gonzalez Alvarez',
  '@ejecutivawomnejanai': 'Natalie Jaña Inostroza',
  '@ejecutivawommari': 'Mariana Vega Muñoz',
  '@tuejecutivadewom': 'Melanie Luna Moreno',
};

const ACCOUNT_DISPLAY_NAME_ENTRIES = Object.entries(ACCOUNT_DISPLAY_NAMES).map(
  ([account, displayName]) => [normalizeUniqueId(account), displayName]
);
const ACCOUNT_DISPLAY_NAME_MAP = new Map(ACCOUNT_DISPLAY_NAME_ENTRIES);

export const CLIENT_USERS = {
  WOM: WOM_USERS,
  CLARO: CLARO_USERS,
};

const CLIENT_USER_SETS = {
  WOM: new Set(WOM_USERS),
  CLARO: new Set(CLARO_USERS),
};

export function getUsersForClient(client) {
  return CLIENT_USERS[client] ?? [];
}

export function isAccountInClient(accountUniqueId, client) {
  const normalized = normalizeUniqueId(accountUniqueId);
  if (!normalized) {
    return false;
  }
  return CLIENT_USER_SETS[client]?.has(normalized) ?? false;
}

export function resolveClientByAccount(accountUniqueId) {
  const normalized = normalizeUniqueId(accountUniqueId);
  if (!normalized) {
    return null;
  }
  if (CLIENT_USER_SETS.WOM.has(normalized)) {
    return 'WOM';
  }
  if (CLIENT_USER_SETS.CLARO.has(normalized)) {
    return 'CLARO';
  }
  return null;
}

export function normalizeClientAccount(value) {
  return normalizeUniqueId(value);
}

export function getDefaultDisplayNameForAccount(accountUniqueId) {
  const normalized = normalizeUniqueId(accountUniqueId);
  if (!normalized) {
    return null;
  }
  return ACCOUNT_DISPLAY_NAME_MAP.get(normalized) ?? null;
}
