-- Useful queries for local exploration.
SET search_path TO ember, public;

-- 1) Accounts and latest live info
SELECT
  a.username,
  a.display_name,
  c.code AS client,
  a.status,
  a.priority,
  a.last_live_at,
  a.last_activity_at
FROM accounts a
JOIN clients c ON c.id = a.client_id
ORDER BY c.code, a.username;

-- 2) Sessions by account
SELECT
  a.username,
  s.session_key,
  s.status,
  s.started_at,
  s.ended_at,
  s.duration_seconds,
  s.messages_count,
  s.leads_detected,
  s.viewers
FROM account_sessions s
JOIN accounts a ON a.id = s.account_id
ORDER BY s.started_at DESC;

-- 3) Leads by status
SELECT
  a.username AS account_username,
  l.username AS lead_username,
  l.status,
  l.total_score,
  l.categories,
  l.last_activity_at
FROM leads l
JOIN accounts a ON a.id = l.account_id
ORDER BY l.last_activity_at DESC;

-- 4) Messages with their lead, if any
SELECT
  a.username AS account_username,
  m.occurred_at,
  m.direction,
  m.status,
  m.username AS sender_username,
  m.content,
  l.username AS lead_username,
  m.score
FROM messages m
JOIN accounts a ON a.id = m.account_id
LEFT JOIN leads l ON l.id = m.lead_id
ORDER BY m.occurred_at DESC;

-- 5) Daily metrics summary
SELECT
  c.code AS client,
  a.username AS account_username,
  m.grain,
  m.period_start,
  m.period_end,
  m.connection_seconds,
  m.connection_seconds / 3600.0 AS connection_hours,
  m.session_count,
  m.messages_count,
  m.lead_like_count,
  m.sales_total,
  m.conversion_rate
FROM account_metrics m
JOIN accounts a ON a.id = m.account_id
JOIN clients c ON c.id = a.client_id
ORDER BY m.period_start DESC, c.code, a.username;

-- 6) Client rollup
SELECT * FROM v_client_metrics ORDER BY period_start DESC, client_code;

-- 7) Open leads
SELECT
  a.username AS account_username,
  l.username AS lead_username,
  l.status,
  l.total_score,
  l.last_message_text
FROM leads l
JOIN accounts a ON a.id = l.account_id
WHERE l.status IN ('new', 'reviewed', 'contacted')
ORDER BY l.total_score DESC, l.last_activity_at DESC;

-- 8) Top accounts by connection time
SELECT
  a.username,
  SUM(m.connection_seconds) AS total_connection_seconds,
  ROUND(SUM(m.connection_seconds)::numeric / 3600.0, 2) AS total_connection_hours
FROM account_metrics m
JOIN accounts a ON a.id = m.account_id
GROUP BY a.username
ORDER BY total_connection_seconds DESC;
