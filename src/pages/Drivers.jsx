import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Pencil, Trash2, X, FileText, Printer, ArrowRight } from "lucide-react";
import { getDrivers, createDriver, updateDriver, deleteDriver, getInvoicesByDriver, getInvoiceItems, getAllSettings } from "../lib/db.js";
import { formatMoney } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const EMPTY = { name: "", phone: "", vehicle_plate: "", notes: "" };

// ─── حساب مقاسات الطباعة الديناميكية بناءً على عدد الصفوف ─────────────────
// الفكرة: مساحة الصفحة (A5 landscape) ثابتة. نحسب المساحة المتاحة لجسم
// الجدول (بعد طرح الهيدر + معلومات السائق + صف عناوين الجدول + الفوتر)
// ثم نقسمها على عدد الصفوف الفعلي. كل ما زاد عدد الصفوف، صغر حجم كل صف.
// هذا يضمن عدم فيضان المحتوى لصفحة ثانية بغض النظر عن عدد المواد.
function getDynamicPrintMetrics(rowCount) {
  const effectiveRows = Math.max(rowCount, 4);

  // مساحة تقريبية بالميلي متر متاحة لجسم الجدول داخل صفحة A5 landscape
  // (بعد طرح الهيدر وصندوق المجموع والتوقيعات) — عدّلها إذا لاحظت
  // فيضان بسيط بعد أول تجربة طباعة فعلية على طابعتك.
  const TABLE_BODY_AVAILABLE_MM = 78;
  const perRowMM = TABLE_BODY_AVAILABLE_MM / effectiveRows;

  // تحويل تقريبي من مم إلى حجم خط/حشوة مناسبين، مع حدود دنيا/عليا
  // تحافظ على وضوح القراءة حتى مع عدد صفوف كبير
  const fontSize   = Math.max(6.5, Math.min(11, perRowMM * 1.3));
  const cellPadY   = Math.max(1,   Math.min(6, perRowMM * 0.6));
  const cellPadX   = Math.max(2,   Math.min(6, perRowMM * 0.5));

  return { fontSize, cellPadY, cellPadX };
}

export default function Drivers() {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [editRow, setEditRow]     = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

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
            items: [],
            notesSummary: []
          };
        }

        groups[dateKey].paidTotal += Number(inv.paid_amount || 0);
        if (inv.notes && !groups[dateKey].notesSummary.includes(inv.notes)) {
          groups[dateKey].notesSummary.push(inv.notes);
        }

        for (const item of items) {
          const productName = item.product_name;
          const price = Number(item.price || 0);
          const weight = Number(item.net_weight || 0);
          const count = Number(item.basket_count || 0);
          const itemTotal = weight * price;

          groups[dateKey].salesTotal += itemTotal;

          const existingItem = groups[dateKey].items.find(
            it => it.product_name === productName && it.price === price
          );

          if (existingItem) {
            existingItem.weight += weight;
            existingItem.count += count;
            existingItem.itemTotal += itemTotal;
          } else {
            groups[dateKey].items.push({ product_name: productName, weight, count, price, itemTotal });
          }
        }
      }

      setDailyGroups(groups);
      
      const dates = Object.keys(groups);
      setActiveDateKey(dates.length > 0 ? dates[0] : "");

    } catch (e) {
      alert("خطأ في جلب تفاصيل السائق: " + e.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  // ─── ستايل الطباعة الموحّد (مطابق لصفحتي Invoices و TradersDebts) ──────
  const getPrintStyles = () => `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
    body {
      margin: 0;
      padding: 0;
      direction: rtl;
      background-color: #fff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: A5 landscape;
      margin: 0.4cm;
    }
    .invoice-book-container {
      border: 2px solid #000 !important;
      padding: 12px;
      background-color: #fff !important;
      font-family: 'Cairo', sans-serif;
      box-sizing: border-box;
      width: 100%;
      height: 128mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .flex-row-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
    }
    .flex-row-info {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
      border-bottom: 1px solid #000;
      padding-bottom: 6px;
      font-size: 12px;
    }
    .info-item {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 48%;
    }
    .dotted-line {
      border-bottom: 1px dotted #000;
      flex-grow: 1;
      padding-bottom: 2px;
      font-weight: bold;
      font-size: 13px;
    }
    .invoice-book-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .invoice-book-table th {
      background-color: #7f1d1d !important;
      color: #ffffff !important;
      border: 1px solid #000 !important;
      font-weight: bold;
      text-align: center;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .invoice-book-table td {
      border: 1px solid #000 !important;
      text-align: center;
      color: #000 !important;
    }
    .footer-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      font-size: 12px;
      font-weight: bold;
      margin-top: 10px;
    }
    .signatures {
      display: flex;
      justify-content: space-around;
      width: 60%;
    }
    .border-box-office { border: 1px solid #000; padding: 2px 8px; font-weight: bold; font-size: 12px; border-radius: 3px; }
    .no-print { display: none !important; }
  `;

  const executePrint = (htmlContent) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0;";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <html>
        <head>
          <title>طباعة كشف السائق</title>
          <style>${getPrintStyles()}</style>
        </head>
        <body>${htmlContent}</body>
      </html>
    `);
    doc.close();

    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      document.body.removeChild(iframe);
    }, 350);
  };

  const handlePrint = () => {
    if (!activeGroup || !printRef.current) return;
    executePrint(printRef.current.innerHTML);
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
    finally { setSaving(false); }
  }

  const columns = [
    { key: "name",          label: "الاسم" },
    { key: "phone",         label: "الهاتف" },
    { key: "vehicle_plate", label: "السيارة / اللوحة" },
    { key: "notes",         label: "ملاحظات", sortable: false },
  ];

  const activeGroup = dailyGroups[activeDateKey];
  const minRows = 4;
  const blankRowsCount = activeGroup && activeGroup.items.length < minRows ? minRows - activeGroup.items.length : 0;

  // مقاسات الطباعة الديناميكية بناءً على عدد بنود اليوم النشط
  const printMetrics = useMemo(
    () => getDynamicPrintMetrics(activeGroup ? Math.max(activeGroup.items.length, minRows) : minRows),
    [activeGroup]
  );

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

              <div className="md:col-span-3">
                {activeGroup ? (
                  <div ref={printRef}>
                    <div className="invoice-book-container">
                      <div>
                        <div className="flex-row-header">
                          <div style={{ textAlign: 'right' }}>
                            <h2 className="text-lg font-black text-red-900" style={{ margin: 0 }}>{marketName}</h2>
                            <p style={{ margin: '2px 0 0 0', fontSize: '10px', fontWeight: 'bold', color: '#000' }}>مُجاز لبيع الفواكه والخُضر بالجملة</p>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <div className="border-box-office" style={{ color: '#000' }}>رقم المكتب ( ٣٥ )</div>
                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#000' }}>المركبة: {selectedDriver.vehicle_plate || "—"}</div>
                          </div>
                        </div>

                        <div className="flex-row-info" style={{ color: '#000' }}>
                          <div className="info-item">
                            <span className="font-bold">السائق :</span>
                            <span className="dotted-line">{selectedDriver.name}</span>
                          </div>
                          <div className="info-item">
                            <span className="font-bold">التاريخ :</span>
                            <span className="dotted-line" style={{ fontFamily: 'monospace' }}>{activeGroup.date}</span>
                          </div>
                        </div>

                        <table className="invoice-book-table" style={{ fontSize: `${printMetrics.fontSize}px` }}>
                          <thead>
                            <tr>
                              <th style={{ width: "6%", padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}>ت</th>
                              <th style={{ width: "34%", padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}>المادة</th>
                              <th style={{ width: "12%", padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}>العدد الكلي</th>
                              <th style={{ width: "16%", padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}>الوزن الإجمالي</th>
                              <th style={{ width: "16%", padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}>السعر</th>
                              <th style={{ width: "16%", padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}>المبلغ الصافي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeGroup.items.map((it, idx) => (
                              <tr key={idx}>
                                <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}>{idx + 1}</td>
                                <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px`, fontWeight: '700' }}>{it.product_name}</td>
                                <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }} className="font-mono">{it.count.toLocaleString("en-US")}</td>
                                <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }} className="font-mono">{it.weight.toLocaleString("en-US")}</td>
                                <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }} className="font-mono">{it.price.toLocaleString("en-US")}</td>
                                <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px`, fontWeight: '700' }} className="font-mono">{it.itemTotal.toLocaleString("en-US")}</td>
                              </tr>
                            ))}

                            {blankRowsCount > 0 && 
                              Array.from({ length: blankRowsCount }).map((_, index) => {
                                const rowNum = activeGroup.items.length + index + 1;
                                return (
                                  <tr key={`empty-${rowNum}`}>
                                    <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }} className="text-gray-400">{rowNum}</td>
                                    <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}></td>
                                    <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}></td>
                                    <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}></td>
                                    <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}></td>
                                    <td style={{ padding: `${printMetrics.cellPadY}px ${printMetrics.cellPadX}px` }}></td>
                                  </tr>
                                );
                              })
                            }
                          </tbody>
                        </table>
                      </div>

                      <div>
                        <div className="footer-row" style={{ justifyContent: 'space-between', color: '#000' }}>
                          <div style={{ border: '1px solid #000', padding: '4px 8px', background: '#f9fafb', fontSize: '11px', minWidth: '200px' }}>
                            <span>الحساب الإجمالي: </span>
                            <span className="font-bold">{formatMoney(activeGroup.salesTotal)}</span>
                          </div>
                          <div className="signatures" style={{ fontSize: '10px' }}>
                            <div>توقيع مستلم القوائم</div>
                            <div>توقيع الحسابات</div>
                          </div>
                        </div>
                        <div style={{ marginTop: '6px', fontSize: '9px', color: '#4b5563', borderTop: '1px dashed #000', paddingTop: '4px' }}>
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