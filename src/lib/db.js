import Database from "@tauri-apps/plugin-sql";

let _db = null;

export async function getDb() {
  if (!_db) {
    _db = await Database.load("sqlite:warehouse.db");
  }
  return _db;
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
  const db = await getDb();
  return db.select("SELECT * FROM traders WHERE is_deleted=0 ORDER BY name");
}

export async function createTrader({ name, phone = null, address = null, notes = null }) {
  const db = await getDb();
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO traders (id, name, phone, address, notes, debt_fils, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
    [id, name, phone, address, notes, ts, ts]
  );
  return id;
}

export async function updateTrader(id, fields) {
  const db = await getDb();
  await db.execute(
    "UPDATE traders SET name=?, phone=?, address=?, notes=?, updated_at=? WHERE id=?",
    [fields.name, fields.phone ?? null, fields.address ?? null, fields.notes ?? null, now(), id]
  );
}

export async function deleteTrader(id) {
  const db = await getDb();
  await db.execute("UPDATE traders SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Vehicles ───────────────────────────────────────────────────────────────
export async function getVehicles() {
  const db = await getDb();
  return db.select("SELECT * FROM vehicles WHERE is_deleted=0 ORDER BY plate");
}

export async function createVehicle({ plate, type = null, notes = null }) {
  const db = await getDb();
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO vehicles (id, plate, type, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, plate, type, notes, ts, ts]
  );
  return id;
}

export async function updateVehicle(id, fields) {
  const db = await getDb();
  await db.execute(
    "UPDATE vehicles SET plate=?, type=?, notes=?, updated_at=? WHERE id=?",
    [fields.plate, fields.type ?? null, fields.notes ?? null, now(), id]
  );
}

export async function deleteVehicle(id) {
  const db = await getDb();
  await db.execute("UPDATE vehicles SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Drivers ────────────────────────────────────────────────────────────────
export async function getDrivers() {
  const db = await getDb();
  return db.select(`
    SELECT d.*, v.plate as vehicle_plate
    FROM drivers d
    LEFT JOIN vehicles v ON d.vehicle_id = v.id
    WHERE d.is_deleted=0 ORDER BY d.name
  `);
}

export async function createDriver({ name, phone = null, vehicle_id = null, notes = null }) {
  const db = await getDb();
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO drivers (id, name, phone, vehicle_id, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, name, phone, vehicle_id, notes, ts, ts]
  );
  return id;
}

export async function updateDriver(id, fields) {
  const db = await getDb();
  await db.execute(
    "UPDATE drivers SET name=?, phone=?, vehicle_id=?, notes=?, updated_at=? WHERE id=?",
    [fields.name, fields.phone ?? null, fields.vehicle_id ?? null, fields.notes ?? null, now(), id]
  );
}

export async function deleteDriver(id) {
  const db = await getDb();
  await db.execute("UPDATE drivers SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Invoices ───────────────────────────────────────────────────────────────
export async function getInvoices({ from = null, to = null, status = null, trader_id = null } = {}) {
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
  const db = await getDb();
  const id = uuid(); const ts = now();
  await db.execute(
    `INSERT INTO invoices (id, trader_id, driver_id, vehicle_id, date, status, total_final, paid_amount, remaining, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', 0, 0, 0, ?, ?, ?)`,
    [id, trader_id, driver_id, vehicle_id, date, notes, ts, ts]
  );
  return id;
}

export async function updateInvoiceTotals(id, { total_final, paid_amount, remaining, notes = null }) {
  const db = await getDb();
  await db.execute(
    "UPDATE invoices SET total_final=?, paid_amount=?, remaining=?, notes=?, updated_at=? WHERE id=?",
    [total_final, paid_amount, remaining, notes, now(), id]
  );
}

/** ترحيل الفاتورة: تغيير الحالة + إضافة الباقي لدين التاجر + تسجيل في سجل المعاملات */
export async function postInvoice(invoiceId) {
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
  const db = await getDb();
  await db.execute("UPDATE invoices SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Invoice Items ───────────────────────────────────────────────────────────
export async function getInvoiceItems(invoice_id) {
  const db = await getDb();
  return db.select(
    "SELECT * FROM invoice_items WHERE invoice_id=? AND is_deleted=0 ORDER BY created_at",
    [invoice_id]
  );
}

export async function upsertInvoiceItem(item) {
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
  const db = await getDb();
  await db.execute("UPDATE invoice_items SET is_deleted=1, updated_at=? WHERE id=?", [now(), id]);
}

// ─── Payments ───────────────────────────────────────────────────────────────
export async function getPayments({ trader_id = null } = {}) {
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
  const db = await getDb();
  const rows = await db.select("SELECT value FROM settings WHERE key=?", [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key, value) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    [key, String(value), now()]
  );
}

export async function getAllSettings() {
  const db = await getDb();
  const rows = await db.select("SELECT key, value FROM settings");
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
export async function getDashboardStats({ from = null, to = null } = {}) {
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
