const LEAD_PREFIX_OVERRIDES: Record<string, string> = {
  bbysaloo: 'bby',
  adarengifo: 'arg',
  ejecutivawomfabi: 'ewf',
};

type LeadVisualIdentityInput = {
  id: string;
  username?: string;
  nickname?: string;
  lastActivity?: Date | string;
};

function normalizeForLookup(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9]/g, '');
}

function extractWords(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function resolveLeadPrefix(username?: string, nickname?: string): string {
  const rawCandidates = [username ?? '', nickname ?? ''].filter(Boolean);
  for (const candidate of rawCandidates) {
    const key = normalizeForLookup(candidate);
    if (LEAD_PREFIX_OVERRIDES[key]) {
      return LEAD_PREFIX_OVERRIDES[key];
    }
  }

  for (const candidate of rawCandidates) {
    const words = extractWords(candidate);
    if (words.length >= 3) {
      return `${words[0][0]}${words[1][0]}${words[2][0]}`.slice(0, 3);
    }
    if (words.length === 2) {
      const secondWord = words[1];
      const thirdChar = secondWord[1] ?? secondWord[0] ?? 'x';
      return `${words[0][0]}${secondWord[0]}${thirdChar}`.slice(0, 3);
    }
    if (words.length === 1 && words[0].length > 0) {
      return words[0].slice(0, 3).padEnd(3, 'x');
    }
  }

  return 'ldx';
}

function parseLeadTimestamp(value?: Date | string): number {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
  if (typeof value === 'string') {
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }
  return 0;
}

export function buildLeadVisualId(
  lead: Pick<LeadVisualIdentityInput, 'username' | 'nickname'>,
  sequenceNumber: number
): string {
  const safeSequence = Math.max(1, Math.min(99_999, Math.floor(sequenceNumber)));
  const prefix = resolveLeadPrefix(lead.username, lead.nickname);
  return `${prefix}${String(safeSequence).padStart(5, '0')}`;
}

export function buildLeadVisualIdMap(leads: LeadVisualIdentityInput[]): Record<string, string> {
  const sortedLeads = [...leads].sort((left, right) => {
    const byTimestamp = parseLeadTimestamp(left.lastActivity) - parseLeadTimestamp(right.lastActivity);
    if (byTimestamp !== 0) {
      return byTimestamp;
    }
    return left.id.localeCompare(right.id);
  });

  const map: Record<string, string> = {};
  sortedLeads.forEach((lead, index) => {
    map[lead.id] = buildLeadVisualId(lead, index + 1);
  });

  return map;
}
