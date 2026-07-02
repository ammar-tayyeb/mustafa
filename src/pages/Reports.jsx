import { useState, useEffect, useCallback } from "react";
import { getInvoices, getTraders, getPayments, getInvoiceItems } from "../lib/db.js";
import { formatMoney } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";

// دالة مساعدة لتنسيق التاريخ والوقت داخل الجدول والتخلص من صيغة ISO
const renderReportDateTime = (dateStr) => {
  if (!dateStr) return <span className="text-muted-foreground">—</span>;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return <span>{dateStr}</span>;
  
  const date = d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  
  return (
    <div className="flex flex-col text-center font-sans font-medium text-[11px] leading-tight select-none px-0.5">
      <span className="text-foreground/90 font-semibold">{date}</span>
      <span className="text-muted-foreground text-[10px]">{time}</span>
    </div>
  );
};

export default function Reports() {
  const [invoices, setInvoices] = useState([]);
  const [traders, setTraders]   = useState([]);
  const [payments, setPayments] = useState([]);
  
  // كائنات تخزين قيم العمولة والحمالية الحقيقية المستخرجة من البنود
  const [calculatedMetrics, setCalculatedMetrics] = useState({ commission: 0, porterage: 0 });
  
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [from, setFrom]         = useState("");
  const [to, setTo]             = useState("");
  const [tab, setTab]           = useState("invoices");

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      
      // 1. فلاتر الفواتير: تحتاج نطاق الوقت الكامل لتغطية الفواتير المخزنة بـ TimeStamp
      const filterFrom = from ? `${from}T00:00:00` : null;
      const filterTo = to ? `${to}T23:59:59` : null;
      
      // 2. فلاتر الدفعات: نرسل التاريخ الصافي الصريح (بدون وقت) ليتطابق مع دالة date() في الـ SQLite
      const paymentFrom = from || null;
      const paymentTo = to || null;
      
      const [inv, tr, pay] = await Promise.all([
        getInvoices({ from: filterFrom, to: filterTo, status: "posted" }),
        getTraders(),
        getPayments({ from: paymentFrom, to: paymentTo }), // 👈 تمرير التاريخ الصافي هنا لتفعيل الفلترة
      ]);
      
      setInvoices(inv); setTraders(tr); setPayments(pay);

      // ─── الحساب الحقيقي من البنود داخل قاعدة البيانات ───────────────────────
      let totalCommAccumulator = 0;
      let totalPortAccumulator = 0;

      for (const invoice of inv) {
        const items = await getInvoiceItems(invoice.id);
        for (const item of items) {
          totalCommAccumulator += Number(item.commission_value || 0);
          totalPortAccumulator += Number(item.porterage || 0);
        }
      }

      setCalculatedMetrics({
        commission: totalCommAccumulator,
        porterage: totalPortAccumulator
      });

    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  // ─── أزرار الفلترة الفورية للتاريخ ──────────────────────────────────────────
  const setTodayFilter = () => {
    const localDate = new Date();
    const tzoffset = localDate.getTimezoneOffset() * 60000;
    const today = new Date(Date.now() - tzoffset).toISOString().split("T")[0];
    setFrom(today);
    setTo(today);
  };

  const setCurrentMonthFilter = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    const firstDay = `${year}-${month}-01`;
    const lastDayNum = new Date(year, now.getMonth() + 1, 0).getDate();
    const lastDay = `${year}-${month}-${String(lastDayNum).padStart(2, '0')}`;
    
    setFrom(firstDay);
    setTo(lastDay);
  };

  // ─── الحسابات المالية الحركية المحدثة ──────────────────────────────────────────
  const totalSales      = invoices.reduce((s, i) => s + (Number(i.total_final) || 0), 0);
  const totalPaidInvs  = invoices.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0);
  
  // أرصدة الديون المتبقية الكلية الحالية للتجار (تراكمية ثابتة)
  const totalDebt       = traders.reduce((s, t) => s + (Number(t.debt_fils) || 0), 0);
  
  // إجمالي الديون التي تم سدادها وإطفاؤها (تتغير وتتأثر بالفلتر المختار لليوم أو الشهر)
  const totalSettledDebts = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const totalCommission = calculatedMetrics.commission;
  const totalPorterage  = calculatedMetrics.porterage;
  
  // الأرباح = إجمالي العمولة - الحمالية 
  const totalProfits    = totalCommission - totalPorterage; 

  // ─── تعريف أعمدة جداول البيانات ──────────────────────────────────────────
  const invColumns = [
    { key: "date",         label: "التاريخ",    render: row => renderReportDateTime(row.date) },
    { key: "trader_name",  label: "التاجر" },
    { key: "total_final",  label: "الإجمالي",  render: r => formatMoney(r.total_final) },
    { key: "paid_amount",  label: "الواصل",    render: r => formatMoney(r.paid_amount) },
    { key: "remaining",    label: "الباقي",    render: r => <span className={r.remaining > 0 ? "text-destructive font-semibold" : ""}>{formatMoney(r.remaining)}</span> },
  ];

  const traderColumns = [
    { key: "name",      label: "التاجر" },
    { key: "phone",     label: "الهاتف" },
    { key: "debt_fils", label: "الدين الحالي", render: r => <span className={r.debt_fils > 0 ? "text-destructive font-bold font-sans" : "text-muted-foreground"}>{formatMoney(r.debt_fils)}</span> },
  ];

  const payColumns = [
    { key: "date",        label: "التاريخ",    render: row => renderReportDateTime(row.date) },
    { key: "trader_name", label: "التاجر" },
    { key: "amount",      label: "المبلغ المسدد", render: r => <span className="text-emerald-600 font-bold font-sans">{formatMoney(r.amount)}</span> },
    { key: "notes",       label: "ملاحظات",    sortable: false },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">التقارير المالية والمؤشرات</h2>
        <p className="text-sm text-muted-foreground mt-0.5">مراقبة الأرباح الفعلية، وديون حركات التسديد اليومية والشهرية المحددة</p>
      </div>

      {/* شريط فلاتر التحكم بالوقت والتوقيت */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-muted/40 p-3 rounded-lg border border-border/80">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">من:</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring font-sans" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">إلى:</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring font-sans" />
          </div>
          {(from || to) && (
            <button onClick={() => { setFrom(""); setTo(""); }} className="text-xs text-muted-foreground hover:text-foreground underline pr-1">
              مسح التصفية
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={setTodayFilter} className="px-3 py-1 text-xs font-bold bg-background border border-input hover:bg-muted rounded-md transition-colors shadow-sm text-primary">
            حسابات اليوم
          </button>
          <button onClick={setCurrentMonthFilter} className="px-3 py-1 text-xs font-bold bg-background border border-input hover:bg-muted rounded-md transition-colors shadow-sm text-primary">
            الشهر الحالي
          </button>
        </div>
      </div>

      {/* كروت المؤشرات الخمسة المحدثة حسابياً وزمنياً */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {[
          { label: "الأرباح (العمولة - الحمالية)", value: formatMoney(totalProfits), color: "text-emerald-700 bg-emerald-50/50 border-emerald-200/60" },
          { label: "إجمالي العمولة",   value: formatMoney(totalCommission),  color: "text-primary bg-primary/5 border-primary/10" },
          { label: "إجمالي الحمالية",  value: formatMoney(totalPorterage), color: "text-blue-600 bg-blue-50/40 border-blue-200/50" },
          { label: "أرصدة ديون التجار الكلية", value: formatMoney(totalDebt),  color: "text-destructive bg-destructive/5 border-destructive/10" },
          { label: "الديون المسددة (للمدة)", value: formatMoney(totalSettledDebts),  color: "text-purple-600 bg-purple-50/40 border-purple-200/50" },
        ].map(card => (
          <div key={card.label} className={`rounded-xl border p-4 shadow-sm transition-all ${card.color || 'bg-card border-border'}`}>
            <p className="text-[11px] font-bold text-muted-foreground/90 truncate">{card.label}</p>
            <p className="text-lg font-bold mt-1.5 font-sans tracking-tight">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-sm bg-muted/30 px-4 py-2.5 rounded-lg border border-border/60 text-xs font-medium">
        <div className="flex justify-between"><span className="text-muted-foreground">مبيعات الفواتير الحالية:</span> <span className="font-semibold font-sans">{formatMoney(totalSales, "")}</span></div>
        <div className="flex justify-between border-r pr-4 border-border"><span className="text-muted-foreground">واصل القوائم الفوري:</span> <span className="font-semibold text-green-600 font-sans">{formatMoney(totalPaidInvs, "")}</span></div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {[["invoices","الفواتير المُرحّلة"],["traders","أرصدة التجار"],["payments","الدفعات"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}

      {loading ? <div className="text-center py-12 text-muted-foreground">جارٍ تصفية البيانات وحساب المبالغ المسددة حالياً...</div> : (
        <div className="bg-background rounded-lg border border-border p-1 shadow-sm">
          {tab === "invoices" && <DataTable columns={invColumns} data={invoices} searchKeys={["trader_name","date"]} emptyText="لا توجد فواتير مُرحّلة للمدة المحددة" />}
          {tab === "traders"  && <DataTable columns={traderColumns} data={traders} searchKeys={["name","phone"]} emptyText="لا يوجد تجار" />}
          {tab === "payments" && <DataTable columns={payColumns} data={payments} searchKeys={["trader_name","notes"]} emptyText="لا توجد تسديدات ديون مسجلة للمدة المحددة" />}
        </div>
      )}
    </div>
  );
}