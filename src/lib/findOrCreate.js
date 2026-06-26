/**
 * findOrCreate.js — إيجاد أو إنشاء تاجر/سائق/مركبة مباشرة من حقول الفاتورة
 */
import { getDb, uuid, now, isTauriRuntime } from "./db.js";

const FALLBACK_STORE_KEY = "warehouse_fallback_store";

function getFallbackStore() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return { traders: [], vehicles: [], drivers: [] };
  }
  try {
    const raw = localStorage.getItem(FALLBACK_STORE_KEY);
    return raw ? JSON.parse(raw) : { traders: [], vehicles: [], drivers: [] };
  } catch {
    return { traders: [], vehicles: [], drivers: [] };
  }
}

function saveFallbackStore(store) {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    localStorage.setItem(FALLBACK_STORE_KEY, JSON.stringify(store));
  }
}

function findFallbackRecord(table, matcher) {
  const store = getFallbackStore();
  const rows = store[table] || [];
  return rows.find(matcher) ?? null;
}

/** إيجاد أو إنشاء تاجر بالاسم */
export async function findOrCreateTrader(name) {
  if (!name?.trim()) return null;
  const normalized = name.trim();
  if (!isTauriRuntime()) {
    const existing = findFallbackRecord("traders", row => row.name === normalized && row.is_deleted !== 1);
    if (existing) return existing.id;
    const store = getFallbackStore();
    const id = uuid(); const ts = now();
    store.traders = store.traders || [];
    store.traders.push({ id, name: normalized, phone: null, address: null, notes: null, debt_fils: 0, is_deleted: 0, created_at: ts, updated_at: ts });
    saveFallbackStore(store);
    return id;
  }
  const db = await getDb();
  const rows = await db.select(
    "SELECT id FROM traders WHERE name=? AND is_deleted=0 LIMIT 1",
    [normalized]
  );
  if (rows.length > 0) return rows[0].id;
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO traders (id, name, debt_fils, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
    [id, normalized, ts, ts]
  );
  return id;
}

/** إيجاد أو إنشاء سائق بالاسم */
export async function findOrCreateDriver(name) {
  if (!name?.trim()) return null;
  const normalized = name.trim();
  if (!isTauriRuntime()) {
    const existing = findFallbackRecord("drivers", row => row.name === normalized && row.is_deleted !== 1);
    if (existing) return existing.id;
    const store = getFallbackStore();
    const id = uuid(); const ts = now();
    store.drivers = store.drivers || [];
    store.drivers.push({ id, name: normalized, phone: null, vehicle_id: null, notes: null, is_deleted: 0, created_at: ts, updated_at: ts });
    saveFallbackStore(store);
    return id;
  }
  const db = await getDb();
  const rows = await db.select(
    "SELECT id FROM drivers WHERE name=? AND is_deleted=0 LIMIT 1",
    [normalized]
  );
  if (rows.length > 0) return rows[0].id;
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO drivers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, normalized, ts, ts]
  );
  return id;
}

/** إيجاد أو إنشاء مركبة برقم اللوحة */
export async function findOrCreateVehicle(plate) {
  if (!plate?.trim()) return null;
  const normalized = plate.trim();
  if (!isTauriRuntime()) {
    const existing = findFallbackRecord("vehicles", row => row.plate === normalized && row.is_deleted !== 1);
    if (existing) return existing.id;
    const store = getFallbackStore();
    const id = uuid(); const ts = now();
    store.vehicles = store.vehicles || [];
    store.vehicles.push({ id, plate: normalized, type: null, notes: null, is_deleted: 0, created_at: ts, updated_at: ts });
    saveFallbackStore(store);
    return id;
  }
  const db = await getDb();
  const rows = await db.select(
    "SELECT id FROM vehicles WHERE plate=? AND is_deleted=0 LIMIT 1",
    [normalized]
  );
  if (rows.length > 0) return rows[0].id;
  const id = uuid(); const ts = now();
  await db.execute(
    "INSERT INTO vehicles (id, plate, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, normalized, ts, ts]
  );
  return id;
}
