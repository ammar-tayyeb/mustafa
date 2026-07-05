-- =============================================
-- 0001_init.sql — المخطط الأولي لنظام إدارة العلوة
-- =============================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- =============================================
-- جدول التجار
-- =============================================
CREATE TABLE IF NOT EXISTS traders (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    phone       TEXT,
    address     TEXT,
    debt_fils   INTEGER NOT NULL DEFAULT 0,  -- الدين بأصغر وحدة (فلس/هللة)
    notes       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    is_deleted  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_traders_name ON traders(name) WHERE is_deleted=0;


select * from traders;

-- =============================================
-- جدول السائقين
-- =============================================
CREATE TABLE IF NOT EXISTS drivers (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    phone       TEXT,
    vehicle_id  TEXT ,
    notes       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    is_deleted  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_drivers_name ON drivers(name) WHERE is_deleted=0;

-- =============================================
-- جدول القوائم
-- =============================================
CREATE TABLE IF NOT EXISTS invoices (
    id              TEXT PRIMARY KEY,
    trader_id       TEXT REFERENCES traders(id),
    driver_id       TEXT REFERENCES drivers(id),
    date            TEXT NOT NULL,              -- YYYY-MM-DD
    status          TEXT NOT NULL DEFAULT 'draft', -- draft | posted
    total_final     INTEGER NOT NULL DEFAULT 0, -- إجمالي المبلغ النهائي
    paid_amount     INTEGER NOT NULL DEFAULT 0, -- الواصل
    remaining       INTEGER NOT NULL DEFAULT 0, -- الباقي
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    is_deleted      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date) WHERE is_deleted=0;
CREATE INDEX IF NOT EXISTS idx_invoices_trader ON invoices(trader_id) WHERE is_deleted=0;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status) WHERE is_deleted=0;

-- =============================================
-- جدول بنود الفاتورة
-- =============================================
CREATE TABLE IF NOT EXISTS invoice_items (
    id                  TEXT PRIMARY KEY,
    invoice_id          TEXT NOT NULL REFERENCES invoices(id),
    product_name        TEXT NOT NULL,          -- اسم المادة
    gross_weight        INTEGER NOT NULL DEFAULT 0, -- 
    basket_count        INTEGER NOT NULL DEFAULT 0, -- عدد السلات
    basket_weight_each  INTEGER NOT NULL DEFAULT 50, -- وزن السلة × 100 (افتراضي 0.5 كجم = 50)
    net_weight          INTEGER NOT NULL DEFAULT 0, -- صافي الوزن المحسوب
    price               INTEGER NOT NULL DEFAULT 0, -- السعر (× 100)
    amount_before       INTEGER NOT NULL DEFAULT 0, -- المبلغ قبل العمولة والحمالية
    commission_rate     INTEGER NOT NULL DEFAULT 0, -- نسبة العمولة × 100 (مثلاً 5% = 500)
    commission_value    INTEGER NOT NULL DEFAULT 0, -- قيمة العمولة المأخوذة
    amount_after_comm   INTEGER NOT NULL DEFAULT 0, -- المبلغ بعد العمولة
    porterage           INTEGER NOT NULL DEFAULT 0, -- الحمالية (مبلغ رقمي)
    final_amount        INTEGER NOT NULL DEFAULT 0,
    basket_number       INTEGER NOT NULL DEFAULT 0, -- رقم السلة
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    is_deleted          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id) WHERE is_deleted=0;

-- =============================================
-- جدول الدفعات / تسوية الديون
-- =============================================
CREATE TABLE IF NOT EXISTS payments (
    id          TEXT PRIMARY KEY,
    trader_id   TEXT NOT NULL REFERENCES traders(id),
    amount      INTEGER NOT NULL DEFAULT 0,
    date        TEXT NOT NULL,
    notes       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    is_deleted  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_payments_trader ON payments(trader_id) WHERE is_deleted=0;
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date) WHERE is_deleted=0;

-- =============================================
-- سجل المعاملات الشامل
-- =============================================
CREATE TABLE IF NOT EXISTS transactions_log (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,  -- invoice_posted | payment | reversal | debt_added
    ref_id      TEXT,           -- معرف الفاتورة أو الدفعة
    trader_id   TEXT REFERENCES traders(id),
    amount      INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    date        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    is_deleted  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_txlog_date ON transactions_log(date) WHERE is_deleted=0;
CREATE INDEX IF NOT EXISTS idx_txlog_trader ON transactions_log(trader_id) WHERE is_deleted=0;

-- =============================================
-- جدول الإعدادات
-- =============================================
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- إعدادات افتراضية
INSERT OR IGNORE INTO settings(key, value, updated_at) VALUES
    ('market_name',         'warehouse System',    datetime('now')),
    ('currency',            'diq',                  datetime('now')),
    ('default_commission',  '500',                   datetime('now')),  -- 5.00%
    ('basket_weight',       '50',                    datetime('now'));   -- 0.50 كجم
