import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { getVehicles, createVehicle, updateVehicle, deleteVehicle } from "../lib/db.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const EMPTY = { plate: "", type: "", notes: "" };

export default function Vehicles() {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);

  const load = useCallback(async () => {
    try { setLoading(true); setError(null); setRows(await getVehicles()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditRow(null); setForm(EMPTY); setShowForm(true); }
  function openEdit(row) {
    setEditRow(row);
    setForm({ plate: row.plate, type: row.type ?? "", notes: row.notes ?? "" });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.plate.trim()) return;
    setSaving(true);
    try {
      if (editRow) await updateVehicle(editRow.id, form);
      else await createVehicle(form);
      setShowForm(false); await load();
    } catch (e) { alert("خطأ: " + e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    try { await deleteVehicle(deleteRow.id); setDeleteRow(null); await load(); }
    catch (e) { alert("خطأ: " + e.message); }
  }

  const columns = [
    { key: "plate", label: "رقم اللوحة" },
    { key: "type",  label: "النوع" },
    { key: "notes", label: "ملاحظات", sortable: false },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">المركبات</h2>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة مركبات النقل</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus size={16} /> إضافة مركبة
        </button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}

      {loading ? <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div> : (
        <DataTable columns={columns} data={rows} searchKeys={["plate", "type"]} emptyText="لا توجد مركبات مسجّلة"
          actions={row => (
            <div className="flex items-center gap-1">
              <button onClick={() => openEdit(row)} className="p-1.5 rounded hover:bg-accent"><Pencil size={15} /></button>
              <button onClick={() => setDeleteRow(row)} className="p-1.5 rounded hover:bg-accent text-destructive"><Trash2 size={15} /></button>
            </div>
          )}
        />
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">{editRow ? "تعديل مركبة" : "إضافة مركبة"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-accent"><X size={16} /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">رقم اللوحة *</label>
                <input required value={form.plate} onChange={e => setForm(f => ({ ...f, plate: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder="رقم اللوحة" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">النوع</label>
                <input value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder="شاحنة / بيك أب..." />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">ملاحظات</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none" />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">إلغاء</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                  {saving ? "جارٍ الحفظ..." : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteRow} title="حذف مركبة" message={`حذف المركبة «${deleteRow?.plate}»؟`}
        confirmText="حذف" danger onConfirm={handleDelete} onCancel={() => setDeleteRow(null)} />
    </div>
  );
}
