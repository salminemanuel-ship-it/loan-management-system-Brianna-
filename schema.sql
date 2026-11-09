CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  phone           TEXT UNIQUE,
  full_name       TEXT NOT NULL,
  profile_image   TEXT,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('loan_officer','supervisor','committee','finance','management','admin','customer')),
  requested_role  TEXT CHECK (requested_role IN ('loan_officer','supervisor','committee','finance','management')),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  admin_locked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_role TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep existing installations aligned when roles expand.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('loan_officer','supervisor','committee','finance','management','admin','customer'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_requested_role_check;
ALTER TABLE users ADD CONSTRAINT users_requested_role_check
  CHECK (requested_role IS NULL OR requested_role IN ('loan_officer','supervisor','committee','finance','management'));

CREATE TABLE IF NOT EXISTS clients (
  id         SERIAL PRIMARY KEY,
  full_name  TEXT NOT NULL,
  officer_id INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_location TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS clients_user_id_unique ON clients(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS loans (
  id            SERIAL PRIMARY KEY,
  loan_number   TEXT UNIQUE NOT NULL,
  client_id     INT NOT NULL REFERENCES clients(id),
  officer_id    INT REFERENCES users(id),
  product       TEXT NOT NULL CHECK (product IN ('Emergency','Group','Business Emergency')),
  stage         TEXT NOT NULL CHECK (stage IN ('assessment','verification','approval','disbursement','repayment')),
  status        TEXT NOT NULL CHECK (status IN ('in_progress','active','closed')),
  balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  next_due_date DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE loans ADD COLUMN IF NOT EXISTS principal_amount NUMERIC(14,2);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS savings_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS savings_rate NUMERIC(6,5) NOT NULL DEFAULT 0.05;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS processing_fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS processing_fee_rate NUMERIC(6,5) NOT NULL DEFAULT 0.10;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS interest_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS weekly_interest_rate NUMERIC(6,5) NOT NULL DEFAULT 0.0475;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS installment_count INT NOT NULL DEFAULT 25;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS weekly_installment_amount NUMERIC(14,2);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS final_installment_amount NUMERIC(14,2);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS first_due_date DATE;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS amount_due NUMERIC(14,2);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS repayment_performance NUMERIC(5,2);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS arrears NUMERIC(14,2);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS transfer_reference TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS disbursed_amount NUMERIC(14,2);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMPTZ;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS loan_decision_records (
  id           BIGSERIAL PRIMARY KEY,
  loan_id      INT NOT NULL REFERENCES loans(id),
  reviewer_id  INT NOT NULL REFERENCES users(id),
  decision     TEXT NOT NULL CHECK (decision IN ('approved','returned')),
  rationale    TEXT NOT NULL CHECK (char_length(rationale) BETWEEN 10 AND 1000),
  decided_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  signer_id    INT REFERENCES users(id),
  signed_at    TIMESTAMPTZ
);
ALTER TABLE loan_decision_records ADD COLUMN IF NOT EXISTS signer_id INT REFERENCES users(id);
ALTER TABLE loan_decision_records ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS loan_decision_records_loan_decided_idx
  ON loan_decision_records(loan_id, decided_at DESC);

CREATE OR REPLACE FUNCTION loan_decision_records_readonly() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'loan_decision_records is append only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loan_decision_records_no_change ON loan_decision_records;
CREATE TRIGGER loan_decision_records_no_change
  BEFORE UPDATE OR DELETE ON loan_decision_records
  FOR EACH ROW EXECUTE FUNCTION loan_decision_records_readonly();

CREATE TABLE IF NOT EXISTS loan_payments (
  id          BIGSERIAL PRIMARY KEY,
  loan_id     INT NOT NULL REFERENCES loans(id),
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference   TEXT NOT NULL DEFAULT '',
  received_by INT REFERENCES users(id),
  provider    TEXT NOT NULL DEFAULT 'manual',
  provider_transaction_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE loan_payments ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE loan_payments ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT;
CREATE INDEX IF NOT EXISTS loan_payments_loan_received_idx ON loan_payments(loan_id, received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS loan_payments_provider_transaction_unique
  ON loan_payments(provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS loan_payment_intents (
  id                    BIGSERIAL PRIMARY KEY,
  loan_id               INT NOT NULL REFERENCES loans(id),
  customer_id           INT NOT NULL REFERENCES users(id),
  provider              TEXT NOT NULL CHECK (provider IN ('selcom','bank_transfer')),
  provider_order_id     TEXT NOT NULL UNIQUE,
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','ambiguous')),
  checkout_url          TEXT,
  gateway_reference     TEXT,
  provider_transaction_id TEXT,
  channel               TEXT,
  customer_reference    TEXT,
  failure_message       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at               TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS loan_payment_intents_customer_created_idx
  ON loan_payment_intents(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS loan_payout_intents (
  id                    BIGSERIAL PRIMARY KEY,
  loan_id               INT NOT NULL REFERENCES loans(id),
  initiated_by          INT NOT NULL REFERENCES users(id),
  provider              TEXT NOT NULL CHECK (provider IN ('selcom_wallet','selcom_bank')),
  transaction_id        TEXT NOT NULL UNIQUE,
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  destination           TEXT NOT NULL,
  destination_name      TEXT NOT NULL,
  destination_bank_code TEXT,
  next_due_date         DATE NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','ambiguous')),
  provider_reference    TEXT,
  failure_message       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at               TIMESTAMPTZ
);
ALTER TABLE loan_payout_intents ADD COLUMN IF NOT EXISTS next_due_date DATE;
ALTER TABLE loan_payout_intents ADD COLUMN IF NOT EXISTS principal_amount NUMERIC(14,2);
CREATE INDEX IF NOT EXISTS loan_payout_intents_loan_created_idx
  ON loan_payout_intents(loan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id       BIGSERIAL PRIMARY KEY,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  username TEXT NOT NULL,
  action   TEXT NOT NULL,
  record   TEXT NOT NULL DEFAULT '',
  detail   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_messages (
  id          BIGSERIAL PRIMARY KEY,
  sender_id   INT NOT NULL REFERENCES users(id),
  recipient_id INT NOT NULL REFERENCES users(id),
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS user_messages_recipient_sent_idx ON user_messages(recipient_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS customer_requests (
  id                   SERIAL PRIMARY KEY,
  customer_id          INT NOT NULL REFERENCES users(id),
  client_id            INT REFERENCES clients(id),
  assigned_officer_id  INT REFERENCES users(id),
  request_type         TEXT NOT NULL CHECK (request_type IN ('loan', 'group_registration', 'assessment', 'member_performance')),
  summary              TEXT NOT NULL,
  details              JSONB NOT NULL DEFAULT '{}'::jsonb,
  status               TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'visited', 'approved', 'rejected', 'completed')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_requests_customer_created_idx ON customer_requests(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_requests_officer_created_idx ON customer_requests(assigned_officer_id, created_at DESC);
ALTER TABLE customer_requests DROP CONSTRAINT IF EXISTS customer_requests_status_check;
ALTER TABLE customer_requests ADD CONSTRAINT customer_requests_status_check
  CHECK (status IN ('new', 'reviewing', 'visited', 'approved', 'rejected', 'completed'));

-- The audit trail is read only: entries cannot be edited or deleted.
CREATE OR REPLACE FUNCTION audit_log_readonly() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is read only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_readonly();
