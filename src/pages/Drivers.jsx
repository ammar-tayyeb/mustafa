import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Printer,
  ArrowRight,
  CheckCircle2,
  Circle,
  XCircle,
  Search,
  Trash,
} from "lucide-react";
import {
  getDrivers,
  createDriver,
  updateDriver,
  deleteDriver,
  getDriverSheetItems,
  openDriverSheet,
  closeDriverSheet,
  toggleDriverPaid,
  getAllSettings,
  getClosedDriverSheets,
  getClosedSheetItems,
  deleteClosedSheet,
} from "../lib/db.js";
import { formatMoney, fromInt } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const EMPTY = { name: "", phone: "", vehicle_plate: "", notes: "" };

// ✅ حساب المبلغ: السعر × الوزن (مباشر بدون تقريب)
function computeSimpleAmount(netWeight, price) {
  return Math.round((netWeight * price));
}

// دمج البنود وحساب المبلغ الصحيح
function processSheetItems(items) {
  if (!items || items.length === 0) return [];

  const mergedMap = new Map();

  for (const item of items) {
    const key = `${item.product_name}_${item.price}`;
    const itemAmount = computeSimpleAmount(item.net_weight || 0, item.price || 0);

    if (mergedMap.has(key)) {
      const existing = mergedMap.get(key);
      existing.basket_count += item.basket_count || 0;
      existing.net_weight += item.net_weight || 0;
      existing.simple_amount = computeSimpleAmount(
        existing.net_weight,
        item.price
      );
    } else {
      mergedMap.set(key, {
        ...item,
        basket_count: item.basket_count || 0,
        net_weight: item.net_weight || 0,
        simple_amount: itemAmount,
      });
    }
  }

  return Array.from(mergedMap.values()).sort((a, b) => b.price - a.price);
}

export default function Drivers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);
  const [settings, setSettings] = useState({});

  // التقسيم: اليمين (القائمة)، اليسار (التفاصيل)
  const [searchText, setSearchText] = useState("");
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [activeSheetType, setActiveSheetType] = useState("open");
  const [sheetItems, setSheetItems] = useState([]);
  const [closedSheets, setClosedSheets] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(false);

  // Dialogs
  const [confirmDeleteSheet, setConfirmDeleteSheet] = useState(null);
  const [confirmTogglePaid, setConfirmTogglePaid] = useState(null);

  const printRef = useRef();
  const marketName = settings.market_name || "مكتب نينوى";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [driverRows, allSettings] = await Promise.all([
        getDrivers(),
        getAllSettings(),
      ]);
      setRows(driverRows);
      setSettings(allSettings);
    } catch (e) {
      setError(e?.message || "خطأ في تحميل السواق");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // فتح تفاصيل السائق مع جميع القوائم
  async function openSheetView(driver) {
    setLoadingSheet(true);
    setSelectedDriver(driver);
    setActiveSheetType("open");
    try {
      const [openItems, closed] = await Promise.all([
        getDriverSheetItems(driver.id),
        getClosedDriverSheets(driver.id),
      ]);
      setSheetItems(processSheetItems(openItems));
      setClosedSheets(closed);
    } catch (e) {
      alert("خطأ: " + e.message);
    } finally {
      setLoadingSheet(false);
    }
  }

  // الانتقال للقائمة المفتوحة
  async function switchToOpenSheet() {
    setLoadingSheet(true);
    setActiveSheetType("open");
    try {
      const openItems = await getDriverSheetItems(selectedDriver.id);
      setSheetItems(processSheetItems(openItems));
    } catch (e) {
      alert("خطأ: " + e.message);
    } finally {
      setLoadingSheet(false);
    }
  }

  // فتح قائمة مغلقة
  async function openClosedSheet(closedSheet) {
    setLoadingSheet(true);
    setActiveSheetType(closedSheet.id);
    try {
      const items = await getClosedSheetItems(
        selectedDriver.id,
        closedSheet.sheet_opened_at,
        closedSheet.sheet_closed_at
      );
      setSheetItems(processSheetItems(items));
    } catch (e) {
      alert("خطأ: " + e.message);
    } finally {
      setLoadingSheet(false);
    }
  }

  async function handleCloseSheet(driverId) {
    if (!window.confirm("إغلاق القائمة؟")) return;
    try {
      await closeDriverSheet(driverId);
      await load();
      if (selectedDriver?.id === driverId) {
        setSelectedDriver(null);
        setSheetItems([]);
      }
    } catch (e) {
      alert("خطأ: " + e.message);
    }
  }

  async function handleTogglePaid(driver, sheetId = null) {
    const newState = driver.is_paid ? 0 : 1;
    const statusText = newState ? "واصل ✓" : "غير واصل";

    setConfirmTogglePaid({
      driver,
      sheetId,
      newState,
      statusText,
    });
  }

  async function executeTogglePaid() {
    try {
      const { driver, newState } = confirmTogglePaid;
      await toggleDriverPaid(driver.id, newState);
      await load();

      if (selectedDriver?.id === driver.id) {
        setSelectedDriver((prev) => ({
          ...prev,
          is_paid: newState,
        }));
      }

      setConfirmTogglePaid(null);
    } catch (e) {
      alert("خطأ: " + e.message);
    }
  }

  async function handleReopenSheet(driverId) {
    try {
      await openDriverSheet(driverId);
      await load();
    } catch (e) {
      alert("خطأ: " + e.message);
    }
  }

  async function handleDeleteSheet() {
    try {
      await deleteClosedSheet(confirmDeleteSheet.id);
      setConfirmDeleteSheet(null);

      // تحديث القوائم المغلقة المعروضة
      if (selectedDriver) {
        const closed = await getClosedDriverSheets(selectedDriver.id);
        setClosedSheets(closed);
      }
    } catch (e) {
      alert("خطأ: " + e.message);
    }
  }

  const getPrintStyles = () => `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
    body { margin:0; padding:0; direction:rtl; background:#fff; font-family:'Cairo', sans-serif; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
    @page { size: A4 portrait; margin: 0.5cm; }
    
    .alwa-container { width: 100%; box-sizing: border-box; background: #fff; direction: rtl; padding: 16px; border: 2px solid #000; border-radius: 16px; }
    
    .alwa-header { border: 2px solid #000; border-radius: 24px; padding: 16px; margin-bottom: 12px; text-align: center; display: flex; justify-content: center; align-items: center; }
    .alwa-header-center { width: 100%; text-align: center; }
    .alwa-title { font-size: 32px; font-weight: 900; color: #1A3B8B; margin: 0; padding: 0; line-height: 1.2; }
    .alwa-subtitle { font-size: 16px; font-weight: 700; color: #C82333; margin: 4px 0 8px 0; }
    .alwa-badge { background: #1E7E34; color: #fff; font-size: 12px; font-weight: bold; padding: 4px 16px; border-radius: 9999px; display: inline-block; border: 1px solid #16a34a; }
    
    .alwa-meta-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-bottom: 8px; padding: 0 4px; color: #1f2937; }
    .alwa-line-input { border-bottom: 2px dotted #94a3b8; flex-grow: 1; margin: 0 8px; color: #1A3B8B; font-size: 16px; padding-bottom: 2px; }
    
    .alwa-table { width: 100%; border-collapse: collapse; border: 1px solid #3B82F6; margin-top: 8px; border-radius: 8px; }
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
  `;

  const executePrint = (htmlContent) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(
      `<html><head><title>طباعة كشف السائق</title><style>${getPrintStyles()}</style></head><body>${htmlContent}</body></html>`
    );
    doc.close();
    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      document.body.removeChild(iframe);
    }, 350);
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    executePrint(printRef.current.innerHTML);
  };

  async function handleDelete() {
    try {
      await deleteDriver(deleteRow.id);
      setDeleteRow(null);
      await load();
    } catch (e) {
      alert("خطأ: " + e.message);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editRow) await updateDriver(editRow.id, form);
      else await createDriver(form);
      setShowForm(false);
      await load();
    } catch (e) {
      alert("خطأ: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  function openAdd() {
    setEditRow(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setForm({
      name: row.name,
      phone: row.phone ?? "",
      vehicle_plate: row.vehicle_plate ?? "",
      notes: row.notes ?? "",
    });
    setShowForm(true);
  }

  // البحث عن السواق
  const filteredRows = useMemo(() => {
    if (!searchText.trim()) return rows;
    const query = searchText.toLowerCase();
    return rows.filter(
      (d) =>
        d.name.toLowerCase().includes(query) ||
        (d.phone && d.phone.includes(query)) ||
        (d.vehicle_plate && d.vehicle_plate.toLowerCase().includes(query))
    );
  }, [rows, searchText]);

  const sheetTotal = sheetItems.reduce((s, it) => s + (it.simple_amount || 0), 0);

  // ─── التقسيم العمودي: اليمين (القائمة)، اليسار (التفاصيل) ───
  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">السواق</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            إدارة السائقين والقوائم المفتوحة والمغلقة
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90"
        >
          <Plus size={16} /> إضافة سائق
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          جارٍ التحميل...
        </div>
      ) : selectedDriver ? (
        // ─── شاشة تفاصيل السائق ───────────────────────────────────────
        <div className="flex flex-col gap-4">
          {/* بار التحكم العلوي */}
          <div className="flex items-center justify-between bg-muted/40 p-4 rounded-xl border border-border">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedDriver(null);
                  setSheetItems([]);
                  setClosedSheets([]);
                }}
                className="p-2 hover:bg-background rounded-lg border border-border"
              >
                <ArrowRight size={18} />
              </button>
              <div>
                <h2 className="text-lg font-bold">
                  {activeSheetType === "open" ? "القائمة المفتوحة" : "قائمة مغلقة"}
                  {": "}
                  <span className="text-primary">{selectedDriver.name}</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  المركبة: {selectedDriver.vehicle_plate || "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeSheetType === "open" &&
              selectedDriver.sheet_status === "open" ? (
                <>
                  <button
                    onClick={() => handleTogglePaid(selectedDriver)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      selectedDriver.is_paid
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                        : "bg-background text-muted-foreground border-border hover:bg-accent"
                    }`}
                  >
                    {selectedDriver.is_paid ? (
                      <CheckCircle2 size={15} />
                    ) : (
                      <Circle size={15} />
                    )}
                    {selectedDriver.is_paid ? "واصل ✓" : "غير واصل"}
                  </button>
                  <button
                    onClick={() => handleCloseSheet(selectedDriver.id)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    <XCircle size={15} /> إغلاق القائمة
                  </button>
                </>
              ) : (
                // قائمة مغلقة
                <button
                  onClick={() =>
                    handleTogglePaid(
                      { ...selectedDriver, id: selectedDriver.id },
                      activeSheetType
                    )
                  }
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    selectedDriver.is_paid
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                      : "bg-background text-muted-foreground border-border"
                  }`}
                >
                  {selectedDriver.is_paid ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <Circle size={15} />
                  )}
                  {selectedDriver.is_paid ? "واصل ✓" : "غير واصل"}
                </button>
              )}
              {sheetItems.length > 0 && (
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-semibold shadow-sm transition-colors"
                >
                  <Printer size={15} /> طباعة
                </button>
              )}
            </div>
          </div>

          {/* التقسيم: اليسار (القوائم)، اليمين (المعاينة) */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
            {/* اليسار: قائمة القوائم */}
            <div className="md:col-span-1 flex flex-col gap-2 bg-muted/20 p-3 rounded-xl border border-border max-h-96 overflow-y-auto">
              {/* القائمة المفتوحة */}
              <button
                onClick={switchToOpenSheet}
                className={`w-full text-right p-3 rounded-xl border font-medium transition-all flex flex-col gap-1 text-sm ${
                  activeSheetType === "open"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-foreground border-border hover:bg-accent"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">القائمة الحالية</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selectedDriver.sheet_status === "open"
                        ? "bg-emerald-500"
                        : "bg-gray-400"
                    }`}
                  />
                </div>
                <span
                  className={`text-xs ${
                    activeSheetType === "open"
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground"
                  }`}
                >
                  {selectedDriver.sheet_opened_at
                    ? new Date(selectedDriver.sheet_opened_at).toLocaleDateString(
                        "ar-IQ"
                      )
                    : "—"}
                </span>
              </button>

              {/* القوائم المغلقة */}
              {closedSheets.map((sheet) => (
                <div
                  key={sheet.id}
                  className="flex gap-1 items-stretch"
                >
                  <button
                    onClick={() => openClosedSheet(sheet)}
                    className={`flex-1 text-right p-3 rounded-xl border font-medium transition-all flex flex-col gap-1 text-sm ${
                      activeSheetType === sheet.id
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-background text-foreground border-border hover:bg-accent"
                    }`}
                  >
                    <span className="font-bold">قائمة مغلقة</span>
                    <span
                      className={`text-xs ${
                        activeSheetType === sheet.id
                          ? "text-blue-100"
                          : "text-muted-foreground"
                      }`}
                    >
                      {new Date(sheet.sheet_closed_at).toLocaleDateString(
                        "ar-IQ"
                      )}
                    </span>
                  </button>
                  <button
                    onClick={() => setConfirmDeleteSheet(sheet)}
                    className="px-2 py-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                    title="حذف القائمة"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* اليمين: معاينة القائمة والطباعة */}
            <div className="md:col-span-3 flex flex-col gap-4">
              {loadingSheet ? (
                <div className="text-center py-24 bg-background border rounded-xl text-muted-foreground shadow-sm">
                  جارٍ تحميل...
                </div>
              ) : sheetItems.length === 0 ? (
                <div className="text-center py-24 text-muted-foreground bg-muted/10 border border-dashed border-border rounded-xl text-sm shadow-sm">
                  لا توجد بنود
                </div>
              ) : (
                <div>
                  <style>{getPrintStyles()}</style>
                  <div
                    ref={printRef}
                    className="bg-white p-6 rounded-xl border shadow-sm max-w-full overflow-hidden"
                  >
                    <div className="alwa-container">
                      <div className="alwa-header">
                        <div className="alwa-header-center">
                          <h1 className="alwa-title">{marketName}</h1>
                          <h2 className="alwa-subtitle">
                            لبيع الفواكه والخضر بالجملة والمفرد
                          </h2>
                          <div className="alwa-badge">
                            موصل / سوق المعاش الأيمن رقم (٣٥)
                          </div>
                        </div>
                      </div>

                      <div className="alwa-meta-row">
                        <span>التاريخ: </span>
                        <span style={{ fontFamily: "monospace" }}>
                          {activeSheetType === "open"
                            ? selectedDriver.sheet_opened_at
                              ? new Date(
                                  selectedDriver.sheet_opened_at
                                ).toLocaleDateString("ar-IQ")
                              : "    /    / ٢٠٢"
                            : new Date(
                                closedSheets.find((s) => s.id === activeSheetType)
                                  ?.sheet_closed_at || ""
                              ).toLocaleDateString("ar-IQ")}
                        </span>
                      </div>

                      <div
                        className="alwa-meta-row"
                        style={{ alignItems: "center", marginBottom: "16px" }}
                      >
                        <span style={{ whiteSpace: "nowrap" }}>
                          حضرة السيد :
                        </span>
                        <span className="alwa-line-input font-bold text-lg px-2">
                          {selectedDriver.name}
                        </span>
                        <span style={{ whiteSpace: "nowrap" }}>المحترم</span>
                      </div>

                      <table className="alwa-table">
                        <thead>
                          <tr>
                            <th style={{ width: "7%" }}>
                              <span className="pill-blue">ت</span>
                            </th>
                            <th style={{ width: "43%" }}>
                              <span className="pill-green">المادة</span>
                            </th>
                            <th style={{ width: "12%" }}>
                              <span className="pill-orange">العدد</span>
                            </th>
                            <th style={{ width: "13%" }}>
                              <span className="pill-red">الوزن</span>
                            </th>
                            <th style={{ width: "12%" }}>
                              <span className="pill-blue">السعر</span>
                            </th>
                            <th style={{ width: "13%" }}>
                              <span className="pill-green">المبلغ</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sheetItems.map((it, idx) => (
                            <tr key={`${it.product_name}_${it.price}`}>
                              <td
                                style={{
                                  fontWeight: "bold",
                                  color: "#4b5563",
                                }}
                              >
                                {idx + 1}
                              </td>
                              <td
                                style={{
                                  fontWeight: "bold",
                                  textAlign: "right",
                                  paddingRight: "16px",
                                }}
                              >
                                {it.product_name}
                              </td>
                              <td style={{ fontFamily: "monospace" }}>
                                {it.basket_count || "—"}
                              </td>
                              <td style={{ fontFamily: "monospace" }}>
                                {fromInt(it.net_weight).toLocaleString("en-US")}
                              </td>
                              <td style={{ fontFamily: "monospace" }}>
                                {fromInt(it.price).toLocaleString("en-US")}
                              </td>
                              <td
                                style={{
                                  fontFamily: "monospace",
                                  fontWeight: "bold",
                                  color: "#1E7E34",
                                }}
                              >
                                {(it.simple_amount || 0).toLocaleString(
                                  "en-US"
                                )}
                              </td>
                            </tr>
                          ))}

                          {Array.from({
                            length: Math.max(0, 15 - sheetItems.length),
                          }).map((_, i) => (
                            <tr key={`empty-${i}`}>
                              <td style={{ color: "#cbd5e1" }}>
                                {sheetItems.length + i + 1}
                              </td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="alwa-total-box">
                        <div className="alwa-total-label">المجموع</div>
                        <div className="alwa-total-value">
                          {sheetTotal.toLocaleString("en-US")}
                        </div>
                      </div>

                      <div className="alwa-footer">
                        <div style={{ paddingLeft: "32px" }}>التوقيع</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // ─── الصفحة الرئيسية: قائمة السواق مع البحث ───────────────────
        <div className="flex flex-col gap-4">
          {/* شريط البحث */}
          <div className="relative">
            <Search className="absolute right-3 top-3 text-muted-foreground" size={18} />
            <input
              type="text"
              placeholder="ابحث عن سائق..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-border bg-background outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* شبكة السواق */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRows.map((driver) => (
              <div
                key={driver.id}
                className="p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => openSheetView(driver)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="font-bold text-sm">{driver.name}</h3>
                    {driver.phone && (
                      <p className="text-xs text-muted-foreground mt-1">
                        📱 {driver.phone}
                      </p>
                    )}
                    {driver.vehicle_plate && (
                      <p className="text-xs text-muted-foreground">
                        🚗 {driver.vehicle_plate}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                        driver.sheet_status === "open"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          driver.sheet_status === "open"
                            ? "bg-emerald-500"
                            : "bg-gray-400"
                        }`}
                      />
                      {driver.sheet_status === "open" ? "مفتوحة" : "مغلقة"}
                    </span>
                  </div>
                </div>

                {/* أزرار الإجراءات */}
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  {driver.sheet_status === "open" ? (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTogglePaid(driver);
                        }}
                        className={`flex-1 flex items-center justify-center gap-1 text-xs font-semibold px-2 py-1.5 rounded border transition-colors ${
                          driver.is_paid
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                            : "bg-background text-muted-foreground border-border hover:bg-accent"
                        }`}
                      >
                        {driver.is_paid ? (
                          <CheckCircle2 size={11} />
                        ) : (
                          <Circle size={11} />
                        )}
                        {driver.is_paid ? "واصل" : "واصل؟"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseSheet(driver.id);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold px-2 py-1.5 rounded border bg-red-50 text-red-700 border-red-200 hover:bg-red-100 transition-colors"
                      >
                        <XCircle size={11} /> إغلاق
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReopenSheet(driver.id);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold px-2 py-1.5 rounded border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-colors"
                    >
                      + قائمة جديدة
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(driver);
                    }}
                    className="p-1.5 rounded hover:bg-accent"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteRow(driver);
                    }}
                    className="p-1.5 rounded hover:bg-accent text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredRows.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              لا يوجد سائقون مسجّلون
            </div>
          )}
        </div>
      )}

      {/* ─── نموذج الإضافة/التعديل ─── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">
                {editRow ? "تعديل سائق" : "إضافة سائق"}
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 rounded hover:bg-accent"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">الاسم *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
                  placeholder="اسم السائق"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">الهاتف</label>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
                  placeholder="رقم الهاتف"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">المركبة / اللوحة</label>
                <input
                  value={form.vehicle_plate}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      vehicle_plate: e.target.value,
                    }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
                  placeholder="رقم اللوحة"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">ملاحظات</label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={2}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
                >
                  {saving ? "جارٍ الحفظ..." : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dialog تأكيد حذف القائمة */}
      <ConfirmDialog
        open={!!confirmDeleteSheet}
        title="حذف قائمة مغلقة"
        message={`هل تريد حذف القائمة المغلقة؟`}
        confirmText="حذف"
        danger
        onConfirm={handleDeleteSheet}
        onCancel={() => setConfirmDeleteSheet(null)}
      />

      {/* Dialog تأكيد تغيير حالة الدفع */}
      <ConfirmDialog
        open={!!confirmTogglePaid}
        title="تغيير حالة الدفع"
        message={`هل تريد تغيير حالة الدفع إلى "${confirmTogglePaid?.statusText}"؟`}
        confirmText="نعم، غير الحالة"
        onConfirm={executeTogglePaid}
        onCancel={() => setConfirmTogglePaid(null)}
      />

      <ConfirmDialog
        open={!!deleteRow}
        title="حذف سائق"
        message={`حذف السائق «${deleteRow?.name}»؟`}
        confirmText="حذف"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteRow(null)}
      />
    </div>
  );
}