export interface Message {
  id: string;
  timestamp: Date;
  username: string;
  nickname: string;
  message: string;
  score: number;
  categories: string[];
  sessionId: string;
}

export interface Lead {
  id: string;
  accountUniqueId?: string;
  status: 'New' | 'Reviewed' | 'Qualified' | 'Contacted';
  username: string;
  nickname: string;
  totalScore: number;
  categories: string[];
  lastMessage: string;
  lastActivity: Date;
  assignedTo?: string;
  messages: Message[];
  semanticAnalysis?: {
    intent: string;
    category: string;
    subcategory: string;
    interestLevel: string;
    confidence: number;
    summary: string;
    flags: {
      portabilityInterest: boolean;
      deviceInterest: boolean;
      pricingInterest: boolean;
    };
  };
}

export interface Account {
  id: string;
  tiktokUniqueId: string;
  nickname: string;
  client: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Active' | 'Inactive';
  lastLive: Date;
}

export interface Rule {
  id: string;
  category: string;
  keywords: string[];
  score: number;
  enabled: boolean;
}

export interface LiveSession {
  id: string;
  rawSessionId?: string;
  accountId: string;
  accountName: string;
  status: 'Active' | 'Ended';
  startTime: Date;
  endTime?: Date;
  previousSession?: {
    sessionId?: string;
    startTime: Date;
    endTime: Date;
  };
  messagesCount: number;
  leadsDetected: number;
  viewers: number;
}

export const mockMessages: Message[] = [];
export const mockLeads: Lead[] = [];
export const mockAccounts: Account[] = [];
export const mockRules: Rule[] = [];
export const mockLiveSessions: LiveSession[] = [];

export const kpiData = {
  activeSessions: 0,
  messagesToday: 0,
  newLeads: 0,
  qualifiedLeads: 0,
  messagesPerMinuteData: [] as Array<{ time: string; messages: number }>,
  leadCategoriesData: [] as Array<{ category: string; count: number }>,
};
