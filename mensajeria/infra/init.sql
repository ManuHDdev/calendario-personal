-- Emails "enviados" en modo mock, capturados en vez de relayados de verdad.
CREATE TABLE IF NOT EXISTS mensajeria_captured_emails (
  id SERIAL PRIMARY KEY,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT,
  received_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensajeria_captured_emails_received_at
  ON mensajeria_captured_emails (received_at DESC);

-- Log de SMS/llamadas, tanto mock ("would send X to Y") como real (Twilio).
CREATE TABLE IF NOT EXISTS mensajeria_message_log (
  id SERIAL PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'call')),
  to_address TEXT NOT NULL,
  from_address TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('mock', 'real')),
  provider_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensajeria_message_log_created_at
  ON mensajeria_message_log (created_at DESC);
