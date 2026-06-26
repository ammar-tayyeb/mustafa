import { useState, useEffect, useCallback } from "react";
import { getInvoices, getTraders, getPayments } from "../lib/db.js";
import { formatMoney, fromInt } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";

export default function Reports() {
  const [invoices, setInvoices] = useState([]);
  const [traders, setTraders]   = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [from, setFrom]         = useState("");
  const [to, setTo]             = useState("");
  const [tab, setTab]           = useState("invoices");

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [inv, tr, pay] = await Promise.all([
        getInvoices({ from: from || null, to: to || null, status: "posted" }),
        getTraders(),
        getPayments(),
      ]);
      setInvoices(inv); setTraders(tr); setPayments(pay);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const totalSales = invoices.reduce((s, i) => s + i.total_final, 0);
  const totalPaid  = invoices.reduce((s, i) => s + i.paid_amount, 0);
  const totalDebt  = traders.reduce((s, t) => s + t.debt_fils, 0);

  const invColumns = [
    { key: "date",         label: "التاريخ" },
    { key: "trader_name",  label: "التاجر" },
    { key: "total_final",  label: "الإجمالي",  render: r => formatMoney(r.total_final) },
    { key: "paid_amount",  label: "الواصل",    render: r => formatMoney(r.paid_amount) },
    { key: "remaining",    label: "الباقي",    render: r => <span className={r.remaining > 0 ? "text-destructive" : ""}>{formatMoney(r.remaining)}</span> },
  ];

  const traderColumns = [
    { key: "name",      label: "التاجر" },
    { key: "phone",     label: "الهاتف" },
    { key: "debt_fils", label: "الدين", render: r => <span className={r.debt_fils > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>{formatMoney(r.debt_fils)}</span> },
  ];

  const payColumns = [
    { key: "date",        label: "التاريخ" },
    { key: "trader_name", label: "التاجر" },
    { key: "amount",      label: "المبلغ", render: r => formatMoney(r.amount) },
    { key: "notes",       label: "ملاحظات", sortable: false },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">التقارير</h2>
        <p className="text-sm text-muted-foreground mt-0.5">تقارير المبيعات والديون والدفعات</p>
      </div>

      {/* فلتر التاريخ */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">من:</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">إلى:</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="text-sm text-muted-foreground hover:text-foreground underline">
            مسح الفلتر
          </button>
        )}
      </div>

      {/* بطاقات الإجماليات */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "إجمالي المبيعات", value: formatMoney(totalSales), color: "text-primary" },
          { label: "إجمالي الواصل",   value: formatMoney(totalPaid),  color: "text-green-600" },
          { label: "إجمالي الديون",   value: formatMoney(totalDebt),  color: "text-destructive" },
        ].map(card => (
          <div key={card.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* تبويبات */}
      <div className="flex gap-1 border-b border-border">
        {[["invoices","الفواتير المُرحّلة"],["traders","أرصدة التجار"],["payments","الدفعات"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}

      {loading ? <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div> : (
        <>
          {tab === "invoices" && <DataTable columns={invColumns} data={invoices} searchKeys={["trader_name","date"]} emptyText="لا توجد فواتير مُرحّلة" />}
          {tab === "traders"  && <DataTable columns={traderColumns} data={traders} searchKeys={["name","phone"]} emptyText="لا يوجد تجار" />}
          {tab === "payments" && <DataTable columns={payColumns} data={payments} searchKeys={["trader_name","notes"]} emptyText="لا توجد دفعات" />}
        </>
      )}
    </div>
  );
}
