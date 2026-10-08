import { isFixedMaterial } from "./materials.js";

let _db = null;
const _tableColumnCache = new Map();
let _schemaEnsured = false;

const fallbackDb = {
  async select() { return []; },
  async execute() { return { lastInsertId: null, changes: 0 }; },
};

const FALLBACK_STORE_KEY = "warehouse_fallback_store";

function cloneData(value) { return JSON.parse(JSON.stringify(value)); }

function getFallbackStore() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return { traders: [], drivers: [], invoices: [], invoice_items: [], payments: [], withdrawals: [], transactions_log: [], settings: {} };
  }
  try {
    const raw = localStorage.getItem(FALLBACK_STORE_KEY);
    if (!raw) {
      const initial = { traders: [], drivers: [], invoices: [], invoice_items: [], payments: [], withdrawals: [], transactions_log: [], settings: {} };
      localStorage.setItem(FALLBACK_STORE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch (error) {
    const initial = { traders: [], drivers: [], invoices: [], invoice_items: [], payments: [], withdrawals: [], transactions_log: [], settings: {} };
    localStorage.setItem(FALLBACK_STORE_KEY, JSON.stringify(initial));
    return initial;
  }
}

function persistFallbackStore(store) {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    localStorage.setItem(FALLBACK_STORE_KEY, JSON.stringify(store));
  }
}

function ensureFallbackStore() {
  const store = getFallbackStore();
  store.traders ??= [];
  store.drivers ??= [];
  store.invoices ??= [];
  store.invoice_items ??= [];
  store.payments ??= [];
  store.withdrawals ??= [];
  store.transactions_log ??= [];
  store.settings ??= {};
  return store;
}

function getFallbackRecords(table) {
  const store = ensureFallbackStore();
  return (store[table] || []).map(item => cloneData(item));
}

function saveFallbackRecords(table, rows) {
  const store = ensureFallbackStore();
  store[table] = rows;
  persistFallbackStore(store);
}

function getFallbackRecordById(table, id) {
  return getFallbackRecords(table).find(item => item.id === id) ?? null;
}

function updateFallbackRecord(table, id, updater) {
  const store = ensureFallbackStore();
  const rows = store[table] || [];
  const index = rows.findIndex(item => item.id === id);
  if (index === -1) return null;
  rows[index] = { ...rows[index], ...updater(rows[index]) };
  store[table] = rows;
  persistFallbackStore(store);
  return cloneData(rows[index]);
}

function pushFallbackRecord(table, row) {
  const store = ensureFallbackStore();
  store[table] = store[table] || [];
  store[table].push(cloneData(row));
  persistFallbackStore(store);
  return cloneData(row);
}

function normalizeDriverNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export async function getDb() {
  if (!_db) {
    if (!isTauriRuntime()) {
      _db = fallbackDb;
      return _db;
    }
    try {
      const Database = (await import("@tauri-apps/plugin-sql")).default;
      _db = await Database.load("sqlite:warehouse.db");
    } catch (error) {
      console.warn("Falling back to local browser storage:", error);
      _db = fallbackDb;
    }
  }
  if (isTauriRuntime() && !_schemaEnsured) {
    await ensureDesktopSchema(_db);
    _schemaEnsured = true;
  }
  return _db;
}

export async function hasColumn(table, column) {
  const cacheKey = `${table}.${column}`;
  if (_tableColumnCache.has(cacheKey)) return _tableColumnCache.get(cacheKey);
  const db = await getDb();
  const exists = await tableHasColumn(db, table, column);
  _tableColumnCache.set(cacheKey, exists);
  return exists;
}

async function tableHasColumn(db, table, column) {
  const rows = await db.select(`PRAGMA table_info(${table})`);
  return rows.some(row => String(row.name).toLowerCase() === String(column).toLowerCase());
}

async function addColumnIfMissing(db, table, column, definition) {
  if (await tableHasColumn(db, table, column)) return false;
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  _tableColumnCache.set(`${table}.${column}`, true);
  return true;
}

async function ensureDesktopSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id              TEXT PRIMARY KEY,
      amount          INTEGER NOT NULL DEFAULT 0,
      withdrawer_type TEXT NOT NULL,
      person_name     TEXT NOT NULL,
      date            TEXT NOT NULL,
      driver_id       TEXT,
      person_id       TEXT,
      person_type     TEXT,
      withdrawal_details TEXT,
      applied_amount  INTEGER NOT NULL DEFAULT 0,
      debt_amount     INTEGER NOT NULL DEFAULT 0,
      debt_paid       INTEGER NOT NULL DEFAULT 0,
      sheet_opened_at TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      is_deleted      INTEGER NOT NULL DEFAULT 0
    )
  `);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_withdrawals_date ON withdrawals(date) WHERE is_deleted=0");
  await addColumnIfMissing(db, "withdrawals", "person_id", "TEXT");
  await addColumnIfMissing(db, "withdrawals", "person_type", "TEXT");
  await addColumnIfMissing(db, "withdrawals", "withdrawal_details", "TEXT");
  await addColumnIfMissing(db, "withdrawals", "debt_paid", "INTEGER NOT NULL DEFAULT 0");
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS driver_sheets (
        id              TEXT PRIMARY KEY,
        driver_id       TEXT NOT NULL REFERENCES drivers(id),
        sheet_opened_at TEXT NOT NULL,
        sheet_closed_at TEXT NOT NULL,
        total_amount    INTEGER NOT NULL DEFAULT 0,
        commission_rate INTEGER NOT NULL DEFAULT 0,
        commission_amount INTEGER NOT NULL DEFAULT 0,
        withdrawal_amount INTEGER NOT NULL DEFAULT 0,
        withdrawal_details TEXT,
        items_count     INTEGER NOT NULL DEFAULT 0,
        notes           TEXT,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        is_deleted      INTEGER NOT NULL DEFAULT 0
      )
    `);
    await addColumnIfMissing(db, "driver_sheets", "commission_rate", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(db, "driver_sheets", "commission_amount", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(db, "driver_sheets", "withdrawal_amount", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfMissing(db, "driver_sheets", "withdrawal_details", "TEXT");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_driver_sheets_driver ON driver_sheets(driver_id) WHERE is_deleted=0");
    await db.execute("CREATE INDEX IF NOT EXISTS idx_driver_sheets_date ON driver_sheets(sheet_closed_at) WHERE is_deleted=0");
  } catch (e) {
    // جدول موجود مسبقاً
  }

  await addColumnIfMissing(db, "traders", "phone", "TEXT");
  await addColumnIfMissing(db, "traders", "address", "TEXT");
  await addColumnIfMissing(db, "traders", "notes", "TEXT");
  await addColumnIfMissing(db, "traders", "debt_fils", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "traders", "created_at", "TEXT");
  await addColumnIfMissing(db, "traders", "updated_at", "TEXT");
  await addColumnIfMissing(db, "traders", "is_deleted", "INTEGER NOT NULL DEFAULT 0");

  await addColumnIfMissing(db, "drivers", "phone", "TEXT");
  await addColumnIfMissing(db, "drivers", "vehicle_plate", "TEXT");
  await addColumnIfMissing(db, "drivers", "notes", "TEXT");
  await addColumnIfMissing(db, "drivers", "created_at", "TEXT");
  await addColumnIfMissing(db, "drivers", "updated_at", "TEXT");
  await addColumnIfMissing(db, "drivers", "is_deleted", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "drivers", "driver_number", "INTEGER");
  // ─── حقول نظام قائمة السائق ───────────────────────────────────────────────
  await addColumnIfMissing(db, "drivers", "sheet_status", "TEXT NOT NULL DEFAULT 'closed'");
  await addColumnIfMissing(db, "drivers", "sheet_opened_at", "TEXT");
  await addColumnIfMissing(db, "drivers", "is_paid", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "drivers", "debt", "INTEGER NOT NULL DEFAULT 0");

  await addColumnIfMissing(db, "invoice_items", "invoice_id", "TEXT NOT NULL");
  await addColumnIfMissing(db, "invoice_items", "product_name", "TEXT NOT NULL");
  await addColumnIfMissing(db, "invoice_items", "gross_weight", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "basket_count", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "basket_weight_each", "INTEGER NOT NULL DEFAULT 50");
  await addColumnIfMissing(db, "invoice_items", "net_weight", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "price", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "basket_price", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "amount_before", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "commission_rate", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "commission_value", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "amount_after_comm", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "porterage", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "final_amount", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "basket_number", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "created_at", "TEXT NOT NULL");
  await addColumnIfMissing(db, "invoice_items", "updated_at", "TEXT NOT NULL");
  await addColumnIfMissing(db, "invoice_items", "is_deleted", "INTEGER NOT NULL DEFAULT 0");
  // ─── معرف السائق على مستوى البند ─────────────────────────────────────────
  await addColumnIfMissing(db, "invoice_items", "driver_id", "TEXT");

  await addColumnIfMissing(db, "invoices", "trader_id", "TEXT REFERENCES traders(id)");
  await addColumnIfMissing(db, "invoices", "driver_id", "TEXT REFERENCES drivers(id)");
  await addColumnIfMissing(db, "invoices", "date", "TEXT");
  await addColumnIfMissing(db, "invoices", "status", "TEXT NOT NULL DEFAULT 'draft'");
  await addColumnIfMissing(db, "invoices", "total_final", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoices", "paid_amount", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoices", "remaining", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoices", "notes", "TEXT");
  await addColumnIfMissing(db, "invoices", "created_at", "TEXT");
  await addColumnIfMissing(db, "invoices", "updated_at", "TEXT");
  await addColumnIfMissing(db, "invoices", "is_deleted", "INTEGER NOT NULL DEFAULT 0");

  await addColumnIfMissing(db, "payments", "trader_id", "TEXT REFERENCES traders(id)");
  await addColumnIfMissing(db, "payments", "amount", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "payments", "date", "TEXT");
  await addColumnIfMissing(db, "payments", "notes", "TEXT");
  await addColumnIfMissing(db, "payments", "created_at", "TEXT");
  await addColumnIfMissing(db, "payments", "updated_at", "TEXT");
  await addColumnIfMissing(db, "payments", "is_deleted", "INTEGER NOT NULL DEFAULT 0");

  await addColumnIfMissing(db, "transactions_log", "type", "TEXT");
  await addColumnIfMissing(db, "transactions_log", "ref_id", "TEXT");
  await addColumnIfMissing(db, "transactions_log", "trader_id", "TEXT REFERENCES traders(id)");
  await addColumnIfMissing(db, "transactions_log", "amount", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "transactions_log", "description", "TEXT");
  await addColumnIfMissing(db, "transactions_log", "date", "TEXT");
  await addColumnIfMissing(db, "transactions_log", "created_at", "TEXT");
  await addColumnIfMissing(db, "transactions_log", "is_deleted", "INTEGER NOT NULL DEFAULT 0");

  await addColumnIfMissing(db, "settings", "updated_at", "TEXT");
}

export function uuid() { return crypto.randomUUID(); }
export function now() { return new Date().toISOString(); }
export function today() { return new Date().toISOString().slice(0, 10); }

// ─── Traders ─────────────────────────────────────────────────────────────────
export async function getTraders() {
  if (!isTauriRuntime()) {
    return getFallbackRecords("traders").filter(item => item.is_deleted !== 1).sort((a, b) => a.name.localeCompare(b.name));
  }
  const db = await getDb();
  return db.select("SELECT * FROM traders WHERE is_deleted=0 ORDER BY name");
}

export async function createTrader({ name, phone = null, address = null, notes = null }) {
  if (!isTauriRuntime()) {
    const store = ensureFallbackStore(); const id = uuid(); const ts = now();
    store.traders.push({ id, name, phone, address, notes, debt_fils: 0, is_deleted: 0, created_at: ts, updated_at: ts });
    persistFallbackStore(store); return id;
  }
  const db = await getDb(); const id = uuid(); const ts = now();
  await db.execute("INSERT INTO traders (id, name, phone, address, notes, debt_fils, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)", [id, name, phone, address, notes, ts, ts]);
  return id;
}

export async function updateTrader(id, fields) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("traders", id, row => ({ ...row, name: fields.name, phone: fields.phone ?? null, address: fields.address ?? null, notes: fields.notes ?? null, updated_at: now() })); return;
  }
  const db = await getDb();
  await db.execute("UPDATE traders SET name=?, phone=?, address=?, notes=?, updated_at=? WHERE id=?", [fields.name, fields.phone ?? null, fields.address ?? null, fields.notes ?? null, now(), id]);
}

export async function deleteTrader(id) {
  if (!isTauriRuntime()) { updateFallbackRecord("traders", id, row => ({ ...row, is_deleted: 1, updated_at: now() })); return; }
  const db = await getDb();
  await db.execute("UPDATE traders SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Drivers ─────────────────────────────────────────────────────────────────
export async function getDrivers() {
  if (!isTauriRuntime()) {
    return getFallbackRecords("drivers")
      .filter(item => item.is_deleted !== 1)
      .sort((a, b) => (a.driver_number ?? 1e9) - (b.driver_number ?? 1e9) || a.name.localeCompare(b.name));
  }
  const db = await getDb();
  return db.select("SELECT * FROM drivers WHERE is_deleted=0 ORDER BY driver_number IS NULL, driver_number ASC, name ASC");
}

/** جلب السواق الذين لديهم قائمة مفتوحة فقط (للاختيار في بنود المبيعات) */
export async function getActiveDrivers() {
  if (!isTauriRuntime()) {
    return getFallbackRecords("drivers")
      .filter(d => d.is_deleted !== 1 && d.sheet_status === 'open')
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  const db = await getDb();
  return db.select("SELECT * FROM drivers WHERE is_deleted=0 AND sheet_status='open' ORDER BY name");
}

/** فتح قائمة للسائق — إذا كانت مفتوحة مسبقاً لا يُعاد تعيين الوقت */
export async function openDriverSheet(driverId) {
  if (!isTauriRuntime()) {
    const driver = getFallbackRecords("drivers").find(d => d.id === driverId);
    if (driver?.sheet_status === 'open') return;
    const ts = now();
    updateFallbackRecord("drivers", driverId, row => ({ ...row, sheet_status: 'open', sheet_opened_at: ts, is_paid: 0, updated_at: ts }));
    return;
  }
  const db = await getDb();
  const rows = await db.select("SELECT sheet_status FROM drivers WHERE id=?", [driverId]);
  if (rows[0]?.sheet_status === 'open') return;
  const ts = now();
  await db.execute("UPDATE drivers SET sheet_status='open', sheet_opened_at=?, is_paid=0, updated_at=? WHERE id=?", [ts, ts, driverId]);
}

/** فتح قائمة جديدة بعد تسجيل المواد التي أحضرها السائق وعدد السلات المتاحة */
export async function openDriverSheetWithInventory(driverId, items) {
  const validItems = (items || []).filter(
    item => item.product_name && Number(item.basket_count) > 0
  );
  if (!validItems.length) throw new Error("يجب إدخال مادة واحدة على الأقل");

  await openDriverSheet(driverId);
  const invoiceId = await createInvoice({
    trader_id: null,
    driver_id: driverId,
    date: now(),
    notes: "إدخال مواد قائمة السائق",
  });

  for (const item of validItems) {
    await upsertInvoiceItem({
      invoice_id: invoiceId,
      product_name: item.product_name,
      gross_weight: 0,
      basket_count: Number(item.basket_count),
      basket_weight_each: 0,
      net_weight: 0,
      price: 0,
      basket_price: 0,
      amount_before: 0,
      commission_rate: 0,
      commission_value: 0,
      amount_after_comm: 0,
      porterage: 0,
      final_amount: 0,
      driver_id: driverId,
    });
  }
}

/** إغلاق قائمة السائق مع حفظ في جدول driver_sheets */
export async function closeDriverSheet(driverId, { commissionRate = 0, commissionAmount = 0, withdrawalAmount = 0, withdrawalDetails = "" } = {}) {
  const normalizedCommissionRate = Math.max(0, Math.min(100, Number(commissionRate) || 0));
  const normalizedCommission = Math.max(0, Math.round(Number(commissionAmount) || 0));
  const normalizedWithdrawal = Math.max(0, Math.round(Number(withdrawalAmount) || 0));
  const normalizedWithdrawalDetails = String(withdrawalDetails || "").trim() || null;
  if (!isTauriRuntime()) {
    const driver = getFallbackRecords("drivers").find(d => d.id === driverId);
    if (!driver) return;
    
    // حساب إجمالي القائمة المغلقة
    const sheetItems = getDriverSheetItemsSync(driverId, driver.sheet_opened_at);
    const totalAmount = sheetItems.reduce((sum, item) => {
      const itemAmount = roundDownToStep(item.net_weight * (item.price / 100), 250);
      return sum + itemAmount;
    }, 0);
    const debtDeducted = Math.min(Number(driver.debt || 0), totalAmount);
    
    // حفظ في driver_sheets
    const sheetId = uuid();
    const ts = now();
    const store = ensureFallbackStore();
    store.driver_sheets = store.driver_sheets || [];
    store.driver_sheets.push({
      id: sheetId,
      driver_id: driverId,
      sheet_opened_at: driver.sheet_opened_at,
      sheet_closed_at: ts,
      total_amount: totalAmount,
      commission_rate: normalizedCommissionRate,
      commission_amount: normalizedCommission,
      withdrawal_amount: normalizedWithdrawal,
      withdrawal_details: normalizedWithdrawalDetails,
      items_count: sheetItems.length,
      notes: null,
      is_deleted: 0,
      created_at: ts,
      updated_at: ts,
    });
    persistFallbackStore(store);
    
    // تحديث حالة السائق
    updateFallbackRecord("drivers", driverId, row => ({ ...row, sheet_status: 'closed', debt: Math.max(0, Number(row.debt || 0) - debtDeducted), updated_at: ts }));
    return;
  }
  
  const db = await getDb();
  const driver = await db.select("SELECT sheet_opened_at, debt FROM drivers WHERE id=?", [driverId]);
  if (!driver[0]) return;
  
  const sheetItems = await db.select(`
    SELECT ii.net_weight, ii.price FROM invoice_items ii
    WHERE ii.driver_id = ? AND ii.is_deleted = 0
    AND ii.created_at >= ?
  `, [driverId, driver[0].sheet_opened_at || '']);
  
  const totalAmount = sheetItems.reduce((sum, item) => {
    const itemAmount = roundDownToStep(item.net_weight * (item.price / 100), 250);
    return sum + itemAmount;
  }, 0);
  const debtDeducted = Math.min(Number(driver[0].debt || 0), totalAmount);
  
  const ts = now();
  const sheetId = uuid();
  
  // حفظ في driver_sheets
  await db.execute(`
    INSERT INTO driver_sheets (
      id, driver_id, sheet_opened_at, sheet_closed_at, total_amount,
      commission_rate, commission_amount, withdrawal_amount, withdrawal_details,
      items_count, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    sheetId, driverId, driver[0].sheet_opened_at, ts, totalAmount,
    normalizedCommissionRate, normalizedCommission, normalizedWithdrawal, normalizedWithdrawalDetails,
    sheetItems.length, ts, ts,
  ]);
  
  // تحديث حالة السائق
  await db.execute("UPDATE drivers SET debt=MAX(0, debt-?), sheet_status='closed', updated_at=? WHERE id=?", [debtDeducted, ts, driverId]);
}

function roundDownToStep(value, step) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  return Math.floor(value / step) * step;
}

function getDriverSheetItemsSync(driverId, sheetOpenedAt) {
  return getFallbackRecords("invoice_items")
    .filter(it => it.driver_id === driverId && it.is_deleted !== 1 && (!sheetOpenedAt || it.created_at >= sheetOpenedAt));
}

/** تبديل حالة الواصل/غير الواصل للسائق */
export async function toggleDriverPaid(driverId, isPaid) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("drivers", driverId, row => ({ ...row, is_paid: isPaid ? 1 : 0, updated_at: now() })); return;
  }
  const db = await getDb();
  await db.execute("UPDATE drivers SET is_paid=?, updated_at=? WHERE id=?", [isPaid ? 1 : 0, now(), driverId]);
}

/** جلب بنود القائمة المفتوحة الحالية للسائق (منذ آخر فتح للقائمة) */
/** جلب جميع القوائم المغلقة للسائق */
export async function getClosedDriverSheets(driverId) {
  if (!isTauriRuntime()) {
    return getFallbackRecords("driver_sheets")
      .filter(sheet => sheet.driver_id === driverId && sheet.is_deleted !== 1)
      .sort((a, b) => (b.sheet_closed_at || '').localeCompare(a.sheet_closed_at || ''));
  }
  const db = await getDb();
  return db.select(
    "SELECT * FROM driver_sheets WHERE driver_id=? AND is_deleted=0 ORDER BY sheet_closed_at DESC",
    [driverId]
  );
}

/** جلب بنود قائمة مغلقة معينة */
export async function getClosedSheetItems(driverId, sheetOpenedAt, sheetClosedAt) {
  if (!isTauriRuntime()) {
    const invoices = new Map(getFallbackRecords("invoices").map(invoice => [invoice.id, invoice]));
    return getFallbackRecords("invoice_items")
      .filter(it => it.driver_id === driverId && it.is_deleted !== 1 && it.created_at >= sheetOpenedAt && it.created_at <= sheetClosedAt)
      .map(it => ({ ...it, trader_id: invoices.get(it.invoice_id)?.trader_id ?? null }))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }
  const db = await getDb();
  return db.select(`
    SELECT ii.*, i.date, i.trader_id, t.name as trader_name
    FROM invoice_items ii
    LEFT JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN traders t ON i.trader_id = t.id
    WHERE ii.driver_id = ? AND ii.is_deleted = 0
    AND ii.created_at >= ? AND ii.created_at <= ?
    ORDER BY ii.created_at DESC
  `, [driverId, sheetOpenedAt, sheetClosedAt]);
}

/** جلب بنود القائمة للسائق - تم تعديلها لتدعم القوائم المفتوحة والمغلقة للمعاينة */
export async function getDriverSheetItems(driverId) {
  if (!isTauriRuntime()) {
    const driver = getFallbackRecords("drivers").find(d => d.id === driverId && d.is_deleted !== 1);
    if (!driver) return []; // تم إلغاء حظر القوائم المغلقة هنا للمعاينة التاريخية
    const since = driver.sheet_opened_at || '';
    const items = getFallbackRecords("invoice_items")
      .filter(it => it.driver_id === driverId && it.is_deleted !== 1 && (!since || it.created_at >= since));
    const invoices = new Map(getFallbackRecords("invoices").filter(i => i.is_deleted !== 1).map(i => [i.id, i]));
    const traders = new Map(getFallbackRecords("traders").filter(t => t.is_deleted !== 1).map(t => [t.id, t]));
    return items.map(it => {
      const inv = invoices.get(it.invoice_id) || {};
      return { ...it, date: inv.date, trader_id: inv.trader_id ?? null, trader_name: traders.get(inv.trader_id)?.name ?? '—' };
    }).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }
  const db = await getDb();
  return db.select(`
    SELECT ii.*, i.date, i.trader_id, t.name as trader_name
    FROM invoice_items ii
    LEFT JOIN invoices i ON ii.invoice_id = i.id
    LEFT JOIN traders t ON i.trader_id = t.id
    INNER JOIN drivers d ON ii.driver_id = d.id
    WHERE ii.driver_id = ?
      AND ii.is_deleted = 0
      AND (i.is_deleted = 0 OR i.id IS NULL)
      -- تم حذف شرط فتح القائمة d.sheet_status = 'open' للسماح بمعاينتها بعد الإغلاق
      AND (d.sheet_opened_at IS NULL OR ii.created_at >= d.sheet_opened_at)
    ORDER BY ii.created_at DESC
  `, [driverId]);
}

/** جلب المواد المتبقية للسائق: المخزون الأصلي ناقص السلات المباعة */
export async function getDriverAvailableInventory(driverId) {
  const items = await getDriverSheetItems(driverId);
  const inventory = new Map();

  for (const item of items) {
    const productName = item.product_name?.trim();
    if (!productName) continue;
    const basketCount = Number(item.basket_count || 0);
    const current = inventory.get(productName) || 0;
    inventory.set(productName, current + (item.trader_id ? -basketCount : basketCount));
  }

  return Array.from(inventory, ([product_name, basket_count]) => ({
    product_name,
    basket_count: Math.max(0, basket_count),
  })).filter(item => item.basket_count > 0 || isFixedMaterial(item.product_name));
}

/** تصفير مخزون القائمة المتبقي واعتباره تالفاً قبل الإغلاق اليدوي */
export async function discardDriverSheetInventory(driverId) {
  if (!isTauriRuntime()) {
    const driver = getFallbackRecords("drivers").find(d => d.id === driverId);
    if (!driver) return;
    const store = ensureFallbackStore();
    const invoices = new Map(
      (store.invoices || []).filter(invoice => invoice.is_deleted !== 1).map(invoice => [invoice.id, invoice])
    );
    const items = store.invoice_items || [];
    for (const item of items) {
      const invoice = invoices.get(item.invoice_id);
      if (
        item.driver_id === driverId &&
        invoice?.trader_id == null &&
        item.is_deleted !== 1 &&
        (!driver.sheet_opened_at || item.created_at >= driver.sheet_opened_at)
      ) {
        item.basket_count = 0;
        item.updated_at = now();
      }
    }
    persistFallbackStore(store);
    return;
  }

  const db = await getDb();
  const driver = await db.select("SELECT sheet_opened_at FROM drivers WHERE id=?", [driverId]);
  if (!driver[0]) return;
  await db.execute(`
    UPDATE invoice_items
    SET basket_count=0, updated_at=?
    WHERE driver_id=? AND is_deleted=0 AND created_at >= ?
      AND invoice_id IN (SELECT id FROM invoices WHERE trader_id IS NULL AND is_deleted=0)
  `, [now(), driverId, driver[0].sheet_opened_at || ""]);
}

export async function createDriver({ name, phone = null, driver_number = null, notes = null }) {
  const num = normalizeDriverNumber(driver_number);
  if (!isTauriRuntime()) {
    const store = ensureFallbackStore(); const id = uuid(); const ts = now();
    store.drivers.push({ id, name, phone, notes, driver_number: num, sheet_status: 'closed', sheet_opened_at: null, is_paid: 0, debt: 0, is_deleted: 0, created_at: ts, updated_at: ts });
    persistFallbackStore(store); return id;
  }
  const db = await getDb(); const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO drivers (id, name, phone, notes, driver_number, sheet_status, is_paid, debt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'closed', 0, 0, ?, ?)",
    [id, name, phone, notes, num, ts, ts]
  );
  return id;
}

export async function updateDriver(id, fields) {
  const num = normalizeDriverNumber(fields.driver_number);
  if (!isTauriRuntime()) {
    updateFallbackRecord("drivers", id, row => ({ ...row, name: fields.name, phone: fields.phone ?? null, driver_number: num, notes: fields.notes ?? null, updated_at: now() }));
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE drivers SET name=?, phone=?, driver_number=?, notes=?, updated_at=? WHERE id=?",
    [fields.name, fields.phone ?? null, num, fields.notes ?? null, now(), id]
  );
}

export async function deleteDriver(id) {
  if (!isTauriRuntime()) { updateFallbackRecord("drivers", id, row => ({ ...row, is_deleted: 1, updated_at: now() })); return; }
  const db = await getDb();
  await db.execute("UPDATE drivers SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

/** البحث عن سائق بالرقم التعريفي التسلسلي */
export async function getDriverByNumber(number) {
  const num = parseInt(number, 10);
  if (!num || num < 1) return null;
  if (!isTauriRuntime()) {
    return getFallbackRecords("drivers").find(d => d.driver_number === num && d.is_deleted !== 1) ?? null;
  }
  const db = await getDb();
  const rows = await db.select("SELECT * FROM drivers WHERE driver_number=? AND is_deleted=0 LIMIT 1", [num]);
  return rows[0] ?? null;
}

// ─── Invoices ────────────────────────────────────────────────────────────────
export async function getInvoices({ from = null, to = null, status = null, trader_id = null } = {}) {
  if (!isTauriRuntime()) {
    const traders = new Map(getFallbackRecords("traders").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    const drivers = getFallbackRecords("drivers").filter(item => item.is_deleted !== 1);
    return getFallbackRecords("invoices")
      .filter(item => item.is_deleted !== 1)
      .filter(item => !from || item.date >= from)
      .filter(item => !to || item.date <= to)
      .filter(item => !status || item.status === status)
      .filter(item => !trader_id || item.trader_id === trader_id)
      .map(item => {
        const driver = drivers.find(candidate => String(candidate.id) === String(item.driver_id));
        return { ...item, trader_name: traders.get(item.trader_id)?.name ?? null, driver_name: driver?.name ?? null, vehicle_plate: driver?.vehicle_plate ?? null };
      })
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created_at || "").localeCompare(a.created_at || ""));
  }
  const db = await getDb();
  let where = "i.is_deleted=0"; const params = [];
    if (from)      { where += " AND i.date >= ?"; params.push(from); }
  if (to)        { where += " AND i.date <= ?"; params.push(to); }
  if (status)    { where += " AND i.status = ?"; params.push(status); }
  if (trader_id) { where += " AND i.trader_id = ?"; params.push(trader_id); }
  return db.select(`SELECT i.*, t.name as trader_name, d.name as driver_name, d.vehicle_plate as vehicle_plate FROM invoices i LEFT JOIN traders t ON i.trader_id = t.id LEFT JOIN drivers d ON i.driver_id = d.id WHERE ${where} ORDER BY i.date DESC, i.created_at DESC`, params);
}

export async function getInvoice(id) {
  if (!isTauriRuntime()) {
    const invoice = getFallbackRecords("invoices").find(item => item.id === id && item.is_deleted !== 1);
    if (!invoice) return null;
    const traders = new Map(getFallbackRecords("traders").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    const drivers = new Map(getFallbackRecords("drivers").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    return { ...invoice, trader_name: traders.get(invoice.trader_id)?.name ?? null, driver_name: drivers.get(invoice.driver_id)?.name ?? null, vehicle_plate: drivers.get(invoice.driver_id)?.vehicle_plate ?? null };
  }
  const db = await getDb();
  const rows = await db.select(`SELECT i.*, t.name as trader_name, d.name as driver_name, d.vehicle_plate as vehicle_plate FROM invoices i LEFT JOIN traders t ON i.trader_id = t.id LEFT JOIN drivers d ON i.driver_id = d.id WHERE i.id=? AND i.is_deleted=0`, [id]);
    return rows[0] ?? null;
}

export async function createInvoice({ trader_id, driver_id = null, date, notes = null }) {
  if (!isTauriRuntime()) {
    const id = uuid(); const ts = now();
    pushFallbackRecord("invoices", { id, trader_id, driver_id, date, status: "draft", total_final: 0, paid_amount: 0, remaining: 0, notes, is_deleted: 0, created_at: ts, updated_at: ts });
    return id;
  }
  const db = await getDb(); const id = uuid(); const ts = now();
    await db.execute(`INSERT INTO invoices (id, trader_id, driver_id, date, status, total_final, paid_amount, remaining, notes, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', 0, 0, 0, ?, ?, ?)`, [id, trader_id, driver_id, date, notes, ts, ts]);
  return id;
}

export async function updateInvoiceTotals(id, { total_final, paid_amount, remaining, notes = null }) {
  if (!isTauriRuntime()) { updateFallbackRecord("invoices", id, row => ({ ...row, total_final, paid_amount, remaining, notes, updated_at: now() })); return; }
  const db = await getDb();
  await db.execute("UPDATE invoices SET total_final=?, paid_amount=?, remaining=?, notes=?, updated_at=? WHERE id=?", [total_final, paid_amount, remaining, notes, now(), id]);
}

export async function postInvoice(invoiceId) {
  if (!isTauriRuntime()) {
    const ts = now(); const inv = await getInvoice(invoiceId);
    if (!inv) throw new Error("الفاتورة غير موجودة");
    if (inv.status === "posted") throw new Error("الفاتورة مُرحّلة مسبقاً");
    updateFallbackRecord("invoices", invoiceId, row => ({ ...row, status: "posted", updated_at: ts }));
    if (inv.remaining > 0 && inv.trader_id) updateFallbackRecord("traders", inv.trader_id, row => ({ ...row, debt_fils: Number(row.debt_fils || 0) + Number(inv.remaining || 0), updated_at: ts }));
    pushFallbackRecord("transactions_log", { id: uuid(), type: "invoice_posted", ref_id: invoiceId, trader_id: inv.trader_id, amount: inv.total_final, description: `ترحيل فاتورة — ${inv.trader_name ?? ""}`, date: inv.date, created_at: ts });
    return;
  }
  const db = await getDb(); const ts = now(); const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (inv.status === "posted") throw new Error("الفاتورة مُرحّلة مسبقاً");
  await db.execute("UPDATE invoices SET status='posted', updated_at=? WHERE id=?", [ts, invoiceId]);
  if (inv.remaining > 0 && inv.trader_id) await db.execute("UPDATE traders SET debt_fils = debt_fils + ?, updated_at=? WHERE id=?", [inv.remaining, ts, inv.trader_id]);
  await db.execute(`INSERT INTO transactions_log (id, type, ref_id, trader_id, amount, description, date, created_at) VALUES (?, 'invoice_posted', ?, ?, ?, ?, ?, ?)`, [uuid(), invoiceId, inv.trader_id, inv.total_final, `ترحيل فاتورة — ${inv.trader_name ?? ""}`, inv.date, ts]);
}

export async function reverseInvoice(invoiceId) {
  if (!isTauriRuntime()) {
    const ts = now(); const inv = await getInvoice(invoiceId);
    if (!inv) throw new Error("الفاتورة غير موجودة");
    if (inv.status !== "posted") throw new Error("الفاتورة غير مُرحّلة");
    updateFallbackRecord("invoices", invoiceId, row => ({ ...row, status: "draft", updated_at: ts }));
    if (inv.remaining > 0 && inv.trader_id) updateFallbackRecord("traders", inv.trader_id, row => ({ ...row, debt_fils: Number(row.debt_fils || 0) - Number(inv.remaining || 0), updated_at: ts }));
    pushFallbackRecord("transactions_log", { id: uuid(), type: "reversal", ref_id: invoiceId, trader_id: inv.trader_id, amount: inv.total_final, description: `عكس فاتورة — ${inv.trader_name ?? ""}`, date: inv.date, created_at: ts });
    return;
  }
  const db = await getDb(); const ts = now(); const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (inv.status !== "posted") throw new Error("الفاتورة غير مُرحّلة");
  await db.execute("UPDATE invoices SET status='draft', updated_at=? WHERE id=?", [ts, invoiceId]);
  if (inv.remaining > 0 && inv.trader_id) await db.execute("UPDATE traders SET debt_fils = debt_fils - ?, updated_at=? WHERE id=?", [inv.remaining, ts, inv.trader_id]);
  await db.execute(`INSERT INTO transactions_log (id, type, ref_id, trader_id, amount, description, date, created_at) VALUES (?, 'reversal', ?, ?, ?, ?, ?, ?)`, [uuid(), invoiceId, inv.trader_id, inv.total_final, `عكس فاتورة — ${inv.trader_name ?? ""}`, inv.date, ts]);
}

export async function deleteInvoice(id) {
  if (!isTauriRuntime()) { updateFallbackRecord("invoices", id, row => ({ ...row, is_deleted: 1, updated_at: now() })); return; }
  const db = await getDb();
  await db.execute("UPDATE invoices SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Invoice Items ────────────────────────────────────────────────────────────
export async function getInvoiceItems(invoice_id) {
  if (!isTauriRuntime()) {
    const items = getFallbackRecords("invoice_items")
      .filter(item => item.invoice_id === invoice_id && item.is_deleted !== 1)
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    const drivers = getFallbackRecords("drivers");
    return items.map(it => ({
      ...it,
      driver_name: drivers.find(driver => String(driver.id) === String(it.driver_id))?.name ?? null,
    }));
  }
  const db = await getDb();
  return db.select(`
    SELECT ii.*, d.name as driver_name
    FROM invoice_items ii
    LEFT JOIN drivers d ON ii.driver_id = d.id
    WHERE ii.invoice_id=? AND ii.is_deleted=0
    ORDER BY ii.created_at
  `, [invoice_id]);
}

export async function upsertInvoiceItem(item) {
  if (!isTauriRuntime()) {
    const ts = now(); const id = item.id ?? uuid();
    const existing = getFallbackRecords("invoice_items").find(row => row.id === id);
    const record = {
      id, invoice_id: item.invoice_id, product_name: item.product_name,
      gross_weight: item.gross_weight, basket_count: item.basket_count,
      basket_weight_each: item.basket_weight_each ?? 50, net_weight: item.net_weight,
      price: item.price, basket_price: item.basket_price ?? 0,
      amount_before: item.amount_before, commission_rate: item.commission_rate,
      commission_value: item.commission_value, amount_after_comm: item.amount_after_comm,
      porterage: item.porterage, final_amount: item.final_amount,
      driver_id: item.driver_id ?? null,
    };
    if (existing) {
      updateFallbackRecord("invoice_items", id, row => ({ ...row, ...record, updated_at: ts }));
    } else {
      pushFallbackRecord("invoice_items", { ...record, is_deleted: 0, created_at: ts, updated_at: ts });
    }
    return id;
  }
  const db = await getDb(); const ts = now(); const id = item.id ?? uuid();
  await db.execute(
    `INSERT INTO invoice_items
      (id, invoice_id, product_name, gross_weight, basket_count, basket_weight_each,
       net_weight, price, basket_price, amount_before, commission_rate, commission_value,
       amount_after_comm, porterage, final_amount, driver_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       product_name=excluded.product_name, gross_weight=excluded.gross_weight,
       basket_count=excluded.basket_count, basket_weight_each=excluded.basket_weight_each,
       net_weight=excluded.net_weight, price=excluded.price, basket_price=excluded.basket_price,
       amount_before=excluded.amount_before, commission_rate=excluded.commission_rate,
       commission_value=excluded.commission_value, amount_after_comm=excluded.amount_after_comm,
       porterage=excluded.porterage, final_amount=excluded.final_amount,
       driver_id=excluded.driver_id, updated_at=excluded.updated_at`,
    [id, item.invoice_id, item.product_name,
     item.gross_weight, item.basket_count, item.basket_weight_each ?? 50,
     item.net_weight, item.price, item.basket_price ?? 0,
     item.amount_before, item.commission_rate, item.commission_value,
     item.amount_after_comm, item.porterage, item.final_amount,
     item.driver_id ?? null, ts, ts]
  );
  return id;
}

export async function deleteInvoiceItem(id) {
  if (!isTauriRuntime()) { updateFallbackRecord("invoice_items", id, row => ({ ...row, is_deleted: 1, updated_at: now() })); return; }
  const db = await getDb();
  await db.execute("UPDATE invoice_items SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── تعديل/حذف مواد مخزون قائمة السائق المفتوحة ───────────────────────────
/** يتحقق أن المباع من المواد المعنية لا يتجاوز الوارد بعد التعديل؛ يعيد اسم أول مادة مخالفة أو null */
function findInventoryShortage(items, productNames) {
  const balance = new Map();
  for (const it of items) {
    const name = it.product_name?.trim();
    if (!name || !productNames.has(name)) continue;
    const count = Number(it.basket_count || 0);
    balance.set(name, (balance.get(name) || 0) + (it.trader_id ? -count : count));
  }
  for (const [name, value] of balance) if (value < 0) return name;
  return null;
}

async function getInventoryContext(driverId, itemId) {
  const items = await getDriverSheetItems(driverId);
  const target = items.find(it => it.id === itemId && it.trader_id == null);
  if (!target) throw new Error("المادة غير موجودة في مخزون هذه القائمة");
  return { items, target };
}

export async function updateDriverInventoryItem(driverId, itemId, { product_name, basket_count }) {
  const name = String(product_name || "").trim();
  const count = Number(basket_count);
  if (!name) throw new Error("اسم المادة مطلوب");
  if (!Number.isInteger(count) || (count <= 0 && !isFixedMaterial(name))) {
    throw new Error("أدخل عدد سلات صحيحاً أكبر من صفر");
  }

  const { items, target } = await getInventoryContext(driverId, itemId);
  const next = items.map(it => it.id === itemId ? { ...it, product_name: name, basket_count: count } : it);
  const shortage = findInventoryShortage(next, new Set([target.product_name?.trim(), name]));
  if (shortage) throw new Error(`لا يمكن التعديل: المباع من «${shortage}» أكبر من الكمية المتبقية بعد التعديل`);

  const ts = now();
  if (!isTauriRuntime()) {
    updateFallbackRecord("invoice_items", itemId, row => ({ ...row, product_name: name, basket_count: count, updated_at: ts }));
  } else {
    const db = await getDb();
    await db.execute("UPDATE invoice_items SET product_name=?, basket_count=?, updated_at=? WHERE id=? AND is_deleted=0", [name, count, ts, itemId]);
  }
  return { product_name: name, basket_count: count, updated_at: ts };
}

export async function deleteDriverInventoryItem(driverId, itemId) {
  const { items, target } = await getInventoryContext(driverId, itemId);
  const next = items.filter(it => it.id !== itemId);
  const shortage = findInventoryShortage(next, new Set([target.product_name?.trim()]));
  if (shortage) throw new Error(`لا يمكن الحذف: المباع من «${shortage}» أكبر من الكمية المتبقية بعد الحذف`);
  await deleteInvoiceItem(itemId);
}

/** حفظ مسودة مواد مخزون السائق دفعة واحدة (إضافة، تعديل، حذف). */
export async function saveDriverInventory(driverId, draftItems = []) {
  const currentItems = await getDriverSheetItems(driverId);
  const currentInventory = currentItems.filter(item => item.trader_id == null);
  const currentById = new Map(currentInventory.map(item => [item.id, item]));
  const draftIds = new Set(draftItems.filter(item => item.id).map(item => item.id));

  const proposedItems = currentItems
    .filter(item => item.trader_id != null || draftIds.has(item.id))
    .map(item => {
      const draft = draftItems.find(candidate => candidate.id === item.id);
      return draft ? { ...item, product_name: draft.product_name, basket_count: draft.basket_count } : item;
    });
  const proposedNames = new Set(draftItems.map(item => String(item.product_name || "").trim()));
  for (const item of draftItems.filter(item => !item.id)) {
    proposedItems.push({ ...item, trader_id: null });
  }
  const shortage = findInventoryShortage(proposedItems, proposedNames);
  if (shortage) throw new Error(`لا يمكن الحفظ: المباع من «${shortage}» أكبر من الكمية المتاحة`);

  for (const item of currentInventory) {
    if (!draftIds.has(item.id)) await deleteInvoiceItem(item.id);
  }
  for (const item of draftItems) {
    const name = String(item.product_name || "").trim();
    const count = Number(item.basket_count);
    if (!name || !Number.isInteger(count) || (count <= 0 && !isFixedMaterial(name))) {
      throw new Error("بيانات مادة المخزون غير صحيحة");
    }
    if (item.id && currentById.has(item.id)) {
      await updateDriverInventoryItem(driverId, item.id, { product_name: name, basket_count: count });
      continue;
    }
    const invoiceId = currentInventory[0]?.invoice_id || await createInvoice({
      trader_id: null, driver_id: driverId, date: now(), notes: "إضافة مواد إلى قائمة السائق",
    });
    await upsertInvoiceItem({
      invoice_id: invoiceId, product_name: name, gross_weight: 0, basket_count: count,
      basket_weight_each: 0, net_weight: 0, price: 0, basket_price: 0,
      amount_before: 0, commission_rate: 0, commission_value: 0, amount_after_comm: 0,
      porterage: 0, final_amount: 0, driver_id: driverId,
    });
  }
}

export async function transferInvoiceItemDriver(itemId, newDriverId) {
  // ─── أ) التحقق الاستباقي: لا يُعدَّل شيء قبل اكتمال كل الفحوصات ───
  if (!itemId || !newDriverId) throw new Error("بيانات النقل ناقصة");
 
  let item = null;
  if (!isTauriRuntime()) {
    const current = getFallbackRecords("invoice_items").find(r => r.id === itemId && r.is_deleted !== 1);
    const invoice = current
      ? getFallbackRecords("invoices").find(r => r.id === current.invoice_id && r.is_deleted !== 1)
      : null;
    item = current && invoice ? { ...current, trader_id: invoice.trader_id } : null;
  } else {
    const db = await getDb();
    const rows = await db.select(`
      SELECT ii.*, i.trader_id
      FROM invoice_items ii
      INNER JOIN invoices i ON i.id = ii.invoice_id
      WHERE ii.id=? AND ii.is_deleted=0 AND i.is_deleted=0
    `, [itemId]);
    item = rows[0] ?? null;
  }
 
  if (!item) throw new Error("البند أو الفاتورة غير موجودة");
  if (item.trader_id == null) throw new Error("لا يمكن نقل بند مخزون");
 
  const oldDriverId = item.driver_id;
  if (String(oldDriverId) === String(newDriverId)) return;
 
  const drivers = await getDrivers();
  const oldDriver = drivers.find(d => String(d.id) === String(oldDriverId));
  const newDriver = drivers.find(d => String(d.id) === String(newDriverId));
  if (!oldDriver) throw new Error("السائق القديم غير موجود");
  if (!newDriver) throw new Error("السائق الجديد غير موجود");
  if (newDriver.sheet_status !== "open") throw new Error("السائق الجديد لا يملك قائمة مفتوحة");
 
  const needed = Number(item.basket_count || 0);
  const available = await getDriverAvailableInventory(newDriverId);
  const stock = available.find(r => r.product_name === item.product_name);
  if (!stock || Number(stock.basket_count) < needed) {
    throw new Error("رصيد السائق الجديد لا يكفي");
  }
 
  // ─── ب) الرصيد غير مخزَّن: هو محسوب من driver_id + created_at ───
  // لذلك النقل = تحديث واحد للبند. وإن كان البند أقدم من فتح قائمة السائق الجديد
  // فسيُستبعد من حسابه، فنرفع created_at إلى الآن ليدخل ضمن قائمته.
  const ts = now();
  const reopenedAfterItem = newDriver.sheet_opened_at && (item.created_at || "") < newDriver.sheet_opened_at;
  const newCreatedAt = reopenedAfterItem ? ts : item.created_at;
 
  // ─── ج) تحديث واحد ذري (بدون BEGIN/COMMIT) ───
  if (!isTauriRuntime()) {
    updateFallbackRecord("invoice_items", itemId, row => ({
      ...row, driver_id: newDriverId, created_at: newCreatedAt, updated_at: ts,
    }));
  } else {
    const db = await getDb();
    await db.execute(
      "UPDATE invoice_items SET driver_id=?, created_at=?, updated_at=? WHERE id=? AND driver_id=? AND is_deleted=0",
      [newDriverId, newCreatedAt, ts, itemId, oldDriverId]
    );
  }
 
  // ─── د) تحديث اختياري لا يُفشل النقل إن تعذّر ───
  try {
    if (!isTauriRuntime()) {
      updateFallbackRecord("invoices", item.invoice_id, row => ({ ...row, driver_id: newDriverId, updated_at: ts }));
    } else {
      const db = await getDb();
      await db.execute("UPDATE invoices SET driver_id=?, updated_at=? WHERE id=? AND is_deleted=0", [newDriverId, ts, item.invoice_id]);
    }
  } catch (e) {
    console.warn("تعذر تحديث driver_id للفاتورة (غير حرج):", e);
  }
}
 
 
// ════════════════════════════════════════════════════════════════
// 2) Invoices.jsx — أضف هذه الـ state مع بقية الـ states:
// ════════════════════════════════════════════════════════════════
// const [transferring, setTransferring] = useState(false);
 
// ثم استبدل handleDriverTransfer بالكامل:
async function handleDriverTransfer(itemId, newDriverId) {
  if (transferring) return; // يمنع الضغط المتكرر أثناء التنفيذ
  setTransferring(true);
  try {
    await transferInvoiceItemDriver(itemId, newDriverId);
    await loadData();
    showToast("تم نقل البند وتحديث مخزون السائقين");
  } catch (error) {
    // أخطاء Tauri SQL تأتي أحياناً كنص وليس Error
    const msg = error?.message || (typeof error === "string" ? error : "") || "تعذر نقل البند إلى السائق الجديد";
    console.error("خطأ نقل السائق:", error);
    showToast(msg);
  } finally {
    setTransferring(false);
  }
}
 

// ─── Payments ────────────────────────────────────────────────────────────────
export async function getPayments(filters = {}) {
  const { from, to } = filters;
  if (!isTauriRuntime()) {
    return getFallbackRecords("payments").filter(p => {
      if (p.is_deleted === 1) return false;
      if (!p.date) return false;
      const pDate = p.date.split("T")[0];
      if (from && pDate < from) return false;
      if (to && pDate > to) return false;
      return true;
    }).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  const db = await getDb();
  let query = "SELECT * FROM payments WHERE is_deleted = 0"; const params = [];
  if (from) { query += " AND date(date) >= date(?)"; params.push(from); }
  if (to)   { query += " AND date(date) <= date(?)"; params.push(to); }
  query += " ORDER BY date DESC";
  return db.select(query, params);
}

export async function createPayment({ trader_id, amount, date, notes = null }) {
  if (!isTauriRuntime()) {
    const id = uuid(); const ts = now();
    pushFallbackRecord("payments", { id, trader_id, amount, date, notes, is_deleted: 0, created_at: ts, updated_at: ts });
    updateFallbackRecord("traders", trader_id, row => ({ ...row, debt_fils: Number(row.debt_fils || 0) - Number(amount || 0), updated_at: ts }));
    pushFallbackRecord("transactions_log", { id: uuid(), type: "payment", ref_id: id, trader_id, amount, description: "دفعة تسوية دين", date, created_at: ts });
    return id;
  }
  const db = await getDb(); const id = uuid(); const ts = now();
  await db.execute("INSERT INTO payments (id, trader_id, amount, date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, trader_id, amount, date, notes, ts, ts]);
  await db.execute("UPDATE traders SET debt_fils = debt_fils - ?, updated_at=? WHERE id=?", [amount, ts, trader_id]);
  await db.execute(`INSERT INTO transactions_log (id, type, ref_id, trader_id, amount, description, date, created_at) VALUES (?, 'payment', ?, ?, ?, ?, ?, ?)`, [uuid(), id, trader_id, amount, "دفعة تسوية دين", date, ts]);
  return id;
}

// ─── Withdrawals ────────────────────────────────────────────────────────────
export async function getWithdrawals({ from = null, to = null } = {}) {
  if (!isTauriRuntime()) {
    return getFallbackRecords("withdrawals")
      .filter(row => row.is_deleted !== 1)
      .filter(row => !from || row.date >= from)
      .filter(row => !to || row.date <= to)
      .map(row => ({
        ...row,
        withdrawerType: row.withdrawer_type,
        personName: row.person_name,
        withdrawalDetails: row.withdrawal_details || "",
        personId: row.person_id || row.driver_id || null,
        personType: row.person_type || row.withdrawer_type,
      }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  const db = await getDb();
  let query = "SELECT id, amount, withdrawer_type AS withdrawerType, person_name AS personName, withdrawal_details AS withdrawalDetails, date, driver_id, person_id AS personId, person_type AS personType, applied_amount, debt_amount, debt_paid, sheet_opened_at, created_at FROM withdrawals WHERE is_deleted=0";
  const params = [];
  if (from) { query += " AND date(date) >= date(?)"; params.push(from); }
  if (to) { query += " AND date(date) <= date(?)"; params.push(to); }
  query += " ORDER BY date DESC, created_at DESC";
  return db.select(query, params);
}

export async function getDebtInvoices() {
  const withdrawals = await getWithdrawals();
  return withdrawals
    .filter(withdrawal => Number(withdrawal.debt_amount || 0) - Number(withdrawal.debt_paid || 0) > 0)
    .map(withdrawal => ({
      id: `debt-${withdrawal.id}`,
      withdrawalId: withdrawal.id,
      personId: withdrawal.personId || withdrawal.driver_id,
      personType: withdrawal.personType || withdrawal.withdrawerType,
      personName: withdrawal.personName,
      date: withdrawal.date,
      total_final: Number(withdrawal.debt_amount),
      paid_amount: Number(withdrawal.debt_paid || 0),
      remaining: Math.max(0, Number(withdrawal.debt_amount) - Number(withdrawal.debt_paid || 0)),
      operationType: "سحب",
      product_summary: "سحب",
      notes: withdrawal.withdrawalDetails || `تفاصيل السحب: مبلغ ${withdrawal.amount}`,
      details: withdrawal.withdrawalDetails || `تفاصيل السحب: مبلغ ${withdrawal.amount}`,
    }));
}

export async function settleDebtWithdrawal({ withdrawalId, amount }) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error("مبلغ التسديد غير صحيح");

  const withdrawal = (await getWithdrawals()).find(row => row.id === withdrawalId);
  if (!withdrawal) throw new Error("فاتورة الدين غير موجودة");

  const debtAmount = Number(withdrawal.debt_amount || 0);
  const debtPaid = Number(withdrawal.debt_paid || 0);
  const remaining = Math.max(0, debtAmount - debtPaid);
  if (numericAmount > remaining) throw new Error("المبلغ المسدد أكبر من الدين المتبقي");

  const personType = withdrawal.personType || withdrawal.withdrawerType;
  const people = personType === "driver" ? await getDrivers() : await getTraders();
  const person = people.find(row =>
    (withdrawal.personId && String(row.id) === String(withdrawal.personId)) || row.name === withdrawal.personName
  );
  if (!person) throw new Error("صاحب الدين غير موجود");

  const nextDebtPaid = debtPaid + numericAmount;
  if (!isTauriRuntime()) {
    updateFallbackRecord("withdrawals", withdrawalId, row => ({ ...row, debt_paid: nextDebtPaid, updated_at: now() }));
    if (personType === "driver") {
      updateFallbackRecord("drivers", person.id, row => ({ ...row, debt: Math.max(0, Number(row.debt || 0) - numericAmount), updated_at: now() }));
    } else {
      updateFallbackRecord("traders", person.id, row => ({ ...row, debt_fils: Math.max(0, Number(row.debt_fils || 0) - numericAmount), updated_at: now() }));
    }
    pushFallbackRecord("transactions_log", {
      id: uuid(), type: "debt_withdrawal_settlement", ref_id: withdrawalId,
      amount: numericAmount, description: `تسديد دين سحب - ${withdrawal.personName}`,
      date: now(), created_at: now(), is_deleted: 0,
    });
    return;
  }

  const db = await getDb();
  await db.execute("UPDATE withdrawals SET debt_paid=?, updated_at=? WHERE id=?", [nextDebtPaid, now(), withdrawalId]);
  if (personType === "driver") {
    await db.execute("UPDATE drivers SET debt=MAX(0, debt-?), updated_at=? WHERE id=?", [numericAmount, now(), person.id]);
  } else {
    await db.execute("UPDATE traders SET debt_fils=MAX(0, debt_fils-?), updated_at=? WHERE id=?", [numericAmount, now(), person.id]);
  }
  await db.execute(
    "INSERT INTO transactions_log (id, type, ref_id, amount, description, date, created_at, is_deleted) VALUES (?, 'debt_withdrawal_settlement', ?, ?, ?, ?, ?, 0)",
    [uuid(), withdrawalId, numericAmount, `تسديد دين سحب - ${withdrawal.personName}`, now(), now()]
  );
}

export async function createWithdrawal({ amount, withdrawerType, personName, withdrawalDetails = "", date, driverId = null, personId = null, personType = withdrawerType, appliedAmount = 0, debtAmount = 0, debtPaid = 0, sheetOpenedAt = null }) {
  const withdrawal = {
    id: uuid(), amount: Number(amount || 0), withdrawer_type: withdrawerType,
    person_name: personName.trim(), withdrawal_details: String(withdrawalDetails || "").trim(), date, driver_id: driverId, person_id: personId, person_type: personType,
    applied_amount: Number(appliedAmount || 0), debt_amount: Number(debtAmount || 0), debt_paid: Number(debtPaid || 0), sheet_opened_at: sheetOpenedAt,
  };
  const ts = now();
  if (!isTauriRuntime()) {
    pushFallbackRecord("withdrawals", { ...withdrawal, created_at: ts, updated_at: ts, is_deleted: 0 });
    return withdrawal.id;
  }
  const db = await getDb();
  await db.execute(
    "INSERT INTO withdrawals (id, amount, withdrawer_type, person_name, withdrawal_details, date, driver_id, person_id, person_type, applied_amount, debt_amount, debt_paid, sheet_opened_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [withdrawal.id, withdrawal.amount, withdrawal.withdrawer_type, withdrawal.person_name, withdrawal.withdrawal_details, withdrawal.date, withdrawal.driver_id, withdrawal.person_id, withdrawal.person_type, withdrawal.applied_amount, withdrawal.debt_amount, withdrawal.debt_paid, withdrawal.sheet_opened_at, ts, ts]
  );
  return withdrawal.id;
}

/** يوجه السحب حسب صاحبه ويعيد تفصيل المبلغ المطبق والدين المرحل. */
export async function processWithdrawal({ amount, withdrawerType, personName, withdrawalDetails: details = "", personId = null, date = today() }) {
  const normalizedAmount = Math.round(Number(amount));
  const normalizedName = String(personName || "").trim();
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) throw new Error("مبلغ السحب غير صحيح");
  if (!normalizedName) throw new Error("اسم الساحب مطلوب");

  if (withdrawerType === "partner") {
    return createWithdrawal({ amount: normalizedAmount, withdrawerType, personName: normalizedName, withdrawalDetails: details, date });
  }

  const [traders, drivers] = await Promise.all([getTraders(), getDrivers()]);
  const person = withdrawerType === "grocer"
    ? traders.find(row => (personId && String(row.id) === String(personId)) || row.name === normalizedName)
    : drivers.find(row => (personId && String(row.id) === String(personId)) || row.name === normalizedName);
  if (!person) throw new Error("الساحب غير موجود");

  const ts = now();
  let withdrawalDetails = {
    amount: normalizedAmount, withdrawerType, personName: normalizedName, withdrawalDetails: details, date,
    driverId: null, personId: person.id, personType: withdrawerType, appliedAmount: 0, debtAmount: 0, sheetOpenedAt: null,
  };

  if (withdrawerType === "grocer") {
    const nextDebt = Number(person.debt_fils || 0) + normalizedAmount;
    withdrawalDetails = { ...withdrawalDetails, debtAmount: normalizedAmount };
    if (!isTauriRuntime()) {
      updateFallbackRecord("traders", person.id, row => ({ ...row, debt_fils: nextDebt, updated_at: ts }));
      return createWithdrawal(withdrawalDetails);
    }
    const db = await getDb();
    await db.execute("UPDATE traders SET debt_fils=?, updated_at=? WHERE id=?", [nextDebt, ts, person.id]);
    return createWithdrawal(withdrawalDetails);
  }

  const driverItems = await getDriverSheetItems(person.id);
  const sheetOpenedAt = person.sheet_opened_at || null;
  const grossBalance = sheetOpenedAt
    ? driverItems
      .filter(item => item.trader_id != null && item.created_at >= sheetOpenedAt)
      .reduce((total, item) => total + Math.max(0, Math.round(Number(item.net_weight || 0) * Number(item.price || 0))), 0)
    : 0;
  const priorApplied = (await getWithdrawals())
    .filter(row => String(row.driver_id) === String(person.id) && row.sheet_opened_at === sheetOpenedAt)
    .reduce((total, row) => total + Number(row.applied_amount || 0), 0);
  const available = Math.max(0, grossBalance - Number(person.debt || 0) - priorApplied);
  const appliedAmount = Math.min(normalizedAmount, available);
  const debtAmount = normalizedAmount - appliedAmount;
  withdrawalDetails = { ...withdrawalDetails, driverId: person.id, appliedAmount, debtAmount, sheetOpenedAt };

  if (!isTauriRuntime()) {
    updateFallbackRecord("drivers", person.id, row => ({ ...row, debt: Number(row.debt || 0) + debtAmount, updated_at: ts }));
    return createWithdrawal(withdrawalDetails);
  }
  const db = await getDb();
  await db.execute("UPDATE drivers SET debt=debt+?, updated_at=? WHERE id=?", [debtAmount, ts, person.id]);
  return createWithdrawal(withdrawalDetails);
}

export async function deleteWithdrawal(id) {
  const withdrawal = (await getWithdrawals()).find(row => row.id === id);
  if (!withdrawal) throw new Error("السحب غير موجود");

  const remaining = Math.max(
    0,
    Number(withdrawal.debt_amount || 0) - Number(withdrawal.debt_paid || 0),
  );
  if (remaining > 0) {
    throw new Error("لا يمكن حذف سحب غير مسدد");
  }

  if (!isTauriRuntime()) {
    updateFallbackRecord("withdrawals", id, row => ({ ...row, is_deleted: 1, updated_at: now() }));
    const store = ensureFallbackStore();
    store.transactions_log = (store.transactions_log || []).map(transaction => (
      transaction.type === "debt_withdrawal_settlement" && transaction.ref_id === id
        ? { ...transaction, is_deleted: 1 }
        : transaction
    ));
    persistFallbackStore(store);
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE withdrawals SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
  await db.execute(
    "UPDATE transactions_log SET is_deleted=1 WHERE type='debt_withdrawal_settlement' AND ref_id=?",
    [id]
  );
}

export async function calculateNetProfits({ from = null, to = null } = {}) {
  const invoices = await getInvoices({ from, to, status: "posted" });
  const invoiceItems = await Promise.all(invoices.map(invoice => getInvoiceItems(invoice.id)));
  const totalCommissions = invoiceItems.flat().reduce(
    (total, item) => total + Number(item.commission_value || 0), 0
  );
  const drivers = await getDrivers();
  const driverSheets = (await Promise.all(
    drivers.map(driver => getClosedDriverSheets(driver.id))
  )).flat().filter(sheet =>
    (!from || String(sheet.sheet_closed_at || "").slice(0, 10) >= from) &&
    (!to || String(sheet.sheet_closed_at || "").slice(0, 10) <= to)
  );
  const driverCommissions = driverSheets.reduce(
    (total, sheet) => total + Number(sheet.commission_amount || 0), 0
  );
  const withdrawals = await getWithdrawals({ from, to });
  const settledWithdrawalDebts = (await getTransactions({ from, to }))
    .filter(transaction => transaction.type === "debt_withdrawal_settlement")
    .reduce((total, transaction) => total + Number(transaction.amount || 0), 0);
  const totalWithdrawals = withdrawals.reduce((total, row) => total + Number(row.amount || 0), 0) - settledWithdrawalDebts;
  return {
    totalCommissions: totalCommissions + driverCommissions + settledWithdrawalDebts,
    totalWithdrawals,
    netProfits: totalCommissions + driverCommissions - totalWithdrawals,
  };
}

export async function getTraderUnpaidInvoices(traderId) {
  if (!isTauriRuntime()) {
    const invoices = getFallbackRecords("invoices").filter(inv => inv.trader_id === traderId && inv.is_deleted !== 1 && inv.remaining > 0);
    const items = getFallbackRecords("invoice_items").filter(item => item.is_deleted !== 1);
    return invoices.map(inv => {
      const invItems = items.filter(it => it.invoice_id === inv.id);
      const productSummary = invItems.map(it => `${it.product_name} (${it.basket_count} صنديق/كيس)`).join(" - ");
      return { ...inv, product_summary: productSummary || inv.notes || "قيد دين يدوي" };
    });
  }
  const db = await getDb();
  return db.select(`SELECT i.*, (SELECT GROUP_CONCAT(ii.product_name || ' (' || ii.basket_count || ')', ' - ') FROM invoice_items ii WHERE ii.invoice_id = i.id AND ii.is_deleted = 0) as product_summary FROM invoices i WHERE i.trader_id = ? AND i.is_deleted = 0 AND i.remaining > 0 AND i.status = 'posted' ORDER BY i.date DESC`, [traderId]);
}

export async function paySpecificInvoice({ trader_id, invoice_id, amount, date, notes }) {
  const ts = now();
  if (!isTauriRuntime()) {
    updateFallbackRecord("invoices", invoice_id, inv => ({ ...inv, remaining: Number(inv.remaining) - Number(amount), paid_amount: Number(inv.paid_amount) + Number(amount), updated_at: ts }));
    updateFallbackRecord("traders", trader_id, t => ({ ...t, debt_fils: Number(t.debt_fils) - Number(amount), updated_at: ts }));
    const pId = uuid();
    pushFallbackRecord("payments", { id: pId, trader_id, amount, date, notes: (notes || "") + ` (تسديد قائمة)`, is_deleted: 0, created_at: ts, updated_at: ts });
    pushFallbackRecord("transactions_log", { id: uuid(), type: "payment", ref_id: pId, trader_id, amount, description: `تسديد جزء/كل من قائمة`, date, created_at: ts });
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE invoices SET paid_amount = paid_amount + ?, remaining = remaining - ?, updated_at = ? WHERE id = ?", [amount, amount, ts, invoice_id]);
  await db.execute("UPDATE traders SET debt_fils = debt_fils - ?, updated_at = ? WHERE id = ?", [amount, ts, trader_id]);
  const paymentId = uuid();
  await db.execute("INSERT INTO payments (id, trader_id, amount, date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [paymentId, trader_id, amount, date, notes, ts, ts]);
  await db.execute(`INSERT INTO transactions_log (id, type, ref_id, trader_id, amount, description, date, created_at) VALUES (?, 'payment', ?, ?, ?, ?, ?, ?)`, [uuid(), paymentId, trader_id, amount, notes, date, ts]);
}

export async function createManualDebtInvoice({ trader_id, amount, date, notes }) {
  const ts = now(); const invoiceId = uuid();
  if (!isTauriRuntime()) {
    pushFallbackRecord("invoices", { id: invoiceId, trader_id, driver_id: null, date, status: "posted", total_final: amount, paid_amount: 0, remaining: amount, notes: notes || "دين يدوي مباشر", is_deleted: 0, created_at: ts, updated_at: ts });
    updateFallbackRecord("traders", trader_id, row => ({ ...row, debt_fils: Number(row.debt_fils || 0) + Number(amount || 0), updated_at: ts }));
    pushFallbackRecord("transactions_log", { id: uuid(), type: "manual_debt", ref_id: invoiceId, trader_id, amount: Number(amount || 0), description: notes || "قيد دين يدوي (قائمة مستقلة)", date, created_at: ts, is_deleted: 0 });
    return invoiceId;
  }
  const db = await getDb();
  await db.execute(`INSERT INTO invoices (id, trader_id, date, status, total_final, paid_amount, remaining, notes, created_at, updated_at, is_deleted) VALUES (?, ?, ?, 'posted', ?, 0, ?, ?, ?, ?, 0)`, [invoiceId, trader_id, date, Number(amount || 0), Number(amount || 0), notes || "دين يدوي مباشر", ts, ts]);
  await db.execute("UPDATE traders SET debt_fils = debt_fils + ?, updated_at=? WHERE id=?", [Number(amount || 0), ts, trader_id]);
  await db.execute(`INSERT INTO transactions_log (id, type, ref_id, trader_id, amount, description, date, created_at, is_deleted) VALUES (?, 'manual_debt', ?, ?, ?, ?, ?, ?, 0)`, [uuid(), invoiceId, trader_id, Number(amount || 0), notes || "قيد دين يدوي (قائمة مستقلة)", date, ts]);
  return invoiceId;
}

// ─── Transactions Log ─────────────────────────────────────────────────────────
export async function getTransactions({ from = null, to = null, trader_id = null } = {}) {
  if (!isTauriRuntime()) {
    const traders = new Map(getFallbackRecords("traders").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    return getFallbackRecords("transactions_log")
      .filter(item => item.is_deleted !== 1)
      .filter(item => !from || item.date >= from)
      .filter(item => !to || item.date <= to)
      .filter(item => !trader_id || item.trader_id === trader_id)
      .map(item => ({ ...item, trader_name: traders.get(item.trader_id)?.name ?? null }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created_at || "").localeCompare(a.created_at || ""));
  }
  const db = await getDb();
  let where = "l.is_deleted=0"; const params = [];
  if (from)      { where += " AND l.date >= ?"; params.push(from); }
  if (to)        { where += " AND l.date <= ?"; params.push(to); }
  if (trader_id) { where += " AND l.trader_id = ?"; params.push(trader_id); }
  return db.select(`SELECT l.*, t.name as trader_name FROM transactions_log l LEFT JOIN traders t ON l.trader_id = t.id WHERE ${where} ORDER BY l.date DESC, l.created_at DESC`, params);
}

export async function getInvoicesByDriver(driverId) {
  if (!isTauriRuntime()) {
    const traders = new Map(getFallbackRecords("traders").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    return getFallbackRecords("invoices")
      .filter(inv => inv.driver_id === driverId && inv.is_deleted !== 1 && inv.status === "posted")
      .map(inv => ({ ...inv, trader_name: traders.get(inv.trader_id)?.name ?? "بگال غير معروف" }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  const db = await getDb();
  return db.select(`SELECT i.*, t.name as trader_name FROM invoices i LEFT JOIN traders t ON i.trader_id = t.id WHERE i.driver_id = ? AND i.is_deleted = 0 AND i.status = 'posted' ORDER BY i.date DESC`, [driverId]);
}

// ─── Settings ────────────────────────────────────────────────────────────────
export async function getSetting(key) {
  if (!isTauriRuntime()) { const store = ensureFallbackStore(); return store.settings?.[key] ?? null; }
  const db = await getDb();
  const rows = await db.select("SELECT value FROM settings WHERE key=?", [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key, value) {
  if (!isTauriRuntime()) { const store = ensureFallbackStore(); store.settings[key] = String(value); persistFallbackStore(store); return; }
  const db = await getDb();
  await db.execute("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at", [key, String(value), now()]);
}

export async function getAllSettings() {
  if (!isTauriRuntime()) { return { ...(ensureFallbackStore().settings || {}) }; }
  const db = await getDb();
  const rows = await db.select("SELECT key, value FROM settings");
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
/** حذف قائمة مغلقة للسائق (حذف ناعم) */
export async function deleteClosedSheet(sheetId) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("driver_sheets", sheetId, row => ({ 
      ...row, 
      is_deleted: 1, 
      updated_at: now() 
    })); 
    return; 
  }
  
  const db = await getDb();
  await db.execute(
    "UPDATE driver_sheets SET is_deleted=1, updated_at=? WHERE id=?", 
    [now(), sheetId]
  );
}