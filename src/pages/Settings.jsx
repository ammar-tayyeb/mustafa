import { useState, useEffect, useCallback } from "react";
import { Save, HardDrive, ShieldCheck, AlertCircle } from "lucide-react";
import { getAllSettings, setSetting, isTauriRuntime } from "../lib/db.js";

export default function Settings() {
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
      setError(null);
      const s = await getAllSettings();
      
      setMarketName(s.market_name ?? "");
      setCurrency(s.currency ?? "د.ع");
      
      // إذا كانت القيمة المخزنة 500 تعني 5%، نقسمها على 100 ليراها المستخدم 5 مباشرة
      const rawComm = Number(s.default_commission ?? 500);
      setCommission((rawComm / 100).toString());
      
      // قراءة وزن السلة الافتراضي مباشرة كقيمة عددية
      const rawWeight = Number(s.basket_weight ?? 50);
      setBasketWeight(rawWeight.toString());
    } catch (e) { 
      setError(e.message); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true); 
    setSaved(false);
    setError(null);
    
    try {
      // تحويل النسبة المدخلة (مثلاً 5) إلى القيمة المخزنة الصحيحة (5 * 100 = 500)
      const parsedCommission = Math.round(parseFloat(commission) * 100);
      const parsedBasketWeight = Math.round(parseFloat(basketWeight));

      if (isNaN(parsedCommission) || isNaN(parsedBasketWeight)) {
        throw new Error("الرجاء إدخال قيم عددية صحيحة للعمولة والوزن.");
      }

      await setSetting("market_name", marketName.trim());
      await setSetting("currency", currency.trim());
      await setSetting("default_commission", parsedCommission);
      await setSetting("basket_weight", parsedBasketWeight);
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { 
      setError(e.message); 
    } finally { 
      setSaving(false); 
    }
  }

async function handleBackup() {
    if (!isTauriRuntime()) {
      alert("النسخ الاحتياطي متاح فقط داخل تطبيق سطح المكتب.");
      return;
    }

    try {
      const dialogPlugin = await import("@tauri-apps/plugin-dialog");
      const fsPlugin = await import("@tauri-apps/plugin-fs");
      const pathApi = await import("@tauri-apps/api/path");

      if (!dialogPlugin?.save || !fsPlugin?.copyFile || !pathApi?.appDataDir) {
        throw new Error("فشل في تحميل إضافات Tauri. تأكد من تفعيل الصلاحيات.");
      }

      const { save } = dialogPlugin;
      const { copyFile } = fsPlugin;
      const { appDataDir, join } = pathApi; // 👈 جلب دالة join لربط المسارات بشكل آمن

      // جلب مجلد بيانات التطبيق الصحيح
      const dataDir = await appDataDir();
      
      // 👈 استخدام join يضمن وضع الـ Backslash (\) الصحيحة بين المجلد والملف
      const srcPath = await join(dataDir, "warehouse.db");
      
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
      console.error("Backup Error Details:", e);
      alert("خطأ في النسخ الاحتياطي: " + (e?.message || e || "فشل الاتصال بنظام توري"));
    }
  }

  // تنسيقات حقول الإدخال المحسنة بلمسة جمالية ناعمة
  const inp = "rounded-lg border border-border bg-background px-3.5 py-2 text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/10 w-full hover:border-muted-foreground/30";

  return (
    <div className="flex flex-col gap-6 max-w-xl mx-auto p-4 md:p-0 transition-all duration-300">
      <div className="border-b border-border/60 pb-4">
        <h2 className="text-2xl font-bold tracking-tight">الإعدادات العامة</h2>
        <p className="text-sm text-muted-foreground mt-1">تخصيص معايير النظام وإدارة قواعد البيانات</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 px-4 py-3 text-sm animate-in fade-in zoom-in-95 duration-200">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {saved && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-4 py-3 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300">
          <ShieldCheck size={16} className="shrink-0" />
          <span>تم حفظ الإعدادات وتحديث النظام بنجاح.</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground text-sm animate-pulse">
          جارٍ تحميل الإعدادات وتأمين الاتصال...
        </div>
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          {/* كارت معلومات السوق */}
          <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm flex flex-col gap-4 hover:shadow-md transition-shadow duration-200">
            <h3 className="font-bold text-sm text-primary border-b border-border/40 pb-2">معلومات السوق والعلوة</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">اسم السوق / العلوة</label>
                <input value={marketName} onChange={e => setMarketName(e.target.value)} className={inp} placeholder="نظام إدارة العلوة" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">نسبة العمولة الافتراضية (%)</label>
                <div className="relative flex items-center">
                  <input type="number" min="0" max="100" step="0.1" value={commission}
                    onChange={e => setCommission(e.target.value)} className={inp} placeholder="5" required />
                  <span className="absolute left-3 text-muted-foreground text-xs font-medium pointer-events-none">%</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">تُطبق تلقائياً كنسبة مئوية عند إنشاء قوائم وبنود جديدة.</p>
              </div>
             
            </div>
          </div>

          {/* كارت إعدادات حساب الفاتورة */}
          

          {/* زر الحفظ الأساسي بجاذبية بصرية ممتازة */}
          <button type="submit" disabled={saving}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold shadow-sm hover:opacity-95 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none">
            <Save size={16} className={saving ? "animate-spin" : ""} />
            {saving ? "جارٍ حفظ التغييرات..." : "حفظ الإعدادات بالكامل"}
          </button>
        </form>
      )}

      {/* قسم النسخ الاحتياطي المفصول بصرياً */}
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-bold text-sm flex items-center gap-1.5 text-foreground/90">
            <HardDrive size={16} className="text-muted-foreground" />
            تأمين البيانات والنسخ الاحتياطي
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
            ينصح بتصدير نسخة احتياطية بشكل دوري وحفظها في مكان آمن لضمان عدم فقدان السجلات المالية للتاجر والمركبات.
          </p>
        </div>
        <button type="button" onClick={handleBackup}
          className="flex items-center justify-center gap-2 bg-background border border-border hover:bg-accent hover:text-accent-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150 whitespace-nowrap shadow-sm">
          تصدير نسخة SQLite (.db)
        </button>
      </div>
    </div>
  );
}