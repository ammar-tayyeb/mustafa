import { Trash2, RotateCcw, CheckCircle, Printer, Plus } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";

import { getInvoices, getTransactions, getWithdrawals, postInvoice, reverseInvoice, deleteInvoice, getInvoiceItems, getAllSettings, getDrivers } from "../lib/db.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { fromInt, formatMoney } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";


export default function Transactions() {
  const [invoices, setInvoices] = useState([]);
  const [transactionLog, setTransactionLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [marketName, setMarketName] = useState("مكتب الموصل");
  const [driverSearchTerm, setDriverSearchTerm] = useState("");
  const [merchantSearchTerm, setMerchantSearchTerm] = useState("");

  const [viewInv, setViewInv] = useState(null);
  const [viewItems, setViewItems] = useState([]);

  const [confirmPost, setConfirmPost] = useState(null);
  const [confirmReverse, setConfirmReverse] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [inv, st, drivers, transactions, withdrawals] = await Promise.all([
        getInvoices(),
        getAllSettings(),
        getDrivers(),
        getTransactions(),
        getWithdrawals(),
      ]);

      const driversMap = new Map(drivers.map(d => [String(d.id), d.name]));

      // استخراج اسم السائق المحدّث من بنود كل فاتورة
      const enriched = await Promise.all(
        inv.map(async (invoice) => {
          const items = await getInvoiceItems(invoice.id);
          const names = new Set();

          for (const it of items) {
            if (!it.driver_id) continue;
            const name = driversMap.get(String(it.driver_id)) || it.driver_name;
            if (name) names.add(name);
          }

          // احتياط: إذا لا توجد بنود بسائق، نستخدم driver_id الخاص بالفاتورة
          if (names.size === 0 && invoice.driver_id) {
            const name = driversMap.get(String(invoice.driver_id)) || invoice.driver_name;
            if (name) names.add(name);
          }

          return {
            ...invoice,
            driver_name: names.size ? Array.from(names).join("، ") : null,
          };
        })
      );

      setInvoices(enriched);
      setTransactionLog(transactions.map(transaction => ({
        ...transaction,
        withdrawal: withdrawals.find(withdrawal => withdrawal.id === transaction.ref_id) || null,
      })));
      if (st?.market_name) setMarketName(st.market_name);
    } catch (e) {
      console.error("خطأ في التحميل:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unifiedLogs = useMemo(() => {
    const mappedInvoices = invoices.map(invoice => ({
      id: `invoice-${invoice.id}`,
      date: invoice.date,
      type: "فاتورة مبيعات",
      details: [invoice.trader_name, invoice.driver_name].filter(Boolean).join(" / ") || "—",
      merchantName: invoice.trader_name || "",
      driverName: invoice.driver_name || "",
      personType: invoice.trader_name ? "merchant" : invoice.driver_name ? "driver" : null,
      personTypes: [invoice.trader_name && "merchant", invoice.driver_name && "driver"].filter(Boolean),
      amount: Number(invoice.total_final || 0),
      source: "invoice",
      sourceRecord: invoice,
    }));

    const mappedTransactions = transactionLog.map(transaction => ({
      id: `transaction-${transaction.id}`,
      date: transaction.date || transaction.created_at,
      type: transaction.type === "debt_withdrawal_settlement"
        ? "تسديد دين سحب"
        : transaction.type === "payment"
          ? "تسديد دين"
          : transaction.type === "withdrawal"
            ? "سحب"
            : transaction.type || "معاملة مالية",
      details: transaction.withdrawal?.personName || transaction.description || transaction.trader_name || "—",
      merchantName: transaction.withdrawal?.personType === "grocer" || transaction.trader_id ? (transaction.trader_name || transaction.withdrawal?.personName || "") : "",
      driverName: transaction.withdrawal?.personType === "driver" ? (transaction.withdrawal?.personName || "") : "",
      personType: transaction.withdrawal?.personType === "driver" || (!transaction.trader_id && transaction.type === "debt_withdrawal_settlement") ? "driver" : transaction.trader_id ? "merchant" : null,
      personTypes: transaction.withdrawal?.personType === "driver" || (!transaction.trader_id && transaction.type === "debt_withdrawal_settlement") ? ["driver"] : transaction.trader_id ? ["merchant"] : [],
      amount: Number(transaction.amount || 0),
      source: "transaction",
      sourceRecord: transaction,
    }));

    return [...mappedInvoices, ...mappedTransactions]
      .sort((a, b) => {
        const aTime = new Date(a.date || 0).getTime();
        const bTime = new Date(b.date || 0).getTime();
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      });
  }, [invoices, transactionLog]);

  const filteredUnifiedLogs = useMemo(() => {
    const driverQuery = driverSearchTerm.trim().toLowerCase();
    const merchantQuery = merchantSearchTerm.trim().toLowerCase();

    return unifiedLogs.filter(log => {
      if (driverQuery && (!log.driverName || !log.driverName.toLowerCase().includes(driverQuery))) {
        return false;
      }
      if (merchantQuery && (!log.merchantName || !log.merchantName.toLowerCase().includes(merchantQuery))) {
        return false;
      }
      return true;
    });
  }, [unifiedLogs, driverSearchTerm, merchantSearchTerm]);

  async function handlePrintDirectly(inv) {
    const its = await getInvoiceItems(inv.id);
    setViewInv(inv);
    setViewItems(its);
  }

  useEffect(() => {
    if (viewInv && viewItems.length > 0) {
      window.print();
      setTimeout(() => {
        setViewInv(null);
        setViewItems([]);
      }, 0);
    }
  }, [viewInv, viewItems]);

  async function handlePost() {
    try {
      await postInvoice(confirmPost.id);
      setConfirmPost(null);
      await load();
    } catch (e) {
      alert("خطأ: " + (e?.message || "خطأ غير معروف"));
    }
  }

  async function handleReverse() {
    try {
      await reverseInvoice(confirmReverse.id);
      setConfirmReverse(null);
      await load();
    } catch (e) {
      alert("خطأ: " + (e?.message || "خطأ غير معروف"));
    }
  }

  async function handleDelete() {
    try {
      await deleteInvoice(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      alert("خطأ: " + (e?.message || "خطأ غير معروف"));
    }
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

  const renderTableDateTime = (dateStr) => {
    if (!dateStr) return <span className="text-muted-foreground">—</span>;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return <span>{dateStr}</span>;
    return (
      <div className="flex flex-col text-center font-sans font-medium text-[10px] leading-tight select-none px-0.5">
        <span className="text-foreground/90">
          {d
            .toLocaleDateString("en-US", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
            .replace(/\//g, "-")}
        </span>
        <span className="text-muted-foreground text-[9px]">
          {d.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}
        </span>
      </div>
    );
  };

  const columns = [
    {
      key: "date",
      label: "التاريخ",
      render: (row) => renderTableDateTime(row.date),
    },
    {
      key: "type",
      label: "نوع الحركة",
      render: (row) => (
        <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${row.source === "invoice" ? "bg-blue-100 text-blue-700" : row.type.includes("تسديد") ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {row.type}
        </span>
      ),
    },
    {
      key: "driverName",
      label: "اسم السائق",
      render: (row) => (
        <span className="text-[12px] font-semibold truncate max-w-[110px] block px-0.5">
          {row.driverName || "-"}
        </span>
      ),
    },
    {
      key: "merchantName",
      label: "اسم البقال",
      render: (row) => (
        <span className="text-[12px] font-semibold truncate max-w-[110px] block px-0.5">
          {row.merchantName || "-"}
        </span>
      ),
    },
    {
      key: "amount",
      label: "المبلغ",
      render: (row) => (
        <span className="font-sans font-bold text-[12px] px-0.5 text-primary">
          {formatMoney(row.amount)}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-1 max-w-full overflow-x-hidden">
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

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/50 pb-2 no-print">
        <div>
          <h2 className="text-base font-bold">سجل الحركات الموحد</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">الفواتير والمعاملات المالية مرتبة زمنياً</p>
        </div>
      </div>

      <div className="flex flex-col gap-1 max-w-full overflow-x-auto no-print">
        <div className="mb-2 flex gap-4">
          <input
            type="text"
            value={driverSearchTerm}
            onChange={(event) => setDriverSearchTerm(event.target.value)}
            placeholder="بحث عن سائق..."
            className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            type="text"
            value={merchantSearchTerm}
            onChange={(event) => setMerchantSearchTerm(event.target.value)}
            placeholder="بحث عن بقال..."
            className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 text-destructive px-3 py-1.5 text-[11px]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-[11px]">
            جارٍ التحميل...
          </div>
        ) : (
          <div className="p-0.5">
            <DataTable
              columns={columns}
              data={filteredUnifiedLogs}
              searchKeys={["type", "details", "date", "amount"]}
              emptyText="لا توجد حركات مسجلة"
              actions={(row) => (
                row.source !== "invoice" ? null : (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handlePrintDirectly(row.sourceRecord)}
                      title="طباعة"
                      className="p-1 rounded hover:bg-accent text-primary"
                    >
                      <Printer size={14} />
                    </button>
                    {row.sourceRecord.status === "draft" && (
                      <>
                        <button
                          onClick={() => alert("للتعديل يرجى الانتقال إلى صفحة إدخال الفواتير")}
                          title="تعديل"
                          className="p-1 rounded hover:bg-accent text-primary"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmPost(row.sourceRecord)}
                          title="ترحيل"
                          className="p-1 rounded hover:bg-accent text-green-600"
                        >
                          <CheckCircle size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(row.sourceRecord)}
                          title="حذف"
                          className="p-1 rounded hover:bg-accent text-destructive"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    {row.sourceRecord.status === "posted" && (
                      <button
                        onClick={() => setConfirmReverse(row.sourceRecord)}
                        title="عكس القائمة"
                        className="p-1 rounded hover:bg-accent text-orange-500"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                )
              )}
            />
          </div>
        )}
      </div>

      {/* ─── قالب الطباعة المخفي ──────────────────────────────────────── */}
      {viewInv && viewItems.length > 0 && (
        <div className="hidden-print-preview print-area">
          <div className="invoice-book-container">
            <div className="flex-row-header">
              <div style={{ textAlign: "right" }}>
                <h2
                  className="text-xl font-black text-red-900"
                  style={{ margin: 0 }}
                >
                  {marketName}
                </h2>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "11px",
                    fontWeight: "bold",
                    color: "#000",
                  }}
                >
                  مُجاز لبيع الفواكه والخُضر بالجملة
                </p>
                <p style={{ margin: 0, fontSize: "11px", color: "#4b5563" }}>
                  موصل - سوق جملة نينوى - الأيمن
                </p>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: "4px",
                }}
              >
                <div className="border-box-office text-black">
                  رقم المكتب ( ٣٥ )
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    fontFamily: "monospace",
                    color: "#000",
                  }}
                >
                  ID: #{viewInv.id.slice(0, 8)}
                </div>
              </div>
            </div>
            <div className="flex-row-info text-black">
              <div className="info-item">
                <span className="font-bold">حضرة السيد :</span>
                <span className="dotted-line">
                  {viewInv.trader_name ?? "—"}
                </span>
              </div>
              <div className="info-item">
                <span className="font-bold">التاريخ والوقت :</span>
                <span
                  className="dotted-line"
                  style={{ fontFamily: "monospace" }}
                >
                  {formatViewDateTime(viewInv.date)}
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
                {viewItems.map((it, idx) => (
                  <tr key={it.id}>
                    <td>{idx + 1}</td>
                    <td className="font-bold">
                      {fromInt(it.final_amount).toLocaleString("en-US", {
                        numberingSystem: "latn",
                      })}
                    </td>
                    <td>
                      {fromInt(it.net_weight).toLocaleString("en-US", {
                        numberingSystem: "latn",
                      })}
                    </td>
                    <td>
                      {fromInt(it.price).toLocaleString("en-US", {
                        numberingSystem: "latn",
                      })}
                    </td>
                    <td>
                      {(it.basket_count || "—").toLocaleString("en-US", {
                        numberingSystem: "latn",
                      })}
                    </td>
                    <td style={{ fontWeight: "700" }}>{it.product_name}</td>
                    <td>جملة</td>
                  </tr>
                ))}
                {viewItems.length < 4 &&
                  Array.from({ length: 4 - viewItems.length }).map((_, i) => (
                    <tr key={`e-${i}`}>
                      <td>{viewItems.length + i + 1}</td>
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
              <div className="flex flex-col gap-1 text-[11px] border border-black p-2 bg-gray-50 min-w-[240px]">
                <div className="flex justify-between">
                  <span>الحساب الإجمالي:</span>
                  <span className="font-bold">
                    {formatMoney(viewInv.total_final)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-dashed border-black pt-1">
                  <span>المبلغ الواصل:</span>
                  <span className="font-bold text-green-800">
                    {formatMoney(viewInv.paid_amount)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-black pt-1 font-bold">
                  <span>المتبقي :</span>
                  <span className="font-black text-red-700">
                    {formatMoney(viewInv.remaining)}
                  </span>
                </div>
              </div>
              <div className="signatures flex-1 flex justify-around pt-6">
                <div>توقيع المستلم: ........................</div>
                <div>توقيع الحسابات: ........................</div>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-gray-600 border-t border-dashed border-black pt-1">
              <span>
                ملاحظات الفاتورة: {viewInv.notes || "لا يوجد ملاحظات إضافية."}
              </span>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmPost}
        title="ترحيل القائمة"
        message="سيُضاف الباقي تلقائياً لدين البگال. هل تريد المتابعة؟"
        confirmText="ترحيل"
        onConfirm={handlePost}
        onCancel={() => setConfirmPost(null)}
      />
      <ConfirmDialog
        open={!!confirmReverse}
        title="عكس القائمة"
        message="سيُطرح الباقي من دين البگال وتعود القائمة لحالة مسودة."
        confirmText="عكس"
        danger
        onConfirm={handleReverse}
        onCancel={() => setConfirmReverse(null)}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        title="حذف القائمة"
        message="هل تريد حذف هذه القائمة؟"
        confirmText="حذف"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}