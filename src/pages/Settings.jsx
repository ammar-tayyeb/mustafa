import { useState, useEffect, useCallback } from "react";
import { Save, HardDrive } from "lucide-react";
import { getAllSettings, setSetting, isTauriRuntime } from "../lib/db.js";
import { fromInt, toInt } from "../lib/money.js";

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState(null);

  // حقول النموذج
  const [marketName,   setMarketName]   = useState("");
  const [currency,     setCurrency]     = useState("");
  const [commission,   setCommission]   = useState("");
  const [basketWeight, setBasketWeight] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const s = await getAllSettings();
      setSettings(s);
      setMarketName(s.market_name ?? "");
      setCurrency(s.currency ?? "ريال");
      setCommission(fromInt(Number(s.default_commission ?? 500)));
      setBasketWeight(fromInt(Number(s.basket_weight ?? 50)));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); setSaved(false);
    try {
      await setSetting("market_name",        marketName);
      await setSetting("currency",           currency);
      await setSetting("default_commission", toInt(commission));
      await setSetting("basket_weight",      toInt(basketWeight));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleBackup() {
    if (!isTauriRuntime()) {
      alert("النسخ الاحتياطي متاح فقط داخل تطبيق سطح المكتب.");
      return;
    }

    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { copyFile } = await import("@tauri-apps/plugin-fs");
      const { appDataDir } = await import("@tauri-apps/api/path");

      const dataDir = await appDataDir();
      const srcPath = dataDir + "warehouse.db";
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const destPath = await save({
        defaultPath: `warehouse_backup_${ts}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (destPath) {
        await copyFile(srcPath, destPath);
        alert("تم حفظ النسخة الاحتياطية بنجاح ✓");
      }
    } catch (e) {
      alert("خطأ في النسخ الاحتياطي: " + e.message);
    }
  }

  const inp = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring w-full";

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div>
        <h2 className="text-xl font-bold">الإعدادات</h2>
        <p className="text-sm text-muted-foreground mt-0.5">إعدادات النظام العامة</p>
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}
      {saved  && <div className="rounded-md bg-green-50 text-green-700 px-4 py-3 text-sm">✓ تم حفظ الإعدادات</div>}

      {loading ? <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div> : (
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div className="rounded-lg border border-border p-5 flex flex-col gap-4">
            <h3 className="font-semibold text-sm">معلومات السوق</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">اسم السوق / العلوة</label>
              <input value={marketName} onChange={e => setMarketName(e.target.value)} className={inp} placeholder="نظام إدارة العلوة" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">العملة</label>
              <input value={currency} onChange={e => setCurrency(e.target.value)} className={inp} placeholder="ريال" />
            </div>
          </div>

          <div className="rounded-lg border border-border p-5 flex flex-col gap-4">
            <h3 className="font-semibold text-sm">إعدادات الفاتورة</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">نسبة العمولة الافتراضية (%)</label>
              <input type="number" min="0" max="100" step="0.01" value={commission}
                onChange={e => setCommission(e.target.value)} className={inp} placeholder="5.00" />
              <p className="text-xs text-muted-foreground">تُطبَّق تلقائياً على كل بند جديد في الفاتورة</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">وزن السلة الافتراضي (كجم)</label>
              <input type="number" min="0" step="0.01" value={basketWeight}
                onChange={e => setBasketWeight(e.target.value)} className={inp} placeholder="0.50" />
            </div>
          </div>

          <button type="submit" disabled={saving}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
            <Save size={16} />
            {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
          </button>
        </form>
      )}

      {/* النسخ الاحتياطي */}
      <div className="rounded-lg border border-border p-5 flex flex-col gap-3">
        <h3 className="font-semibold text-sm">النسخ الاحتياطي</h3>
        <p className="text-sm text-muted-foreground">احفظ نسخة من قاعدة البيانات على جهازك أو قرص خارجي.</p>
        <button type="button" onClick={handleBackup}
          className="flex items-center gap-2 border border-border px-4 py-2 rounded-md text-sm hover:bg-accent w-fit">
          <HardDrive size={16} /> حفظ نسخة احتياطية
        </button>
      </div>
    </div>
  );
}
