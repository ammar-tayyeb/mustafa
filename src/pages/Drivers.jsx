import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Pencil, Trash2, X, FileText, Printer, ArrowRight } from "lucide-react";
import { getDrivers, createDriver, updateDriver, deleteDriver, getInvoicesByDriver, getInvoiceItems, getAllSettings } from "../lib/db.js";
import { formatMoney } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const EMPTY = { name: "", phone: "", vehicle_plate: "", notes: "" };

export default function Drivers() {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [editRow, setEditRow]     = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);

  // إدارة مبيعات السائق
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [dailyGroups, setDailyGroups]       = useState({});
  const [activeDateKey, setActiveDateKey]   = useState(""); 
  const [settings, setSettings]             = useState({});
  
  const printRef = useRef();
  const marketName = settings.market_name || "مكتب نينوى"; 

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [driverRows, allSettings] = await Promise.all([getDrivers(), getAllSettings()]);
      setRows(driverRows);
      setSettings(allSettings);
    } catch (e) { setError(e?.message || "خطأ في تحميل السواق"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleViewDriverSheets = async (driver) => {
    try {
      setLoadingDetails(true);
      setSelectedDriver(driver);
      
      const invoices = await getInvoicesByDriver(driver.id);
      const groups = {};

      for (const inv of invoices) {
        const dateKey = inv.date ? inv.date.split("T")[0] : "بدون تاريخ";
        const items = await getInvoiceItems(inv.id);

        if (!groups[dateKey]) {
          groups[dateKey] = {
            date: dateKey,
            salesTotal: 0,
            paidTotal: 0,
            items: [], // ستحتوي على العناصر المدمجة
            notesSummary: []
          };
        }

        // تجميع وتحديث الدفعات والملاحظات
        groups[dateKey].paidTotal += Number(inv.paid_amount || 0);
        if (inv.notes && !groups[dateKey].notesSummary.includes(inv.notes)) {
          groups[dateKey].notesSummary.push(inv.notes);
        }

        // دمج العناصر بناءً على المادة والسعر
        for (const item of items) {
          const productName = item.product_name;
          const price = Number(item.price || 0);
          const weight = Number(item.net_weight || 0);
          const count = Number(item.basket_count || 0);
          const itemTotal = weight * price;

          // تحديث المجموع الكلي للمبيعات لليوم مباشرة
          groups[dateKey].salesTotal += itemTotal;

          // البحث عن عنصر مطابق (نفس السلعة ونفس السعر) في هذا اليوم
          const existingItem = groups[dateKey].items.find(
            it => it.product_name === productName && it.price === price
          );

          if (existingItem) {
            // إذا وُجد، ادمج القيم الرياضية التراكمية
            existingItem.weight += weight;
            existingItem.count += count;
            existingItem.itemTotal += itemTotal;
          } else {
            // إذا لم يوجد، أنشئ عنصراً جديداً (بدون trader_name)
            groups[dateKey].items.push({
              product_name: productName,
              weight,
              count,
              price,
              itemTotal
            });
          }
        }
      }

      setDailyGroups(groups);
      
      const dates = Object.keys(groups);
      if (dates.length > 0) {
        setActiveDateKey(dates[0]);
      } else {
        setActiveDateKey("");
      }

    } catch (e) {
      alert("خطأ في جلب تفاصيل السائق: " + e.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handlePrint = () => {
    if (!activeDateKey || !dailyGroups[activeDateKey]) return;
    
    const printContent = printRef.current.innerHTML;
    const originalContent = document.body.innerHTML;
    
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        @page { size: A5 landscape; margin: 5mm; }
        html, body { height: 100%; margin: 0; padding: 0; background: white; color: black; direction: rtl; font-family: 'Segoe UI', Tahoma, sans-serif; }
        
        .invoice-book-container { 
          border: 2px solid #000; padding: 12px; background: #fff; 
          box-sizing: border-box; width: 100%; max-width: 100%;
          display: flex; flex-direction: column; justify-content: space-between;
          height: 135mm; 
        }
        
        .invoice-main-content { flex-grow: 1; display: flex; flex-direction: column; }
        .flex-row-header { display: flex; justify-content: space-between; align-items: center; border-b: 2px solid #000; padding-bottom: 5px; margin-bottom: 8px; }
        .border-box-office { border: 2px solid #000; padding: 2px 6px; font-weight: bold; font-size: 11px; background: #f9f9f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .flex-row-info { display: flex; justify-content: space-between; margin-bottom: 8px; gap: 10px; }
        .info-item { flex: 1; display: flex; align-items: flex-end; font-size: 12px; }
        .dotted-line { flex: 1; border-b: 1px dotted #000; margin-right: 4px; padding-bottom: 1px; }
        
        .invoice-book-table { width: 100%; border-collapse: collapse; margin-top: 5px; flex-grow: 1; }
        .invoice-book-table th { background-color: #eaeaea !important; font-weight: bold; padding: 5px; font-size: 11px; border: 1px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .invoice-book-table td { padding: 4px; font-size: 11px; border: 1px solid #000; line-height: 1.2; }
        
        .invoice-footer-section { margin-top: auto; width: 100%; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload(); 
  };

  function openAdd() { setEditRow(null); setForm(EMPTY); setShowForm(true); }
  function openEdit(row) {
    setEditRow(row);
    setForm({ name: row.name, phone: row.phone ?? "", vehicle_plate: row.vehicle_plate ?? "", notes: row.notes ?? "" });
    setShowForm(true);
  }

  async function handleDelete() {
    try { await deleteDriver(deleteRow.id); setDeleteRow(null); await load(); }
    catch (e) { alert("خطأ: " + e.message); }
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
    finally {
      setSaving(false);
    }
  }

  const columns = [
    { key: "name",          label: "الاسم" },
    { key: "phone",         label: "الهاتف" },
    { key: "vehicle_plate", label: "السيارة / اللوحة" },
    { key: "notes",         label: "ملاحظات", sortable: false },
  ];

  const activeGroup = dailyGroups[activeDateKey];
  const minRows = 4;
  const blankRowsCount = activeGroup ? (activeGroup.items.length < minRows ? minRows - activeGroup.items.length : 0) : 0;
  const [loadingDetails, setLoadingDetails] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {!selectedDriver ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">السواق</h2>
              <p className="text-sm text-muted-foreground mt-0.5">إدارة السائقين ومتابعة الكشوفات اليومية لمبيعاتهم</p>
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
                  <button onClick={() => handleViewDriverSheets(row)} className="flex items-center gap-1 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1.5 rounded" title="عرض القوائم والمبيعات">
                    <FileText size={14} /> قوائم اليومية
                  </button>
                  <button onClick={() => openEdit(row)} className="p-1.5 rounded hover:bg-accent"><Pencil size={15} /></button>
                  <button onClick={() => setDeleteRow(row)} className="p-1.5 rounded hover:bg-accent text-destructive"><Trash2 size={15} /></button>
                </div>
              )}
            />
          )}
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between bg-muted/40 p-4 rounded-xl border border-border">
            <div className="flex items-center gap-3">
              <button onClick={() => setSelectedDriver(null)} className="p-2 hover:bg-background rounded-lg border border-border">
                <ArrowRight size={18} />
              </button>
              <div>
                <h2 className="text-lg font-bold">حسابات السائق: <span className="text-primary">{selectedDriver.name}</span></h2>
                <p className="text-xs text-muted-foreground mt-0.5">رقم المركبة: {selectedDriver.vehicle_plate || "—"}</p>
              </div>
            </div>
            {activeGroup && (
              <button onClick={handlePrint} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm">
                <Printer size={16} /> طباعة مبيعات يوم ({activeDateKey})
              </button>
            )}
          </div>

          {loadingDetails ? <div className="text-center py-12 text-muted-foreground">جارٍ تجميع الحسابات...</div> : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
              
              {/* أزرار التحكم والتبديل الجانبية بين التواريخ */}
              <div className="flex flex-col gap-1.5 bg-muted/30 p-3 rounded-xl border border-border/80 md:col-span-1">
                <span className="text-xs font-bold text-muted-foreground px-1 mb-1 block">تواريخ المبيعات المتاحة</span>
                {Object.keys(dailyGroups).length === 0 ? (
                  <div className="text-xs text-muted-foreground p-3 text-center bg-background rounded-lg border border-dashed border-border">لا توجد حركات مبيعات مسجلة لهذا السائق</div>
                ) : (
                  Object.keys(dailyGroups).map((dateKey) => (
                    <button key={dateKey} onClick={() => setActiveDateKey(dateKey)}
                      className={`w-full text-right px-3 py-2 text-xs font-semibold rounded-lg border transition-all flex items-center justify-between ${activeDateKey === dateKey ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background text-foreground border-border hover:bg-accent"}`}>
                      <span>قائمة يوم {dateKey}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${activeDateKey === dateKey ? "bg-background/20 text-white" : "bg-muted text-muted-foreground"}`}>
                        {dailyGroups[dateKey].items.length} مواد
                      </span>
                    </button>
                  ))
                )}
              </div>

              {/* عرض ومعاينة القائمة النشطة المحددة فقط */}
              <div className="md:col-span-3">
                {activeGroup ? (
                  <div ref={printRef}>
                    <div className="invoice-book-container w-full border-2 border-black p-4 bg-background shadow-sm">
                      
                      <div className="invoice-main-content">
                        <div className="flex-row-header flex justify-between items-center border-b-2 border-black pb-2 mb-2">
                          <div style={{ textAlign: 'right' }}>
                            <h2 className="text-lg font-black text-red-900" style={{ margin: 0 }}>{marketName}</h2>
                            <p style={{ margin: '2px 0 0 0', fontSize: '10px', fontWeight: 'bold', color: '#000' }}>مُجاز لبيع الفواكه والخُضر بالجملة</p>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <div className="border-box-office text-black border-2 border-black px-2 py-0.5 font-bold bg-gray-50 text-xs">رقم المكتب ( ٣٥ )</div>
                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#000' }}>المركبة: {selectedDriver.vehicle_plate || "—"}</div>
                          </div>
                        </div>

                        <div className="flex-row-info flex justify-between mb-2 text-black text-xs">
                          <div className="info-item flex-1 flex items-end">
                            <span className="font-bold whitespace-nowrap">السائق :</span>
                            <span className="dotted-line border-b border-dotted border-black flex-1 mr-1">{selectedDriver.name}</span>
                          </div>
                          <div className="info-item flex-1 flex items-end">
                            <span className="font-bold whitespace-nowrap">التاريخ :</span>
                            <span className="dotted-line border-b border-dotted border-black flex-1 mr-1 font-mono">{activeGroup.date}</span>
                          </div>
                        </div>

                        {/* 🛑 تم تعديل الهيدر وحذف عمود التاجر هنا */}
                        <table className="invoice-book-table w-full border-collapse border border-black">
                          <thead>
                            <tr className="bg-gray-100 border-b border-black text-xs font-bold text-black">
                              <th style={{ width: "6%", border: "1px solid black" }}>ت</th>
                              <th style={{ width: "34%", border: "1px solid black" }}>المادة</th>
                              <th style={{ width: "12%", border: "1px solid black" }}>العدد الكلي</th>
                              <th style={{ width: "16%", border: "1px solid black" }}>الوزن الإجمالي</th>
                              <th style={{ width: "16%", border: "1px solid black" }}>السعر</th>
                              <th style={{ width: "16%", border: "1px solid black" }}>المبلغ الصافي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeGroup.items.map((it, idx) => (
                              <tr key={idx} className="border-b border-black text-center text-xs font-medium text-black">
                                <td style={{ border: "1px solid black" }}>{idx + 1}</td>
                                <td style={{ border: "1px solid black", fontWeight: '700' }}>{it.product_name}</td>
                                <td style={{ border: "1px solid black" }} className="font-mono">{it.count.toLocaleString("en-US")}</td>
                                <td style={{ border: "1px solid black" }} className="font-mono">{it.weight.toLocaleString("en-US")}</td>
                                <td style={{ border: "1px solid black" }} className="font-mono">{it.price.toLocaleString("en-US")}</td>
                                <td style={{ border: "1px solid black" }} className="font-bold font-mono">{it.itemTotal.toLocaleString("en-US")}</td>
                              </tr>
                            ))}

                            {blankRowsCount > 0 && 
                              Array.from({ length: blankRowsCount }).map((_, index) => {
                                const rowNum = activeGroup.items.length + index + 1;
                                return (
                                  <tr key={`empty-${rowNum}`} className="border-b border-black text-center">
                                    <td style={{ border: "1px solid black", padding: '4px' }} className="text-gray-400 text-[10px]">{rowNum}</td>
                                    <td style={{ border: "1px solid black" }}></td>
                                    <td style={{ border: "1px solid black" }}></td>
                                    <td style={{ border: "1px solid black" }}></td>
                                    <td style={{ border: "1px solid black" }}></td>
                                    <td style={{ border: "1px solid black" }}></td>
                                  </tr>
                                );
                              })
                            }
                          </tbody>
                        </table>
                      </div>

                      <div className="invoice-footer-section">
                        <div className="flex justify-between items-start mt-3 text-black text-xs">
                          <div className="flex flex-col gap-0.5 border border-black p-1.5 bg-gray-50 min-w-[220px]">
                            <div className="flex justify-between">
                              <span>الحساب الإجمالي:</span>
                              <span className="font-bold">{formatMoney(activeGroup.salesTotal)}</span>
                            </div>
                          </div>

                          <div className="signatures flex-1 flex justify-around pt-4 text-[10px] font-bold">
                            <div>توقيع مستلم القوائم</div>
                            <div>توقيع الحسابات</div>
                          </div>
                        </div>

                        <div className="mt-2 text-[9px] text-gray-600 border-t border-dashed border-black pt-1">
                          <span>ملاحظات: {activeGroup.notesSummary.join(" | ") || "لا يوجد ملاحظات إضافية."}</span>
                        </div>
                      </div>

                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-muted-foreground bg-muted/10 border border-dashed border-border rounded-xl">قم باختيار تاريخ القائمة المراد عرضها أو طباعتها من اللوحة الجانبية</div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* مودال النماذج */}
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
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" placeholder="اسم السائق" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">الهاتف</label>
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" placeholder="رقم الهاتف" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">السيارة / اللوحة</label>
                <input value={form.vehicle_plate} onChange={e => setForm(f => ({ ...f, vehicle_plate: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none" placeholder="رقم اللوحة" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">ملاحظات</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none resize-none" />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent">إلغاء</button>
                <button type="submit" disabled={saving} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
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