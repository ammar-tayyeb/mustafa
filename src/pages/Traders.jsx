import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X, CreditCard } from "lucide-react";
import { getTraders, createTrader, updateTrader, deleteTrader, createPayment } from "../lib/db.js";
import { formatMoney, fromInt, toInt } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const EMPTY_FORM = { name: "", phone: "", address: "", notes: "" };
const EMPTY_PAY  = { amount: "", date: new Date().toISOString().slice(0, 10), notes: "" };

export default function Traders() {
  const [traders, setTraders]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // نموذج إضافة/تعديل
  const [showForm, setShowForm]     = useState(false);
  const [editRow, setEditRow]       = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  // نموذج الدفعة
  const [payRow, setPayRow]         = useState(null);
  const [payForm, setPayForm]       = useState(EMPTY_PAY);
  const [payingSaving, setPaySaving]= useState(false);

  // حذف
  const [deleteRow, setDeleteRow]   = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTraders(await getTraders());
    } catch (e) {
      setError(e.message);
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
    setForm({ name: row.name, phone: row.phone ?? "", address: row.address ?? "", notes: row.notes ?? "" });
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
      alert("خطأ: " + e.message);
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
      alert("خطأ: " + e.message);
    }
  }

  function openPay(row) {
    setPayRow(row);
    setPayForm({ ...EMPTY_PAY, date: new Date().toISOString().slice(0, 10) });
  }

  async function handlePay(e) {
    e.preventDefault();
    if (!payForm.amount || Number(payForm.amount) <= 0) return;
    setPaySaving(true);
    try {
      await createPayment({
        trader_id: payRow.id,
        amount: toInt(payForm.amount),
        date: payForm.date,
        notes: payForm.notes || null,
      });
      setPayRow(null);
      await load();
    } catch (e) {
      alert("خطأ: " + e.message);
    } finally {
      setPaySaving(false);
    }
  }

  const columns = [
    { key: "name",      label: "الاسم" },
    { key: "phone",     label: "الهاتف" },
    { key: "address",   label: "العنوان" },
    {
      key: "debt_fils",
      label: "الدين",
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
        <div>
          <h2 className="text-xl font-bold">التجار</h2>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة التجار وأرصدة الديون</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90"
        >
          <Plus size={16} /> إضافة تاجر
        </button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
      ) : (
        <DataTable
          columns={columns}
          data={traders}
          searchKeys={["name", "phone", "address"]}
          emptyText="لا يوجد تجار مسجّلون"
          actions={row => (
            <div className="flex items-center gap-1">
              <button
                onClick={() => openPay(row)}
                title="تسجيل دفعة"
                className="p-1.5 rounded hover:bg-accent text-green-600"
              >
                <CreditCard size={15} />
              </button>
              <button
                onClick={() => openEdit(row)}
                title="تعديل"
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

      {/* نموذج إضافة/تعديل */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">{editRow ? "تعديل تاجر" : "إضافة تاجر"}</h3>
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
                  placeholder="اسم التاجر"
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
                <label className="text-sm font-medium">العنوان</label>
                <input
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  placeholder="العنوان"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">
                  إلغاء
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                  {saving ? "جارٍ الحفظ..." : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نموذج الدفعة */}
      {payRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">تسجيل دفعة — {payRow.name}</h3>
              <button onClick={() => setPayRow(null)} className="p-1 rounded hover:bg-accent"><X size={16} /></button>
            </div>
            <form onSubmit={handlePay} className="p-5 flex flex-col gap-4">
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                الدين الحالي: <span className="font-semibold text-destructive">{formatMoney(payRow.debt_fils)}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">المبلغ المدفوع *</label>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payForm.amount}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">التاريخ *</label>
                <input
                  required
                  type="date"
                  value={payForm.date}
                  onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">ملاحظات</label>
                <input
                  value={payForm.notes}
                  onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setPayRow(null)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">إلغاء</button>
                <button type="submit" disabled={payingSaving} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                  {payingSaving ? "جارٍ الحفظ..." : "تسجيل الدفعة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* تأكيد الحذف */}
      <ConfirmDialog
        open={!!deleteRow}
        title="حذف تاجر"
        message={`هل تريد حذف التاجر «${deleteRow?.name}»؟ لن يُحذف نهائياً.`}
        confirmText="حذف"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteRow(null)}
      />
    </div>
  );
}
