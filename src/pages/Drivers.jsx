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
  discardDriverSheetInventory,
  getDriverAvailableInventory,
  closeDriverSheet,
  toggleDriverPaid,
  getAllSettings,
  getClosedDriverSheets,
  getClosedSheetItems,
  deleteClosedSheet,
  saveDriverInventory,
  getWithdrawals,
  processWithdrawal,
  deleteWithdrawal,
} from "../lib/db.js";
import { formatMoney, fromInt } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { isFixedMaterial } from "../lib/materials.js";
import { useDataContext } from "../context/DataContext.jsx";

const EMPTY = { name: "", phone: "", driver_number: "", notes: "" };

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
      existing.gross_weight = Number(existing.gross_weight || 0) + Number(item.gross_weight || 0);
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

function getSoldItems(items) {
  return (items || []).filter(
    item => item.trader_id != null && item.trader_id !== ""
  );
}

// مواد المخزون الأصلي (التي أحضرها السائق): بنود غير مرتبطة ببگال
function getInventoryItems(items) {
  return (items || [])
    .filter(item => item.trader_id == null || item.trader_id === "")
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
}

function toInventoryDraft(items) {
  return (items || []).map((item) => ({
    key: item.id,
    id: item.id,
    product_name: item.product_name || "",
    basket_count: String(item.basket_count ?? ""),
  }));
}

function normalizeInventoryName(name) {
  return String(name || "").trim().toLowerCase();
}

function mergeInventoryDraftItems(items) {
  const merged = [];
  const indexesByName = new Map();

  for (const item of items) {
    const normalizedName = normalizeInventoryName(item.product_name);
    if (!normalizedName || !indexesByName.has(normalizedName)) {
      indexesByName.set(normalizedName, merged.length);
      merged.push({ ...item, product_name: String(item.product_name || "").trim() });
      continue;
    }

    const existing = merged[indexesByName.get(normalizedName)];
    existing.basket_count = String(
      (Number(existing.basket_count) || 0) + (Number(item.basket_count) || 0)
    );
  }

  return merged;
}

function calculateAveragePrices(items) {
  const totals = new Map();

  for (const item of items || []) {
    const productName = item.product_name?.trim();
    if (!productName) continue;

    const current = totals.get(productName) || {
      product_name: productName,
      total_amount: 0,
      total_weight: 0,
      total_quantity: 0,
    };
    current.total_amount += Number(item.simple_amount || 0);
    current.total_weight += Number(item.net_weight || 0);
    current.total_quantity += Number(item.basket_count || 0);
    totals.set(productName, current);
  }

  return Array.from(totals.values()).map(item => {
    const divisor = item.total_weight || item.total_quantity;
    return {
      ...item,
      divisor,
      average_price: divisor ? item.total_amount / divisor : 0,
    };
  });
}

export default function Drivers() {
  const {
    refreshData,
    getDriverCommission,
    setDriverCommission: saveDriverCommissionToContext,
    clearDriverCommission,
  } = useDataContext();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY);
  const [addSaving, setAddSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState(null);
  const [settings, setSettings] = useState({});

  // التقسيم: اليمين (القائمة)، اليسار (التفاصيل)
  const [searchText, setSearchText] = useState("");
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [activeSheetType, setActiveSheetType] = useState("open");
  const [sheetItems, setSheetItems] = useState([]);
  const [showAveragePrice, setShowAveragePrice] = useState(false);
  const [closedSheets, setClosedSheets] = useState([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [driverCommission, setDriverCommission] = useState(0);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalAmountInput, setWithdrawalAmountInput] = useState("");
  const [withdrawalDetails, setWithdrawalDetails] = useState("");
  const [withdrawalEntries, setWithdrawalEntries] = useState([]);

  // مواد قائمة السائق المفتوحة
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryDraft, setInventoryDraft] = useState([]);
  const [inventoryNewRow, setInventoryNewRow] = useState({ product_name: "", basket_count: "" });
  const [inventorySaving, setInventorySaving] = useState(false);
  const [inventoryError, setInventoryError] = useState("");

  // Dialogs
  const [confirmDeleteSheet, setConfirmDeleteSheet] = useState(null);
  const [confirmTogglePaid, setConfirmTogglePaid] = useState(null);
  const [confirmDiscardSheet, setConfirmDiscardSheet] = useState(null);
  const [openingSaving, setOpeningSaving] = useState(false);

  const printRef = useRef();
  const marketName = settings.market_name || "مكتب نينوى";
  const productItems = useMemo(
    () => ["الرگي", ...(settings.products_list || "")
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((name, index, names) => names.indexOf(name) === index && name !== "الرگي")]
      .map((name) => ({ id: name, label: name })),
    [settings.products_list]
  );
  const weightOnlyInventory = isFixedMaterial(inventoryNewRow.product_name);

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

  useEffect(() => {
    if (!selectedDriver && rows.length > 0) {
      const savedDriverId = typeof window !== "undefined" && localStorage.getItem("warehouse_selected_driver_id");
      if (savedDriverId) {
        const found = rows.find(r => String(r.id) === String(savedDriverId));
        if (found) {
          openSheetView(found);
        }
      }
    }
  }, [rows, selectedDriver]);

  // فتح تفاصيل السائق مع جميع القوائم
  async function openSheetView(driver) {
    setLoadingSheet(true);
    setSelectedDriver(driver);
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem("warehouse_selected_driver_id", driver.id);
    }
    setActiveSheetType("open");
    
    // استرجاع نسبة العمولة المحفوظة للسائق بدلاً من تصفيرها
    const savedComm = getDriverCommission(driver.id);
    setDriverCommission(savedComm);

    setWithdrawalAmount("");
    setWithdrawalAmountInput("");
    setWithdrawalDetails("");
    try {
      const [openItems, closed, allWithdrawals] = await Promise.all([
        getDriverSheetItems(driver.id),
        getClosedDriverSheets(driver.id),
        getWithdrawals(),
      ]);
      const nextInventory = getInventoryItems(openItems);
      setSheetItems(processSheetItems(getSoldItems(openItems)));
      setInventoryItems(nextInventory);
      setInventoryDraft(toInventoryDraft(nextInventory));
      setInventoryNewRow({ product_name: "", basket_count: "" });
      setInventoryError("");
      setClosedSheets(closed);

      // استرجاع السحوبات الحقيقية المحفوظة للسائق
      const driverWithdrawals = allWithdrawals.filter(w =>
        (String(w.driver_id) === String(driver.id) || (String(w.person_id) === String(driver.id) && (w.person_type === "driver" || w.withdrawer_type === "driver"))) &&
        w.is_deleted !== 1 &&
        (!driver.sheet_opened_at || w.date >= driver.sheet_opened_at || w.created_at >= driver.sheet_opened_at)
      );
      setWithdrawalEntries(driverWithdrawals.map(w => ({
        id: w.id,
        type: "withdrawal",
        amount: -Number(w.amount || 0),
        details: w.withdrawal_details || w.withdrawalDetails || "",
        date: w.date,
      })));
    } catch (e) {
      alert("خطأ: " + e.message);
    } finally {
      setLoadingSheet(false);
    }
  }

  function handleCommissionChange(val) {
    const num = val === "" ? "" : Math.min(100, Math.max(0, Number(val)));
    setDriverCommission(num);
    if (selectedDriver && activeSheetType === "open") {
      saveDriverCommissionToContext(selectedDriver.id, num);
    }
  }

  function handleWithdrawalAmountChange(event) {
    const valueWithoutCommas = event.target.value.replace(/[,،]/g, "");
    if (!/^\d*$/.test(valueWithoutCommas)) return;

    const numericValue = valueWithoutCommas === "" ? "" : Number(valueWithoutCommas);
    if (numericValue !== "" && numericValue > netAmountAfterCommission - withdrawalTotal) {
      alert("مبلغ السحب يتجاوز رصيد القائمة المتاح بعد العمولة");
      return;
    }

    setWithdrawalAmount(numericValue);
    setWithdrawalAmountInput(
      valueWithoutCommas === "" ? "" : numericValue.toLocaleString("en-US")
    );
  }

  async function handleAddWithdrawal() {
    const amount = Number(withdrawalAmount);
    const remainingAmount = netAmountAfterCommission - withdrawalTotal;
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("أدخل مبلغ سحب صحيحاً");
      return;
    }
    if (amount > remainingAmount) {
      alert("مبلغ السحب يتجاوز رصيد القائمة المتاح بعد العمولة");
      return;
    }

    try {
      await processWithdrawal({
        amount,
        withdrawerType: "driver",
        personId: selectedDriver.id,
        personName: selectedDriver.name,
        withdrawalDetails: withdrawalDetails.trim(),
        date: new Date().toISOString(),
      });
      await refreshData();

      const allWithdrawals = await getWithdrawals();
      const driverWithdrawals = allWithdrawals.filter(w =>
        (String(w.driver_id) === String(selectedDriver.id) || (String(w.person_id) === String(selectedDriver.id) && (w.person_type === "driver" || w.withdrawer_type === "driver"))) &&
        w.is_deleted !== 1 &&
        (!selectedDriver.sheet_opened_at || w.date >= selectedDriver.sheet_opened_at || w.created_at >= selectedDriver.sheet_opened_at)
      );
      setWithdrawalEntries(driverWithdrawals.map(w => ({
        id: w.id,
        type: "withdrawal",
        amount: -Number(w.amount || 0),
        details: w.withdrawal_details || w.withdrawalDetails || "",
        date: w.date,
      })));
      setWithdrawalAmount("");
      setWithdrawalAmountInput("");
      setWithdrawalDetails("");
    } catch (e) {
      alert("خطأ أثناء تسجيل السحب: " + (e?.message || e));
    }
  }

  async function handleDeleteDriverWithdrawal(withdrawalId) {
    try {
      await deleteWithdrawal(withdrawalId);
      await refreshData();
      const allWithdrawals = await getWithdrawals();
      const driverWithdrawals = allWithdrawals.filter(w =>
        (String(w.driver_id) === String(selectedDriver.id) || (String(w.person_id) === String(selectedDriver.id) && (w.person_type === "driver" || w.withdrawer_type === "driver"))) &&
        w.is_deleted !== 1 &&
        (!selectedDriver.sheet_opened_at || w.date >= selectedDriver.sheet_opened_at || w.created_at >= selectedDriver.sheet_opened_at)
      );
      setWithdrawalEntries(driverWithdrawals.map(w => ({
        id: w.id,
        type: "withdrawal",
        amount: -Number(w.amount || 0),
        details: w.withdrawal_details || w.withdrawalDetails || "",
        date: w.date,
      })));
    } catch (e) {
      alert("خطأ أثناء حذف السحب: " + (e?.message || e));
    }
  }

  // الانتقال للقائمة المفتوحة
  async function switchToOpenSheet() {
    setLoadingSheet(true);
    setActiveSheetType("open");
    const savedComm = getDriverCommission(selectedDriver.id);
    setDriverCommission(savedComm);
    setWithdrawalAmount("");
    setWithdrawalAmountInput("");
    setWithdrawalDetails("");
    try {
      const [openItems, allWithdrawals] = await Promise.all([
        getDriverSheetItems(selectedDriver.id),
        getWithdrawals(),
      ]);
      setSheetItems(processSheetItems(getSoldItems(openItems)));
      const nextInventory = getInventoryItems(openItems);
      setInventoryItems(nextInventory);
      setInventoryDraft(toInventoryDraft(nextInventory));
      setInventoryNewRow({ product_name: "", basket_count: "" });
      setInventoryError("");

      const driverWithdrawals = allWithdrawals.filter(w =>
        (String(w.driver_id) === String(selectedDriver.id) || (String(w.person_id) === String(selectedDriver.id) && (w.person_type === "driver" || w.withdrawer_type === "driver"))) &&
        w.is_deleted !== 1 &&
        (!selectedDriver.sheet_opened_at || w.date >= selectedDriver.sheet_opened_at || w.created_at >= selectedDriver.sheet_opened_at)
      );
      setWithdrawalEntries(driverWithdrawals.map(w => ({
        id: w.id,
        type: "withdrawal",
        amount: -Number(w.amount || 0),
        details: w.withdrawal_details || w.withdrawalDetails || "",
        date: w.date,
      })));
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
    setInventoryItems([]);
    const savedWithdrawalAmount = Number(closedSheet.withdrawal_amount || 0);
    setDriverCommission(Number(closedSheet.commission_rate || 0));
    setWithdrawalAmount(savedWithdrawalAmount || "");
    setWithdrawalAmountInput(
      savedWithdrawalAmount ? savedWithdrawalAmount.toLocaleString("en-US") : ""
    );
    setWithdrawalDetails(closedSheet.withdrawal_details || "");
    setWithdrawalEntries(savedWithdrawalAmount > 0 ? [{
      id: `closed-withdrawal-${closedSheet.id}`,
      type: "withdrawal",
      amount: -savedWithdrawalAmount,
      details: closedSheet.withdrawal_details || "",
    }] : []);
    try {
      const items = await getClosedSheetItems(
        selectedDriver.id,
        closedSheet.sheet_opened_at,
        closedSheet.sheet_closed_at
      );
      setSheetItems(processSheetItems(getSoldItems(items)));
    } catch (e) {
      alert("خطأ: " + e.message);
    } finally {
      setLoadingSheet(false);
    }
  }

  async function handleCloseSheet(driverId) {
    try {
      const remaining = await getDriverAvailableInventory(driverId);
      if (remaining.length > 0) {
        setConfirmDiscardSheet({ driverId });
        return;
      }
      await finishCloseSheet(driverId, false);
    } catch (e) {
      alert("خطأ: " + e.message);
    }
  }

  async function finishCloseSheet(driverId, discardRemaining) {
    try {
      if (discardRemaining) await discardDriverSheetInventory(driverId);
      await closeDriverSheet(driverId, {
        commissionRate,
        commissionAmount,
        withdrawalAmount: withdrawalTotal,
        withdrawalDetails: withdrawalEntries.map((entry) => entry.details).filter(Boolean).join(" | "),
        totalAmount: sheetTotal,
      });
      clearDriverCommission(driverId);
      setConfirmDiscardSheet(null);
      await load();
      await refreshData();
      if (selectedDriver?.id === driverId) {
        const updatedDrivers = await getDrivers();
        const updatedCurrent = updatedDrivers.find(d => String(d.id) === String(driverId));
        if (updatedCurrent) {
          await openSheetView(updatedCurrent);
        } else {
          setSelectedDriver(null);
          setSheetItems([]);
          setInventoryItems([]);
        }
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

  async function beginOpenSheet(driver) {
    setOpeningSaving(true);
    try {
      await openDriverSheet(driver.id);
      setSelectedDriver((current) => current?.id === driver.id
        ? { ...current, sheet_status: "open", sheet_opened_at: new Date().toISOString(), is_paid: 0 }
        : current);
      setActiveSheetType("open");
      setInventoryItems([]);
      setInventoryDraft([]);
      await load();
      if (selectedDriver?.id === driver.id) await switchToOpenSheet();
    } catch (e) {
      alert("خطأ: " + e.message);
    } finally {
      setOpeningSaving(false);
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

  async function persistInventoryDraft(draftItems) {
    const mergedDraftItems = mergeInventoryDraftItems(draftItems);
    const normalizedItems = mergedDraftItems.map((item) => ({
      id: item.id,
      product_name: item.product_name.trim(),
      basket_count: Number(item.basket_count),
    }));
    const invalidItem = normalizedItems.find(
      (item) => !item.product_name || !Number.isInteger(item.basket_count) || (
        item.basket_count <= 0 && !isFixedMaterial(item.product_name)
      )
    );
    if (invalidItem) {
      setInventoryError("أدخل اسم المادة وكمية صحيحة أكبر من صفر");
      return false;
    }

    setInventorySaving(true);
    setInventoryError("");
    try {
      await saveDriverInventory(selectedDriver.id, normalizedItems);
      const openItems = await getDriverSheetItems(selectedDriver.id);
      const nextInventory = getInventoryItems(openItems);
      setInventoryItems(nextInventory);
      setInventoryDraft(toInventoryDraft(nextInventory));
      setSheetItems(processSheetItems(getSoldItems(openItems)));
      return true;
    } catch (e) {
      setInventoryError(e?.message || "تعذر حفظ مواد السائق");
      return false;
    } finally {
      setInventorySaving(false);
    }
  }

  function updateInventoryDraft(key, field, value) {
    setInventoryDraft((current) => current.map((item) => (
      item.key === key ? { ...item, [field]: value } : item
    )));
    setInventoryError("");
  }

  async function handleInventoryBlur() {
    await persistInventoryDraft(mergeInventoryDraftItems(inventoryDraft));
  }

  async function handleAddInventory() {
    const productName = inventoryNewRow.product_name.trim();
    const basketCount = Number(inventoryNewRow.basket_count);
    if (!productName || !Number.isInteger(basketCount) || (basketCount <= 0 && !isFixedMaterial(productName))) {
      setInventoryError("أدخل اسم المادة وكمية صحيحة أكبر من صفر");
      return;
    }

    const nextDraft = mergeInventoryDraftItems([
      ...inventoryDraft,
      {
        key: `new-${Date.now()}`,
        id: null,
        product_name: productName,
        basket_count: String(basketCount),
      },
    ]);
    if (await persistInventoryDraft(nextDraft)) {
      setInventoryNewRow({ product_name: "", basket_count: "" });
    }
  }

  async function handleRemoveInventory(key) {
    const nextDraft = inventoryDraft.filter((item) => item.key !== key);
    await persistInventoryDraft(nextDraft);
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
    .average-row td { background: #eff6ff!important; color: #1e3a8a!important; border-top: 2px solid #2563eb!important; font-weight: 900!important; }
    .average-row .average-label { text-align: right; padding-right: 16px; }
    
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
      if (editRow) {
        await updateDriver(editRow.id, form);
        setShowForm(false);
      } else {
        await createDriver(form);
        setForm(EMPTY);
      }
      await load();
      await refreshData();
    } catch (e) {
      alert("خطأ: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickAdd(e) {
    e.preventDefault();
    if (!addForm.name.trim()) return;
    setAddSaving(true);
    try {
      await createDriver(addForm);
      setAddForm(EMPTY);
      await load();
      await refreshData();
    } catch (e) {
      alert("خطأ: " + e.message);
    } finally {
      setAddSaving(false);
    }
  }

  function openEdit(row) {
    setEditRow(row);
    setForm({
      name: row.name,
      phone: row.phone ?? "",
      driver_number: row.driver_number ?? "",
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
        (d.driver_number != null && String(d.driver_number).includes(query))
    );
  }, [rows, searchText]);

  const sheetTotal = useMemo(
    () => sheetItems.reduce((sum, item) => sum + Number(item.simple_amount || 0), 0),
    [sheetItems]
  );
  const commissionRate = Math.min(100, Math.max(0, Number(driverCommission) || 0));
  const commissionAmount = useMemo(
    () => Math.round(sheetItems.reduce(
      (total, item) => total + (Number(item.simple_amount) || 0) * (commissionRate / 100),
      0,
    )),
    [sheetItems, commissionRate]
  );
  const netAmountAfterCommission = useMemo(
    () => sheetTotal - commissionAmount,
    [sheetTotal, commissionAmount]
  );
  const withdrawalTotal = useMemo(
    () => withdrawalEntries.reduce((total, entry) => total + Math.abs(Number(entry.amount) || 0), 0),
    [withdrawalEntries]
  );
  const finalSheetTotal = netAmountAfterCommission - withdrawalTotal;
  const averagePrices = useMemo(
    () => calculateAveragePrices(sheetItems),
    [sheetItems]
  );

  // ─── التقسيم العمودي: اليمين (القائمة)، اليسار (التفاصيل) ───
  return (
    <div className="flex flex-col gap-4 h-full">
      

      {!selectedDriver && (
        <section className="bg-card border border-border rounded-lg p-4 shadow-sm">
          <div className="mb-3">
            <h3 className="text-sm font-semibold">إضافة سائق جديد</h3>
            <p className="text-xs text-muted-foreground mt-1">
              أضف السائق بسرعة، وسيظهر مباشرة في القائمة أدناه.
            </p>
          </div>
          <form onSubmit={handleQuickAdd} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">الاسم *</label>
              <input
                required
                value={addForm.name}
                onChange={(e) => setAddForm((current) => ({ ...current, name: e.target.value }))}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="اسم السائق"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">الهاتف</label>
              <input
                type="tel"
                value={addForm.phone}
                onChange={(e) => setAddForm((current) => ({ ...current, phone: e.target.value }))}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="رقم الهاتف"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">رقم السائق</label>
              <input
                inputMode="numeric"
                maxLength={4}
                value={addForm.driver_number}
                onChange={(e) => setAddForm((current) => ({ ...current, driver_number: e.target.value.replace(/\D/g, "") }))}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="اختياري"
              />
            </div>
            <div className="flex items-end gap-2">
              <input
                value={addForm.notes}
                onChange={(e) => setAddForm((current) => ({ ...current, notes: e.target.value }))}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="ملاحظات"
              />
              <button
                type="submit"
                disabled={addSaving}
                className="shrink-0 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {addSaving ? "جارٍ..." : "إضافة"}
              </button>
            </div>
          </form>
        </section>
      )}

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
          <div className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => {
                  setSelectedDriver(null);
                  if (typeof window !== "undefined" && window.localStorage) {
                    localStorage.removeItem("warehouse_selected_driver_id");
                  }
                  setSheetItems([]);
                  setInventoryItems([]);
                  setClosedSheets([]);
                }}
                className="p-2 hover:bg-background rounded-lg border border-border"
              >
                <ArrowRight size={18} />
              </button>
              <div className="flex items-center gap-3">
                {selectedDriver.driver_number && (
                  <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-extrabold text-lg border-2 border-primary/20 shrink-0">
                    {selectedDriver.driver_number}
                  </span>
                )}
                <div>
                  <h2 className="text-lg font-bold">
                    {activeSheetType === "open" ? "القائمة المفتوحة" : "قائمة مغلقة"}
                    {": "}
                    <span className="text-primary">{selectedDriver.name}</span>
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    الهاتف: {selectedDriver.phone || "—"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
                <>
                  {selectedDriver.sheet_status !== "open" && activeSheetType === "open" && (
                    <button
                      onClick={() => beginOpenSheet(selectedDriver)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                    >
                      <Plus size={15} /> فتح قائمة
                    </button>
                  )}
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
                </>
              )}
              {sheetItems.length > 0 && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={showAveragePrice}
                  aria-label="عرض السعر المتوسط"
                  onClick={() => setShowAveragePrice((current) => !current)}
                  className={`group flex items-center gap-2 min-h-9 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-semibold border shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    showAveragePrice
                      ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                      : "bg-background text-foreground border-border hover:bg-accent"
                  }`}
                >
                  <span
                    className={`relative inline-block h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors ${
                      showAveragePrice ? "bg-white/35" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full shadow-sm transition-[left] duration-200 ${
                        showAveragePrice ? "left-[18px] bg-white" : "bg-white"
                      }`}
                    />
                  </span>
                  عرض السعر المتوسط
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
            {/* اليسار: قائمة القوائم */}
            <aside className="md:col-span-1 flex min-h-0 flex-col gap-2 rounded-xl border border-border bg-muted/20 p-2 overflow-y-auto">
              {/* القوائم المغلقة */}
              <div className="order-2 flex flex-col gap-2">
                {closedSheets.map((sheet) => (
                  <div key={sheet.id} className="flex gap-1 items-stretch">
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

              <div className="w-full overflow-hidden rounded-lg border border-border bg-background shadow-sm">
                <div className="grid w-full grid-cols-4 items-end gap-2 p-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <label htmlFor="driver-commission" className="truncate text-[11px] font-semibold text-muted-foreground">
                      عمولة السائق (%)
                    </label>
                    <input
                      id="driver-commission"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={driverCommission}
                      onChange={(event) => handleCommissionChange(event.target.value)}
                      className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label htmlFor="driver-withdrawal-amount" className="truncate text-[11px] font-semibold text-muted-foreground">
                      السحوبات
                    </label>
                    <input
                      id="driver-withdrawal-amount"
                      type="text"
                      inputMode="numeric"
                      value={withdrawalAmountInput}
                      data-raw-amount={withdrawalAmount}
                      onChange={handleWithdrawalAmountChange}
                      className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <label htmlFor="driver-withdrawal-details" className="truncate text-[11px] font-semibold text-muted-foreground">
                      تفاصيل السحب
                    </label>
                    <input
                      id="driver-withdrawal-details"
                      type="text"
                      value={withdrawalDetails}
                      onChange={(event) => setWithdrawalDetails(event.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="سبب السحب"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="h-4 truncate text-[11px] font-semibold text-muted-foreground">إضافة</span>
                    <button
                      type="button"
                      onClick={handleAddWithdrawal}
                      className="flex h-8 w-full items-center justify-center gap-1 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                      title="إضافة السحب"
                    >
                      <Plus size={14} /> إضافة
                    </button>
                  </div>
                </div>
                <hr className="border-gray-200" />

                <section className="w-full overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-2 py-1.5">
                    <h3 className="text-sm font-bold">المواد التي أحضرها السائق</h3>
                    <span className="text-xs text-muted-foreground">{inventoryDraft.length} مادة</span>
                  </div>
                  <div className="flex items-center gap-1 border-b border-border bg-muted/10 p-2">
                    <select
                      value={inventoryNewRow.product_name}
                      onChange={(event) => setInventoryNewRow((current) => ({ ...current, product_name: event.target.value, basket_count: isFixedMaterial(event.target.value) ? "0" : current.basket_count }))}
                      className="min-w-0 flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="">اختر المادة</option>
                      {productItems.map((item) => <option key={item.id} value={item.label}>{item.label}</option>)}
                    </select>
                    <input
                      type="number"
                      min={weightOnlyInventory ? "0" : "1"}
                      step="1"
                      inputMode="numeric"
                      value={weightOnlyInventory ? "0" : inventoryNewRow.basket_count}
                      disabled={weightOnlyInventory}
                      onChange={(event) => setInventoryNewRow((current) => ({ ...current, basket_count: event.target.value }))}
                      placeholder="السلات"
                      className="w-16 h-8 rounded-md border border-input bg-background px-1 text-center text-xs font-mono outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      type="button"
                      onClick={handleAddInventory}
                      disabled={inventorySaving || productItems.length === 0}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      title="إضافة مادة"
                      aria-label="إضافة مادة"
                    >
                      <Plus size={17} />
                    </button>
                  </div>
                  {productItems.length === 0 && <p className="px-3 pt-2 text-xs text-amber-700">لا توجد مواد، الرجاء إضافتها من الإعدادات</p>}
                  {inventoryError && <p className="px-3 pt-2 text-xs text-destructive">{inventoryError}</p>}
                  <div className="max-h-52 overflow-y-auto p-2">
                    {inventoryDraft.length === 0 ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">لا توجد مواد في القائمة</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {inventoryDraft.map((item) => (
                          <div key={item.key} className="flex items-center gap-1">
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.product_name}</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={isFixedMaterial(item.product_name) ? "0" : item.basket_count}
                              disabled={isFixedMaterial(item.product_name)}
                              onChange={(event) => updateInventoryDraft(item.key, "basket_count", event.target.value)}
                              onBlur={handleInventoryBlur}
                              aria-label={`كمية ${item.product_name}`}
                              className="w-16 h-8 rounded-md border border-input bg-background px-1 text-center text-xs font-mono outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveInventory(item.key)}
                              disabled={inventorySaving}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50"
                              title="حذف المادة"
                              aria-label={`حذف ${item.product_name}`}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <div className="border-t border-border p-2">
                  {selectedDriver.sheet_status === "open" ? (
                    <button
                      type="button"
                      onClick={switchToOpenSheet}
                      className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-right text-sm font-semibold text-emerald-700"
                    >
                      القائمة المفتوحة الحالية
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">لا توجد قائمة مفتوحة لهذا السائق</span>
                      <button
                        type="button"
                        onClick={() => beginOpenSheet(selectedDriver)}
                        disabled={openingSaving}
                        className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {openingSaving ? "جارٍ الفتح..." : "فتح قائمة جديدة"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </aside>

            {/* اليمين: معاينة القائمة والطباعة */}
            <main className="md:col-span-2 flex min-w-0 flex-col gap-4">
              {activeSheetType === "__legacy__" && (
              <div>
                <div className="grid w-full grid-cols-1 gap-3 p-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="driver-commission" className="text-xs font-semibold text-muted-foreground">
                      عمولة السائق (%)
                    </label>
                    <input
                      id="driver-commission"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={driverCommission}
                      onChange={(event) => handleCommissionChange(event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="driver-withdrawal-amount" className="text-xs font-semibold text-muted-foreground">
                      السحوبات
                    </label>
                    <input
                      id="driver-withdrawal-amount"
                      type="text"
                      inputMode="numeric"
                      value={withdrawalAmountInput}
                      data-raw-amount={withdrawalAmount}
                      onChange={handleWithdrawalAmountChange}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="driver-withdrawal-details" className="text-xs font-semibold text-muted-foreground">
                      تفاصيل السحب
                    </label>
                    <input
                      id="driver-withdrawal-details"
                      type="text"
                      value={withdrawalDetails}
                      onChange={(event) => setWithdrawalDetails(event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="سبب أو تفاصيل السحب"
                    />
                  </div>
                </div>

                <hr className="mx-4 border-gray-200" />

              {activeSheetType === "open" && selectedDriver.sheet_status === "open" && (
                <section className="w-full overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold">المواد التي أحضرها السائق</h3>
                      <span className="text-xs text-muted-foreground">{inventoryItems.length} مادة</span>
                    </div>
                    {inventorySaving && <span className="text-xs text-muted-foreground">جارٍ الحفظ...</span>}
                  </div>

                  <div className="p-3 border-b border-border bg-muted/10">
                    <div className="flex items-center gap-2">
                      <input
                        list="driver-inventory-products"
                        value={inventoryNewRow.product_name}
                        onChange={(event) => setInventoryNewRow((current) => ({ ...current, product_name: event.target.value, basket_count: isFixedMaterial(event.target.value) ? "0" : current.basket_count }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddInventory();
                          }
                        }}
                        placeholder="اسم المادة"
                        className="min-w-0 flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <input
                        type="number"
                        min={weightOnlyInventory ? "0" : "1"}
                        step="1"
                        inputMode="numeric"
                        value={weightOnlyInventory ? "0" : inventoryNewRow.basket_count}
                        disabled={weightOnlyInventory}
                        onChange={(event) => setInventoryNewRow((current) => ({ ...current, basket_count: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddInventory();
                          }
                        }}
                        placeholder="السلات"
                        className="w-28 h-9 rounded-md border border-input bg-background px-3 text-center text-sm font-mono outline-none focus:ring-2 focus:ring-primary/40"
                      />
                      <button
                        type="button"
                        onClick={handleAddInventory}
                        disabled={inventorySaving}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        title="إضافة مادة"
                        aria-label="إضافة مادة"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                    <datalist id="driver-inventory-products">
                      {productItems.map((item) => <option key={item.id} value={item.label} />)}
                    </datalist>
                  </div>

                  {inventoryError && (
                    <p className="px-3 pt-2 text-xs text-destructive">{inventoryError}</p>
                  )}

                  <div className="max-h-60 overflow-y-auto p-3">
                    {inventoryDraft.length === 0 ? (
                      <div className="py-5 text-center text-xs text-muted-foreground">
                        لا توجد مواد في قائمة السائق
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {inventoryDraft.map((item) => (
                          <div key={item.key} className="flex items-center gap-2">
                            <input
                              list="driver-inventory-products"
                              value={item.product_name}
                              onChange={(event) => updateInventoryDraft(item.key, "product_name", event.target.value)}
                              onBlur={handleInventoryBlur}
                              aria-label="اسم المادة"
                              className="min-w-0 flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={isFixedMaterial(item.product_name) ? "0" : item.basket_count}
                              disabled={isFixedMaterial(item.product_name)}
                              onChange={(event) => updateInventoryDraft(item.key, "basket_count", event.target.value)}
                              onBlur={handleInventoryBlur}
                              aria-label="عدد السلات"
                              className="w-28 h-9 rounded-md border border-input bg-background px-3 text-center text-sm font-mono outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveInventory(item.key)}
                              disabled={inventorySaving}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50"
                              title="حذف المادة"
                              aria-label={`حذف ${item.product_name || "المادة"}`}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}
              </div>
              )}

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

                          {showAveragePrice && averagePrices.map((item) => (
                            <tr className="average-row" key={`average-row-${item.product_name}`}>
                              <td>—</td>
                              <td className="average-label">
                                متوسط السعر: {item.product_name}
                              </td>
                              <td>{item.total_quantity || "—"}</td>
                              <td>{fromInt(item.total_weight).toLocaleString("en-US") || "—"}</td>
                              <td>
                                {item.average_price.toLocaleString("en-US", {
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td>{item.total_amount.toLocaleString("en-US")}</td>
                            </tr>
                          ))}
                          {withdrawalEntries.map((entry) => (
                            <tr key={entry.id} className="text-red-700">
                              <td className="relative">
                                <span>—</span>
                                {activeSheetType === "open" && entry.id && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDriverWithdrawal(entry.id)}
                                    className="mr-1 inline-flex items-center text-destructive hover:bg-destructive/10 p-0.5 rounded print:hidden"
                                    title="حذف هذا السحب"
                                    aria-label="حذف هذا السحب"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </td>
                              <td className="text-right font-bold" style={{ paddingRight: "16px" }}>
                                سحب: {entry.details || "—"}
                              </td>
                              <td>—</td>
                              <td>—</td>
                              <td>—</td>
                              <td style={{ fontFamily: "monospace", fontWeight: "bold" }}>
                                {entry.amount.toLocaleString("en-US")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="alwa-total-box">
                        <div className="alwa-total-label">المجموع</div>
                        <div className="alwa-total-value">
                          {finalSheetTotal.toLocaleString("en-US")}
                        </div>
                      </div>

                      <div className="alwa-footer">
                        <div style={{ paddingLeft: "32px" }}>التوقيع</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </main>
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
                  <div className="flex-1 flex items-start gap-2">
                    {driver.driver_number != null && driver.driver_number !== "" && (
                      <span className="shrink-0 inline-flex items-center justify-center min-w-10 h-10 px-2 rounded-full bg-primary/10 text-primary font-extrabold text-base border-2 border-primary/30">
                        {driver.driver_number}
                      </span>
                    )}
                    <div className="flex-1">
                      <h3 className="font-bold text-sm">{driver.name}</h3>
                      {driver.phone && (
                        <p className="text-xs text-muted-foreground mt-1">
                          📱 {driver.phone}
                        </p>
                      )}
                    </div>
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
                        beginOpenSheet(driver);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold px-2 py-1.5 rounded border bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 transition-colors"
                    >
                      فتح قائمة
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
                <label className="text-sm font-medium">رقم السائق</label>
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={form.driver_number}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, driver_number: e.target.value.replace(/\D/g, "") }))
                  }
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
                  placeholder="اختياري"
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
        open={!!confirmDiscardSheet}
        title="إغلاق قائمة السائق"
        message="هل تريد حذف الكميات المتبقية واعتبارها تالفة؟"
        confirmText="نعم"
        cancelText="لا"
        danger
        onConfirm={() => finishCloseSheet(confirmDiscardSheet.driverId, true)}
        onCancel={() => setConfirmDiscardSheet(null)}
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