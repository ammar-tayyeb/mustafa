import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, CreditCard, Scale, ShoppingBag } from "lucide-react";
// استبدال الدالة القديمة بالدالة الجديدة القائمة على القوائم والفواتير المستقلة
import { getTraders, createTrader, updateTrader, deleteTrader, createManualDebtInvoice } from "../lib/db.js";
import { formatMoney, toInt } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const EMPTY_FORM = { name: "", phone: "", notes: "" };
const EMPTY_DEBT = { amount: "", date: new Date().toISOString().slice(0, 10), productName: "", notes: "" };

export default function Traders() {
  const [traders, setTraders]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // نموذج إضافة/تعديل بگال
  const [showForm, setShowForm]     = useState(false);
  const [editRow, setEditRow]       = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  // نموذج إضافة دين جديد يدوي كقائمة مستقلة
  const [debtRow, setDebtRow]       = useState(null);
  const [debtForm, setDebtForm]     = useState(EMPTY_DEBT);
  const [debtSaving, setDebtSaving] = useState(false);

  // حذف
  const [deleteRow, setDeleteRow]   = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTraders(await getTraders());
    } catch (e) {
      setError(e?.message || String(e) || "خطأ غير معروف");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditRow(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setForm({ name: row.name, phone: row.phone ?? "", notes: row.notes ?? "" });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editRow) await updateTrader(editRow.id, form);
      else await createTrader(form);
      setShowForm(false);
      await load();
    } catch (e) {
      alert("خطأ: " + (e?.message || String(e) || "خطأ غير معروف"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteRow) return;
    try {
      await deleteTrader(deleteRow.id);
      setDeleteRow(null);
      await load();
    } catch (e) {
      alert("خطأ: " + (e?.message || String(e) || "خطأ غير معروف"));
    }
  }

  // متحكمات إضافة الدين اليدوي الجديد (بشكل قائمة فاتورة)
  function openDebt(row) {
    setDebtRow(row);
    setDebtForm({ ...EMPTY_DEBT, date: new Date().toISOString().slice(0, 10) });
  }

  async function handleDebt(e) {
    e.preventDefault();
    if (!debtForm.amount || Number(debtForm.amount) <= 0) return;
    if (!debtForm.productName.trim()) {
      alert("يرجى تحديد السلعة أو تفاصيل القائمة المسببة للدين");
      return;
    }
    
    setDebtSaving(true);
    try {
      // دمج اسم المادة مع الملاحظات ليظهر الملخص متناسقاً في كشف القوائم
      const compositeNotes = `${debtForm.productName.trim()} ${debtForm.notes ? ' - ' + debtForm.notes.trim() : ''}`;
      
      await createManualDebtInvoice({
        trader_id: debtRow.id,
        amount: toInt(debtForm.amount),
        date: debtForm.date,
        notes: compositeNotes,
      });
      
      setDebtRow(null);
      await load();
    } catch (e) {
      alert("خطأ أثناء حفظ قائمة الدين: " + e.message);
    } finally {
      setDebtSaving(false);
    }
  }

  const columns = [
    { key: "name",      label: "الاسم" },
    { key: "phone",     label: "الهاتف" },
    {
      key: "debt_fils",
      label: "إجمالي الدين الحالي",
      render: row => (
        <span className={row.debt_fils > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
          {formatMoney(row.debt_fils)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* رأس الصفحة */}
      <div className="flex items-center justify-between">
     
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90"
        >
          <Plus size={16} /> إضافة بگال
        </button>
      </div>
    

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
      ) : (
        <DataTable
          columns={columns}
          data={traders}
          searchKeys={["name", "phone"]}
          emptyText="لا يوجد بگاگيل مسجّلون"
          actions={row => (
            <div className="flex items-center gap-1">
              <button
                onClick={() => openDebt(row)}
                title="إنشاء قائمة دين يدوية جديدة"
                className="p-1.5 rounded hover:bg-accent text-orange-600"
              >
                <Scale size={15} />
              </button>
              <button
                onClick={() => openEdit(row)}
                title="تعديل بيانات البگال"
                className="p-1.5 rounded hover:bg-accent"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => setDeleteRow(row)}
                title="حذف"
                className="p-1.5 rounded hover:bg-accent text-destructive"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
        />
      )}

      {/* نموذج إضافة/تعديل بگال */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">{editRow ? "تعديل بيانات البگال" : "إضافة بگال جديد"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-accent">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">الاسم *</label>
                <input
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  placeholder="اسم البگال الثلاثي"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">الهاتف</label>
                <input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  placeholder="رقم الهاتف"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">ملاحظات عامة</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">إلغاء</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                  {saving ? "جارٍ الحفظ..." : "حفظ المعطيات"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نموذج فتح قائمة دين مستقلة جديدة (يدوية) */}
      {debtRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-orange-600">فتح قائمة دين جديدة — {debtRow.name}</h3>
              <button onClick={() => setDebtRow(null)} className="p-1 rounded hover:bg-accent"><X size={16} /></button>
            </div>
            <form onSubmit={handleDebt} className="p-5 flex flex-col gap-4">
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                إجمالي المديونية الحالية: <span className="font-semibold text-destructive">{formatMoney(debtRow.debt_fils)}</span>
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium flex items-center gap-1">
                  <ShoppingBag size={14} className="text-orange-500" /> السلعة / الخدمة المسببة للدين *
                </label>
                <input
                  required
                  type="text"
                  value={debtForm.productName}
                  onChange={e => setDebtForm(f => ({ ...f, productName: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring focus:border-orange-500"
                  placeholder="مثال: موز، تفاح، أجور نقل وقيد..."
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">مبلغ القائمة الإجمالي *</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={debtForm.amount}
                  onChange={e => setDebtForm(f => ({ ...f, amount: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring focus:border-orange-500"
                  placeholder="0.00"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">التاريخ *</label>
                <input
                  required
                  type="date"
                  value={debtForm.date}
                  onChange={e => setDebtForm(f => ({ ...f, date: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">ملاحظات إضافية</label>
                <input
                  value={debtForm.notes}
                  onChange={e => setDebtForm(f => ({ ...f, notes: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  placeholder="أي تفاصيل تود تسجيلها بالوصل..."
                />
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setDebtRow(null)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">إلغاء</button>
                <button type="submit" disabled={debtSaving} className="px-4 py-2 rounded-md bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-60">
                  {debtSaving ? "جارٍ تسجيل القائمة..." : "تأكيد وإدراج القائمة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* تأكيد الحذف */}
      <ConfirmDialog
        open={!!deleteRow}
        title="حذف بگال"
        message={`هل تريد حذف البگال «${deleteRow?.name}»؟ لن يُحذف نهائياً من أرشيف النظام.`}
        confirmText="تأكيد الحذف"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteRow(null)}
      />
    </div>
  );
}