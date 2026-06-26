import { useState, useEffect, useCallback } from "react";
import { Plus, Eye, Trash2, RotateCcw, CheckCircle, Printer, X, PlusCircle, Minus } from "lucide-react";
import {
  getInvoices, getInvoice, createInvoice, updateInvoiceTotals,
  postInvoice, reverseInvoice, deleteInvoice,
  getInvoiceItems, upsertInvoiceItem, deleteInvoiceItem,
  getTraders, getDrivers, getVehicles, getAllSettings,
} from "../lib/db.js";
import { computeInvoiceItem, computeInvoiceTotals, fromInt, toInt, formatMoney, formatWeight } from "../lib/money.js";
import { findOrCreateTrader, findOrCreateDriver, findOrCreateVehicle } from "../lib/findOrCreate.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EntityCombobox from "../components/EntityCombobox.jsx";

// ─── بند فارغ ────────────────────────────────────────────────────────────────
function emptyItem() {
  return {
    _key: crypto.randomUUID(),
    id: null,
    product_name: "",
    grossWeight: "",
    basketCount: "",
    basketWeightEach: "0.5",
    price: "",
    commissionRate: "",
    porterage: "",
    manualFinal: null,
    computed: null,
  };
}

// ─── صف بند الفاتورة ─────────────────────────────────────────────────────────
function ItemRow({ item, defaultCommission, onChange, onRemove }) {
  const c = item.computed;

  function field(key, val) {
    const updated = { ...item, [key]: val, manualFinal: key === "manualFinal" ? val : item.manualFinal };
    // إعادة الحساب
    const computed = computeInvoiceItem({
      grossWeight:      updated.grossWeight,
      basketCount:      updated.basketCount,
      basketWeightEach: updated.basketWeightEach || 0.5,
      price:            updated.price,
      commissionRate:   updated.commissionRate !== "" ? updated.commissionRate : (defaultCommission / 100),
      porterage:        updated.porterage,
      manualFinal:      updated.manualFinal !== null && updated.manualFinal !== "" ? updated.manualFinal : null,
    });
    onChange({ ...updated, computed });
  }

  // حساب أولي عند التغيير
  function handleChange(key, val) { field(key, val); }

  const inp = "w-full rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring text-center";
  const lbl = "text-xs text-muted-foreground text-center mb-0.5";

  return (
    <div className="rounded-md border border-border bg-muted/20 p-3 flex flex-col gap-2">
      {/* السطر الأول: المادة + الأوزان + السعر */}
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-2">
          <p className={lbl}>اسم المادة *</p>
          <input value={item.product_name} onChange={e => handleChange("product_name", e.target.value)}
            className={inp} placeholder="الصنف" />
        </div>
        <div>
          <p className={lbl}>الوزن الكلي</p>
          <input type="number" min="0" step="0.01" value={item.grossWeight}
            onChange={e => handleChange("grossWeight", e.target.value)} className={inp} placeholder="0" />
        </div>
        <div>
          <p className={lbl}>عدد السلات</p>
          <input type="number" min="0" step="1" value={item.basketCount}
            onChange={e => handleChange("basketCount", e.target.value)} className={inp} placeholder="0" />
        </div>
        <div>
          <p className={lbl}>السعر</p>
          <input type="number" min="0" step="0.01" value={item.price}
            onChange={e => handleChange("price", e.target.value)} className={inp} placeholder="0" />
        </div>
      </div>

      {/* السطر الثاني: العمولة + الحمالية + النهائي اليدوي */}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <p className={lbl}>العمولة %</p>
          <input type="number" min="0" step="0.01" value={item.commissionRate}
            onChange={e => handleChange("commissionRate", e.target.value)}
            className={inp} placeholder={defaultCommission / 100} />
        </div>
        <div>
          <p className={lbl}>الحمالية</p>
          <input type="number" min="0" step="0.01" value={item.porterage}
            onChange={e => handleChange("porterage", e.target.value)} className={inp} placeholder="0" />
        </div>
        <div>
          <p className={lbl}>النهائي (يدوي)</p>
          <input type="number" min="0" step="0.01"
            value={item.manualFinal ?? ""}
            onChange={e => handleChange("manualFinal", e.target.value || null)}
            className={inp + " border-dashed"} placeholder="تلقائي" />
        </div>
        <div className="flex items-end justify-center pb-0.5">
          <button type="button" onClick={onRemove} className="p-1.5 rounded hover:bg-destructive/10 text-destructive">
            <Minus size={15} />
          </button>
        </div>
      </div>

      {/* نتائج الحساب */}
      {c && (
        <div className="grid grid-cols-5 gap-1 rounded bg-muted/50 px-2 py-1.5 text-xs">
          <div className="text-center">
            <p className="text-muted-foreground">صافي الوزن</p>
            <p className="font-medium">{c.display.netWeight.toFixed(2)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">قبل العمولة</p>
            <p className="font-medium">{c.display.amountBefore.toFixed(2)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">قيمة العمولة</p>
            <p className="font-medium text-orange-600">{c.display.commissionValue.toFixed(2)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">بعد العمولة</p>
            <p className="font-medium">{c.display.amountAfterComm.toFixed(2)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground">النهائي</p>
            <p className="font-semibold text-primary">{c.display.finalAmount.toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── الصفحة الرئيسية ─────────────────────────────────────────────────────────
export default function Invoices() {
  const [invoices, setInvoices]   = useState([]);
  const [traders, setTraders]     = useState([]);
  const [drivers, setDrivers]     = useState([]);
  const [vehicles, setVehicles]   = useState([]);
  const [settings, setSettings]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  // نموذج الفاتورة
  const [showForm, setShowForm]   = useState(false);
  const [editInv, setEditInv]     = useState(null);
  const [invForm, setInvForm]     = useState({ trader_id: null, trader_label: "", driver_id: null, driver_label: "", vehicle_id: null, vehicle_label: "", date: new Date().toISOString().slice(0,10), notes: "" });
  const [items, setItems]         = useState([emptyItem()]);
  const [paidAmount, setPaidAmount] = useState("");
  const [saving, setSaving]       = useState(false);

  // عرض تفاصيل
  const [viewInv, setViewInv]     = useState(null);
  const [viewItems, setViewItems] = useState([]);

  // تأكيدات
  const [confirmPost, setConfirmPost]       = useState(null);
  const [confirmReverse, setConfirmReverse] = useState(null);
  const [confirmDelete, setConfirmDelete]   = useState(null);

  const defaultCommission = Number(settings.default_commission ?? 500); // × 100

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [inv, tr, dr, ve, st] = await Promise.all([
        getInvoices(), getTraders(), getDrivers(), getVehicles(), getAllSettings()
      ]);
      setInvoices(inv); setTraders(tr); setDrivers(dr); setVehicles(ve); setSettings(st);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const traderItems  = traders.map(t => ({ id: t.id, label: t.name }));
  const driverItems  = drivers.map(d => ({ id: d.id, label: d.name }));
  const vehicleItems = vehicles.map(v => ({ id: v.id, label: v.plate }));

  // ─── فتح نموذج جديد ────────────────────────────────────────────────────────
  function openNew() {
    setEditInv(null);
    setInvForm({ trader_id: null, trader_label: "", driver_id: null, driver_label: "", vehicle_id: null, vehicle_label: "", date: new Date().toISOString().slice(0,10), notes: "" });
    setItems([emptyItem()]);
    setPaidAmount("");
    setShowForm(true);
  }

  // ─── فتح تعديل فاتورة مسودة ────────────────────────────────────────────────
  async function openEdit(inv) {
    if (inv.status === "posted") return;
    const its = await getInvoiceItems(inv.id);
    setEditInv(inv);
    setInvForm({
      trader_id: inv.trader_id, trader_label: inv.trader_name ?? "",
      driver_id: inv.driver_id, driver_label: inv.driver_name ?? "",
      vehicle_id: inv.vehicle_id, vehicle_label: inv.vehicle_plate ?? "",
      date: inv.date, notes: inv.notes ?? "",
    });
    setItems(its.map(it => ({
      _key: it.id,
      id: it.id,
      product_name: it.product_name,
      grossWeight: fromInt(it.gross_weight),
      basketCount: it.basket_count,
      basketWeightEach: fromInt(it.basket_weight_each),
      price: fromInt(it.price),
      commissionRate: fromInt(it.commission_rate),
      porterage: fromInt(it.porterage),
      manualFinal: null,
      computed: {
        display: {
          netWeight: fromInt(it.net_weight),
          amountBefore: fromInt(it.amount_before),
          commissionValue: fromInt(it.commission_value),
          amountAfterComm: fromInt(it.amount_after_comm),
          finalAmount: fromInt(it.final_amount),
        }
      },
    })));
    setPaidAmount(fromInt(inv.paid_amount));
    setShowForm(true);
  }

  // ─── حفظ الفاتورة ──────────────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      // Find-or-Create للتاجر/السائق/المركبة
      let trader_id  = invForm.trader_id;
      let driver_id  = invForm.driver_id;
      let vehicle_id = invForm.vehicle_id;

      if (!trader_id && invForm.trader_label)   trader_id  = await findOrCreateTrader(invForm.trader_label);
      if (!driver_id && invForm.driver_label)   driver_id  = await findOrCreateDriver(invForm.driver_label);
      if (!vehicle_id && invForm.vehicle_label) vehicle_id = await findOrCreateVehicle(invForm.vehicle_label);

      // إنشاء أو تحديث الفاتورة
      let invoiceId = editInv?.id;
      if (!invoiceId) {
        invoiceId = await createInvoice({ trader_id, driver_id, vehicle_id, date: invForm.date, notes: invForm.notes || null });
      }

      // حفظ البنود
      const savedItems = [];
      for (const item of items) {
        if (!item.product_name.trim()) continue;
        const comm = item.commissionRate !== "" ? item.commissionRate : (defaultCommission / 100);
        const computed = computeInvoiceItem({
          grossWeight: item.grossWeight, basketCount: item.basketCount,
          basketWeightEach: item.basketWeightEach || 0.5, price: item.price,
          commissionRate: comm, porterage: item.porterage,
          manualFinal: item.manualFinal !== null && item.manualFinal !== "" ? item.manualFinal : null,
        });
        const id = await upsertInvoiceItem({ ...computed, id: item.id, invoice_id: invoiceId, product_name: item.product_name });
        savedItems.push({ ...computed, id });
      }

      // حساب الإجماليات وتحديث الفاتورة
      const totals = computeInvoiceTotals(savedItems, paidAmount);
      await updateInvoiceTotals(invoiceId, { ...totals, notes: invForm.notes || null });

      setShowForm(false);
      await load();
    } catch (e) {
      alert("خطأ في الحفظ: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── عرض التفاصيل ──────────────────────────────────────────────────────────
  async function handleView(inv) {
    const its = await getInvoiceItems(inv.id);
    setViewInv(inv);
    setViewItems(its);
  }

  // ─── طباعة ─────────────────────────────────────────────────────────────────
  function handlePrint() { window.print(); }

  // ─── ترحيل ─────────────────────────────────────────────────────────────────
  async function handlePost() {
    try { await postInvoice(confirmPost.id); setConfirmPost(null); await load(); }
    catch (e) { alert("خطأ: " + e.message); }
  }

  async function handleReverse() {
    try { await reverseInvoice(confirmReverse.id); setConfirmReverse(null); await load(); }
    catch (e) { alert("خطأ: " + e.message); }
  }

  async function handleDelete() {
    try { await deleteInvoice(confirmDelete.id); setConfirmDelete(null); await load(); }
    catch (e) { alert("خطأ: " + e.message); }
  }

  // ─── تحديث بند ─────────────────────────────────────────────────────────────
  function updateItem(key, updated) {
    setItems(prev => prev.map(it => it._key === key ? updated : it));
  }

  function removeItem(key) {
    setItems(prev => prev.filter(it => it._key !== key));
  }

  // ─── إجماليات مباشرة ────────────────────────────────────────────────────────
  const liveItems = items.filter(it => it.computed);
  const liveTotals = computeInvoiceTotals(liveItems.map(it => it.computed), paidAmount);

  // ─── أعمدة الجدول ──────────────────────────────────────────────────────────
  const columns = [
    { key: "date",         label: "التاريخ" },
    { key: "trader_name",  label: "التاجر" },
    { key: "driver_name",  label: "السائق" },
    { key: "vehicle_plate",label: "المركبة" },
    {
      key: "status", label: "الحالة",
      render: row => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${row.status === "posted" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
          {row.status === "posted" ? "مُرحّلة" : "مسودة"}
        </span>
      ),
    },
    { key: "total_final",  label: "الإجمالي",  render: row => formatMoney(row.total_final) },
    { key: "paid_amount",  label: "الواصل",    render: row => formatMoney(row.paid_amount) },
    { key: "remaining",    label: "الباقي",    render: row => <span className={row.remaining > 0 ? "text-destructive font-medium" : ""}>{formatMoney(row.remaining)}</span> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">الفواتير</h2>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة فواتير البيع وسلسلة الحساب</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus size={16} /> فاتورة جديدة
        </button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}

      {loading ? <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div> : (
        <DataTable
          columns={columns} data={invoices}
          searchKeys={["trader_name", "driver_name", "vehicle_plate", "date"]}
          emptyText="لا توجد فواتير"
          actions={row => (
            <div className="flex items-center gap-1">
              <button onClick={() => handleView(row)} title="عرض" className="p-1.5 rounded hover:bg-accent"><Eye size={15} /></button>
              {row.status === "draft" && (
                <>
                  <button onClick={() => openEdit(row)} title="تعديل" className="p-1.5 rounded hover:bg-accent"><Plus size={15} /></button>
                  <button onClick={() => setConfirmPost(row)} title="ترحيل" className="p-1.5 rounded hover:bg-accent text-green-600"><CheckCircle size={15} /></button>
                  <button onClick={() => setConfirmDelete(row)} title="حذف" className="p-1.5 rounded hover:bg-accent text-destructive"><Trash2 size={15} /></button>
                </>
              )}
              {row.status === "posted" && (
                <button onClick={() => setConfirmReverse(row)} title="عكس" className="p-1.5 rounded hover:bg-accent text-orange-500"><RotateCcw size={15} /></button>
              )}
            </div>
          )}
        />
      )}

      {/* ─── نموذج الفاتورة ─────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-6">
          <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-4xl mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-lg">{editInv ? "تعديل فاتورة" : "فاتورة جديدة"}</h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-accent"><X size={16} /></button>
            </div>

            <form onSubmit={handleSave} className="p-5 flex flex-col gap-5">
              {/* بيانات الفاتورة */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">التاجر *</label>
                  <EntityCombobox items={traderItems} value={invForm.trader_id}
                    onChange={(id, label) => setInvForm(f => ({ ...f, trader_id: id, trader_label: label }))}
                    placeholder="اختر أو اكتب..." />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">السائق</label>
                  <EntityCombobox items={driverItems} value={invForm.driver_id}
                    onChange={(id, label) => setInvForm(f => ({ ...f, driver_id: id, driver_label: label }))}
                    placeholder="اختر أو اكتب..." />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">المركبة</label>
                  <EntityCombobox items={vehicleItems} value={invForm.vehicle_id}
                    onChange={(id, label) => setInvForm(f => ({ ...f, vehicle_id: id, vehicle_label: label }))}
                    placeholder="اختر أو اكتب..." />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">التاريخ *</label>
                  <input type="date" required value={invForm.date}
                    onChange={e => setInvForm(f => ({ ...f, date: e.target.value }))}
                    className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring" />
                </div>
              </div>

              {/* البنود */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">بنود الفاتورة</h4>
                  <button type="button" onClick={() => setItems(prev => [...prev, emptyItem()])}
                    className="flex items-center gap-1 text-sm text-primary hover:underline">
                    <PlusCircle size={15} /> إضافة بند
                  </button>
                </div>
                {items.map(item => (
                  <ItemRow
                    key={item._key}
                    item={item}
                    defaultCommission={defaultCommission}
                    onChange={updated => updateItem(item._key, updated)}
                    onRemove={() => removeItem(item._key)}
                  />
                ))}
              </div>

              {/* الإجماليات */}
              <div className="rounded-md border border-border bg-muted/30 p-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">إجمالي النهائي</p>
                  <p className="font-bold text-lg">{fromInt(liveTotals.total_final).toFixed(2)}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">الواصل (المدفوع)</label>
                  <input type="number" min="0" step="0.01" value={paidAmount}
                    onChange={e => setPaidAmount(e.target.value)}
                    className="rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                    placeholder="0.00" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">الباقي (يُحوَّل للديون)</p>
                  <p className={`font-bold text-lg ${liveTotals.remaining > 0 ? "text-destructive" : ""}`}>
                    {fromInt(liveTotals.remaining).toFixed(2)}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">ملاحظات</label>
                  <input value={invForm.notes} onChange={e => setInvForm(f => ({ ...f, notes: e.target.value }))}
                    className="rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                    placeholder="ملاحظات..." />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">إلغاء</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                  {saving ? "جارٍ الحفظ..." : "حفظ الفاتورة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── عرض تفاصيل الفاتورة ────────────────────────────────────────────── */}
      {viewInv && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-6 print:bg-white print:p-0">
          <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-3xl mx-4 print:shadow-none print:border-none">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border print:hidden">
              <h3 className="font-semibold">تفاصيل الفاتورة</h3>
              <div className="flex gap-2">
                <button onClick={handlePrint} className="flex items-center gap-1 px-3 py-1.5 rounded border border-border text-sm hover:bg-accent">
                  <Printer size={14} /> طباعة
                </button>
                <button onClick={() => setViewInv(null)} className="p-1 rounded hover:bg-accent"><X size={16} /></button>
              </div>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {/* رأس الفاتورة */}
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><span className="text-muted-foreground">التاجر: </span><strong>{viewInv.trader_name ?? "—"}</strong></div>
                <div><span className="text-muted-foreground">السائق: </span><strong>{viewInv.driver_name ?? "—"}</strong></div>
                <div><span className="text-muted-foreground">المركبة: </span><strong>{viewInv.vehicle_plate ?? "—"}</strong></div>
                <div><span className="text-muted-foreground">التاريخ: </span><strong>{viewInv.date}</strong></div>
              </div>

              {/* البنود */}
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {["المادة","الوزن الكلي","السلات","صافي الوزن","السعر","قبل العمولة","العمولة","بعد العمولة","الحمالية","النهائي"].map(h => (
                        <th key={h} className="px-2 py-2 text-center text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {viewItems.map(it => (
                      <tr key={it.id} className="hover:bg-muted/20">
                        <td className="px-2 py-2 text-center">{it.product_name}</td>
                        <td className="px-2 py-2 text-center">{fromInt(it.gross_weight).toFixed(2)}</td>
                        <td className="px-2 py-2 text-center">{it.basket_count}</td>
                        <td className="px-2 py-2 text-center">{fromInt(it.net_weight).toFixed(2)}</td>
                        <td className="px-2 py-2 text-center">{fromInt(it.price).toFixed(2)}</td>
                        <td className="px-2 py-2 text-center">{fromInt(it.amount_before).toFixed(2)}</td>
                        <td className="px-2 py-2 text-center text-orange-600">{fromInt(it.commission_value).toFixed(2)}</td>
                        <td className="px-2 py-2 text-center">{fromInt(it.amount_after_comm).toFixed(2)}</td>
                        <td className="px-2 py-2 text-center">{fromInt(it.porterage).toFixed(2)}</td>
                        <td className="px-2 py-2 text-center font-semibold text-primary">{fromInt(it.final_amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* الإجماليات */}
              <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/30 p-3 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">الإجمالي النهائي</p>
                  <p className="font-bold text-base">{formatMoney(viewInv.total_final)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">الواصل</p>
                  <p className="font-bold text-base text-green-600">{formatMoney(viewInv.paid_amount)}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">الباقي</p>
                  <p className={`font-bold text-base ${viewInv.remaining > 0 ? "text-destructive" : ""}`}>{formatMoney(viewInv.remaining)}</p>
                </div>
              </div>
              {viewInv.notes && <p className="text-sm text-muted-foreground">ملاحظات: {viewInv.notes}</p>}
            </div>
          </div>
        </div>
      )}

      {/* تأكيدات */}
      <ConfirmDialog open={!!confirmPost} title="ترحيل الفاتورة"
        message="سيُضاف الباقي تلقائياً لدين التاجر. هل تريد المتابعة؟"
        confirmText="ترحيل" onConfirm={handlePost} onCancel={() => setConfirmPost(null)} />
      <ConfirmDialog open={!!confirmReverse} title="عكس الفاتورة"
        message="سيُطرح الباقي من دين التاجر وتعود الفاتورة لحالة مسودة."
        confirmText="عكس" danger onConfirm={handleReverse} onCancel={() => setConfirmReverse(null)} />
      <ConfirmDialog open={!!confirmDelete} title="حذف الفاتورة"
        message="هل تريد حذف هذه الفاتورة؟"
        confirmText="حذف" danger onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
