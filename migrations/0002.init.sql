-- عمليات السحب من أرباح المكتب
CREATE TABLE IF NOT EXISTS withdrawals (
	id              TEXT PRIMARY KEY,
	amount          INTEGER NOT NULL DEFAULT 0,
	withdrawer_type TEXT NOT NULL,
	person_name     TEXT NOT NULL,
	date            TEXT NOT NULL,
	driver_id       TEXT,
	applied_amount  INTEGER NOT NULL DEFAULT 0,
	debt_amount     INTEGER NOT NULL DEFAULT 0,
	sheet_opened_at TEXT,
	created_at      TEXT NOT NULL,
	updated_at      TEXT NOT NULL,
	is_deleted      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_date ON withdrawals(date) WHERE is_deleted=0;
