import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Printer, ArrowRight, CheckCircle2, Circle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  getDrivers, createDriver, updateDriver, deleteDriver,
  getDriverSheetItems, openDriverSheet, closeDriverSheet,
  toggleDriverPaid, getAllSettings,
} from "../lib/db.js";
import { formatMoney, fromInt } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const EMPTY = { name: "", phone: "", vehicle_plate: "", notes: "" };

// دالة مساعدة لدمج البنود المتشابهة في (المادة + السعر) وترتيبها من الأعلى سعراً للأقل
function processSheetItems(items) {
  if (!items || items.length === 0) return [];

  const mergedMap = new Map();

  for (const item of items) {
    // مفتاح الدمج الفريد: اسم المنتج + السعر
    const key = `${item.product_name}_${item.price}`;

    if (mergedMap.has(key)) {
      const existing = mergedMap.get(key);
      existing.basket_count += (item.basket_count || 0);
      existing.net_weight += (item.net_weight || 0);
      existing.final_amount += (item.final_amount || 0);
    } else {
      mergedMap.set(key, {
        ...item,
        basket_count: item.basket_count || 0,
        net_weight: item.net_weight || 0,
        final_amount: item.final_amount || 0,
      });
    }
  }

  // تحويل الخريطة إلى مصفوفة ثم الترتيب تنازلياً حسب السعر (من الأعلى إلى الأقل)
  return Array.from(mergedMap.values()).sort((a, b) => b.price - a.price);
}

// function getDynamicPrintMetrics(rowCount) {
//   const effectiveRows = Math.max(rowCount, 4);
//   const TABLE_BODY_AVAILABLE_MM = 78;
//   const perRowMM = TABLE_BODY_AVAILABLE_MM / effectiveRows;
//   return {
//     fontSize: Math.max(6.5, Math.min(11, perRowMM * 1.3)),
//     cellPadY: Math.max(1, Math.min(6, perRowMM * 0.6)),
//     cellPadX: Math.max(2, Math.min(6, perRowMM * 0.5)),
//   };
// }

export default function Drivers() {
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [editRow, setEditRow]       = useState(null);
  const [form, setForm]             = useState(EMPTY);
  const [saving, setSaving]         = useState(false);
  const [deleteRow, setDeleteRow]   = useState(null);
  const [settings, setSettings]     = useState({});

  // السائق المختار لعرض قائمته
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [sheetItems, setSheetItems]         = useState([]);
  const [loadingSheet, setLoadingSheet]     = useState(false);

  // قائمة السائقين المنبسطة (expanded) في الجدول الرئيسي
  const [expandedId, setExpandedId] = useState(null);
  const [expandedItems, setExpandedItems] = useState([]);
  const [loadingExpand, setLoadingExpand] = useState(false);

  const printRef  = useRef();
  const marketName = settings.market_name || "مكتب نينوى";

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [driverRows, allSettings] = await Promise.all([getDrivers(), getAllSettings()]);
      setRows(driverRows); setSettings(allSettings);
    } catch (e) { setError(e?.message || "خطأ في تحميل السواق"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── فتح/إغلاق تفاصيل قائمة سائق في الجدول الرئيسي (يدعم المفتوح والمغلق للمعاينة) ───
  async function toggleExpand(driver) {
    if (expandedId === driver.id) { setExpandedId(null); setExpandedItems([]); return; }
    setLoadingExpand(true);
    setExpandedId(driver.id);
    try {
      const items = await getDriverSheetItems(driver.id);
      setExpandedItems(processSheetItems(items)); // دمج وفرز البنود تلقائياً
    } catch (e) { alert("خطأ: " + e.message); }
    finally { setLoadingExpand(false); }
  }

  // ─── فتح صفحة القائمة الكاملة للطباعة والمعاينة ────────────────────────────────────
  async function openSheetView(driver) {
    setLoadingSheet(true);
    setSelectedDriver(driver);
    try {
      const items = await getDriverSheetItems(driver.id);
      setSheetItems(processSheetItems(items)); // دمج وفرز البنود تلقائياً
    } catch (e) { alert("خطأ: " + e.message); }
    finally { setLoadingSheet(false); }
  }

  // ─── إغلاق القائمة ────────────────────────────────────────────────────────
  async function handleCloseSheet(driverId) {
    if (!window.confirm("إغلاق القائمة؟ سيختفي السائق من خيارات المبيعات حتى إضافته مجدداً.")) return;
    try {
      await closeDriverSheet(driverId);
      await load();
      if (selectedDriver?.id === driverId) { setSelectedDriver(null); setSheetItems([]); }
      if (expandedId === driverId) { setExpandedId(null); setExpandedItems([]); }
    } catch (e) { alert("خطأ: " + e.message); }
  }

  // ─── تبديل الواصل ─────────────────────────────────────────────────────────
  async function handleTogglePaid(driver) {
    try {
      await toggleDriverPaid(driver.id, driver.is_paid ? 0 : 1);
      await load();
      if (selectedDriver?.id === driver.id) {
        setSelectedDriver(prev => ({ ...prev, is_paid: prev.is_paid ? 0 : 1 }));
      }
    } catch (e) { alert("خطأ: " + e.message); }
  }

  // ─── إعادة فتح قائمة مغلقة ────────────────────────────────────────────────
  async function handleReopenSheet(driverId) {
    try { await openDriverSheet(driverId); await load(); }
    catch (e) { alert("خطأ: " + e.message); }
  }

 
const getPrintStyles = () => `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght=400;700;900&display=swap');
    body { margin:0; padding:0; direction:rtl; background:#fff; font-family:'Cairo', sans-serif; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
    @page { size: A4 portrait; margin: 0.5cm; }
    
    .alwa-container { width: 100%; box-sizing: border-box; background: #fff; direction: rtl; padding: 16px; border: 2px solid #000; border-radius: 16px; }
    
    /* هيدر ممركز بالكامل بدون أطراف الفواكه */
    .alwa-header { border: 2px solid #000; border-radius: 24px; padding: 16px; margin-bottom: 12px; text-align: center; display: flex; justify-content: center; align-items: center; }
    .alwa-header-center { width: 100%; text-align: center; }
    .alwa-title { font-size: 32px; font-weight: 900; color: #1A3B8B; margin: 0; padding: 0; line-height: 1.2; }
    .alwa-subtitle { font-size: 16px; font-weight: 700; color: #C82333; margin: 4px 0 8px 0; }
    .alwa-badge { background: #1E7E34; color: #fff; font-size: 12px; font-weight: bold; padding: 4px 16px; border-radius: 9999px; display: inline-block; border: 1px solid #16a34a; }
    
    .alwa-meta-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-bottom: 8px; padding: 0 4px; color: #1f2937; }
    .alwa-line-input { border-bottom: 2px dotted #94a3b8; flex-grow: 1; margin: 0 8px; color: #1A3B8B; font-size: 16px; padding-bottom: 2px; }
    
    /* الشبكة المغلقة بالكامل */
    .alwa-table { width: 100%; border-collapse: collapse; border: 1px solid #3B82F6; margin-top: 8px; border-radius: 8px;  }
    .alwa-table th { border: 1px solid #3B82F6!important; padding: 8px 4px; background: #f8fafc; text-align: center; font-weight: bold; }
    .alwa-table td { border: 1px solid #3B82F6!important; height: 38px; text-align: center; font-size: 14px; color: #000; font-weight: bold; border-radius: 8px; }
    
    .pill-green { border: 1px solid #16a34a; color: #16a34a; background: #f0fdf4; border-radius: 9999px; padding: 2px 16px; font-size: 12px; font-weight: bold; display: inline-block; }
    .pill-orange { border: 1px solid #ea580c; color: #ea580c; background: #fff7ed; border-radius: 9999px; padding: 2px 16px; font-size: 12px; font-weight: bold; display: inline-block; }
    .pill-blue { border: 1px solid #2563eb; color: #2563eb; background: #eff6ff; border-radius: 9999px; padding: 2px 16px; font-size: 12px; font-weight: bold; display: inline-block; }
    .pill-red { border: 1px solid #dc2626; color: #dc2626; background: #fef2f2; border-radius: 9999px; padding: 2px 16px; font-size: 12px; font-weight: bold; display: inline-block; }
    
    .alwa-total-box { display: flex; align-items: center; border: 2px solid #000; border-radius: 9999px; overflow: hidden; margin-top: 16px; width: fit-content; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
    .alwa-total-label { background: #f1f5f9; padding: 6px 20px; font-weight: bold; border-left: 2px solid #000; font-size: 15px; }
    .alwa-total-value { padding: 6px 32px; font-weight: 900; color: #1E7E34; font-size: 18px; font-family: monospace; }
    
    .alwa-footer { display: flex; justify-content: space-between; margin-top: 40px; font-size: 13px; font-weight: bold; padding: 0 8px; }
    .text-red-msg { color: #C82333; }
  `;
  const executePrint = (htmlContent) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<html><head><title>طباعة كشف السائق</title><style>${getPrintStyles()}</style></head><body>${htmlContent}</body></html>`);
    doc.close();
    iframe.contentWindow.focus();
    setTimeout(() => { iframe.contentWindow.print(); document.body.removeChild(iframe); }, 350);
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    executePrint(printRef.current.innerHTML);
  };

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

  function openAdd()   { setEditRow(null); setForm(EMPTY); setShowForm(true); }
  function openEdit(row) { setEditRow(row); setForm({ name: row.name, phone: row.phone ?? "", vehicle_plate: row.vehicle_plate ?? "", notes: row.notes ?? "" }); setShowForm(true); }

  // const printMetrics = useMemo(
  //   () => getDynamicPrintMetrics(Math.max(sheetItems.length, 4)),
  //   [sheetItems.length]
  // );

  const sheetTotal = sheetItems.reduce((s, it) => s + fromInt(it.final_amount), 0);

  
  if (selectedDriver) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between bg-muted/40 p-4 rounded-xl border border-border">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedDriver(null); setSheetItems([]); }} className="p-2 hover:bg-background rounded-lg border border-border">
              <ArrowRight size={18} />
            </button>
            <div>
              <h2 className="text-lg font-bold">
                قائمة السائق: <span className="text-primary">{selectedDriver.name}</span>
                {selectedDriver.sheet_status === 'closed' && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded mr-2">(معاينة قائمة مغلقة)</span>}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">رقم المركبة: {selectedDriver.vehicle_plate || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedDriver.sheet_status === 'open' ? (
              <>
                <button
                  onClick={() => handleTogglePaid(selectedDriver)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${selectedDriver.is_paid ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100" : "bg-background text-muted-foreground border-border hover:bg-accent"}`}>
                  {selectedDriver.is_paid ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                  {selectedDriver.is_paid ? "واصل ✓" : "غير واصل"}
                </button>
                <button onClick={() => handleCloseSheet(selectedDriver.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors">
                  <XCircle size={15} /> إغلاق القائمة
                </button>
              </>
            ) : (
              <span className="text-xs font-bold bg-gray-100 text-gray-600 border border-gray-300 px-3 py-2 rounded-lg">
                تم تسوية وإغلاق الكشف لحسابات السائق
              </span>
            )}
            {sheetItems.length > 0 && (
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors">
                <Printer size={15} /> طباعة الكشف
              </button>
            )}
          </div>
        </div>

        {loadingSheet ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ تحميل القائمة...</div>
        ) : sheetItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground bg-muted/10 border border-dashed border-border rounded-xl text-sm">
            لا توجد بنود في هذه القائمة
          </div>
        ) : (
          <div>
            {/* حقن الستايل لعرض المعاينة داخل المتصفح بشكل مطابق تماماً للورقة المطبوعة */}
            <style>{getPrintStyles()}</style>
            
            <div ref={printRef} className="bg-white p-6 rounded-xl border shadow-sm max-w-[21cm] mx-auto overflow-hidden">
              <div className="alwa-container">
                
                {/* الإطار العلوي الدائري للترويسة */}
                <div className="alwa-header">
                  <div className="alwa-header-center">
                    <h1 className="alwa-title">{marketName}</h1>
                    <h2 className="alwa-subtitle">لبيع الفواكه والخضر بالجملة والمفرد</h2>
                    <div className="alwa-badge">
                      موصل / سوق المعاش الأيمن رقم (٣٥) بإدارة : أبو مصطفى
                    </div>
                  </div>
                  <div className="alwa-header-left"></div>
                </div>

                {/* تفاصيل الرقم والتاريخ */}
                <div className="alwa-meta-row">
                    <span>التاريخ: </span>
                    <span style={{ fontFamily: 'monospace' }}>
                      {selectedDriver.sheet_opened_at ? new Date(selectedDriver.sheet_opened_at).toLocaleDateString("ar-IQ") : "    /    / ٢٠٢"}
                    </span>
                  </div>
                </div>

                {/* اسم السائق على سطر منقط ورقي */}
                <div className="alwa-meta-row" style={{ alignItems: 'center', marginBottom: '16px' }}>
                  <span style={{ whiteSpace: 'nowrap' }}>حضرة السيد :</span>
                  <span className="alwa-line-input font-bold text-lg px-2">
                    {selectedDriver.name}
                  </span>
                  <span style={{ whiteSpace: 'nowrap' }}>المحترم</span>
                </div>

                {/* جدول البيانات الرئيسي بالخطوط الزرقاء والكبسولات الملونة */}
                <table className="alwa-table">
                  <thead>
                    <tr>
                      <th style={{ width: '7%' }}><span className="pill-blue">ت</span></th>
                      <th style={{ width: '43%' }}><span className="pill-green">المادة</span></th>
                      <th style={{ width: '12%' }}><span className="pill-orange">العدد</span></th>
                      <th style={{ width: '13%' }}><span className="pill-red">الوزن</span></th>
                      <th style={{ width: '12%' }}><span className="pill-blue">السعر</span></th>
                      <th style={{ width: '13%' }}><span className="pill-green">المبلغ</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* عرض السطور المحملة بالبضائع الفاتورة الحية */}
                    {sheetItems.map((it, idx) => (
                      <tr key={`${it.product_name}_${it.price}`}>
                        <td style={{ fontWeight: 'bold', color: '#4b5563' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 'bold', textPadding: '0 8px', textAlign: 'right', paddingRight: '16px' }}>{it.product_name}</td>
                        <td style={{ fontFamily: 'monospace' }}>{it.basket_count || '—'}</td>
                        <td style={{ fontFamily: 'monospace' }}>{fromInt(it.net_weight).toLocaleString("en-US")}</td>
                        <td style={{ fontFamily: 'monospace' }}>{fromInt(it.price).toLocaleString("en-US")}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#1E7E34' }}>{fromInt(it.final_amount).toLocaleString("en-US")}</td>
                      </tr>
                    ))}
                    
                    {/* توليد صفوف فارغة مكملة للعدد 15 صفاً للحفاظ على مظهر الدفتر الورقي الثابت */}
                    {Array.from({ length: Math.max(0, 15 - sheetItems.length) }).map((_, i) => (
                      <tr key={`empty-${i}`}>
                        <td style={{ color: '#cbd5e1' }}>{sheetItems.length + i + 1}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* شريط المجموع الإجمالي السفلي */}
                <div className="alwa-total-box">
                  <div className="alwa-total-label">المجموع</div>
                  <div className="alwa-total-value">
                    {sheetTotal.toLocaleString("en-US")}
                  </div>
                </div>

                {/* التذييل والملاحظات القانونية أسفل الدفتر */}
                <div className="alwa-footer">
                  <div className="text-red-msg" style={{ paddingLeft: '32px' }}>التوقيع</div>
                </div>

              </div>
            </div>
          
        )}
      </div>
    );
  }

  // ─── الصفحة الرئيسية: قائمة السواق ──────────────────────────────────────
  const columns = [
    { key: "name",          label: "الاسم" },
    { key: "vehicle_plate", label: "المركبة / اللوحة" },
    { key: "sheet_status",  label: "حالة القائمة",
      render: row => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${row.sheet_status === 'open' ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${row.sheet_status === 'open' ? "bg-emerald-500" : "bg-gray-400"}`} />
          {row.sheet_status === 'open' ? "مفتوحة" : "مغلقة"}
        </span>
      ),
    },
    { key: "is_paid", label: "الواصل",
      render: row => row.sheet_status === 'open' ? (
        <span className={`text-[10px] font-semibold ${row.is_paid ? "text-emerald-600" : "text-gray-400"}`}>
          {row.is_paid ? "واصل ✓" : "غير واصل"}
        </span>
      ) : <span className="text-[10px] text-gray-300">—</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">السواق</h2>
          <p className="text-sm text-muted-foreground mt-0.5">إدارة السائقين وقوائمهم المفتوحة والمغلقة</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90">
          <Plus size={16} /> إضافة سائق
        </button>
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
      ) : (
        <div className="flex flex-col gap-0">
          <DataTable
            columns={columns}
            data={rows}
            searchKeys={["name", "phone", "vehicle_plate"]}
            emptyText="لا يوجد سائقون مسجّلون"
            actions={row => (
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {/* زر عرض/طي القائمة متاح دائماً الآن للمفتوحة والمغلقة */}
                <button
                  onClick={() => toggleExpand(row)}
                  className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border transition-colors ${expandedId === row.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-foreground border-border hover:bg-accent"}`}>
                  {expandedId === row.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {row.sheet_status === 'open' ? "القائمة الحالية" : "معاينة السجل"}
                </button>

                {row.sheet_status === 'open' ? (
                  <>
                    <button onClick={() => handleTogglePaid(row)}
                      className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border transition-colors ${row.is_paid ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" : "bg-background text-muted-foreground border-border hover:bg-accent"}`}>
                      {row.is_paid ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                      {row.is_paid ? "واصل" : "واصل؟"}
                    </button>
                    <button onClick={() => openSheetView(row)}
                      className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-colors">
                      <Printer size={12} /> طباعة
                    </button>
                    <button onClick={() => handleCloseSheet(row.id)}
                      className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border bg-red-50 text-red-700 border-red-200 hover:bg-red-100 transition-colors">
                      <XCircle size={12} /> إغلاق
                    </button>
                  </>
                ) : (
                  <>
                    {/* زر المعاينة والطباعة للقوائم المغلقة */}
                    <button onClick={() => openSheetView(row)}
                      className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border bg-gray-150 text-gray-700 border-gray-300 hover:bg-gray-200 transition-colors">
                      <Printer size={12} /> معاينة وطباعة
                    </button>
                    <button onClick={() => handleReopenSheet(row.id)}
                      className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-colors">
                      + قائمة جديدة
                    </button>
                  </>
                )}

                <button onClick={() => openEdit(row)} className="p-1.5 rounded hover:bg-accent"><Pencil size={14} /></button>
                <button onClick={() => setDeleteRow(row)} className="p-1.5 rounded hover:bg-accent text-destructive"><Trash2 size={14} /></button>
              </div>
            )}
          />

          {/* ─── صف التفاصيل المنبسط للمعاينة ─────────────────────────────────── */}
          {expandedId && (
            <div className="border border-t-0 border-border rounded-b-xl bg-muted/20 p-3 mx-0.5">
              {(() => {
                const driver = rows.find(r => r.id === expandedId);
                if (!driver) return null;

                if (loadingExpand) return <p className="text-xs text-muted-foreground text-center py-3">جارٍ التحميل...</p>;

                if (expandedItems.length === 0) return <p className="text-xs text-muted-foreground text-center py-3">لا توجد بنود مسجلة في هذه القائمة</p>;

                const total = expandedItems.reduce((s, it) => s + fromInt(it.final_amount), 0);

                return (
                  <div className="overflow-x-auto">
                    {driver.sheet_status === 'closed' && (
                      <div className="bg-amber-50 text-amber-800 text-[11px] p-2 rounded-md mb-2 border border-amber-200 text-center font-semibold">
                        هذه القائمة مغلقة حالياً (معاينة الأرشيف التاريخي)
                      </div>
                    )}
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-muted">
                          <th className="border border-border px-2 py-1 text-center font-semibold">#</th>
                          <th className="border border-border px-2 py-1 text-center font-semibold">المادة</th>
                          <th className="border border-border px-2 py-1 text-center font-semibold">العدد</th>
                          <th className="border border-border px-2 py-1 text-center font-semibold">الوزن</th>
                          <th className="border border-border px-2 py-1 text-center font-semibold">السعر</th>
                          <th className="border border-border px-2 py-1 text-center font-semibold">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expandedItems.map((it, idx) => (
                          <tr key={`${it.product_name}_${it.price}`} className="hover:bg-muted/50">
                            <td className="border border-border px-2 py-1 text-center text-muted-foreground">{idx + 1}</td>
                            <td className="border border-border px-2 py-1 text-center font-bold">{it.product_name}</td>
                            <td className="border border-border px-2 py-1 text-center font-mono">{it.basket_count}</td>
                            <td className="border border-border px-2 py-1 text-center font-mono">{fromInt(it.net_weight).toLocaleString("en-US")}</td>
                            <td className="border border-border px-2 py-1 text-center font-mono">{fromInt(it.price).toLocaleString("en-US")}</td>
                            <td className="border border-border px-2 py-1 text-center font-bold text-primary font-mono">{fromInt(it.final_amount).toLocaleString("en-US")}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted font-bold">
                          <td colSpan={5} className="border border-border px-2 py-1 text-left">الإجمالي</td>
                          <td className="border border-border px-2 py-1 text-center text-primary font-mono">{total.toLocaleString("en-US")}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ─── نموذج الإضافة/التعديل ────────────────────────────────────────── */}
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