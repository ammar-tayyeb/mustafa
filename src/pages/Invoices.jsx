import { Plus, CheckCircle, PlusCircle, User, Trash2, Check, Clock, Pin, Users, Send, Printer } from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

import { getInvoices, createInvoice, updateInvoiceTotals, postInvoice, deleteInvoice, getInvoiceItems, upsertInvoiceItem, deleteInvoiceItem, getTraders, deleteTrader, getActiveDrivers, getDrivers, getAllSettings, openDriverSheet } from "../lib/db.js";
import { computeInvoiceItem, computeInvoiceTotals, fromInt, formatMoney } from "../lib/money.js";
import { findOrCreateTrader, findOrCreateDriver } from "../lib/findOrCreate.js";
import { SmallProductCombobox } from "../components/SmallProductCombobox.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";


// ----------------------------------------------------------------------
// دوال مساعدة
// ----------------------------------------------------------------------
function getLocalDateTimeString() {
  const tzoffset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - tzoffset).toISOString().slice(0, 19);
}

function formatNumberWithCommas(value) {
  if (value === null || value === undefined || value === "") return "";
  const cleanValue = value.toString().replace(/,/g, "");
  if (isNaN(cleanValue)) return value;
  const parts = cleanValue.split(".");
  parts[0] = Number(parts[0]).toLocaleString("en-US", { numberingSystem: "latn" });
  return parts.join(".");
}

function cleanCommas(value) {
  if (!value) return 0;
  const cleaned = value.toString().replace(/,/g, "");
  return Number(cleaned) || 0;
}

function normalizeBasketWeightEach(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue === 0) return 0;
  return numericValue > 10 ? numericValue / 100 : numericValue;
}

const formatViewDateTime = (dateStr) => {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.toLocaleTimeString("ar-IQ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })} | ${d.toLocaleDateString("ar-IQ")}`;
};

// ----------------------------------------------------------------------
// مكون حقل التعديل المباشر
// ----------------------------------------------------------------------
function DoubleTapEdit({ value, onSave, className = "" }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(value);

  useEffect(() => {
    setVal(value);
  }, [value]);

  const handleSave = () => {
    setEdit(false);
    if (val !== value) onSave(val);
  };

  if (edit) {
    return (
      <div className="absolute inset-0 z-20 bg-background flex items-center p-0.5">
        <input
          autoFocus
          className={`w-full h-full outline-none bg-background text-[11px] font-sans font-extrabold border-2 border-primary rounded px-1 ${className}`}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        />
      </div>
    );
  }

  return (
    <div
      onDoubleClick={() => setEdit(true)}
      className={`cursor-pointer hover:bg-primary/10 w-full h-full min-h-[30px] flex items-center text-[11px] font-sans font-extrabold transition-colors relative ${className}`}
      title="انقر مرتين للتعديل"
    >
      {value}
    </div>
  );
}

// ----------------------------------------------------------------------
// المكون الرئيسي
// ----------------------------------------------------------------------
export default function Invoices() {
  const [traders, setTraders] = useState([]);
  const [draftInvoices, setDraftInvoices] = useState([]);
  const [activeDrivers, setActiveDrivers] = useState([]);
  const [allDrivers, setAllDrivers] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  const [selectedTrader, setSelectedTrader] = useState(null);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [searchTrader, setSearchTrader] = useState("");
  const [newTraderName, setNewTraderName] = useState("");

  const [pinnedTraderIds, setPinnedTraderIds] = useState(() => {
    try {
      const saved = localStorage.getItem("pinned_traders");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [openedTraderIds, setOpenedTraderIds] = useState([]);

  const [localPaid, setLocalPaid] = useState("");
  const [localNotes, setLocalNotes] = useState("");

  // ترتيب حقول النموذج الجديد حسب الطلب (السائق أولاً، ثم المادة، الوزن، السعر، العدد، سعر السلة، الحمالية، العمولة)
  const [newItem, setNewItem] = useState({
    driver_id: null, driver_label: "", product_name: "",
    grossWeight: "", price: "", basketCount: "",
    basketPrice: "", porterage: "", commissionRate: "", basketWeightEach: "", manualFinal: ""
  });

  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteTrader, setConfirmDeleteTrader] = useState(null);
  const [confirmPostAll, setConfirmPostAll] = useState(false);

  const [printInv, setPrintInv] = useState(null);
  const [printItems, setPrintItems] = useState([]);

  const defaultCommission = Number(settings.default_commission ?? 0);
  const defaultBasketWeightEach = normalizeBasketWeightEach(settings.basket_weight ?? 0);
  const defaultBasketPrice = Number(settings.basket_price ?? 0) || 0;
  const defaultPorterage = Number(settings.porterage ?? 0) || 0;
  const marketName = settings.market_name || "مكتب الموصل";

  const productItems = useMemo(() => {
    return (settings.products_list ?? "")
      .split("\n").map(p => p.trim()).filter(p => p.length > 0)
      .map(name => ({ id: name, label: name }));
  }, [settings.products_list]);

  const activeDriverItems = useMemo(() => {
    return activeDrivers.map(d => ({ id: d.id, label: d.name }));
  }, [activeDrivers]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [allInv, tr, dr, allDr, st] = await Promise.all([
        getInvoices(), getTraders(), getActiveDrivers(), getDrivers(), getAllSettings(),
      ]);
      setTraders(tr);
      setActiveDrivers(dr);
      setAllDrivers(allDr);
      setSettings(st);

      const drafts = allInv.filter(inv => inv.status === "draft");
      setDraftInvoices(drafts);

      if (selectedTrader) {
        const draft = drafts.find(d => d.trader_id === selectedTrader.id);
        setCurrentInvoice(draft || null);
        if (draft) {
          const items = await getInvoiceItems(draft.id);
          setInvoiceItems(items);
        } else {
          setInvoiceItems([]);
        }
      }
    } catch (e) {
      console.error("خطأ في التحميل:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedTrader]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (currentInvoice) {
      setLocalPaid(currentInvoice.paid_amount != null ? formatNumberWithCommas(fromInt(currentInvoice.paid_amount)) : "");
      setLocalNotes(currentInvoice.notes || "");
    } else {
      setLocalPaid("");
      setLocalNotes("");
    }
  }, [currentInvoice]);

  const filteredTraders = useMemo(() => {
    let list = traders;
    if (searchTrader.trim()) {
      list = list.filter(t => t.name.toLowerCase().includes(searchTrader.toLowerCase()));
    }
    return list;
  }, [traders, searchTrader]);

  const pinnedTradersList = useMemo(() => {
    return filteredTraders.filter(t => pinnedTraderIds.includes(t.id));
  }, [filteredTraders, pinnedTraderIds]);

  const normalTradersList = useMemo(() => {
    return filteredTraders.filter(t => {
      if (pinnedTraderIds.includes(t.id)) return false;
      if (searchTrader.trim()) return true;
      const hasDraft = draftInvoices.some(d => d.trader_id === t.id);
      const isOpened = openedTraderIds.includes(t.id);
      return hasDraft || isOpened;
    });
  }, [filteredTraders, pinnedTraderIds, draftInvoices, searchTrader, openedTraderIds]);

  const allFlattenedTraders = useMemo(() => {
    return [...normalTradersList, ...pinnedTradersList];
  }, [normalTradersList, pinnedTradersList]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      if (allFlattenedTraders.length === 0) return;

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const currentIndex = allFlattenedTraders.findIndex(t => t.id === selectedTrader?.id);
        let nextIndex = 0;

        if (currentIndex === -1) {
          nextIndex = 0;
        } else if (e.key === "ArrowDown") {
          nextIndex = (currentIndex + 1) % allFlattenedTraders.length;
        } else {
          nextIndex = (currentIndex - 1 + allFlattenedTraders.length) % allFlattenedTraders.length;
        }

        handleSelectTrader(allFlattenedTraders[nextIndex]);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [allFlattenedTraders, selectedTrader]);

  const liveTotals = useMemo(() => {
    if (!currentInvoice || invoiceItems.length === 0) return { total_final: 0, paid_amount: 0, remaining: 0 };

    const computedItems = invoiceItems.map(it => ({
      finalAmount: fromInt(it.final_amount) || 0
    }));

    const totalFinal = computedItems.reduce((acc, curr) => acc + curr.finalAmount, 0);
    const paid = cleanCommas(localPaid);
    const remaining = totalFinal - paid;

    return {
      total_final: totalFinal,
      paid_amount: paid,
      remaining: remaining > 0 ? remaining : 0
    };
  }, [invoiceItems, localPaid, currentInvoice]);

  async function handleAddTrader(e) {
    e.preventDefault();
    if (!newTraderName.trim()) return;
    try {
      const id = await findOrCreateTrader(newTraderName.trim());
      setNewTraderName("");
      await loadData();
      const updatedTraders = await getTraders();
      const newTrader = updatedTraders.find(t => t.id === id);
      if (newTrader) {
        handleSelectTrader(newTrader);
        setSearchTrader("");
      }
    } catch (err) {
      alert("خطأ أثناء إضافة البگال");
    }
  }

  async function handleDeleteTraderAction() {
    try {
      if (!confirmDeleteTrader) return;
      await deleteTrader(confirmDeleteTrader.id);
      setOpenedTraderIds(prev => prev.filter(id => id !== confirmDeleteTrader.id));
      if (selectedTrader?.id === confirmDeleteTrader.id) setSelectedTrader(null);
      setConfirmDeleteTrader(null);
      await loadData();
    } catch (err) {
      alert("خطأ أثناء الحذف. قد يكون البگال مرتبطاً بفواتير سابقة لا يمكن حذفها.");
    }
  }

  async function handleSelectTrader(trader) {
    setSelectedTrader(trader);
    setOpenedTraderIds(prev => prev.includes(trader.id) ? prev : [...prev, trader.id]);

    const draft = draftInvoices.find(d => d.trader_id === trader.id);
    if (draft) {
      setCurrentInvoice(draft);
      const items = await getInvoiceItems(draft.id);
      setInvoiceItems(items);
    } else {
      setCurrentInvoice(null);
      setInvoiceItems([]);
    }
  }

  const togglePinTrader = (e, traderId) => {
    e.stopPropagation();
    let updated;
    if (pinnedTraderIds.includes(traderId)) {
      updated = pinnedTraderIds.filter(id => id !== traderId);
    } else {
      updated = [...pinnedTraderIds, traderId];
    }
    setPinnedTraderIds(updated);
    try {
      localStorage.setItem("pinned_traders", JSON.stringify(updated));
    } catch {}
  };

  const handleNewItemChange = (field, val) => {
    setNewItem({ ...newItem, [field]: formatNumberWithCommas(val.replace(/[^0-9.]/g,"")) });
  };

  async function handleAddNewItem(e) {
    e.preventDefault();
    if (!selectedTrader) return alert("الرجاء اختيار بگال أولاً");
    if (!newItem.product_name) return alert("اسم المادة مطلوب");

    try {
      let invId = currentInvoice?.id;
      if (!invId) {
        invId = await createInvoice({ trader_id: selectedTrader.id, driver_id: null, date: getLocalDateTimeString(), notes: null });
      }

      let dId = newItem.driver_id;
      if (!dId && newItem.driver_label?.trim()) {
        const trimmed = newItem.driver_label.trim();
        const existing = allDrivers.find(d => d.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) { dId = existing.id; await openDriverSheet(dId); }
        else { dId = await findOrCreateDriver(trimmed); }
      }

      const cleanGross = cleanCommas(newItem.grossWeight);
      const cleanPrice = cleanCommas(newItem.price);
      const cleanBasketCount = cleanCommas(newItem.basketCount);
      const cleanBasketWt = defaultBasketWeightEach;
      const cleanCommRate = newItem.commissionRate !== "" ? cleanCommas(newItem.commissionRate) : (defaultCommission / 100);
      const cleanPortVal = newItem.porterage !== "" ? cleanCommas(newItem.porterage) : defaultPorterage;
      const cleanBasketPrice = newItem.basketPrice !== "" ? cleanCommas(newItem.basketPrice) : defaultBasketPrice;
      const cleanManualFinal = newItem.manualFinal !== "" ? cleanCommas(newItem.manualFinal) : null;

      const computed = computeInvoiceItem({
        grossWeight: cleanGross, basketCount: cleanBasketCount, basketWeightEach: cleanBasketWt,
        price: cleanPrice, basketPrice: cleanBasketPrice, commissionRate: cleanCommRate,
        porterage: cleanPortVal * cleanBasketCount, manualFinal: cleanManualFinal,
      });

      await upsertInvoiceItem({
        ...computed, id: null, invoice_id: invId, product_name: newItem.product_name, driver_id: dId,
      });

      const updatedItems = await getInvoiceItems(invId);
      const currentTotals = {
        total_final: updatedItems.reduce((acc, it) => acc + (fromInt(it.final_amount) || 0), 0),
        paid_amount: cleanCommas(localPaid),
        remaining: 0
      };
      currentTotals.remaining = Math.max(0, currentTotals.total_final - currentTotals.paid_amount);

      await updateInvoiceTotals(invId, currentTotals);

      setNewItem({ ...newItem, grossWeight: "", basketCount: "", price: "", basketPrice: "", porterage: "", commissionRate: "", manualFinal: "" });
      await loadData();
    } catch (err) {
      console.error(err);
      alert("حدث خطأ أثناء الإضافة");
    }
  }

  async function handleInlineEdit(itemId, field, newFormattedValue) {
    if (!currentInvoice) return;
    try {
      const itemToUpdate = invoiceItems.find(it => it.id === itemId);
      if (!itemToUpdate) return;

      const overrides = {
        grossWeight: field === 'gross_weight' ? cleanCommas(newFormattedValue) : fromInt(itemToUpdate.gross_weight),
        basketCount: field === 'basket_count' ? cleanCommas(newFormattedValue) : itemToUpdate.basket_count,
        price: field === 'price' ? cleanCommas(newFormattedValue) : fromInt(itemToUpdate.price),
        commissionRate: field === 'commission_rate' ? cleanCommas(newFormattedValue) : fromInt(itemToUpdate.commission_rate),
        porterage: field === 'porterage' ? cleanCommas(newFormattedValue) : (itemToUpdate.basket_count ? fromInt(itemToUpdate.porterage)/itemToUpdate.basket_count : defaultPorterage),
        basketWeightEach: itemToUpdate.basket_weight_each || defaultBasketWeightEach,
      };

      const computed = computeInvoiceItem({
        ...overrides,
        basketPrice: fromInt(itemToUpdate.basket_price || defaultBasketPrice),
        porterage: overrides.porterage * overrides.basketCount,
        manualFinal: null,
      });

      await upsertInvoiceItem({ ...computed, id: itemId, invoice_id: currentInvoice.id, product_name: itemToUpdate.product_name, driver_id: itemToUpdate.driver_id });

      const updatedItems = await getInvoiceItems(currentInvoice.id);
      const totalFinal = updatedItems.reduce((acc, it) => acc + (fromInt(it.final_amount) || 0), 0);
      const paid = cleanCommas(localPaid);

      const totals = {
        total_final: totalFinal,
        paid_amount: paid,
        remaining: Math.max(0, totalFinal - paid)
      };

      await updateInvoiceTotals(currentInvoice.id, totals);
      await loadData();
    } catch (e) {
      alert("خطأ في تحديث البند");
    }
  }

  async function handleDriverEdit(itemId, newDriverName) {
    if (!currentInvoice) return;
    try {
      const itemToUpdate = invoiceItems.find(it => it.id === itemId);
      if (!itemToUpdate) return;

      let dId = null;
      const trimmed = newDriverName ? newDriverName.trim().replace(/^—$/, "") : "";

      if (trimmed !== "") {
        const existing = allDrivers.find(d => d.name.toLowerCase() === trimmed.toLowerCase());
        if (existing) {
          dId = existing.id;
        } else {
          dId = await findOrCreateDriver(trimmed);
        }
      }

      const overrides = {
        grossWeight: fromInt(itemToUpdate.gross_weight),
        basketCount: itemToUpdate.basket_count,
        price: fromInt(itemToUpdate.price),
        commissionRate: fromInt(itemToUpdate.commission_rate),
        porterage: itemToUpdate.basket_count ? fromInt(itemToUpdate.porterage)/itemToUpdate.basket_count : defaultPorterage,
        basketWeightEach: itemToUpdate.basket_weight_each || defaultBasketWeightEach,
      };

      const computed = computeInvoiceItem({
        ...overrides,
        basketPrice: fromInt(itemToUpdate.basket_price || defaultBasketPrice),
        porterage: overrides.porterage * overrides.basketCount,
        manualFinal: fromInt(itemToUpdate.final_amount),
      });

      await upsertInvoiceItem({
        ...computed,
        id: itemId,
        invoice_id: currentInvoice.id,
        product_name: itemToUpdate.product_name,
        driver_id: dId
      });

      await loadData();
    } catch (e) {
      alert("خطأ في تحديث السائق");
    }
  }

  async function handleDeleteItem(itemId) {
    if(!confirm("هل أنت متأكد من حذف هذا البند؟")) return;
    try {
      await deleteInvoiceItem(itemId);
      const updatedItems = await getInvoiceItems(currentInvoice.id);
      const totalFinal = updatedItems.reduce((acc, it) => acc + (fromInt(it.final_amount) || 0), 0);
      const paid = cleanCommas(localPaid);

      const totals = {
        total_final: totalFinal,
        paid_amount: paid,
        remaining: Math.max(0, totalFinal - paid)
      };

      await updateInvoiceTotals(currentInvoice.id, totals);
      await loadData();
    } catch (e) {
      alert("خطأ في الحذف");
    }
  }

  const saveInvoiceInfo = async () => {
    if (!currentInvoice) return;
    await updateInvoiceTotals(currentInvoice.id, {
      total_final: liveTotals.total_final,
      paid_amount: liveTotals.paid_amount,
      remaining: liveTotals.remaining,
      notes: localNotes
    });
    await loadData();
  };

  const handlePayAll = async () => {
    if (liveTotals.total_final > 0) {
      const fullAmount = Math.round(liveTotals.total_final).toString();
      setLocalPaid(formatNumberWithCommas(fullAmount));

      const updatedTotals = {
        total_final: liveTotals.total_final,
        paid_amount: Number(fullAmount),
        remaining: 0,
        notes: localNotes
      };
      await updateInvoiceTotals(currentInvoice.id, updatedTotals);
      await loadData();
    }
  };

  async function handlePostInvoice() {
    try {
      await saveInvoiceInfo();
      await postInvoice(currentInvoice.id);
      setOpenedTraderIds(prev => prev.filter(id => id !== selectedTrader?.id));
      setConfirmPost(false);
      setSelectedTrader(null);
      await loadData();
    } catch (e) {
      alert("خطأ أثناء الترحيل");
    }
  }

  async function handlePostAllInvoices() {
    try {
      const draftTraderIds = draftInvoices.map(d => d.trader_id);
      for (const inv of draftInvoices) {
        await postInvoice(inv.id);
      }
      setOpenedTraderIds(prev => prev.filter(id => !draftTraderIds.includes(id)));
      setConfirmPostAll(false);
      setSelectedTrader(null);
      await loadData();
    } catch (e) {
      alert("خطأ أثناء ترحيل القوائم");
    }
  }

  async function handleDeleteInvoice() {
    try {
      await deleteInvoice(currentInvoice.id);
      setOpenedTraderIds(prev => prev.filter(id => id !== selectedTrader?.id));
      setConfirmDelete(false);
      setSelectedTrader(null);
      await loadData();
    } catch (e) {
      alert("خطأ أثناء الحذف");
    }
  }

  useEffect(() => {
    if (printInv && printItems.length > 0) {
      window.print();
      setTimeout(() => {
        setPrintInv(null);
        setPrintItems([]);
      }, 0);
    }
  }, [printInv, printItems]);

  const handlePrintInvoice = async () => {
    if (!currentInvoice) return;
    await saveInvoiceInfo();
    setPrintInv({
      ...currentInvoice,
      trader_name: selectedTrader?.name || "—",
      total_final: liveTotals.total_final,
      paid_amount: liveTotals.paid_amount,
      remaining: liveTotals.remaining,
      notes: localNotes
    });
    setPrintItems([...invoiceItems]);
  };

  const textInputClass = "w-full rounded border-2 border-slate-300 bg-background px-1.5 h-7 text-[11px] font-bold outline-none focus:border-primary font-sans";
  const labelClass = "text-[11px] text-slate-700 block mb-0.5 font-bold";

  return (
    <>
      <style>{`
        @media print {
          body { margin:0; padding:0; direction:rtl; background:#fff!important; -webkit-print-color-adjust:exact!important; print-color-adjust:exact!important; }
          @page { size:A5 landscape; margin:0.4cm; }
          body * { visibility:hidden!important; }
          .print-area, .print-area * { visibility:visible!important; }
          .print-area { position:absolute!important; left:0!important; top:0!important; width:100%!important; padding:0!important; display:block!important; }
          .no-print { display:none!important; }
        }
        .invoice-book-container { border:2px solid #000!important; padding:14px; background:#fff!important; font-family:'Cairo',sans-serif; box-sizing:border-box; width:100%; direction:rtl; }
        .flex-row-header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #000; padding-bottom:6px; }
        .flex-row-info { display:flex; justify-content:space-between; margin-top:10px; border-bottom:1px solid #000; padding-bottom:6px; font-size:13px; }
        .info-item { display:flex; align-items:center; gap:4px; width:48%; }
        .dotted-line { border-bottom:1px dotted #000; flex-grow:1; padding-bottom:2px; font-weight:bold; font-size:14px; }
        .invoice-book-table { width:100%; border-collapse:collapse; margin-top:12px; margin-bottom:12px; }
        .invoice-book-table th { background:#7f1d1d!important; color:#fff!important; border:1px solid #000!important; padding:6px 4px; font-size:13px; font-weight:bold; text-align:center; -webkit-print-color-adjust:exact!important; }
        .invoice-book-table td { border:1px solid #000!important; padding:6px; font-size:13px; text-align:center; height:38px; color:#000!important; }
        .border-box-office { border:1px solid #000; padding:2px 8px; font-weight:bold; font-size:12px; border-radius:3px; }
        .hidden-print-preview { display:none; }
      `}</style>

      <div className="flex flex-col md:flex-row gap-3 p-2 w-full h-[calc(100vh-5.5rem)] overflow-hidden bg-slate-100 no-print">

        {/* ─── القائمة الجانبية (البگاكيل) ─── */}
        <div className="w-full md:w-1/4 lg:w-1/5 flex flex-col border-2 border-slate-300 rounded-lg bg-background shadow-md h-full overflow-hidden shrink-0 no-print">
          <div className="p-2 border-b-2 border-slate-300 bg-slate-200 shrink-0">
            <h3 className="font-extrabold text-[13px] mb-2 px-1 flex items-center gap-1.5 text-slate-900">
              <User size={15} /> البگاكيل
            </h3>
            <form onSubmit={handleAddTrader} className="flex gap-1 mb-2">
              <input value={newTraderName} onChange={(e) => setNewTraderName(e.target.value)} placeholder="إضافة بگال جديد..." className="flex-1 rounded border-2 border-slate-300 bg-background px-2 py-1 h-7 text-[11px] font-bold text-slate-900 outline-none focus:border-primary" />
              <button type="submit" disabled={!newTraderName.trim()} className="bg-primary text-primary-foreground h-7 w-7 rounded flex items-center justify-center disabled:opacity-50 font-bold">
                <Plus size={15} />
              </button>
            </form>
            <input value={searchTrader} onChange={(e) => setSearchTrader(e.target.value)} placeholder="بحث عن بگال..." className="w-full rounded border-2 border-slate-300 bg-background px-2 py-1 h-7 text-[11px] font-bold text-slate-900 outline-none focus:border-primary" />
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {/* البگاكيل العاديون */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-1.5 space-y-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="text-[10px] font-extrabold text-slate-600 px-1 py-0.5 sticky top-0 bg-background z-10 flex items-center gap-1 border-b border-slate-200">
                <Users size={12}/> البگاكيل العاديون ({normalTradersList.length})
              </div>
              {normalTradersList.map((trader) => {
                const isSelected = selectedTrader?.id === trader.id;
                const hasDraft = draftInvoices.some(d => d.trader_id === trader.id);
                return (
                  <div key={trader.id} onClick={() => handleSelectTrader(trader)} className={`w-full px-2.5 py-1.5 rounded-md flex items-center justify-between text-[12px] font-bold transition-colors cursor-pointer border ${isSelected ? "bg-primary text-primary-foreground border-primary shadow ring-2 ring-primary" : "bg-white border-slate-200 hover:bg-slate-100 text-slate-800"}`}>
                    <span className="truncate flex-1">{trader.name}</span>
                    <div className="flex items-center gap-1.5">
                      {hasDraft && <span className="h-2 w-2 rounded-full bg-slate-500" title="توجد قائمة مفتوحة" />}
                      <button
                        type="button"
                        onClick={(e) => togglePinTrader(e, trader.id)}
                        className={`p-1 rounded hover:bg-slate-200 transition-colors ${isSelected ? 'text-white/90 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                        title="تحويل إلى دائم"
                      >
                        <Pin size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {normalTradersList.length === 0 && <div className="text-center text-[10px] text-slate-400 py-2">لا يوجد بگاكيل</div>}
            </div>

            <div className="shrink-0 relative flex items-center justify-center my-1">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-slate-300" /></div>
              <span className="relative bg-slate-200 text-slate-700 px-2 py-0.5 text-[10px] font-extrabold rounded-full border border-slate-300 shadow-sm">
                الدائمون
              </span>
            </div>

            {/* الدائمون */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-1.5 space-y-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="text-[10px] font-extrabold text-slate-700 px-1 py-0.5 sticky top-0 bg-background z-10 flex items-center gap-1 border-b border-slate-200">
                <Pin size={11} className="fill-current text-slate-700"/> الدائمون ({pinnedTradersList.length})
              </div>
              {pinnedTradersList.map((trader) => {
                const isSelected = selectedTrader?.id === trader.id;
                const hasDraft = draftInvoices.some(d => d.trader_id === trader.id);
                return (
                  <div key={trader.id} onClick={() => handleSelectTrader(trader)} className={`w-full px-2.5 py-1.5 rounded-md flex items-center justify-between text-[12px] font-bold transition-colors cursor-pointer border ${isSelected ? "bg-primary text-primary-foreground border-primary shadow ring-2 ring-primary" : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-900"}`}>
                    <span className="truncate flex-1">{trader.name}</span>
                    <div className="flex items-center gap-1.5">
                      {hasDraft && <span className="h-2 w-2 rounded-full bg-slate-600" title="توجد قائمة مفتوحة" />}
                      <button
                        type="button"
                        onClick={(e) => togglePinTrader(e, trader.id)}
                        className={`p-1 rounded hover:bg-slate-200 transition-colors ${isSelected ? 'text-white' : 'text-slate-600'}`}
                        title="إلغاء التثبيت"
                      >
                        <Pin size={12} className="fill-current" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {pinnedTradersList.length === 0 && <div className="text-center text-[10px] text-slate-400 py-2">لا يوجد دائمون</div>}
            </div>

          </div>
        </div>

        {/* ─── القسم الرئيسي (إدخال بنود الفاتورة) ─── */}
        <div className="w-full md:w-3/4 lg:w-4/5 flex flex-col gap-3 h-full overflow-hidden">

          <div className="shrink-0 border-2 border-slate-300 rounded-lg bg-background shadow-md p-2.5 flex flex-col">
            <div className="flex items-center justify-between border-b-2 border-slate-200 pb-1.5 mb-2.5 px-1">
              <h3 className="font-extrabold text-[12px] text-slate-900 flex items-center gap-1.5">
                <PlusCircle size={15} className="text-primary" />
                {selectedTrader ? (
                  <>
                    إضافة مادة لقائمة البگال: {selectedTrader.name}
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTrader(selectedTrader)}
                      className="text-destructive hover:bg-destructive/10 p-1 rounded transition-colors mr-2"
                      title="حذف البگال نهائياً"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                ) : (
                  "اختر بگال من القائمة الجانبية للبدء"
                )}
              </h3>
              <button
                type="button"
                onClick={() => setConfirmPostAll(true)}
                disabled={draftInvoices.length === 0}
                className="flex items-center gap-1 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-extrabold text-[11px] px-2.5 h-6 rounded shadow transition-colors"
              >
                <Send size={12} /> ترحيل الكل ({draftInvoices.length})
              </button>
            </div>

            {/* نموذج الإضافة بالترتيب المطلوب: السائق أولاً، ثم المادة، الوزن الكلي، السعر، العدد، سعر السلة، الحمالية، العمولة */}
            <form onSubmit={handleAddNewItem} className="flex flex-col gap-2">

              {/* الصف الأول: السائق، اسم المادة، الوزن الكلي، السعر، العدد */}
              <div className="grid grid-cols-5 gap-2 items-end">
                <div>
                  <label className={labelClass}>السائق</label>
                  <SmallProductCombobox items={activeDriverItems} value={newItem.driver_id || ""} onChange={(id, label) => setNewItem({ ...newItem, driver_id: id, driver_label: label })} placeholder="اختر السائق..." />
                </div>
                <div>
                  <label className={labelClass}>اسم المادة *</label>
                  <SmallProductCombobox items={productItems} value={newItem.product_name} onChange={(id, label) => setNewItem({ ...newItem, product_name: label })} placeholder="بحث المادة..." />
                </div>
                <div>
                  <label className={labelClass}>الوزن الكلي</label>
                  <input type="text" value={newItem.grossWeight} onChange={(e) => handleNewItemChange('grossWeight', e.target.value)} className={textInputClass} placeholder="0" />
                </div>
                <div>
                  <label className={labelClass}>السعر</label>
                  <input type="text" value={newItem.price} onChange={(e) => handleNewItemChange('price', e.target.value)} className={textInputClass} placeholder="0" />
                </div>
                <div>
                  <label className={labelClass}>العدد</label>
                  <input type="text" value={newItem.basketCount} onChange={(e) => handleNewItemChange('basketCount', e.target.value)} className={textInputClass} placeholder="0" />
                </div>
              </div>

              {/* الصف الثاني: سعر السلة، الحمالية/سلة، العمولة %، نهائي يدوي، زر الإضافة */}
              <div className="grid grid-cols-5 gap-2 items-end pt-1">
                <div>
                  <label className={labelClass}>سعر السلة</label>
                  <input type="text" value={newItem.basketPrice} onChange={(e) => handleNewItemChange('basketPrice', e.target.value)} className={textInputClass} placeholder={`${defaultBasketPrice}`} />
                </div>
                <div>
                  <label className={labelClass}>حمالية/سلة</label>
                  <input type="text" value={newItem.porterage} onChange={(e) => handleNewItemChange('porterage', e.target.value)} className={textInputClass} placeholder={`${defaultPorterage}`} />
                </div>
                <div>
                  <label className={labelClass}>العمولة %</label>
                  <input type="text" value={newItem.commissionRate} onChange={(e) => handleNewItemChange('commissionRate', e.target.value)} className={textInputClass} placeholder={`${defaultCommission/100}`} />
                </div>
                <div>
                  <label className={labelClass}>نهائي (يدوي)</label>
                  <input type="text" value={newItem.manualFinal} onChange={(e) => handleNewItemChange('manualFinal', e.target.value)} className={`${textInputClass} border-dashed`} placeholder="تلقائي" />
                </div>
                <div>
                  <button type="submit" disabled={!selectedTrader || !newItem.product_name} className="w-full h-7 rounded bg-primary text-primary-foreground text-[11px] font-extrabold hover:bg-primary/90 disabled:opacity-50 shadow transition-colors">
                    إضافة البند
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* الجدول الحالي */}
          <div className="flex-1 flex flex-col border-2 border-slate-300 rounded-lg bg-background shadow-md overflow-hidden relative">
            {!selectedTrader ? (
               <div className="flex-1 flex items-center justify-center text-slate-500 font-bold text-[12px]">الرجاء اختيار بگال لفتح القائمة</div>
            ) : !currentInvoice ? (
               <div className="flex-1 flex items-center justify-center text-slate-500 font-bold text-[12px]">لا توجد قائمة مفتوحة حالياً، أضف مادة للبدء.</div>
            ) : (
              <>
                <div className="flex-1 overflow-auto bg-slate-50 relative [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <table className="w-full text-[11px] text-center border-collapse">
                    <thead className="sticky top-0 bg-slate-200 shadow border-b-2 border-slate-300 z-10">
                      <tr>
                        <th className="py-2.5 px-1 font-extrabold text-slate-800">المادة / السائق</th>
                        <th className="py-2.5 px-1 font-extrabold text-slate-800 border-r-2 border-slate-300">الوزن</th>
                        <th className="py-2.5 px-1 font-extrabold text-slate-800 border-r-2 border-slate-300">العدد</th>
                        <th className="py-2.5 px-1 font-extrabold text-slate-800 border-r-2 border-slate-300">السعر</th>
                        <th className="py-2.5 px-1 font-extrabold text-slate-800 border-r-2 border-slate-300">العمولة %</th>
                        <th className="py-2.5 px-1 font-extrabold text-slate-800 border-r-2 border-slate-300 hidden md:table-cell">حمالية/سلة</th>
                        <th className="py-2.5 px-1 font-extrabold text-slate-800 border-r-2 border-slate-300 bg-slate-300/50">الصافي</th>
                        <th className="py-2.5 px-1 font-extrabold text-primary border-r-2 border-slate-300 bg-primary/10">النهائي</th>
                        <th className="py-2.5 px-1 w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceItems.map((it) => (
                        <tr key={it.id} className="border-b-2 border-slate-200 hover:bg-slate-100 group relative">
                          <td className="py-2 px-1 text-right">
                            <div className="font-extrabold text-slate-900 truncate max-w-[120px]">{it.product_name}</div>
                            <div className="max-w-[120px]">
                              <DoubleTapEdit
                                value={it.driver_name || "—"}
                                onSave={(v) => handleDriverEdit(it.id, v)}
                                className="text-[10px] font-bold text-slate-500 justify-start px-0.5 text-right w-full"
                              />
                            </div>
                          </td>
                          <td className="border-r-2 border-slate-200 p-0 relative h-[34px]">
                            <DoubleTapEdit value={formatNumberWithCommas(fromInt(it.gross_weight))} onSave={(v) => handleInlineEdit(it.id, 'gross_weight', v)} />
                          </td>
                          <td className="border-r-2 border-slate-200 p-0 relative h-[34px]">
                            <DoubleTapEdit value={formatNumberWithCommas(it.basket_count)} onSave={(v) => handleInlineEdit(it.id, 'basket_count', v)} />
                          </td>
                          <td className="border-r-2 border-slate-200 p-0 relative h-[34px]">
                            <DoubleTapEdit value={formatNumberWithCommas(fromInt(it.price))} onSave={(v) => handleInlineEdit(it.id, 'price', v)} className="text-slate-900 font-extrabold" />
                          </td>
                          <td className="border-r-2 border-slate-200 p-0 relative h-[34px]">
                            <DoubleTapEdit value={formatNumberWithCommas(fromInt(it.commission_rate))} onSave={(v) => handleInlineEdit(it.id, 'commission_rate', v)} className="text-slate-900 font-extrabold" />
                          </td>
                          <td className="border-r-2 border-slate-200 p-0 relative h-[34px] hidden md:table-cell">
                            <DoubleTapEdit value={formatNumberWithCommas(it.basket_count ? fromInt(it.porterage)/it.basket_count : defaultPorterage)} onSave={(v) => handleInlineEdit(it.id, 'porterage', v)} />
                          </td>
                          <td className="border-r-2 border-slate-200 p-1 bg-slate-100 font-sans font-bold text-slate-800">{formatMoney(fromInt(it.net_weight), "")}</td>
                          <td className="border-r-2 border-slate-200 p-1 bg-primary/5 font-sans font-extrabold text-primary text-[13px]">{formatMoney(fromInt(it.final_amount), "")}</td>
                          <td className="p-1">
                            <button onClick={() => handleDeleteItem(it.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100 transition-all font-bold">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="shrink-0 bg-slate-200 border-t-2 border-slate-300 p-2.5">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 items-end">

                    <div className="flex flex-col gap-1 bg-background border-2 border-slate-300 p-2 rounded-md shadow-sm">
                      <span className="text-[10px] text-slate-600 font-extrabold">المبلغ النهائي للقائمة</span>
                      <span className="text-base font-extrabold font-sans text-primary">{formatMoney(liveTotals.total_final, "")}</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] text-slate-700 font-extrabold flex justify-between items-end">
                        <span>المبلغ الواصل من البگال</span>
                        <button type="button" onClick={handlePayAll} className="text-primary hover:underline text-[10px] font-extrabold flex items-center gap-0.5 px-1 bg-primary/10 rounded transition-colors">
                           <Check size={11}/> واصل كاملا
                        </button>
                      </label>
                      <input
                        type="text"
                        value={localPaid}
                        onChange={(e) => setLocalPaid(formatNumberWithCommas(e.target.value.replace(/[^0-9.]/g, "")))}
                        onBlur={saveInvoiceInfo}
                        className="w-full rounded border-2 border-slate-400 bg-background px-2 h-8 text-[13px] font-extrabold font-sans text-slate-900 outline-none focus:border-primary shadow-sm"
                        placeholder="0"
                      />
                    </div>

                    <div className="flex flex-col gap-1 bg-background border-2 border-slate-300 p-2 rounded-md shadow-sm">
                      <span className="text-[10px] text-slate-600 font-extrabold">الباقي للديون</span>
                      <span className="text-base font-extrabold font-sans text-slate-900">
                        {formatMoney(liveTotals.remaining, "")}
                      </span>
                    </div>

                    <div className="flex gap-1 items-end h-full">
                      <button onClick={() => setConfirmDelete(true)} className="h-8 w-8 flex items-center justify-center border-2 border-destructive/50 text-destructive bg-destructive/10 hover:bg-destructive/20 rounded-md font-bold shadow-sm" title="حذف القائمة">
                        <Trash2 size={14} />
                      </button>
                      <button onClick={handlePrintInvoice} className="h-8 w-9 flex items-center justify-center border-2 border-slate-400 text-slate-700 bg-white hover:bg-slate-100 rounded-md font-bold shadow-sm" title="طباعة القائمة">
                        <Printer size={14} />
                      </button>
                      <button onClick={() => setConfirmPost(true)} className="flex-1 h-8 flex items-center justify-center gap-1 bg-green-700 text-white font-bold text-[11px] rounded-md shadow hover:bg-green-800 transition-colors">
                        <CheckCircle size={14} /> ترحيل
                      </button>
                    </div>

                  </div>
                  <div className="mt-2">
                      <input
                        value={localNotes}
                        onChange={(e) => setLocalNotes(e.target.value)}
                        onBlur={saveInvoiceInfo}
                        placeholder="ملاحظات على القائمة..."
                        className="w-full rounded border-2 border-slate-300 bg-background px-2.5 h-7 text-[11px] font-bold text-slate-900 outline-none focus:border-primary shadow-sm"
                      />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── قالب الطباعة المخفي ─── */}
      {printInv && printItems.length > 0 && (
        <div className="hidden-print-preview print-area">
          <div className="invoice-book-container">
            <div className="flex-row-header">
              <div style={{ textAlign: "right" }}>
                <h2 className="text-xl font-black text-red-900" style={{ margin: 0 }}>
                  {marketName}
                </h2>
                <p style={{ margin: "4px 0 0 0", fontSize: "11px", fontWeight: "bold", color: "#000" }}>
                  مُجاز لبيع الفواكه والخُضر بالجملة
                </p>
                <p style={{ margin: 0, fontSize: "11px", color: "#4b5563" }}>
                  موصل - سوق جملة نينوى - الأيمن
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                <div className="border-box-office text-black">
                  رقم المكتب ( ٣٥ )
                </div>
                <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#000" }}>
                  ID: #{printInv.id?.toString().slice(0, 8)}
                </div>
              </div>
            </div>
            <div className="flex-row-info text-black">
              <div className="info-item">
                <span className="font-bold">حضرة السيد :</span>
                <span className="dotted-line">
                  {printInv.trader_name}
                </span>
              </div>
              <div className="info-item">
                <span className="font-bold">التاريخ والوقت :</span>
                <span className="dotted-line" style={{ fontFamily: "monospace" }}>
                  {formatViewDateTime(printInv.date)}
                </span>
              </div>
            </div>
            <table className="invoice-book-table">
              <thead>
                <tr>
                  <th style={{ width: "5%" }}>ت</th>
                  <th style={{ width: "22%" }}>المبلغ</th>
                  <th style={{ width: "13%" }}>الوزن</th>
                  <th style={{ width: "13%" }}>السعر</th>
                  <th style={{ width: "11%" }}>العدد</th>
                  <th style={{ width: "20%" }}>النوع (المادة)</th>
                  <th style={{ width: "16%" }}>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {printItems.map((it, idx) => (
                  <tr key={it.id}>
                    <td>{idx + 1}</td>
                    <td className="font-bold">
                      {fromInt(it.final_amount).toLocaleString("en-US", { numberingSystem: "latn" })}
                    </td>
                    <td>
                      {fromInt(it.net_weight) === 0 ? "—" : fromInt(it.net_weight).toLocaleString("en-US", { numberingSystem: "latn" })}
                    </td>
                    <td>
                      {fromInt(it.price) === 0 ? "—" : fromInt(it.price).toLocaleString("en-US", { numberingSystem: "latn" })}
                    </td>
                    <td>
                      {it.basket_count ? it.basket_count.toLocaleString("en-US", { numberingSystem: "latn" }) : "—"}
                    </td>
                    <td style={{ fontWeight: "700" }}>{it.product_name}</td>
                    <td>جملة</td>
                  </tr>
                ))}
                {printItems.length < 4 &&
                  Array.from({ length: 4 - printItems.length }).map((_, i) => (
                    <tr key={`e-${i}`}>
                      <td>{printItems.length + i + 1}</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  ))}
              </tbody>
            </table>

            <div className="flex justify-between items-start mt-2 text-black text-[12px]">
              <div className="signatures flex-1 flex justify-around pt-6">
                <div>توقيع الحسابات: ........................</div>
                <div>توقيع المستلم: ........................</div>
              </div>
              <div className="flex flex-col gap-1 text-[11px] border border-black p-2 bg-gray-50 min-w-[240px]">
                <div className="flex justify-between">
                  <span>الحساب الإجمالي:</span>
                  <span className="font-bold">
                    {formatMoney(printInv.total_final)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-dashed border-black pt-1">
                  <span>المبلغ الواصل:</span>
                  <span className="font-bold text-green-800">
                    {formatMoney(printInv.paid_amount)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-black pt-1 font-bold">
                  <span>المتبقي :</span>
                  <span className="font-black text-red-700">
                    {formatMoney(printInv.remaining)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 text-[10px] text-gray-600 border-t border-dashed border-black pt-1">
              <span>
                ملاحظات الفاتورة: {printInv.notes || "لا يوجد ملاحظات إضافية."}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ─── النوافذ الحوارية ─── */}
      <ConfirmDialog
        open={confirmPost} title="ترحيل القائمة"
        message="هل أنت متأكد من ترحيل القائمة؟ سيتم حفظ المبالغ."
        confirmText="ترحيل" onConfirm={handlePostInvoice} onCancel={() => setConfirmPost(false)}
      />
      <ConfirmDialog
        open={confirmPostAll} title="ترحيل كل القوائم"
        message={`هل أنت متأكد من ترحيل جميع القوائم المعلقة (${draftInvoices.length} قائمة)؟`}
        confirmText="ترحيل الكل" onConfirm={handlePostAllInvoices} onCancel={() => setConfirmPostAll(false)}
      />
      <ConfirmDialog
        open={confirmDelete} title="حذف القائمة المفتوحة"
        message="هل تريد بالتأكيد حذف هذه القائمة وكل بنودها؟"
        confirmText="حذف نهائي" danger onConfirm={handleDeleteInvoice} onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={!!confirmDeleteTrader} title="حذف البگال"
        message={`هل تريد بالتأكيد حذف البگال (${confirmDeleteTrader?.name}) نهائياً؟`}
        confirmText="حذف البگال" danger onConfirm={handleDeleteTraderAction} onCancel={() => setConfirmDeleteTrader(null)}
      />
    </>
  );
}
