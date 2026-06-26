import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { getDrivers, createDriver, updateDriver, deleteDriver, getVehicles } from "../lib/db.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EntityCombobox from "../components/EntityCombobox.jsx";

const EMPTY = { name: "", phone: "", vehicle_id: null, notes: "" };

export default function Drivers() {
  const [rows, setRows]           = useState([]);
  const [vehicles, setVehicles]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [editRow, setEditRow]     = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [d, v] = await Promise.all([getDrivers(), getVehicles()]);
      setRows(d); setVehicles(v);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const vehicleItems = vehicles.map(v => ({ id: v.id, label: v.plate }));

  function openAdd() { setEditRow(null); setForm(EMPTY); setShowForm(true); }
  function openEdit(row) {
    setEditRow(row);
    setForm({ name: row.name, phone: row.phone ?? "", vehicle_id: row.vehicle_id ?? null, notes: row.notes ?? "" });
    setShowForm(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editRow) await updateDriver(editRow.id, form);
      else await createDriver(form);
      setShowForm(false); await load();
    } catch (e) { alert("خطأ: " + e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    try { await deleteDriver(deleteRow.id); setDeleteRow(null); await load(); }
    catch (e) { alert("خطأ: " + e.message); }
  }

  const columns = [
    { key: "name",          label: "الاسم" },
    { key: "phone",         label: "الهاتف" },
    { key: "vehicle_plate", label: "المركبة" },
    { key: "notes",         label: "ملاحظات", sortable: false },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">السائقون</h2>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة السائقين وربطهم بالمركبات</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus size={16} /> إضافة سائق
        </button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}

      {loading ? <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div> : (
        <DataTable columns={columns} data={rows} searchKeys={["name", "phone", "vehicle_plate"]} emptyText="لا يوجد سائقون مسجّلون"
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
              <h3 className="font-semibold">{editRow ? "تعديل سائق" : "إضافة سائق"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-accent"><X size={16} /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">الاسم *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder="اسم السائق" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">الهاتف</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" placeholder="رقم الهاتف" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">المركبة</label>
                <EntityCombobox
                  items={vehicleItems}
                  value={form.vehicle_id}
                  onChange={(id) => setForm(f => ({ ...f, vehicle_id: id }))}
                  placeholder="اختر مركبة..."
                />
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

      <ConfirmDialog open={!!deleteRow} title="حذف سائق" message={`حذف السائق «${deleteRow?.name}»؟`}
        confirmText="حذف" danger onConfirm={handleDelete} onCancel={() => setDeleteRow(null)} />
    </div>
  );
}
