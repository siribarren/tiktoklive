-- Sample data for local development.
-- This runs after schema.sql on the first init of the PostgreSQL volume.

BEGIN;

SET search_path TO ember, public;

INSERT INTO app_users (
  login,
  display_name,
  role,
  client_code,
  password_hash,
  metadata
)
VALUES
  (
    'simon@phigital.cl',
    'Simón Phigital',
    'administrator',
    NULL,
    crypt('123450#', gen_salt('bf')),
    '{"seed":true,"access":"all"}'::jsonb
  ),
  (
    'supervisor_claro',
    'Supervisor Claro',
    'supervisor',
    'CLARO',
    crypt('claro123$', gen_salt('bf')),
    '{"seed":true,"access":"claro"}'::jsonb
  ),
  (
    'supervisor_wom',
    'Supervisor WOM',
    'supervisor',
    'WOM',
    crypt('wom123$', gen_salt('bf')),
    '{"seed":true,"access":"wom"}'::jsonb
  )
ON CONFLICT DO NOTHING;

INSERT INTO accounts (
  client_id,
  platform,
  external_id,
  username,
  display_name,
  priority,
  status,
  timezone,
  last_live_at,
  last_activity_at,
  metadata
)
VALUES
  (
    (SELECT id FROM clients WHERE code = 'WOM'),
    'tiktok',
    'ejecutivadewom',
    '@ejecutivadewom',
    'Paz Ibanez Catalan',
    'high',
    'active',
    'America/Santiago',
    '2026-06-20 23:15:00+00',
    '2026-06-20 23:25:00+00',
    '{"campaign":"WOM","channel":"tiktok"}'::jsonb
  ),
  (
    (SELECT id FROM clients WHERE code = 'WOM'),
    'tiktok',
    'janisvalentina77',
    '@janisvalentina77',
    'Janis Gonzalez Alvarez',
    'medium',
    'active',
    'America/Santiago',
    '2026-06-20 20:05:00+00',
    '2026-06-20 20:35:00+00',
    '{"campaign":"WOM","channel":"tiktok"}'::jsonb
  ),
  (
    (SELECT id FROM clients WHERE code = 'CLARO'),
    'tiktok',
    'claro_benficios',
    '@claro_benficios',
    'Daniela Baeza',
    'high',
    'active',
    'America/Santiago',
    '2026-06-20 22:45:00+00',
    '2026-06-20 22:58:00+00',
    '{"campaign":"CLARO","channel":"tiktok"}'::jsonb
  ),
  (
    (SELECT id FROM clients WHERE code = 'CLARO'),
    'tiktok',
    'ada_rengifo1012',
    '@ada_rengifo1012',
    'Ada Rengifo',
    'medium',
    'active',
    'America/Santiago',
    '2026-06-19 19:40:00+00',
    '2026-06-19 20:02:00+00',
    '{"campaign":"CLARO","channel":"tiktok"}'::jsonb
  );

INSERT INTO account_sessions (
  account_id,
  session_key,
  status,
  started_at,
  ended_at,
  messages_count,
  leads_detected,
  viewers,
  error_message,
  metadata
)
VALUES
  (
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    '20260620180000-wom-001',
    'ended',
    '2026-06-20 18:00:00+00',
    '2026-06-20 22:00:00+00',
    234,
    12,
    1847,
    NULL,
    '{"source":"recorder","client":"WOM"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    '20260620221000-wom-002',
    'live',
    '2026-06-20 22:10:00+00',
    NULL,
    57,
    3,
    512,
    NULL,
    '{"source":"recorder","client":"WOM"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@janisvalentina77'),
    '20260620153000-wom-003',
    'ended',
    '2026-06-20 15:30:00+00',
    '2026-06-20 19:05:00+00',
    181,
    8,
    960,
    NULL,
    '{"source":"recorder","client":"WOM"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@claro_benficios'),
    '20260620210000-claro-001',
    'ended',
    '2026-06-20 21:00:00+00',
    '2026-06-20 23:05:00+00',
    302,
    14,
    3201,
    NULL,
    '{"source":"recorder","client":"CLARO"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@ada_rengifo1012'),
    '20260619180000-claro-002',
    'ended',
    '2026-06-19 18:00:00+00',
    '2026-06-19 20:15:00+00',
    167,
    6,
    1280,
    NULL,
    '{"source":"recorder","client":"CLARO"}'::jsonb
  );

INSERT INTO leads (
  account_id,
  source_id,
  external_ref,
  username,
  nickname,
  full_name,
  status,
  total_score,
  categories,
  first_seen_at,
  last_activity_at,
  last_message_at,
  last_message_text,
  assigned_to_name,
  semantic_analysis,
  metadata
)
VALUES
  (
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    (SELECT id FROM sources WHERE code = 'tiktok'),
    'wom-lead-001',
    '@carla_mov',
    'Carla M',
    'Carla Munoz',
    'qualified',
    10,
    ARRAY['Portabilidad', 'Condicion', 'Equipo'],
    '2026-06-20 18:12:00+00',
    '2026-06-20 18:25:00+00',
    '2026-06-20 18:25:00+00',
    'que pasa si tengo plan vigente pero quiero cambiarme?',
    'Ejecutivo Smith',
    '{"intent":"Consulta sobre condiciones de contrato","category":"Portabilidad","subcategory":"Contrato activo","interestLevel":"High","confidence":0.91,"summary":"El usuario evalua cambiar de proveedor pero tiene dudas sobre un contrato vigente.","flags":{"portabilityInterest":true,"deviceInterest":true,"pricingInterest":false}}'::jsonb,
    '{"priority":"high"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    (SELECT id FROM sources WHERE code = 'tiktok'),
    'wom-lead-002',
    '@maria_tech',
    'Maria Gonzalez',
    'Maria Gonzalez',
    'reviewed',
    7,
    ARRAY['Equipo', 'Portabilidad', 'Plan'],
    '2026-06-20 21:18:00+00',
    '2026-06-20 21:30:00+00',
    '2026-06-20 21:30:00+00',
    'tienen samsung s24 con portabilidad?',
    NULL,
    '{"intent":"Consulta de equipo y portabilidad","category":"Equipo","subcategory":"Samsung S24","interestLevel":"Medium","confidence":0.84,"summary":"Interes por equipo y cambio de compania.","flags":{"portabilityInterest":true,"deviceInterest":true,"pricingInterest":false}}'::jsonb,
    '{"priority":"medium"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@janisvalentina77'),
    (SELECT id FROM sources WHERE code = 'manual'),
    'wom-lead-003',
    '@lucho_89',
    'Luis Soto',
    'Luis Soto',
    'new',
    4,
    ARRAY['Plan', 'Precio'],
    '2026-06-20 15:55:00+00',
    '2026-06-20 16:02:00+00',
    '2026-06-20 16:02:00+00',
    'cuanto sale el plan con mas gigas?',
    NULL,
    '{"intent":"Consulta de precio","category":"Plan","subcategory":"Precio","interestLevel":"Medium","confidence":0.77,"summary":"Quiere conocer el precio de un plan de mayor capacidad.","flags":{"portabilityInterest":false,"deviceInterest":false,"pricingInterest":true}}'::jsonb,
    '{"priority":"medium"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@claro_benficios'),
    (SELECT id FROM sources WHERE code = 'tiktok'),
    'claro-lead-001',
    '@ana_mobile',
    'Ana R',
    'Ana Romero',
    'contacted',
    9,
    ARRAY['Condicion', 'Portabilidad'],
    '2026-06-20 21:22:00+00',
    '2026-06-20 21:40:00+00',
    '2026-06-20 21:40:00+00',
    'me interesa pero tengo contrato',
    'Ejecutivo Claro 1',
    '{"intent":"Duda sobre contrato vigente","category":"Portabilidad","subcategory":"Contrato activo","interestLevel":"High","confidence":0.9,"summary":"Busca confirmar si puede cambiarse con contrato activo.","flags":{"portabilityInterest":true,"deviceInterest":false,"pricingInterest":false}}'::jsonb,
    '{"priority":"high"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@ada_rengifo1012'),
    (SELECT id FROM sources WHERE code = 'tiktok'),
    'claro-lead-002',
    '@carlos2024',
    'Carlos M',
    'Carlos Mena',
    'new',
    6,
    ARRAY['Portabilidad', 'Condicion'],
    '2026-06-19 18:18:00+00',
    '2026-06-19 18:28:00+00',
    '2026-06-19 18:28:00+00',
    'cuales son las condiciones de portabilidad?',
    NULL,
    '{"intent":"Consulta de portabilidad","category":"Portabilidad","subcategory":"Requisitos","interestLevel":"Medium","confidence":0.88,"summary":"Solicita condiciones para portarse a la compania.","flags":{"portabilityInterest":true,"deviceInterest":false,"pricingInterest":false}}'::jsonb,
    '{"priority":"medium"}'::jsonb
  );

INSERT INTO lead_status_history (
  lead_id,
  status,
  changed_at,
  changed_by_account_id,
  note,
  metadata
)
VALUES
  (
    (SELECT id FROM leads WHERE username = '@carla_mov'),
    'new',
    '2026-06-20 18:12:00+00',
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    'Detectado desde comentario del live',
    '{}'::jsonb
  ),
  (
    (SELECT id FROM leads WHERE username = '@carla_mov'),
    'qualified',
    '2026-06-20 18:25:00+00',
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    'Interes alto y datos completos',
    '{}'::jsonb
  ),
  (
    (SELECT id FROM leads WHERE username = '@maria_tech'),
    'new',
    '2026-06-20 21:18:00+00',
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    'Ingreso por portabilidad',
    '{}'::jsonb
  ),
  (
    (SELECT id FROM leads WHERE username = '@maria_tech'),
    'reviewed',
    '2026-06-20 21:30:00+00',
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    'Se reviso interes por equipo',
    '{}'::jsonb
  ),
  (
    (SELECT id FROM leads WHERE username = '@ana_mobile'),
    'new',
    '2026-06-20 21:22:00+00',
    (SELECT id FROM accounts WHERE username = '@claro_benficios'),
    'Lead detectado en live Claro',
    '{}'::jsonb
  ),
  (
    (SELECT id FROM leads WHERE username = '@ana_mobile'),
    'contacted',
    '2026-06-20 21:40:00+00',
    (SELECT id FROM accounts WHERE username = '@claro_benficios'),
    'Se envio seguimiento por DM',
    '{}'::jsonb
  );

INSERT INTO messages (
  account_id,
  session_id,
  lead_id,
  source_id,
  external_message_id,
  direction,
  status,
  username,
  nickname,
  content,
  score,
  categories,
  occurred_at,
  processed_at,
  raw_payload,
  metadata
)
VALUES
  (
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    (SELECT id FROM account_sessions WHERE session_key = '20260620180000-wom-001'),
    (SELECT id FROM leads WHERE username = '@carla_mov'),
    (SELECT id FROM sources WHERE code = 'tiktok'),
    'msg-0001',
    'inbound',
    'received',
    '@carla_mov',
    'Carla M',
    'tienen iphone en plan?',
    3,
    ARRAY['Equipo', 'Plan'],
    '2026-06-20 18:13:12+00',
    '2026-06-20 18:13:13+00',
    '{"event":"comment"}'::jsonb,
    '{"language":"es"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    (SELECT id FROM account_sessions WHERE session_key = '20260620180000-wom-001'),
    (SELECT id FROM leads WHERE username = '@carla_mov'),
    (SELECT id FROM sources WHERE code = 'tiktok'),
    'msg-0002',
    'inbound',
    'received',
    '@carla_mov',
    'Carla M',
    'y con portabilidad?',
    2,
    ARRAY['Portabilidad'],
    '2026-06-20 18:16:20+00',
    '2026-06-20 18:16:21+00',
    '{"event":"comment"}'::jsonb,
    '{"language":"es"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    (SELECT id FROM account_sessions WHERE session_key = '20260620180000-wom-001'),
    (SELECT id FROM leads WHERE username = '@maria_tech'),
    (SELECT id FROM sources WHERE code = 'tiktok'),
    'msg-0003',
    'inbound',
    'received',
    '@maria_tech',
    'Maria Gonzalez',
    'tienen samsung s24 con portabilidad?',
    4,
    ARRAY['Equipo', 'Portabilidad'],
    '2026-06-20 21:18:44+00',
    '2026-06-20 21:18:45+00',
    '{"event":"comment"}'::jsonb,
    '{"language":"es"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@janisvalentina77'),
    (SELECT id FROM account_sessions WHERE session_key = '20260620153000-wom-003'),
    (SELECT id FROM leads WHERE username = '@lucho_89'),
    (SELECT id FROM sources WHERE code = 'manual'),
    'msg-0004',
    'inbound',
    'received',
    '@lucho_89',
    'Luis Soto',
    'cuanto sale el plan con mas gigas?',
    3,
    ARRAY['Plan', 'Precio'],
    '2026-06-20 15:56:30+00',
    '2026-06-20 15:56:31+00',
    '{"event":"comment"}'::jsonb,
    '{"language":"es"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@claro_benficios'),
    (SELECT id FROM account_sessions WHERE session_key = '20260620210000-claro-001'),
    (SELECT id FROM leads WHERE username = '@ana_mobile'),
    (SELECT id FROM sources WHERE code = 'tiktok'),
    'msg-0005',
    'inbound',
    'received',
    '@ana_mobile',
    'Ana R',
    'me interesa pero tengo contrato',
    4,
    ARRAY['Condicion', 'Portabilidad'],
    '2026-06-20 21:22:14+00',
    '2026-06-20 21:22:15+00',
    '{"event":"comment"}'::jsonb,
    '{"language":"es"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@claro_benficios'),
    (SELECT id FROM account_sessions WHERE session_key = '20260620210000-claro-001'),
    (SELECT id FROM leads WHERE username = '@carlos2024'),
    (SELECT id FROM sources WHERE code = 'tiktok'),
    'msg-0006',
    'inbound',
    'received',
    '@carlos2024',
    'Carlos M',
    'cuales son las condiciones de portabilidad?',
    4,
    ARRAY['Portabilidad', 'Condicion'],
    '2026-06-19 18:18:55+00',
    '2026-06-19 18:18:56+00',
    '{"event":"comment"}'::jsonb,
    '{"language":"es"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@claro_benficios'),
    (SELECT id FROM account_sessions WHERE session_key = '20260620210000-claro-001'),
    NULL,
    (SELECT id FROM sources WHERE code = 'manual'),
    'msg-0007',
    'outbound',
    'sent',
    '@claro_benficios',
    'Daniela Baeza',
    'te comparto la promo por DM',
    0,
    ARRAY['FollowUp'],
    '2026-06-20 22:05:00+00',
    '2026-06-20 22:05:01+00',
    '{"event":"dm"}'::jsonb,
    '{"language":"es"}'::jsonb
  );

INSERT INTO message_status_history (
  message_id,
  status,
  changed_at,
  error_code,
  error_message,
  metadata
)
VALUES
  (
    (SELECT id FROM messages WHERE external_message_id = 'msg-0001'),
    'received',
    '2026-06-20 18:13:13+00',
    NULL,
    NULL,
    '{}'::jsonb
  ),
  (
    (SELECT id FROM messages WHERE external_message_id = 'msg-0001'),
    'read',
    '2026-06-20 18:13:20+00',
    NULL,
    NULL,
    '{}'::jsonb
  ),
  (
    (SELECT id FROM messages WHERE external_message_id = 'msg-0005'),
    'received',
    '2026-06-20 21:22:15+00',
    NULL,
    NULL,
    '{}'::jsonb
  ),
  (
    (SELECT id FROM messages WHERE external_message_id = 'msg-0007'),
    'queued',
    '2026-06-20 22:05:00+00',
    NULL,
    NULL,
    '{}'::jsonb
  ),
  (
    (SELECT id FROM messages WHERE external_message_id = 'msg-0007'),
    'sent',
    '2026-06-20 22:05:01+00',
    NULL,
    NULL,
    '{}'::jsonb
  );

INSERT INTO account_metrics (
  account_id,
  grain,
  period_start,
  period_end,
  connection_seconds,
  session_count,
  messages_count,
  messages_inbound,
  messages_outbound,
  lead_like_count,
  sales_total,
  views_total,
  unique_viewers,
  active_viewers,
  peak_viewers,
  avg_response_seconds,
  conversion_rate,
  metadata
)
VALUES
  (
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    'day',
    '2026-06-20 00:00:00+00',
    '2026-06-21 00:00:00+00',
    14400,
    2,
    291,
    284,
    7,
    15,
    4,
    1847,
    1214,
    312,
    417,
    18.4,
    26.67,
    '{"client":"WOM","granularity":"day"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@janisvalentina77'),
    'day',
    '2026-06-20 00:00:00+00',
    '2026-06-21 00:00:00+00',
    12600,
    1,
    181,
    176,
    5,
    8,
    2,
    960,
    643,
    142,
    183,
    22.7,
    25.00,
    '{"client":"WOM","granularity":"day"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@claro_benficios'),
    'day',
    '2026-06-20 00:00:00+00',
    '2026-06-21 00:00:00+00',
    7500,
    1,
    302,
    289,
    13,
    14,
    5,
    3201,
    1975,
    402,
    501,
    14.2,
    35.71,
    '{"client":"CLARO","granularity":"day"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@ada_rengifo1012'),
    'day',
    '2026-06-19 00:00:00+00',
    '2026-06-20 00:00:00+00',
    5100,
    1,
    167,
    160,
    7,
    6,
    1,
    1280,
    804,
    214,
    276,
    19.8,
    16.67,
    '{"client":"CLARO","granularity":"day"}'::jsonb
  ),
  (
    (SELECT id FROM accounts WHERE username = '@ejecutivadewom'),
    'hour',
    '2026-06-20 22:00:00+00',
    '2026-06-20 23:00:00+00',
    3600,
    1,
    57,
    54,
    3,
    3,
    1,
    512,
    341,
    118,
    162,
    12.6,
    33.33,
    '{"client":"WOM","granularity":"hour"}'::jsonb
  );

COMMIT;
