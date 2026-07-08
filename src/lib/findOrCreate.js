/**
 * findOrCreate.js — إيجاد أو إنشاء بگال/سائق مباشرة من حقول الفاتورة
 * تعديل: عند إيجاد/إنشاء سائق يُفتح له قائمة تلقائياً
 */
import { getDb, uuid, now, isTauriRuntime, openDriverSheet } from "./db.js";

const FALLBACK_STORE_KEY = "warehouse_fallback_store";

function getFallbackStore() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return { traders: [], drivers: [] };
  try {
    const raw = localStorage.getItem(FALLBACK_STORE_KEY);
    return raw ? JSON.parse(raw) : { traders: [], drivers: [] };
  } catch { return { traders: [], drivers: [] }; }
}

function saveFallbackStore(store) {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    localStorage.setItem(FALLBACK_STORE_KEY, JSON.stringify(store));
  }
}

function findFallbackRecord(table, matcher) {
  const store = getFallbackStore();
  return (store[table] || []).find(matcher) ?? null;
}

/** إيجاد أو إنشاء بگال بالاسم */
export async function findOrCreateTrader(name) {
  if (!name?.trim()) return null;
  const normalized = name.trim();
  if (!isTauriRuntime()) {
    const existing = findFallbackRecord("traders", row => row.name === normalized && row.is_deleted !== 1);
    if (existing) return existing.id;
    const store = getFallbackStore(); const id = uuid(); const ts = now();
    store.traders = store.traders || [];
    store.traders.push({ id, name: normalized, phone: null, address: null, notes: null, debt_fils: 0, is_deleted: 0, created_at: ts, updated_at: ts });
    saveFallbackStore(store); return id;
  }
  const db = await getDb();
  const rows = await db.select("SELECT id FROM traders WHERE name=? AND is_deleted=0 LIMIT 1", [normalized]);
  if (rows.length > 0) return rows[0].id;
  const id = uuid(); const ts = now();
  await db.execute("INSERT INTO traders (id, name, debt_fils, created_at, updated_at) VALUES (?, ?, 0, ?, ?)", [id, normalized, ts, ts]);
  return id;
}

/**
 * إيجاد أو إنشاء سائق بالاسم — يفتح قائمة له تلقائياً
 * (إذا كانت القائمة مفتوحة مسبقاً لا يُعاد تعيين وقت الفتح)
 */
export async function findOrCreateDriver(name) {
  if (!name?.trim()) return null;
  const normalized = name.trim();

  if (!isTauriRuntime()) {
    const existing = findFallbackRecord("drivers", row => row.name === normalized && row.is_deleted !== 1);
    let id;
    if (existing) {
      id = existing.id;
    } else {
      const store = getFallbackStore(); id = uuid(); const ts = now();
      store.drivers = store.drivers || [];
      store.drivers.push({ id, name: normalized, phone: null, vehicle_plate: null, notes: null, sheet_status: 'closed', sheet_opened_at: null, is_paid: 0, is_deleted: 0, created_at: ts, updated_at: ts });
      saveFallbackStore(store);
    }
    await openDriverSheet(id); // فتح القائمة (لا يعيد التعيين إذا كانت مفتوحة)
    return id;
  }

  const db = await getDb();
  const rows = await db.select("SELECT id FROM drivers WHERE name=? AND is_deleted=0 LIMIT 1", [normalized]);
  let id;
  if (rows.length > 0) {
    id = rows[0].id;
  } else {
    id = uuid(); const ts = now();
    const { hasColumn } = await import("./db.js");
    if (await hasColumn("drivers", "vehicle_plate")) {
      await db.execute("INSERT INTO drivers (id, name, vehicle_plate, sheet_status, is_paid, created_at, updated_at) VALUES (?, ?, NULL, 'closed', 0, ?, ?)", [id, normalized, ts, ts]);
    } else {
      await db.execute("INSERT INTO drivers (id, name, sheet_status, is_paid, created_at, updated_at) VALUES (?, ?, 'closed', 0, ?, ?)", [id, normalized, ts, ts]);
    }
  }
  await openDriverSheet(id); // فتح القائمة (لا يعيد التعيين إذا كانت مفتوحة)
  return id;
}