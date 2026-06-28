let _db = null;
const _tableColumnCache = new Map();
let _schemaEnsured = false;

const fallbackDb = {
  async select() {
    return [];
  },
  async execute() {
    return { lastInsertId: null, changes: 0 };
  },
};

const FALLBACK_STORE_KEY = "warehouse_fallback_store";

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function getFallbackStore() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return { traders: [], vehicles: [], drivers: [], invoices: [], invoice_items: [], payments: [], transactions_log: [], settings: {} };
  }

  try {
    const raw = localStorage.getItem(FALLBACK_STORE_KEY);
    if (!raw) {
      const initial = { traders: [], vehicles: [], drivers: [], invoices: [], invoice_items: [], payments: [], transactions_log: [], settings: {} };
      localStorage.setItem(FALLBACK_STORE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Unable to read fallback store, resetting it.", error);
    const initial = { traders: [], vehicles: [], drivers: [], invoices: [], invoice_items: [], payments: [], transactions_log: [], settings: {} };
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
  store.vehicles ??= [];
  store.drivers ??= [];
  store.invoices ??= [];
  store.invoice_items ??= [];
  store.payments ??= [];
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

export function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

// important: this function should be called only once at the start of the app, to ensure that the database schema is up-to-date.

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
      console.warn("Falling back to local browser storage because the Tauri runtime is unavailable:", error);
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
  if (_tableColumnCache.has(cacheKey)) {
    return _tableColumnCache.get(cacheKey);
  }

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
  if (await tableHasColumn(db, table, column)) {
    return false;
  }

  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  _tableColumnCache.set(`${table}.${column}`, true);
  return true;
}

async function ensureDesktopSchema(db) {
  await addColumnIfMissing(db, "traders", "phone", "TEXT");
  await addColumnIfMissing(db, "traders", "address", "TEXT");
  await addColumnIfMissing(db, "traders", "notes", "TEXT");
  await addColumnIfMissing(db, "traders", "debt_fils", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "traders", "created_at", "TEXT");
  await addColumnIfMissing(db, "traders", "updated_at", "TEXT");
  await addColumnIfMissing(db, "traders", "is_deleted", "INTEGER NOT NULL DEFAULT 0");

  await addColumnIfMissing(db, "vehicles", "type", "TEXT");
  await addColumnIfMissing(db, "vehicles", "notes", "TEXT");
  await addColumnIfMissing(db, "vehicles", "created_at", "TEXT");
  await addColumnIfMissing(db, "vehicles", "updated_at", "TEXT");
  await addColumnIfMissing(db, "vehicles", "is_deleted", "INTEGER NOT NULL DEFAULT 0");

  await addColumnIfMissing(db, "drivers", "phone", "TEXT");
  await addColumnIfMissing(db, "drivers", "vehicle_id", "TEXT REFERENCES vehicles(id)");
  const addedVehiclePlate = await addColumnIfMissing(db, "drivers", "vehicle_plate", "TEXT");
  await addColumnIfMissing(db, "drivers", "notes", "TEXT");
  await addColumnIfMissing(db, "drivers", "created_at", "TEXT");
  await addColumnIfMissing(db, "drivers", "updated_at", "TEXT");
  await addColumnIfMissing(db, "drivers", "is_deleted", "INTEGER NOT NULL DEFAULT 0");

// ─── تحديث جدول بنود الفواتير (Invoice Items) ليكون مطابقاً للـ SQL ───
  await addColumnIfMissing(db, "invoice_items", "invoice_id", "TEXT NOT NULL"); // لاحظ: يجب أن يكون موجوداً
  await addColumnIfMissing(db, "invoice_items", "product_name", "TEXT NOT NULL");
  await addColumnIfMissing(db, "invoice_items", "gross_weight", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "basket_count", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "basket_weight_each", "INTEGER NOT NULL DEFAULT 50");
  await addColumnIfMissing(db, "invoice_items", "net_weight", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoice_items", "price", "INTEGER NOT NULL DEFAULT 0");
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

  if (addedVehiclePlate || await tableHasColumn(db, "drivers", "vehicle_plate")) {
    await db.execute(`
      UPDATE drivers
      SET vehicle_plate = (
        SELECT v.plate
        FROM vehicles v
        WHERE v.id = drivers.vehicle_id
          AND v.is_deleted = 0
      )
      WHERE vehicle_plate IS NULL AND vehicle_id IS NOT NULL
    `);
  }

  await addColumnIfMissing(db, "invoices", "trader_id", "TEXT REFERENCES traders(id)");
  await addColumnIfMissing(db, "invoices", "driver_id", "TEXT REFERENCES drivers(id)");
  await addColumnIfMissing(db, "invoices", "vehicle_id", "TEXT REFERENCES vehicles(id)");
  await addColumnIfMissing(db, "invoices", "date", "TEXT");
  await addColumnIfMissing(db, "invoices", "status", "TEXT NOT NULL DEFAULT 'draft'");
  await addColumnIfMissing(db, "invoices", "total_final", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoices", "paid_amount", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoices", "remaining", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing(db, "invoices", "notes", "TEXT");
  await addColumnIfMissing(db, "invoices", "created_at", "TEXT");
  await addColumnIfMissing(db, "invoices", "updated_at", "TEXT");
  await addColumnIfMissing(db, "invoices", "is_deleted", "INTEGER NOT NULL DEFAULT 0");

  await addColumnIfMissing(db, "invoice_items", "basket_number", "INTEGER NOT NULL DEFAULT 0");
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

export function uuid() {
  return crypto.randomUUID();
}

export function now() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Traders ────────────────────────────────────────────────────────────────
export async function getTraders() {
  if (!isTauriRuntime()) {
    return getFallbackRecords("traders").filter(item => item.is_deleted !== 1).sort((a, b) => a.name.localeCompare(b.name));
  }
  // this what works in the app
  const db = await getDb();
  return db.select("SELECT * FROM traders WHERE is_deleted=0 ORDER BY name");
}

export async function createTrader({ name, phone = null, address = null, notes = null }) {
  if (!isTauriRuntime()) {
    const store = ensureFallbackStore();
    const id = uuid(); const ts = now();
    store.traders.push({ id, name, phone, address, notes, debt_fils: 0, is_deleted: 0, created_at: ts, updated_at: ts });
    persistFallbackStore(store);
    return id;
  }
  const db = await getDb();
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO traders (id, name, phone, address, notes, debt_fils, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
    [id, name, phone, address, notes, ts, ts]
  );
  return id;
}

export async function updateTrader(id, fields) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("traders", id, row => ({
      ...row,
      name: fields.name,
      phone: fields.phone ?? null,
      address: fields.address ?? null,
      notes: fields.notes ?? null,
      updated_at: now(),
    }));
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE traders SET name=?, phone=?, address=?, notes=?, updated_at=? WHERE id=?",
    [fields.name, fields.phone ?? null, fields.address ?? null, fields.notes ?? null, now(), id]
  );
}

export async function deleteTrader(id) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("traders", id, row => ({ ...row, is_deleted: 1, updated_at: now() }));
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE traders SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Vehicles ───────────────────────────────────────────────────────────────
export async function getVehicles() {
  if (!isTauriRuntime()) {
    return getFallbackRecords("vehicles").filter(item => item.is_deleted !== 1).sort((a, b) => a.plate.localeCompare(b.plate));
  }
  const db = await getDb();
  return db.select("SELECT * FROM vehicles WHERE is_deleted=0 ORDER BY plate");
}

export async function createVehicle({ plate, type = null, notes = null }) {
  if (!isTauriRuntime()) {
    const store = ensureFallbackStore();
    const id = uuid(); const ts = now();
    store.vehicles.push({ id, plate, type, notes, is_deleted: 0, created_at: ts, updated_at: ts });
    persistFallbackStore(store);
    return id;
  }
  const db = await getDb();
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO vehicles (id, plate, type, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, plate, type, notes, ts, ts]
  );
  return id;
}

export async function updateVehicle(id, fields) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("vehicles", id, row => ({ ...row, plate: fields.plate, type: fields.type ?? null, notes: fields.notes ?? null, updated_at: now() }));
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE vehicles SET plate=?, type=?, notes=?, updated_at=? WHERE id=?",
    [fields.plate, fields.type ?? null, fields.notes ?? null, now(), id]
  );
}

export async function deleteVehicle(id) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("vehicles", id, row => ({ ...row, is_deleted: 1, updated_at: now() }));
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE vehicles SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Drivers ────────────────────────────────────────────────────────────────
export async function getDrivers() {
  if (!isTauriRuntime()) {
    return getFallbackRecords("drivers")
      .filter(item => item.is_deleted !== 1)
      .map(driver => ({ ...driver, vehicle_plate: driver.vehicle_plate ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  const db = await getDb();
  if (await hasColumn("drivers", "vehicle_plate")) {
    return db.select(`
      SELECT id, name, phone, vehicle_plate, notes, created_at, updated_at, is_deleted
      FROM drivers
      WHERE is_deleted=0 ORDER BY name
    `);
  }

  return db.select(`
    SELECT d.id, d.name, d.phone, v.plate as vehicle_plate, d.notes, d.created_at, d.updated_at, d.is_deleted
    FROM drivers d
    LEFT JOIN vehicles v ON d.vehicle_id = v.id
    WHERE d.is_deleted=0 ORDER BY d.name
  `);
}

export async function createDriver({ name, phone = null, vehicle_plate = null, notes = null }) {
  if (!isTauriRuntime()) {
    const store = ensureFallbackStore();
    const id = uuid(); const ts = now();
    store.drivers.push({ id, name, phone, vehicle_plate, notes, is_deleted: 0, created_at: ts, updated_at: ts });
    persistFallbackStore(store);
    return id;
  }
  const db = await getDb();
  const id = uuid(); const ts = now();
  if (await hasColumn("drivers", "vehicle_plate")) {
    await db.execute(
      "INSERT INTO drivers (id, name, phone, vehicle_plate, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, name, phone, vehicle_plate, notes, ts, ts]
    );
  } else {
    let vehicleId = null;
    if (vehicle_plate?.trim()) {
      const plate = vehicle_plate.trim();
      const rows = await db.select("SELECT id FROM vehicles WHERE plate=? AND is_deleted=0 LIMIT 1", [plate]);
      vehicleId = rows[0]?.id ?? null;
      if (!vehicleId) {
        vehicleId = uuid();
        await db.execute(
          "INSERT INTO vehicles (id, plate, created_at, updated_at) VALUES (?, ?, ?, ?)",
          [vehicleId, plate, ts, ts]
        );
      }
    }
    await db.execute(
      "INSERT INTO drivers (id, name, phone, vehicle_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, name, phone, vehicleId, notes, ts, ts]
    );
  }
  return id;
}

export async function updateDriver(id, fields) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("drivers", id, row => ({ ...row, name: fields.name, phone: fields.phone ?? null, vehicle_plate: fields.vehicle_plate ?? null, notes: fields.notes ?? null, updated_at: now() }));
    return;
  }
  const db = await getDb();
  if (await hasColumn("drivers", "vehicle_plate")) {
    await db.execute(
      "UPDATE drivers SET name=?, phone=?, vehicle_plate=?, notes=?, updated_at=? WHERE id=?",
      [fields.name, fields.phone ?? null, fields.vehicle_plate ?? null, fields.notes ?? null, now(), id]
    );
  } else {
    let vehicleId = null;
    if (fields.vehicle_plate?.trim()) {
      const plate = fields.vehicle_plate.trim();
      const rows = await db.select("SELECT id FROM vehicles WHERE plate=? AND is_deleted=0 LIMIT 1", [plate]);
      vehicleId = rows[0]?.id ?? null;
      if (!vehicleId) {
        vehicleId = uuid();
        const ts = now();
        await db.execute(
          "INSERT INTO vehicles (id, plate, created_at, updated_at) VALUES (?, ?, ?, ?)",
          [vehicleId, plate, ts, ts]
        );
      }
    }
    await db.execute(
      "UPDATE drivers SET name=?, phone=?, vehicle_id=?, notes=?, updated_at=? WHERE id=?",
      [fields.name, fields.phone ?? null, vehicleId, fields.notes ?? null, now(), id]
    );
  }
}

export async function deleteDriver(id) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("drivers", id, row => ({ ...row, is_deleted: 1, updated_at: now() }));
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE drivers SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Invoices ───────────────────────────────────────────────────────────────
export async function getInvoices({ from = null, to = null, status = null, trader_id = null } = {}) {
  if (!isTauriRuntime()) {
    const traders = new Map(getFallbackRecords("traders").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    const drivers = new Map(getFallbackRecords("drivers").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    const vehicles = new Map(getFallbackRecords("vehicles").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    return getFallbackRecords("invoices")
      .filter(item => item.is_deleted !== 1)
      .filter(item => !from || item.date >= from)
      .filter(item => !to || item.date <= to)
      .filter(item => !status || item.status === status)
      .filter(item => !trader_id || item.trader_id === trader_id)
      .map(item => ({
        ...item,
        trader_name: traders.get(item.trader_id)?.name ?? null,
        driver_name: drivers.get(item.driver_id)?.name ?? null,
        vehicle_plate: vehicles.get(item.vehicle_id)?.plate ?? null,
      }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created_at || "").localeCompare(a.created_at || ""));
  }
  const db = await getDb();
  let where = "i.is_deleted=0";
  const params = [];
  if (from)      { where += " AND i.date >= ?"; params.push(from); }
  if (to)        { where += " AND i.date <= ?"; params.push(to); }
  if (status)    { where += " AND i.status = ?"; params.push(status); }
  if (trader_id) { where += " AND i.trader_id = ?"; params.push(trader_id); }
  return db.select(`
    SELECT i.*, t.name as trader_name, d.name as driver_name, v.plate as vehicle_plate
    FROM invoices i
    LEFT JOIN traders t ON i.trader_id = t.id
    LEFT JOIN drivers d ON i.driver_id = d.id
    LEFT JOIN vehicles v ON i.vehicle_id = v.id
    WHERE ${where} ORDER BY i.date DESC, i.created_at DESC
  `, params);
}

export async function getInvoice(id) {
  if (!isTauriRuntime()) {
    const invoice = getFallbackRecords("invoices").find(item => item.id === id && item.is_deleted !== 1);
    if (!invoice) return null;
    const traders = new Map(getFallbackRecords("traders").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    const drivers = new Map(getFallbackRecords("drivers").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    const vehicles = new Map(getFallbackRecords("vehicles").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    return { ...invoice, trader_name: traders.get(invoice.trader_id)?.name ?? null, driver_name: drivers.get(invoice.driver_id)?.name ?? null, vehicle_plate: vehicles.get(invoice.vehicle_id)?.plate ?? null };
  }
  const db = await getDb();
  const rows = await db.select(`
    SELECT i.*, t.name as trader_name, d.name as driver_name, v.plate as vehicle_plate
    FROM invoices i
    LEFT JOIN traders t ON i.trader_id = t.id
    LEFT JOIN drivers d ON i.driver_id = d.id
    LEFT JOIN vehicles v ON i.vehicle_id = v.id
    WHERE i.id=? AND i.is_deleted=0
  `, [id]);
  return rows[0] ?? null;
}

export async function createInvoice({ trader_id, driver_id = null, vehicle_id = null, date, notes = null }) {
  if (!isTauriRuntime()) {
    const id = uuid(); const ts = now();
    pushFallbackRecord("invoices", {
      id,
      trader_id,
      driver_id,
      vehicle_id,
      date,
      status: "draft",
      total_final: 0,
      paid_amount: 0,
      remaining: 0,
      notes,
      is_deleted: 0,
      created_at: ts,
      updated_at: ts,
    });
    return id;
  }
  const db = await getDb();
  const id = uuid(); const ts = now();
  await db.execute(
    `INSERT INTO invoices (id, trader_id, driver_id, vehicle_id, date, status, total_final, paid_amount, remaining, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', 0, 0, 0, ?, ?, ?)` ,
    [id, trader_id, driver_id, vehicle_id, date, notes, ts, ts]
  );
  return id;
}

export async function updateInvoiceTotals(id, { total_final, paid_amount, remaining, notes = null }) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("invoices", id, row => ({ ...row, total_final, paid_amount, remaining, notes, updated_at: now() }));
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE invoices SET total_final=?, paid_amount=?, remaining=?, notes=?, updated_at=? WHERE id=?",
    [total_final, paid_amount, remaining, notes, now(), id]
  );
}

/** ترحيل الفاتورة: تغيير الحالة + إضافة الباقي لدين التاجر + تسجيل في سجل المعاملات */
export async function postInvoice(invoiceId) {
  if (!isTauriRuntime()) {
    const ts = now();
    const inv = await getInvoice(invoiceId);
    if (!inv) throw new Error("الفاتورة غير موجودة");
    if (inv.status === "posted") throw new Error("الفاتورة مُرحّلة مسبقاً");
    updateFallbackRecord("invoices", invoiceId, row => ({ ...row, status: "posted", updated_at: ts }));
    if (inv.remaining > 0 && inv.trader_id) {
      updateFallbackRecord("traders", inv.trader_id, row => ({ ...row, debt_fils: Number(row.debt_fils || 0) + Number(inv.remaining || 0), updated_at: ts }));
    }
    pushFallbackRecord("transactions_log", {
      id: uuid(), type: "invoice_posted", ref_id: invoiceId, trader_id: inv.trader_id, amount: inv.total_final, description: `ترحيل فاتورة — ${inv.trader_name ?? ""}`, date: inv.date, created_at: ts,
    });
    return;
  }
  const db = await getDb();
  const ts = now();
  const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (inv.status === "posted") throw new Error("الفاتورة مُرحّلة مسبقاً");

  await db.execute("UPDATE invoices SET status='posted', updated_at=? WHERE id=?", [ts, invoiceId]);

  if (inv.remaining > 0 && inv.trader_id) {
    await db.execute(
      "UPDATE traders SET debt_fils = debt_fils + ?, updated_at=? WHERE id=?",
      [inv.remaining, ts, inv.trader_id]
    );
  }

  // تسجيل في سجل المعاملات
  await db.execute(
    `INSERT INTO transactions_log (id, type, ref_id, trader_id, amount, description, date, created_at)
     VALUES (?, 'invoice_posted', ?, ?, ?, ?, ?, ?)`,
    [uuid(), invoiceId, inv.trader_id, inv.total_final,
     `ترحيل فاتورة — ${inv.trader_name ?? ""}`, inv.date, ts]
  );
}

/** حركة عكسية للفاتورة المُرحّلة */
export async function reverseInvoice(invoiceId) {
  if (!isTauriRuntime()) {
    const ts = now();
    const inv = await getInvoice(invoiceId);
    if (!inv) throw new Error("الفاتورة غير موجودة");
    if (inv.status !== "posted") throw new Error("الفاتورة غير مُرحّلة");
    updateFallbackRecord("invoices", invoiceId, row => ({ ...row, status: "draft", updated_at: ts }));
    if (inv.remaining > 0 && inv.trader_id) {
      updateFallbackRecord("traders", inv.trader_id, row => ({ ...row, debt_fils: Number(row.debt_fils || 0) - Number(inv.remaining || 0), updated_at: ts }));
    }
    pushFallbackRecord("transactions_log", {
      id: uuid(), type: "reversal", ref_id: invoiceId, trader_id: inv.trader_id, amount: inv.total_final, description: `عكس فاتورة — ${inv.trader_name ?? ""}`, date: inv.date, created_at: ts,
    });
    return;
  }
  const db = await getDb();
  const ts = now();
  const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (inv.status !== "posted") throw new Error("الفاتورة غير مُرحّلة");

  await db.execute("UPDATE invoices SET status='draft', updated_at=? WHERE id=?", [ts, invoiceId]);

  if (inv.remaining > 0 && inv.trader_id) {
    await db.execute(
      "UPDATE traders SET debt_fils = debt_fils - ?, updated_at=? WHERE id=?",
      [inv.remaining, ts, inv.trader_id]
    );
  }

  await db.execute(
    `INSERT INTO transactions_log (id, type, ref_id, trader_id, amount, description, date, created_at)
     VALUES (?, 'reversal', ?, ?, ?, ?, ?, ?)`,
    [uuid(), invoiceId, inv.trader_id, inv.total_final,
     `عكس فاتورة — ${inv.trader_name ?? ""}`, inv.date, ts]
  );
}

export async function deleteInvoice(id) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("invoices", id, row => ({ ...row, is_deleted: 1, updated_at: now() }));
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE invoices SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Invoice Items ───────────────────────────────────────────────────────────
export async function getInvoiceItems(invoice_id) {
  if (!isTauriRuntime()) {
    return getFallbackRecords("invoice_items")
      .filter(item => item.invoice_id === invoice_id && item.is_deleted !== 1)
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  }
  const db = await getDb();
  return db.select(
    "SELECT * FROM invoice_items WHERE invoice_id=? AND is_deleted=0 ORDER BY created_at",
    [invoice_id]
  );
}

export async function upsertInvoiceItem(item) {
  if (!isTauriRuntime()) {
    const ts = now();
    const id = item.id ?? uuid();
    const existing = getFallbackRecords("invoice_items").find(row => row.id === id);
    if (existing) {
      updateFallbackRecord("invoice_items", id, row => ({
        ...row,
        invoice_id: item.invoice_id,
        product_name: item.product_name,
        gross_weight: item.gross_weight,
        basket_count: item.basket_count,
        basket_weight_each: item.basket_weight_each ?? 50,
        net_weight: item.net_weight,
        price: item.price,
        amount_before: item.amount_before,
        commission_rate: item.commission_rate,
        commission_value: item.commission_value,
        amount_after_comm: item.amount_after_comm,
        porterage: item.porterage,
        final_amount: item.final_amount,
        updated_at: ts,
      }));
    } else {
      pushFallbackRecord("invoice_items", {
        id,
        invoice_id: item.invoice_id,
        product_name: item.product_name,
        gross_weight: item.gross_weight,
        basket_count: item.basket_count,
        basket_weight_each: item.basket_weight_each ?? 50,
        net_weight: item.net_weight,
        price: item.price,
        amount_before: item.amount_before,
        commission_rate: item.commission_rate,
        commission_value: item.commission_value,
        amount_after_comm: item.amount_after_comm,
        porterage: item.porterage,
        final_amount: item.final_amount,
        is_deleted: 0,
        created_at: ts,
        updated_at: ts,
      });
    }
    return id;
  }
  const db = await getDb();
  const ts = now();
  const id = item.id ?? uuid();
  await db.execute(
    `INSERT INTO invoice_items
      (id, invoice_id, product_name, gross_weight, basket_count, basket_weight_each,
       net_weight, price, amount_before, commission_rate, commission_value,
       amount_after_comm, porterage, final_amount, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       product_name=excluded.product_name,
       gross_weight=excluded.gross_weight,
       basket_count=excluded.basket_count,
       basket_weight_each=excluded.basket_weight_each,
       net_weight=excluded.net_weight,
       price=excluded.price,
       amount_before=excluded.amount_before,
       commission_rate=excluded.commission_rate,
       commission_value=excluded.commission_value,
       amount_after_comm=excluded.amount_after_comm,
       porterage=excluded.porterage,
       final_amount=excluded.final_amount,
       updated_at=excluded.updated_at`,
    [
      id, item.invoice_id, item.product_name,
      item.gross_weight, item.basket_count, item.basket_weight_each ?? 50,
      item.net_weight, item.price,
      item.amount_before, item.commission_rate, item.commission_value,
      item.amount_after_comm, item.porterage, item.final_amount,
      ts, ts,
    ]
  );
  return id;
}

export async function deleteInvoiceItem(id) {
  if (!isTauriRuntime()) {
    updateFallbackRecord("invoice_items", id, row => ({ ...row, is_deleted: 1, updated_at: now() }));
    return;
  }
  const db = await getDb();
  await db.execute("UPDATE invoice_items SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Payments ───────────────────────────────────────────────────────────────
export async function getPayments({ trader_id = null } = {}) {
  if (!isTauriRuntime()) {
    const traders = new Map(getFallbackRecords("traders").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    return getFallbackRecords("payments")
      .filter(item => item.is_deleted !== 1)
      .filter(item => !trader_id || item.trader_id === trader_id)
      .map(item => ({ ...item, trader_name: traders.get(item.trader_id)?.name ?? null }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }
  const db = await getDb();
  let where = "p.is_deleted=0";
  const params = [];
  if (trader_id) { where += " AND p.trader_id=?"; params.push(trader_id); }
  return db.select(`
    SELECT p.*, t.name as trader_name
    FROM payments p
    LEFT JOIN traders t ON p.trader_id = t.id
    WHERE ${where} ORDER BY p.date DESC
  `, params);
}

export async function createPayment({ trader_id, amount, date, notes = null }) {
  if (!isTauriRuntime()) {
    const id = uuid(); const ts = now();
    pushFallbackRecord("payments", { id, trader_id, amount, date, notes, is_deleted: 0, created_at: ts, updated_at: ts });
    updateFallbackRecord("traders", trader_id, row => ({ ...row, debt_fils: Number(row.debt_fils || 0) - Number(amount || 0), updated_at: ts }));
    pushFallbackRecord("transactions_log", { id: uuid(), type: "payment", ref_id: id, trader_id, amount, description: "دفعة تسوية دين", date, created_at: ts });
    return id;
  }
  const db = await getDb();
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO payments (id, trader_id, amount, date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, trader_id, amount, date, notes, ts, ts]
  );
  await db.execute(
    "UPDATE traders SET debt_fils = debt_fils - ?, updated_at=? WHERE id=?",
    [amount, ts, trader_id]
  );
  await db.execute(
    `INSERT INTO transactions_log (id, type, ref_id, trader_id, amount, description, date, created_at)
     VALUES (?, 'payment', ?, ?, ?, ?, ?, ?)`,
    [uuid(), id, trader_id, amount, "دفعة تسوية دين", date, ts]
  );
  return id;
}

// ─── Transactions Log ────────────────────────────────────────────────────────
export async function getTransactions({ from = null, to = null, trader_id = null } = {}) {
  if (!isTauriRuntime()) {
    const traders = new Map(getFallbackRecords("traders").filter(item => item.is_deleted !== 1).map(item => [item.id, item]));
    return getFallbackRecords("transactions_log")
      .filter(item => item.is_deleted !== 1)
      .filter(item => !from || item.date >= from)
      .filter(item => !to || item.date <= to)
      .filter(item => !trader_id || item.trader_id === trader_id)
      .map(item => ({ ...item, trader_name: traders.get(item.trader_id)?.name ?? null }))
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
      .slice(0, 1000);
  }
  const db = await getDb();
  let where = "tl.is_deleted=0";
  const params = [];
  if (from)      { where += " AND tl.date >= ?"; params.push(from); }
  if (to)        { where += " AND tl.date <= ?"; params.push(to); }
  if (trader_id) { where += " AND tl.trader_id=?"; params.push(trader_id); }
  return db.select(`
    SELECT tl.*, t.name as trader_name
    FROM transactions_log tl
    LEFT JOIN traders t ON tl.trader_id = t.id
    WHERE ${where} ORDER BY tl.created_at DESC LIMIT 1000
  `, params);
}

// ─── Settings ────────────────────────────────────────────────────────────────
export async function getSetting(key) {
  if (!isTauriRuntime()) {
    const store = ensureFallbackStore();
    return store.settings?.[key] ?? null;
  }
  const db = await getDb();
  const rows = await db.select("SELECT value FROM settings WHERE key=?", [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key, value) {
  if (!isTauriRuntime()) {
    const store = ensureFallbackStore();
    store.settings[key] = String(value);
    persistFallbackStore(store);
    return;
  }
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    [key, String(value), now()]
  );
}

export async function getAllSettings() {
  if (!isTauriRuntime()) {
    return { ...(ensureFallbackStore().settings || {}) };
  }
  const db = await getDb();
  const rows = await db.select("SELECT key, value FROM settings");
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
export async function getDashboardStats({ from = null, to = null } = {}) {
  if (!isTauriRuntime()) {
    const traders = getFallbackRecords("traders").filter(item => item.is_deleted !== 1);
    const invoices = getFallbackRecords("invoices").filter(item => item.is_deleted !== 1 && (!from || item.date >= from) && (!to || item.date <= to));
    const postedInvoices = invoices.filter(item => item.status === "posted");
    const invoiceItems = getFallbackRecords("invoice_items").filter(item => item.is_deleted !== 1);
    const postedItems = invoiceItems.filter(item => postedInvoices.some(inv => inv.id === item.invoice_id));
    const topDebtors = traders.filter(item => Number(item.debt_fils || 0) > 0).sort((a, b) => Number(b.debt_fils || 0) - Number(a.debt_fils || 0)).slice(0, 5);
    const topProducts = postedItems.reduce((acc, item) => {
      const key = item.product_name || "غير محدد";
      acc[key] ??= { product_name: key, total_weight: 0, total_amount: 0 };
      acc[key].total_weight += Number(item.net_weight || 0);
      acc[key].total_amount += Number(item.final_amount || 0);
      return acc;
    }, {});
    const salesByDay = Object.entries(postedInvoices.reduce((acc, inv) => {
      acc[inv.date] = (acc[inv.date] || 0) + Number(inv.total_final || 0);
      return acc;
    }, {})).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 30);

    return {
      tradersCount: traders.length,
      totalSales: postedInvoices.reduce((s, inv) => s + Number(inv.total_final || 0), 0),
      totalComm: postedItems.reduce((s, item) => s + Number(item.commission_value || 0), 0),
      totalPort: postedItems.reduce((s, item) => s + Number(item.porterage || 0), 0),
      totalDebt: traders.reduce((s, item) => s + Number(item.debt_fils || 0), 0),
      draftCount: invoices.filter(item => item.status === "draft").length,
      postedCount: postedInvoices.length,
      topDebtors: topDebtors.map(item => ({ name: item.name, debt_fils: Number(item.debt_fils || 0) })),
      topProducts: Object.values(topProducts).sort((a, b) => b.total_amount - a.total_amount).slice(0, 5),
      salesByDay,
    };
  }
  const db = await getDb();
  let dateFilter = "";
  const p = [];
  if (from) { dateFilter += " AND date >= ?"; p.push(from); }
  if (to)   { dateFilter += " AND date <= ?"; p.push(to); }

  const [traders]       = await db.select("SELECT COUNT(*) as c FROM traders WHERE is_deleted=0");
  const [totalSales]    = await db.select(`SELECT COALESCE(SUM(total_final),0) as c FROM invoices WHERE is_deleted=0 AND status='posted'${dateFilter}`, p);
  const [totalComm]     = await db.select(`SELECT COALESCE(SUM(ii.commission_value),0) as c FROM invoice_items ii JOIN invoices i ON ii.invoice_id=i.id WHERE ii.is_deleted=0 AND i.status='posted' AND i.is_deleted=0${dateFilter.replace(/date/g,"i.date")}`, p);
  const [totalPort]     = await db.select(`SELECT COALESCE(SUM(ii.porterage),0) as c FROM invoice_items ii JOIN invoices i ON ii.invoice_id=i.id WHERE ii.is_deleted=0 AND i.status='posted' AND i.is_deleted=0${dateFilter.replace(/date/g,"i.date")}`, p);
  const [totalDebt]     = await db.select("SELECT COALESCE(SUM(debt_fils),0) as c FROM traders WHERE is_deleted=0");
  const [draftCount]    = await db.select("SELECT COUNT(*) as c FROM invoices WHERE is_deleted=0 AND status='draft'");
  const [postedCount]   = await db.select(`SELECT COUNT(*) as c FROM invoices WHERE is_deleted=0 AND status='posted'${dateFilter}`, p);
  const topDebtors      = await db.select("SELECT name, debt_fils FROM traders WHERE is_deleted=0 AND debt_fils>0 ORDER BY debt_fils DESC LIMIT 5");
  const topProducts     = await db.select(`
    SELECT ii.product_name, COALESCE(SUM(ii.net_weight),0) as total_weight, COALESCE(SUM(ii.final_amount),0) as total_amount
    FROM invoice_items ii JOIN invoices i ON ii.invoice_id=i.id
    WHERE ii.is_deleted=0 AND i.status='posted' AND i.is_deleted=0${dateFilter.replace(/date/g,"i.date")}
    GROUP BY ii.product_name ORDER BY total_amount DESC LIMIT 5
  `, p);
  const salesByDay      = await db.select(`
    SELECT i.date, COALESCE(SUM(i.total_final),0) as total
    FROM invoices i WHERE i.is_deleted=0 AND i.status='posted'${dateFilter}
    GROUP BY i.date ORDER BY i.date ASC LIMIT 30
  `, p);

  return {
    tradersCount:   traders.c,
    totalSales:     totalSales.c,
    totalComm:      totalComm.c,
    totalPort:      totalPort.c,
    totalDebt:      totalDebt.c,
    draftCount:     draftCount.c,
    postedCount:    postedCount.c,
    topDebtors,
    topProducts,
    salesByDay,
  };
}
