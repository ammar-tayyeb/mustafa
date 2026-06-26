/**
 * findOrCreate.js — إيجاد أو إنشاء تاجر/سائق/مركبة مباشرة من حقول الفاتورة
 */
import { getDb, uuid, now } from "./db.js";

/** إيجاد أو إنشاء تاجر بالاسم */
export async function findOrCreateTrader(name) {
  if (!name?.trim()) return null;
  const db = await getDb();
  const rows = await db.select(
    "SELECT id FROM traders WHERE name=? AND is_deleted=0 LIMIT 1",
    [name.trim()]
  );
  if (rows.length > 0) return rows[0].id;
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO traders (id, name, debt_fils, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
    [id, name.trim(), ts, ts]
  );
  return id;
}

/** إيجاد أو إنشاء سائق بالاسم */
export async function findOrCreateDriver(name) {
  if (!name?.trim()) return null;
  const db = await getDb();
  const rows = await db.select(
    "SELECT id FROM drivers WHERE name=? AND is_deleted=0 LIMIT 1",
    [name.trim()]
  );
  if (rows.length > 0) return rows[0].id;
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO drivers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, name.trim(), ts, ts]
  );
  return id;
}

/** إيجاد أو إنشاء مركبة برقم اللوحة */
export async function findOrCreateVehicle(plate) {
  if (!plate?.trim()) return null;
  const db = await getDb();
  const rows = await db.select(
    "SELECT id FROM vehicles WHERE plate=? AND is_deleted=0 LIMIT 1",
    [plate.trim()]
  );
  if (rows.length > 0) return rows[0].id;
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO vehicles (id, plate, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, plate.trim(), ts, ts]
  );
  return id;
}
