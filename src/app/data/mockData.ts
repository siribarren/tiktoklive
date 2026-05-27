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

// Mock Messages
export const mockMessages: Message[] = [
  {
    id: '1',
    timestamp: new Date(Date.now() - 1000 * 60 * 2),
    username: '@juan123',
    nickname: 'Juan Pérez',
    message: 'tienen iphone en plan?',
    score: 3,
    categories: ['Equipo', 'Plan'],
    sessionId: 'session1',
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    username: '@carla_mov',
    nickname: 'Carla M',
    message: 'que pasa si tengo plan vigente pero quiero cambiarme?',
    score: 4,
    categories: ['Condición', 'Portabilidad'],
    sessionId: 'session1',
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 1000 * 60 * 8),
    username: '@lucho_89',
    nickname: 'Luis Soto',
    message: 'cuanto sale el plan con más gigas?',
    score: 3,
    categories: ['Plan', 'Precio'],
    sessionId: 'session1',
  },
  {
    id: '4',
    timestamp: new Date(Date.now() - 1000 * 60 * 10),
    username: '@random_user',
    nickname: 'user123',
    message: 'jajaja buena promo',
    score: 0,
    categories: [],
    sessionId: 'session1',
  },
  {
    id: '5',
    timestamp: new Date(Date.now() - 1000 * 60 * 12),
    username: '@maria_tech',
    nickname: 'María González',
    message: 'tienen samsung s24 con portabilidad?',
    score: 4,
    categories: ['Equipo', 'Portabilidad'],
    sessionId: 'session1',
  },
  {
    id: '6',
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
    username: '@pedro_cl',
    nickname: 'Pedro C',
    message: 'necesito cambiar mi plan actual',
    score: 3,
    categories: ['Plan', 'Condición'],
    sessionId: 'session1',
  },
  {
    id: '7',
    timestamp: new Date(Date.now() - 1000 * 60 * 18),
    username: '@ana_mobile',
    nickname: 'Ana R',
    message: 'me interesa pero tengo contrato',
    score: 4,
    categories: ['Condición', 'Portabilidad'],
    sessionId: 'session2',
  },
  {
    id: '8',
    timestamp: new Date(Date.now() - 1000 * 60 * 20),
    username: '@carlos2024',
    nickname: 'Carlos M',
    message: 'cuales son las condiciones de portabilidad?',
    score: 4,
    categories: ['Portabilidad', 'Condición'],
    sessionId: 'session2',
  },
  {
    id: '9',
    timestamp: new Date(Date.now() - 1000 * 60 * 22),
    username: '@viewer99',
    nickname: 'viewer99',
    message: 'saludos desde chile!',
    score: 0,
    categories: [],
    sessionId: 'session2',
  },
  {
    id: '10',
    timestamp: new Date(Date.now() - 1000 * 60 * 25),
    username: '@tech_fan',
    nickname: 'Roberto V',
    message: 'el iphone 15 viene con plan?',
    score: 3,
    categories: ['Equipo', 'Plan'],
    sessionId: 'session2',
  },
];

// Mock Leads
export const mockLeads: Lead[] = [
  {
    id: 'lead1',
    status: 'New',
    username: '@carla_mov',
    nickname: 'Carla M',
    totalScore: 7,
    categories: ['Portabilidad', 'Condición', 'Equipo'],
    lastMessage: 'que pasa si tengo plan vigente pero quiero cambiarme?',
    lastActivity: new Date(Date.now() - 1000 * 60 * 5),
    messages: [
      {
        id: 'm1',
        timestamp: new Date(Date.now() - 1000 * 60 * 15),
        username: '@carla_mov',
        nickname: 'Carla M',
        message: 'tienen iphone?',
        score: 2,
        categories: ['Equipo'],
        sessionId: 'session1',
      },
      {
        id: 'm2',
        timestamp: new Date(Date.now() - 1000 * 60 * 10),
        username: '@carla_mov',
        nickname: 'Carla M',
        message: 'y con portabilidad?',
        score: 2,
        categories: ['Portabilidad'],
        sessionId: 'session1',
      },
      {
        id: 'm3',
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        username: '@carla_mov',
        nickname: 'Carla M',
        message: 'que pasa si tengo contrato vigente?',
        score: 3,
        categories: ['Condición', 'Portabilidad'],
        sessionId: 'session1',
      },
    ],
    semanticAnalysis: {
      intent: 'Consulta sobre condiciones de contrato',
      category: 'Portabilidad',
      subcategory: 'Contrato activo',
      interestLevel: 'High',
      confidence: 0.91,
      summary: 'El usuario está evaluando cambiar de proveedor, pero tiene dudas sobre obligaciones de contrato vigentes.',
      flags: {
        portabilityInterest: true,
        deviceInterest: true,
        pricingInterest: false,
      },
    },
  },
  {
    id: 'lead2',
    status: 'Reviewed',
    username: '@maria_tech',
    nickname: 'María González',
    totalScore: 6,
    categories: ['Equipo', 'Portabilidad', 'Plan'],
    lastMessage: 'tienen samsung s24 con portabilidad?',
    lastActivity: new Date(Date.now() - 1000 * 60 * 12),
    assignedTo: 'Ejecutivo Smith',
    messages: [
      {
        id: 'm4',
        timestamp: new Date(Date.now() - 1000 * 60 * 20),
        username: '@maria_tech',
        nickname: 'María González',
        message: 'cuanto sale el samsung s24?',
        score: 2,
        categories: ['Equipo', 'Precio'],
        sessionId: 'session1',
      },
      {
        id: 'm5',
        timestamp: new Date(Date.now() - 1000 * 60 * 12),
        username: '@maria_tech',
        nickname: 'María González',
        message: 'tienen samsung s24 con portabilidad?',
        score: 4,
        categories: ['Equipo', 'Portabilidad'],
        sessionId: 'session1',
      },
    ],
    semanticAnalysis: {
      intent: 'Compra de equipo con portabilidad',
      category: 'Equipo',
      subcategory: 'Smartphone gama alta',
      interestLevel: 'High',
      confidence: 0.87,
      summary: 'El usuario está interesado en comprar un equipo específico de gama alta con portabilidad numérica.',
      flags: {
        portabilityInterest: true,
        deviceInterest: true,
        pricingInterest: true,
      },
    },
  },
  {
    id: 'lead3',
    status: 'Qualified',
    username: '@carlos2024',
    nickname: 'Carlos M',
    totalScore: 8,
    categories: ['Portabilidad', 'Condición', 'Plan'],
    lastMessage: 'cuales son las condiciones de portabilidad?',
    lastActivity: new Date(Date.now() - 1000 * 60 * 20),
    assignedTo: 'Ejecutivo Johnson',
    messages: [
      {
        id: 'm6',
        timestamp: new Date(Date.now() - 1000 * 60 * 30),
        username: '@carlos2024',
        nickname: 'Carlos M',
        message: 'me interesa cambiarme de compañía',
        score: 3,
        categories: ['Portabilidad'],
        sessionId: 'session2',
      },
      {
        id: 'm7',
        timestamp: new Date(Date.now() - 1000 * 60 * 25),
        username: '@carlos2024',
        nickname: 'Carlos M',
        message: 'que planes tienen disponibles?',
        score: 2,
        categories: ['Plan'],
        sessionId: 'session2',
      },
      {
        id: 'm8',
        timestamp: new Date(Date.now() - 1000 * 60 * 20),
        username: '@carlos2024',
        nickname: 'Carlos M',
        message: 'cuales son las condiciones de portabilidad?',
        score: 3,
        categories: ['Portabilidad', 'Condición'],
        sessionId: 'session2',
      },
    ],
    semanticAnalysis: {
      intent: 'Consulta de cambio de servicio',
      category: 'Portabilidad',
      subcategory: 'Detalles del proceso',
      interestLevel: 'Very High',
      confidence: 0.94,
      summary: 'El usuario está planificando activamente cambiar de proveedor y busca información detallada del proceso.',
      flags: {
        portabilityInterest: true,
        deviceInterest: false,
        pricingInterest: true,
      },
    },
  },
  {
    id: 'lead4',
    status: 'New',
    username: '@lucho_89',
    nickname: 'Luis Soto',
    totalScore: 5,
    categories: ['Plan', 'Precio'],
    lastMessage: 'cuanto sale el plan con más gigas?',
    lastActivity: new Date(Date.now() - 1000 * 60 * 8),
    messages: [
      {
        id: 'm9',
        timestamp: new Date(Date.now() - 1000 * 60 * 8),
        username: '@lucho_89',
        nickname: 'Luis Soto',
        message: 'cuanto sale el plan con más gigas?',
        score: 3,
        categories: ['Plan', 'Precio'],
        sessionId: 'session1',
      },
    ],
    semanticAnalysis: {
      intent: 'Consulta de precios de planes',
      category: 'Plan',
      subcategory: 'Planes de datos',
      interestLevel: 'Medium',
      confidence: 0.82,
      summary: 'El usuario está interesado en planes con muchos datos y su información de precios.',
      flags: {
        portabilityInterest: false,
        deviceInterest: false,
        pricingInterest: true,
      },
    },
  },
  {
    id: 'lead5',
    status: 'Contacted',
    username: '@ana_mobile',
    nickname: 'Ana R',
    totalScore: 6,
    categories: ['Condición', 'Portabilidad'],
    lastMessage: 'me interesa pero tengo contrato',
    lastActivity: new Date(Date.now() - 1000 * 60 * 18),
    assignedTo: 'Ejecutivo Davis',
    messages: [
      {
        id: 'm10',
        timestamp: new Date(Date.now() - 1000 * 60 * 18),
        username: '@ana_mobile',
        nickname: 'Ana R',
        message: 'me interesa pero tengo contrato',
        score: 4,
        categories: ['Condición', 'Portabilidad'],
        sessionId: 'session2',
      },
    ],
    semanticAnalysis: {
      intent: 'Interés con restricción contractual',
      category: 'Portabilidad',
      subcategory: 'Contrato activo',
      interestLevel: 'Medium',
      confidence: 0.88,
      summary: 'El usuario muestra interés, pero actualmente está sujeto a un contrato vigente.',
      flags: {
        portabilityInterest: true,
        deviceInterest: false,
        pricingInterest: false,
      },
    },
  },
];

// Mock Accounts
export const mockAccounts: Account[] = [
  {
    id: 'acc1',
    tiktokUniqueId: '@telco_chile_oficial',
    nickname: 'Telco Chile',
    client: 'Telco Chile SA',
    priority: 'High',
    status: 'Active',
    lastLive: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: 'acc2',
    tiktokUniqueId: '@movil_deals',
    nickname: 'Móvil Deals',
    client: 'Mobile Solutions Inc',
    priority: 'High',
    status: 'Active',
    lastLive: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: 'acc3',
    tiktokUniqueId: '@tech_promo_cl',
    nickname: 'Tech Promo',
    client: 'TechCorp',
    priority: 'Medium',
    status: 'Active',
    lastLive: new Date(Date.now() - 1000 * 60 * 60 * 5),
  },
  {
    id: 'acc4',
    tiktokUniqueId: '@plan_movil_test',
    nickname: 'Plan Móvil Test',
    client: 'Cuenta de prueba',
    priority: 'Low',
    status: 'Inactive',
    lastLive: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
  },
];

// Mock Rules
export const mockRules: Rule[] = [
  {
    id: 'rule1',
    category: 'Portabilidad',
    keywords: ['portabilidad', 'cambiarme', 'traer numero', 'cambiar compañía'],
    score: 2,
    enabled: true,
  },
  {
    id: 'rule2',
    category: 'Condición',
    keywords: ['que pasa si', 'si tengo plan', 'tengo contrato', 'plan vigente'],
    score: 2,
    enabled: true,
  },
  {
    id: 'rule3',
    category: 'Equipo',
    keywords: ['iphone', 'samsung', 'xiaomi', 'celular', 'equipo'],
    score: 1,
    enabled: true,
  },
  {
    id: 'rule4',
    category: 'Plan',
    keywords: ['plan', 'gigas', 'megas', 'datos', 'minutos'],
    score: 1,
    enabled: true,
  },
  {
    id: 'rule5',
    category: 'Precio',
    keywords: ['cuanto', 'precio', 'costo', 'sale', 'valor'],
    score: 1,
    enabled: true,
  },
];

// Mock Live Sessions
export const mockLiveSessions: LiveSession[] = [
  {
    id: 'session1',
    accountId: 'acc1',
    accountName: '@telco_chile_oficial',
    status: 'Active',
    startTime: new Date(Date.now() - 1000 * 60 * 45),
    messagesCount: 234,
    leadsDetected: 12,
    viewers: 1847,
  },
  {
    id: 'session2',
    accountId: 'acc2',
    accountName: '@movil_deals',
    status: 'Active',
    startTime: new Date(Date.now() - 1000 * 60 * 120),
    messagesCount: 567,
    leadsDetected: 23,
    viewers: 3201,
  },
  {
    id: 'session3',
    accountId: 'acc1',
    accountName: '@telco_chile_oficial',
    status: 'Ended',
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 24),
    endTime: new Date(Date.now() - 1000 * 60 * 60 * 22),
    messagesCount: 892,
    leadsDetected: 34,
    viewers: 5643,
  },
];

// KPI Data
export const kpiData = {
  activeSessions: 2,
  messagesToday: 1847,
  newLeads: 15,
  qualifiedLeads: 8,
  messagesPerMinuteData: [
    { time: '10:00', messages: 12 },
    { time: '10:05', messages: 18 },
    { time: '10:10', messages: 25 },
    { time: '10:15', messages: 31 },
    { time: '10:20', messages: 28 },
    { time: '10:25', messages: 35 },
    { time: '10:30', messages: 42 },
    { time: '10:35', messages: 38 },
    { time: '10:40', messages: 45 },
    { time: '10:45', messages: 52 },
    { time: '10:50', messages: 48 },
    { time: '10:55', messages: 41 },
  ],
  leadCategoriesData: [
    { category: 'Portabilidad', count: 28 },
    { category: 'Equipo', count: 22 },
    { category: 'Plan', count: 18 },
    { category: 'Condición', count: 15 },
    { category: 'Precio', count: 12 },
  ],
};
