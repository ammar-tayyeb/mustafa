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
  
  // تتبع الفلتر النشط لتغيير نصوص الكروت وألوان الأزرار (custom, today, month)
  const [activeFilter, setActiveFilter] = useState("custom"); 
  
  // كائنات تخزين قيم العمولة والحمالية والسلات (الكلية والمسددة الحقيقية)
  const [calculatedMetrics, setCalculatedMetrics] = useState({ 
    commission: 0, 
    porterage: 0,
    paidCommission: 0,
    paidPorterage: 0,
    paidBaskets: 0 
  });
  
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [from, setFrom]         = useState("");
  const [to, setTo]             = useState("");
  const [tab, setTab]           = useState("invoices");

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      
      // 1. فلاتر الفواتير: نطاق الوقت الكامل لتغطية الفواتير المخزنة بـ TimeStamp
      const filterFrom = from ? `${from}T00:00:00` : null;
      const filterTo = to ? `${to}T23:59:59` : null;
      
      // 2. فلاتر الدفعات
      const paymentFrom = from || null;
      const paymentTo = to || null;
      
      const [inv, tr, pay] = await Promise.all([
        getInvoices({ from: filterFrom, to: filterTo, status: "posted" }),
        getTraders(),
        getPayments({ from: paymentFrom, to: paymentTo }),
      ]);
      
      setInvoices(inv); setTraders(tr); setPayments(pay);

      let totalCommAccumulator = 0;
      let totalPortAccumulator = 0;
      let paidCommAccumulator  = 0;
      let paidPortAccumulator  = 0;
      let paidBasketsAccumulator = 0;

      for (const invoice of inv) {
        const items = await getInvoiceItems(invoice.id);
        
        const totalFinal = Number(invoice.total_final || 0);
        const immediatePaid = Number(invoice.paid_amount || 0);
        
        // حساب مجموع التسديدات اللاحقة الخاصة بهذه الفاتورة
        const totalInvoicePaid = Number(invoice.paid_amount || 0) + (totalFinal - Number(invoice.remaining || 0) - immediatePaid);
        
        // نسبة المدفوع من الفاتورة خاضعة للتصفية
        let paidRatio = 0;
        if (totalFinal > 0) {
          paidRatio = Math.min(totalInvoicePaid / totalFinal, 1); 
        }

        for (const item of items) {
          const itemComm = Number(item.commission_value || 0);
          const itemPort = Number(item.porterage || 0);
          
          // إيراد البند من السلات = سعر السلة * عدد السلات
          const itemBasketCount = Number(item.basket_count || 0);
          const itemBasketPrice = Number(item.basket_price || 0);
          const itemBasketTotal = itemBasketCount * itemBasketPrice;

          totalCommAccumulator += itemComm;
          totalPortAccumulator += itemPort;

          // احتساب المبالغ الواصلة بناءً على نسبة سداد الفاتورة الحالية المفلترة
          paidCommAccumulator    += (itemComm * paidRatio);
          paidPortAccumulator    += (itemPort * paidRatio);
          paidBasketsAccumulator += (itemBasketTotal * paidRatio); 
        }
      }

      setCalculatedMetrics({
        commission: totalCommAccumulator,
        porterage: totalPortAccumulator,
        paidCommission: paidCommAccumulator,
        paidPorterage: paidPortAccumulator,
        paidBaskets: paidBasketsAccumulator
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
    setActiveFilter("today"); // تعيين الفلتر النشط كـ اليوم
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
    setActiveFilter("month"); // تعيين الفلتر النشط كـ الشهر
  };

  const clearFilter = () => {
    setFrom("");
    setTo("");
    setActiveFilter("custom"); // إعادة تعيين التصفية الافتراضية
  };

  // ─── الحسابات المالية الحركية المحدثة ──────────────────────────────────────────
  const totalSales        = invoices.reduce((s, i) => s + (Number(i.total_final) || 0), 0);
  const totalPaidInvs    = invoices.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0);
  const totalDebt         = traders.reduce((s, t) => s + (Number(t.debt_fils) || 0), 0);
  const totalSettledDebts = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  
  // الدخل الفعلي المحصل = العمولة الواصلة + الحمالية الواصلة + قيمة السلات الواصلة المفلترة
  const realIncome      = calculatedMetrics.paidCommission + calculatedMetrics.paidPorterage + calculatedMetrics.paidBaskets;

  // تحديد اسم كارت الدخل بناءً على الفلتر المختار
  const getIncomeLabel = () => {
    if (activeFilter === "today") return "الدخل اليومي الفعلي";
    if (activeFilter === "month") return "الدخل الشهري الفعلي";
    return "الدخل الفعلي المحصل";
  };

  // ─── تعريف أعمدة جداول البيانات ──────────────────────────────────────────
  const invColumns = [
    { key: "date",         label: "التاريخ",    render: row => renderReportDateTime(row.date) },
    { key: "trader_name",  label: "البگال" },
    { key: "total_final",  label: "الإجمالي",  render: r => formatMoney(r.total_final) },
    { key: "paid_amount",  label: "الواصل",    render: r => formatMoney(r.paid_amount) },
    { key: "remaining",    label: "الباقي",    render: r => <span className={r.remaining > 0 ? "text-destructive font-semibold" : ""}>{formatMoney(r.remaining)}</span> },
  ];

  const traderColumns = [
    { key: "name",      label: "البگال" },
    { key: "phone",     label: "الهاتف" },
    { key: "debt_fils", label: "الدين الحالي", render: r => <span className={r.debt_fils > 0 ? "text-destructive font-bold font-sans" : "text-muted-foreground"}>{formatMoney(r.debt_fils)}</span> },
  ];

  const payColumns = [
    { key: "date",        label: "التاريخ",    render: row => renderReportDateTime(row.date) },
    { key: "trader_name", label: "البگال" },
    { key: "amount",      label: "المبلغ المسدد", render: r => <span className="text-emerald-600 font-bold font-sans">{formatMoney(r.amount)}</span> },
    { key: "notes",       label: "ملاحظات",        sortable: false },
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
            <input type="date" value={from} onChange={e => { setFrom(e.target.value); setActiveFilter("custom"); }}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring font-sans" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground">إلى:</label>
            <input type="date" value={to} onChange={e => { setTo(e.target.value); setActiveFilter("custom"); }}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring font-sans" />
          </div>
          {(from || to) && (
            <button onClick={clearFilter} className="text-xs text-muted-foreground hover:text-foreground underline pr-1">
              مَسح التصفية
            </button>
          )}
        </div>

        {/* 🛑 تعديل ألوان الأزرار ديناميكياً لتظهر كـ Active عند الضغط عليها */}
        <div className="flex items-center gap-1.5">
          <button onClick={setTodayFilter} 
            className={`px-3 py-1 text-xs font-bold rounded-md transition-colors shadow-sm border ${
              activeFilter === "today" 
                ? "bg-primary text-primary-foreground border-primary" 
                : "bg-background border-input hover:bg-muted text-primary"
            }`}>
            حسابات اليوم
          </button>
          <button onClick={setCurrentMonthFilter} 
            className={`px-3 py-1 text-xs font-bold rounded-md transition-colors shadow-sm border ${
              activeFilter === "month" 
                ? "bg-primary text-primary-foreground border-primary" 
                : "bg-background border-input hover:bg-muted text-primary"
            }`}>
            الشهر الحالي
          </button>
        </div>
      </div>

      {/* كروت المؤشرات الخمسة المحدثة للقيم الواصلة فقط متضمنة إيراد السلات */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {[
          { label: getIncomeLabel(), value: formatMoney(realIncome), color: "text-emerald-700 bg-emerald-50/50 border-emerald-200/60" },
          { label: "العمولة الواصلة",   value: formatMoney(calculatedMetrics.paidCommission),  color: "text-primary bg-primary/5 border-primary/10" },
          { label: "الحمالية الواصلة",  value: formatMoney(calculatedMetrics.paidPorterage), color: "text-blue-600 bg-blue-50/40 border-blue-200/50" },
          { label: "إيراد السلات الواصلة", value: formatMoney(calculatedMetrics.paidBaskets), color: "text-amber-700 bg-amber-50/40 border-amber-200/50" },
          { label: "الديون المسددة (للمدة)", value: formatMoney(totalSettledDebts),  color: "text-purple-600 bg-purple-50/40 border-purple-200/50" },
        ].map(card => (
          <div key={card.label} className={`rounded-xl border p-4 shadow-sm transition-all ${card.color || 'bg-card border-border'}`}>
            <p className="text-[11px] font-bold text-muted-foreground/90 truncate">{card.label}</p>
            <p className="text-lg font-bold mt-1.5 font-sans tracking-tight">{card.value}</p>
          </div>
        ))}
      </div>

      {/* مؤشرات إضافية ثابتة للمقارنة العامة */}
      <div className="grid grid-cols-3 gap-4 max-w-md bg-muted/30 px-4 py-2.5 rounded-lg border border-border/60 text-xs font-medium">
        <div className="flex justify-between"><span className="text-muted-foreground">مبيعات المدة:</span> <span className="font-semibold font-sans">{formatMoney(totalSales, "")}</span></div>
        <div className="flex justify-between border-x px-4 border-border"><span className="text-muted-foreground">الواصل الفوري:</span> <span className="font-semibold text-green-600 font-sans">{formatMoney(totalPaidInvs, "")}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">ديون البگاگيل الكلية:</span> <span className="font-semibold text-destructive font-sans">{formatMoney(totalDebt, "")}</span></div>
      </div>

      <div className="flex gap-1 border-b border-border">
        {[["invoices","الفواتير المُرحّلة"],["traders","أرصدة البگاگيل"],["payments","الدفعات"]].map(([key, label]) => (
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
          {tab === "traders"  && <DataTable columns={traderColumns} data={traders} searchKeys={["name","phone"]} emptyText="لا يوجد بگاگيل" />}
          {tab === "payments" && <DataTable columns={payColumns} data={payments} searchKeys={["trader_name","notes"]} emptyText="لا توجد تسديدات ديون مسجلة للمدة المحددة" />}
        </div>
      )}
    </div>
  );
}