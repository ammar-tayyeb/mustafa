import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Eye, Trash2, RotateCcw, CheckCircle, Printer, X, PlusCircle, Minus, Check } from "lucide-react";
import {
  getInvoices, getInvoice, createInvoice, updateInvoiceTotals,
  postInvoice, reverseInvoice, deleteInvoice,
  getInvoiceItems, upsertInvoiceItem, deleteInvoiceItem,
  getTraders, getDrivers,  getAllSettings,
} from "../lib/db.js";
import { computeInvoiceItem, computeInvoiceTotals, fromInt, toInt, formatMoney, formatWeight } from "../lib/money.js";
import { findOrCreateTrader, findOrCreateDriver } from "../lib/findOrCreate.js";
import DataTable from "../components/DataTable.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import EntityCombobox from "../components/EntityCombobox.jsx";
import { SmallProductCombobox } from "../components/SmallProductCombobox.jsx";

function getLocalDateTimeString() {
  const tzoffset = (new Date()).getTimezoneOffset() * 60000; 
  const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 19);
  return localISOTime; 
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
  if (!Number.isFinite(numericValue) || numericValue === 0) return 0.5;
  return numericValue > 10 ? numericValue / 100 : numericValue;
}

function emptyItem(defaults = {}) {
  return {
    _key: crypto.randomUUID(),
    id: null,
    product_name: "",
    grossWeight: "",
    basketCount: "",
    basketWeightEach: defaults.basketWeightEach ?? "0.5",
    price: "",
    basketPrice: defaults.basketPrice ?? "250",
    commissionRate: "",
    porterage: defaults.porterage ?? "250", 
    manualFinal: "",
    computed: null,
  };
}

function ItemRow({ item, productItems, defaultCommission, defaultBasketWeightEach, defaultBasketPrice, defaultPorterage, onChange, onRemove }) {
  const c = item.computed;
  const cleanPorterage = cleanCommas(item.porterage);
  const effectivePorterage = item.porterage !== "" ? cleanPorterage : defaultPorterage;
  const currentTotalPorterage = effectivePorterage * (cleanCommas(item.basketCount) || 0);

  function field(key, rawVal) {
    let formattedVal = rawVal;
    
    if (key === "grossWeight" || key === "price" || key === "basketPrice" || key === "manualFinal" || key === "basketCount" || key === "porterage" || key === "commissionRate" || key === "basketWeightEach") {
      const sanitized = rawVal.replace(/[^0-9.]/g, "");
      formattedVal = formatNumberWithCommas(sanitized);
    }

    const updated = { ...item, [key]: formattedVal };
    
    const cleanGross = cleanCommas(updated.grossWeight);
    const cleanPrice = cleanCommas(updated.price);
    const cleanBasketPrice = updated.basketPrice !== "" ? cleanCommas(updated.basketPrice) : defaultBasketPrice;
    const cleanBasketCount = cleanCommas(updated.basketCount);
    const cleanBasketWeightEach = updated.basketWeightEach !== "" ? normalizeBasketWeightEach(updated.basketWeightEach) : defaultBasketWeightEach;
    const cleanCommRate = updated.commissionRate !== "" ? cleanCommas(updated.commissionRate) : (defaultCommission / 100);
    const currentPorterageValue = updated.porterage !== "" ? cleanCommas(updated.porterage) : defaultPorterage;
    
    const totalPorterage = currentPorterageValue * cleanBasketCount;
    const cleanManualFinal = updated.manualFinal !== "" ? cleanCommas(updated.manualFinal) : null;

    const computed = computeInvoiceItem({
      grossWeight:      cleanGross || "",
      basketCount:      cleanBasketCount || "",
      basketWeightEach: cleanBasketWeightEach,
      price:            cleanPrice || "",
      basketPrice:      cleanBasketPrice || "",
      commissionRate:   cleanCommRate,
      porterage:        totalPorterage, 
      manualFinal:      cleanManualFinal,
    });
    
    onChange({ ...updated, computed });
  }

  const textInputClass = "w-full rounded border border-input bg-background px-1 py-0.5 text-[11px] h-6 outline-none focus:ring-1 focus:ring-ring text-center font-sans font-medium";
  const labelClass = "text-[10px] text-muted-foreground text-center block mb-0.5 font-medium";

  return (
    <div className="rounded border border-border bg-muted/20 p-1 flex flex-col gap-0.5 text-[11px]">
      <div className="grid grid-cols-5 gap-1">
        <div className="col-span-2">
          <span className={labelClass}>اسم المادة</span>
          <SmallProductCombobox 
            items={productItems}
            value={item.product_name}
            onChange={(id, label) => field("product_name", label)}
            placeholder="بحث..."
          />
        </div>
        <div>
          <span className={labelClass}>الوزن الكلي</span>
          <input type="text" value={item.grossWeight}
            onChange={e => field("grossWeight", e.target.value)} className={textInputClass} placeholder="0" />
        </div>
        <div>
          <span className={labelClass}>عدد السلات</span>
          <input type="text" value={item.basketCount}
            onChange={e => field("basketCount", e.target.value)} className={textInputClass} placeholder="0" />
        </div>
        <div>
          <span className={labelClass}>السعر</span>
          <input type="text" value={item.price}
            onChange={e => field("price", e.target.value)} className={textInputClass} placeholder="0" />
        </div>
        
      </div>

      <div className="grid grid-cols-5 gap-1 items-end">
        <div>
          <span className={labelClass}>العمولة %</span>
          <input type="text" value={item.commissionRate}
            onChange={e => field("commissionRate", e.target.value)}
            className={textInputClass} placeholder={`${defaultCommission / 100}`} />
        </div>
        <div>
          <span className={labelClass}>وزن السلة</span>
          <input type="text" value={item.basketWeightEach}
            onChange={e => field("basketWeightEach", e.target.value)} className={textInputClass} placeholder="0.5" />
        </div>

        <div>
          <span className={labelClass}>حمالية / سلة</span>
          <input type="text" value={item.porterage}
            onChange={e => field("porterage", e.target.value)} className={textInputClass} placeholder="250" />
        </div>
        <div>
          <span className={labelClass}>سعر السلة</span>
          <input type="text" value={item.basketPrice}
            onChange={e => field("basketPrice", e.target.value)} className={textInputClass} placeholder="0" />
        </div>
        <div>
          <span className={labelClass}>نهائي (يدوي)</span>
          <input type="text" value={item.manualFinal}
            onChange={e => field("manualFinal", e.target.value)}
            className={`${textInputClass} border-dashed`} placeholder="تلقائي" />
        </div>
        <div className="flex items-center justify-center pb-0.5">
          <button type="button" onClick={onRemove} className="p-0.5 rounded hover:bg-destructive/10 text-destructive flex items-center" title="حذف البند">
             حذف  البند
          </button>
        </div>
      </div>

      {c && (
        <div className="grid grid-cols-6 gap-0.5 rounded bg-muted/60 px-1 py-0.5 text-[9.5px] font-sans font-medium mt-0.5">
          <div className="text-center"><span className="text-muted-foreground font-sans font-normal">صافي: </span><span>{formatMoney(c.display.netWeight, "")}</span></div>
          <div className="text-center"><span className="text-muted-foreground font-sans font-normal">قبل: </span><span>{formatMoney(c.display.amountBefore, "")}</span></div>
          <div className="text-center"><span className="text-muted-foreground font-sans font-normal">عمولة: </span><span className="text-orange-600">{formatMoney(c.display.commissionValue, "")}</span></div>
          <div className="text-center"><span className="text-muted-foreground font-sans font-normal">سلة: </span><span className="text-violet-600">{formatMoney(c.display.basketPriceTotal, "")}</span></div>
          <div className="text-center"><span className="text-muted-foreground font-sans font-normal">حمالية: </span><span className="text-blue-600">{currentTotalPorterage.toLocaleString("en-US", { numberingSystem: "latn" })}</span></div>
          <div className="text-center"><span className="text-muted-foreground font-sans font-normal">نهائي: </span><span className="font-bold text-primary">{formatMoney(c.display.finalAmount, "")}</span></div>
        </div>
      )}
    </div>
  );
}

export default function Invoices() {
  const [invoices, setInvoices]   = useState([]);
  const [traders, setTraders]     = useState([]);
  const [drivers, setDrivers]     = useState([]);
  const [settings, setSettings]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const [editInv, setEditInv]     = useState(null);
  const [invForm, setInvForm]     = useState({ trader_id: null, trader_label: "", driver_id: null, driver_label: "",  vehicle_label: "", notes: "" });
  const [items, setItems]         = useState([emptyItem()]);
  const [paidAmount, setPaidAmount] = useState("");
  const [saving, setSaving]       = useState(false);
  const [marketName, setMarketName] = useState("مكتب الموصل");

  const handlePaidChange = (e) => {
    const rawValue = e.target.value.replace(/,/g, ""); 
    if (/^\d*$/.test(rawValue)) setPaidAmount(rawValue);
  };

  const [viewInv, setViewInv]     = useState(null);
  const [viewItems, setViewItems] = useState([]);

  const [confirmPost, setConfirmPost]       = useState(null);
  const [confirmReverse, setConfirmReverse] = useState(null);
  const [confirmDelete, setConfirmDelete]   = useState(null);

  const defaultCommission = Number(settings.default_commission ?? 500); 
  const defaultBasketWeightEach = normalizeBasketWeightEach(settings.basket_weight ?? 0.5);
  const defaultBasketPrice = Number(settings.basket_price ?? 250) || 250;
  const defaultPorterage = Number(settings.porterage ?? 250) || 250;
  const defaultItemValues = useMemo(() => ({
    basketWeightEach: defaultBasketWeightEach.toString(),
    basketPrice: defaultBasketPrice.toString(),
    porterage: defaultPorterage.toString(),
  }), [defaultBasketWeightEach, defaultBasketPrice, defaultPorterage]);

  const productItems = useMemo(() => {
    const prodList = settings.products_list ?? "";
    return prodList
      .split('\n')
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(name => ({ id: name, label: name }));
  }, [settings.products_list]);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [inv, tr, dr, st] = await Promise.all([
        getInvoices(), getTraders(), getDrivers(), getAllSettings()
      ]);
      setInvoices(inv); setTraders(tr); setDrivers(dr); setSettings(st);
      if (st?.market_name) setMarketName(st.market_name);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const traderItems  = traders.map(t => ({ id: t.id, label: t.name }));
  const driverItems  = drivers.map(d => ({ id: d.id, label: d.name }));

  function resetForm() {
    setEditInv(null);                    
    setInvForm({ trader_id: null, trader_label: "", driver_id: null, driver_label: "", vehicle_label: "", notes: "" });
    setItems([emptyItem(defaultItemValues)]);
    setPaidAmount("");
  }

  useEffect(() => {
    setItems(prev => {
      if (editInv || prev.length !== 1) return prev;
      const [first] = prev;
      const isBlank = first && !first.id && !first.product_name && !first.grossWeight && !first.basketCount && !first.price && !first.manualFinal;
      if (!isBlank) return prev;
      return [emptyItem(defaultItemValues)];
    });
  }, [defaultItemValues, editInv]);

  const liveItems = items.filter(it => it.computed);
  const liveTotals = computeInvoiceTotals(liveItems.map(it => it.computed), paidAmount);

  const handlePayAll = () => {
    if (liveTotals.total_final > 0) {
      setPaidAmount(Math.round(liveTotals.total_final).toString());
    }
  };

  async function openEdit(inv) {
    if (inv.status === "posted") return;
    const its = await getInvoiceItems(inv.id);
    setEditInv(inv);
    setInvForm({
      trader_id: inv.trader_id, trader_label: inv.trader_name ?? "",
      driver_id: inv.driver_id, driver_label: inv.driver_name ?? "",
      vehicle_label: inv.vehicle_plate ?? "",
      notes: inv.notes ?? "",
    });
    setItems(its.map(it => {
      return {
        _key: it.id,
        id: it.id,
        product_name: it.product_name,
        grossWeight: formatNumberWithCommas(fromInt(it.gross_weight)),
        basketCount: formatNumberWithCommas(it.basket_count),
        basketWeightEach: normalizeBasketWeightEach(it.basket_weight_each ?? defaultBasketWeightEach),
        price: formatNumberWithCommas(fromInt(it.price)),
        basketPrice: formatNumberWithCommas(fromInt(it.basket_price ?? defaultBasketPrice)),
        commissionRate: formatNumberWithCommas(fromInt(it.commission_rate)),
        porterage: it.basket_count > 0 ? formatNumberWithCommas((fromInt(it.porterage) / it.basket_count)) : defaultPorterage.toString(), 
        manualFinal: "",
        computed: {
          display: {
            netWeight: fromInt(it.net_weight),
            amountBefore: fromInt(it.amount_before),
            commissionValue: fromInt(it.commission_value),
            amountAfterComm: fromInt(it.amount_after_comm),
            basketPriceTotal: fromInt(it.basket_price_total),
            finalAmount: fromInt(it.final_amount),
          }
        },
      };
    }));
    setPaidAmount(fromInt(inv.paid_amount));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handlePrintDirectly(inv) {
    const its = await getInvoiceItems(inv.id);
    setViewInv(inv);
    setViewItems(its);
  }

  useEffect(() => {
    if (viewInv && viewItems.length > 0) {
      window.print();
      setViewInv(null);
      setViewItems([]);
    }
  }, [viewInv, viewItems]);

  async function handleSave(e) {
    e.preventDefault();
    if (!invForm.trader_label || !invForm.trader_label.trim()) {
      alert("اسم البگال غير موجود");
      return;
    }

    setSaving(true);
    try {
      let trader_id  = invForm.trader_id;
      let driver_id  = invForm.driver_id;

      if (!trader_id && invForm.trader_label)   trader_id  = await findOrCreateTrader(invForm.trader_label);
      if (!driver_id && invForm.driver_label)   driver_id  = await findOrCreateDriver(invForm.driver_label);

      let invoiceId = editInv?.id;
      if (!invoiceId) {
        const currentDateTime = getLocalDateTimeString(); 
        invoiceId = await createInvoice({ trader_id, driver_id, date: currentDateTime, notes: invForm.notes || null });
      }

      const savedItems = [];
      for (const item of items) {
        if (!item.product_name.trim()) continue;
        const cleanGross = cleanCommas(item.grossWeight);
        const cleanPrice = cleanCommas(item.price);
        const cleanBasketPrice = item.basketPrice !== "" ? cleanCommas(item.basketPrice) : defaultBasketPrice;
        const cleanBasketCount = cleanCommas(item.basketCount);
        const cleanBasketWeightEach = item.basketWeightEach !== "" ? normalizeBasketWeightEach(item.basketWeightEach) : defaultBasketWeightEach;
        const cleanCommRate = item.commissionRate !== "" ? cleanCommas(item.commissionRate) : (defaultCommission / 100);
        const currentPorterageValue = item.porterage !== "" ? cleanCommas(item.porterage) : defaultPorterage;
        
        const totalPorterage = currentPorterageValue * cleanBasketCount;
        const cleanManualFinal = item.manualFinal !== "" ? cleanCommas(item.manualFinal) : null;

        const computed = computeInvoiceItem({
          grossWeight: cleanGross, basketCount: cleanBasketCount,
          basketWeightEach: cleanBasketWeightEach, price: cleanPrice,
          basketPrice: cleanBasketPrice,
          commissionRate: cleanCommRate, porterage: totalPorterage,
          manualFinal: cleanManualFinal,
        });
        const id = await upsertInvoiceItem({ ...computed, id: item.id, invoice_id: invoiceId, product_name: item.product_name });
        savedItems.push({ ...computed, id });
      }

      const totals = computeInvoiceTotals(savedItems, paidAmount);
      await updateInvoiceTotals(invoiceId, { ...totals, notes: invForm.notes || null });

      resetForm();
      await load();
    } catch (e) {
      alert("خطأ في الحفظ: " + (e?.message ||  "خطأ غير معروف"));
    } finally {
      setSaving(false);
    }
  }

  async function handlePost() {
    try { await postInvoice(confirmPost.id); setConfirmPost(null); await load(); }
    catch (e) { alert("خطأ: " + (e?.message || "خطأ غير معروف")); }
  }

  async function handleReverse() {
    try { await reverseInvoice(confirmReverse.id); setConfirmReverse(null); await load(); }
    catch (e) { alert("خطأ: " + (e?.message || "خطأ غير معروف")); }
  }

  async function handleDelete() {
    try { await deleteInvoice(confirmDelete.id); setConfirmDelete(null); await load(); }
    catch (e) { alert("خطأ: " + (e?.message || "خطأ غير معروف")); }
  }

  function updateItem(key, updated) {
    setItems(prev => prev.map(it => it._key === key ? updated : it));
  }

  function removeItem(key) {
    setItems(prev => prev.filter(it => it._key !== key));
  }

  const formatViewDateTime = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const date = d.toLocaleDateString("ar-IQ");
    const time = d.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${time} | ${date}`;
  };

  const renderTableDateTime = (dateStr) => {
    if (!dateStr) return <span className="text-muted-foreground">—</span>;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return <span>{dateStr}</span>;
    
    const date = d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    
    return (
      <div className="flex flex-col text-center font-sans font-medium text-[10px] leading-tight select-none px-0.5">
        <span className="text-foreground/90">{date}</span>
        <span className="text-muted-foreground text-[9px]">{time}</span>
      </div>
    );
  };

  const columns = [
    { key: "date",         label: "التاريخ",    render: row => renderTableDateTime(row.date) },
    { key: "trader_name",  label: "البگال",     render: row => <span className="text-[11px] truncate max-w-[75px] block font-medium px-0.5">{row.trader_name}</span> },
    { key: "driver_name",  label: "السائق",     render: row => <span className="text-[11px] truncate max-w-[65px] block text-muted-foreground px-0.5">{row.driver_name || "—"}</span> },
    { key: "status",       label: "الحالة",
      render: row => (
        <span className={`px-1 py-0.5 rounded text-[9.5px] font-semibold tracking-tight ${row.status === "posted" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
          {row.status === "posted" ? "مرحل" : "مسودة"}
        </span>
      ),
    },
    { key: "total_final",  label: "الإجمالي",  render: row => <span className="font-sans font-semibold text-[11px] px-0.5">{formatMoney(row.total_final)}</span> },
    { key: "paid_amount",  label: "الواصل",    render: row => <span className="font-sans font-semibold text-[11px] text-emerald-600 px-0.5">{formatMoney(row.paid_amount)}</span> },
    { key: "remaining",    label: "الباقي",    render: row => <span className={`font-sans text-[11px] px-0.5 ${row.remaining > 0 ? "text-destructive font-bold" : "text-muted-foreground font-medium"}`}>{formatMoney(row.remaining)}</span> },
  ];

  return (
    <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3 items-start max-w-full overflow-x-hidden p-1">
      
      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            direction: rtl;
            background-color: #fff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A5 landscape;
            margin: 0.4cm;
          }
          body * {
            visibility: hidden !important;
          }
          .print-area, .print-area * {
            visibility: visible !important;
          }
          .print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0px !important;
            display: block !important;
            opacity: 1 !important;
          }
          .no-print {
            display: none !important;
          }
        }
        
        .invoice-book-container {
          border: 2px solid #000 !important;
          padding: 14px;
          background-color: #fff !important;
          font-family: 'Cairo', sans-serif;
          box-sizing: border-box;
          width: 100%;
          direction: rtl;
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
          margin-top: 10px;
          border-bottom: 1px solid #000;
          padding-bottom: 6px;
          font-size: 13px;
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
          font-size: 14px;
        }
        .invoice-book-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
          margin-bottom: 12px;
        }
        .invoice-book-table th {
          background-color: #7f1d1d !important;
          color: #ffffff !important;
          border: 1px solid #000 !important;
          padding: 6px 4px;
          font-size: 13px;
          font-weight: bold;
          text-align: center;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .invoice-book-table td {
          border: 1px solid #000 !important;
          padding: 6px;
          font-size: 13px;
          text-align: center;
          height: 38px;
          color: #000 !important;
        }
        .footer-row {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          font-size: 12px;
          font-weight: bold;
          margin-top: 14px;
        }
        .signatures {
          display: flex;
          justify-content: space-around;
          width: 60%;
        }
        .border-box-office { border: 1px solid #000; padding: 2px 8px; font-weight: bold; font-size: 12px; border-radius: 3px; }
        
        .hidden-print-preview {
          display: none;
        }
      `}</style>

      {/* الاستمارة الجانبية */}
      <div className="lg:col-span-1 bg-background rounded-lg border border-border shadow-sm sticky top-4 no-print">
        <form onSubmit={handleSave} className="p-2.5 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[11px] font-medium">البگال *</label>
              <EntityCombobox items={traderItems} value={invForm.trader_id} required
                onChange={(id, label) => setInvForm(f => ({ ...f, trader_id: id, trader_label: label }))}
                placeholder="اختر أو اكتب البگال..." />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[11px] font-medium">السائق</label>
              <EntityCombobox items={driverItems} value={invForm.driver_id}
                onChange={(id, label) => setInvForm(f => ({ ...f, driver_id: id, driver_label: label }))}
                placeholder="اختر أو اكتب..." />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between border-b border-border/50 pb-1">
              <h4 className="font-medium text-[11px]">بنود القائمة</h4>
              <button type="button" onClick={() => setItems(prev => [...prev, emptyItem()])}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                <PlusCircle size={12} /> إضافة بند
              </button>
            </div>
            <div className="space-y-1 max-h-[240px] overflow-y-auto pr-0.5">
              {items.map(item => (
                <ItemRow key={item._key} item={item} productItems={productItems} defaultCommission={defaultCommission}
                  defaultBasketWeightEach={defaultBasketWeightEach}
                  defaultBasketPrice={defaultBasketPrice}
                  defaultPorterage={defaultPorterage}
                  onChange={updated => updateItem(item._key, updated)} onRemove={() => removeItem(item._key)} />
              ))}
            </div>
          </div>

          <div className="rounded border border-border bg-muted/40 p-2 flex flex-col gap-1.5 text-[11px]">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[11px]">إجمالي النهائي:</span>
              <span className="font-bold text-sm text-primary font-sans">{formatMoney(liveTotals.total_final, "")}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-[11px]">الباقي للديون:</span>
              <span className={`font-bold text-xs font-sans ${liveTotals.remaining > 0 ? "text-destructive" : ""}`}>{formatMoney(liveTotals.remaining, "")}</span>
            </div>
            
            <div className="grid grid-cols-2 gap-2 mt-0.5">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground">الواصل</label>
                <div className="flex gap-1">
                  <input type="text" value={paidAmount ? Number(paidAmount).toLocaleString("en-US", { numberingSystem: "latn" }) : ""} onChange={handlePaidChange}
                    className="flex-1 rounded border border-input bg-background px-1.5 py-0.5 text-[11px] outline-none focus:ring-1 focus:ring-ring h-6 font-sans font-medium" placeholder="0" />
                  <button type="button" onClick={handlePayAll} title="إيصال كامل المبلغ"
                    className="h-6 px-1.5 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded font-medium transition-colors whitespace-nowrap flex items-center gap-0.5">
                    <Check size={11} /> واصل كاملا
                  </button>
                </div>
              </div>
              <br />
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground">ملاحظات</label>
                <input value={invForm.notes} onChange={e => setInvForm(f => ({ ...f, notes: e.target.value }))}
                  className="rounded border border-input bg-background px-1.5 py-0.5 text-[11px] outline-none focus:ring-1 focus:ring-ring h-6" placeholder="ملاحظات..." />
              </div>
            </div>
          </div>

          <button type="submit" disabled={saving} className="w-full py-1 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-60 shadow-sm">
            {saving ? "جاري الحفظ..." : editInv ? "تحديث القائمة" : "حفظ وإدخل القائمة"}
          </button>
        </form>
      </div>

      {/* سجل المبيعات */}
      <div className="lg:col-span-2 flex flex-col gap-1 max-w-full overflow-x-auto no-print">
        

        {error && <div className="rounded-md bg-destructive/10 text-destructive px-2 py-1 text-[11px]">{error}</div>}

        {loading ? <div className="text-center py-6 text-muted-foreground text-[11px]">جارٍ التحميل...</div> : (
          <div className="p-0.5">
            <DataTable
              columns={columns} data={invoices}
              searchKeys={["trader_name", "driver_name", "date" , "notes"]}
              emptyText="لا توجد مبيعات"
              actions={row => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => handlePrintDirectly(row)} title="طباعة الفاتورة" className="p-0.5 rounded hover:bg-accent text-primary"><Printer size={13} /></button>
                  {row.status === "draft" && (
                    <>
                      <button onClick={() => openEdit(row)} title="تعديل" className="p-0.5 rounded hover:bg-accent text-primary"><Plus size={13} /></button>
                      <button onClick={() => setConfirmPost(row)} title="ترحيل" className="p-0.5 rounded hover:bg-accent text-green-600"><CheckCircle size={13} /></button>
                      <button onClick={() => setConfirmDelete(row)} title="حذف" className="p-0.5 rounded hover:bg-accent text-destructive"><Trash2 size={13} /></button>
                    </>
                  )}
                  {row.status === "posted" && (
                    <button onClick={() => setConfirmReverse(row)} title="عكس" className="p-0.5 rounded hover:bg-accent text-orange-500"><RotateCcw size={13} /></button>
                  )}
                </div>
              )}
            />
          </div>
        )}
      </div>

      {/* ─── المكون المخفي المخصص للطباعة الفورية ─── */}
      {viewInv && viewItems.length > 0 && (
        <div className="hidden-print-preview print-area">
          <div className="invoice-book-container">
            
            <div className="flex-row-header">
              <div style={{ textAlign: 'right' }}>
                <h2 className="text-xl font-black text-red-900" style={{ margin: 0 }}>{marketName}</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', fontWeight: 'bold', color: '#000' }}>مُجاز لبيع الفواكه والخُضر بالجملة</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#4b5563' }}>موصل - سوق جملة نينوى - الأيمن</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <div className="border-box-office text-black">رقم المكتب ( ٣٥ )</div>
                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#000' }}>ID: #{viewInv.id.slice(0, 8)}</div>
              </div>
            </div>

            <div className="flex-row-info text-black">
              <div className="info-item">
                <span className="font-bold">حضرة السيد :</span>
                <span className="dotted-line">{viewInv.trader_name ?? "—"}</span>
              </div>
              <div className="info-item">
                <span className="font-bold">التاريخ والوقت :</span>
                <span className="dotted-line" style={{ fontFamily: 'monospace' }}>{formatViewDateTime(viewInv.date)}</span>
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
                  <th style={{ width: "16%" }}> التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {viewItems.map((it, idx) => {
                  const netWeight = fromInt(it.net_weight);
                  const price = fromInt(it.price);
                  const finalAmount = fromInt(it.final_amount);
                  const basketCount = it.basket_count || "—";

                  return (
                    <tr key={it.id}>
                      <td>{idx + 1}</td>
                      <td className="font-bold">{finalAmount.toLocaleString("en-US", { numberingSystem: "latn" })}</td>
                      <td>{netWeight.toLocaleString("en-US", { numberingSystem: "latn" })}</td>
                      <td>{price.toLocaleString("en-US", { numberingSystem: "latn" })}</td>
                      <td>{basketCount.toLocaleString("en-US", { numberingSystem: "latn" })}</td>
                      <td style={{ fontWeight: '700' }}>{it.product_name}</td>
                      <td>جملة</td>
                    </tr>
                  );
                })}

                {viewItems.length < 4 && 
                  Array.from({ length: 4 - viewItems.length }).map((_, index) => {
                    const rowNum = viewItems.length + index + 1;
                    return (
                      <tr key={`empty-${rowNum}`}>
                        <td>{rowNum}</td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    );
                  })
                }
              </tbody>
            </table>

            <div className="flex justify-between items-start mt-2 text-black text-[12px]">
              <div className="flex flex-col gap-1 text-[11px] border border-black p-2 bg-gray-50 min-w-[240px]">
                <div className="flex justify-between">
                  <span>الحساب الإجمالي:</span>
                  <span className="font-bold">{formatMoney(viewInv.total_final)}</span>
                </div>
                <div className="flex justify-between border-t border-dashed border-black pt-1">
                  <span>المبلغ الواصل:</span>
                  <span className="font-bold text-green-800">{formatMoney(viewInv.paid_amount)}</span>
                </div>
                <div className="flex justify-between border-t border-black pt-1 font-bold">
                  <span>المتبقي :</span>
                  <span className="font-black text-red-700">{formatMoney(viewInv.remaining)}</span>
                </div>
              </div>

              <div className="signatures flex-1 flex justify-around pt-6">
                <div>توقيع المستلم: ........................</div>
                <div>توقيع الحسابات: ........................</div>
              </div>
            </div>

            <div className="mt-3 text-[10px] text-gray-600 border-t border-dashed border-black pt-1">
              <span>ملاحظات الفاتورة: {viewInv.notes || "لا يوجد ملاحظات إضافية."}</span>
            </div>

          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirmPost} title="ترحيل القائمة" message="سيُضاف الباقي تلقائياً لدين البگال. هل تريد المتابعة؟" confirmText="ترحيل" onConfirm={handlePost} onCancel={() => setConfirmPost(null)} />
      <ConfirmDialog open={!!confirmReverse} title="عكس القائمة" message="سيُطرح الباقي من دين البگال وتعود القائمة لحالة مسودة." confirmText="عكس" danger onConfirm={handleReverse} onCancel={() => setConfirmReverse(null)} />
      <ConfirmDialog open={!!confirmDelete} title="حذف القائمة" message="هل تريد حذف هذه القائمة؟" confirmText="حذف" danger onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}