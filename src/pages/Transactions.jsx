import { useState, useEffect, useCallback } from "react";
import { getTransactions } from "../lib/db.js";
import { formatMoney } from "../lib/money.js";
import { RefreshCw, X } from "lucide-react";
import DataTable from "../components/DataTable.jsx";

const TYPE_LABELS = {
  invoice_posted: "ترحيل فاتورة",
  payment:        "دفعة",
  reversal:       "عكس فاتورة",
  debt_added:     "إضافة دين",
};

export default function Transactions() {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [from, setFrom]     = useState("");
  const [to, setTo]         = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const data = await getTransactions({ from: from || null, to: to || null });
      
      // هنا نقوم بالتأكد من استقبال الحقول وتمرير الملاحظات بشكل سليم لكل صف
      const mappedRows = data.map(row => ({
        ...row,
        notes: row.notes ?? "" // حماية في حال كانت القيمة NULL في قاعدة البيانات
      }));

      setRows(mappedRows);
    } catch (e) { 
      setError(e.message); 
    } finally { 
      setLoading(false); 
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const renderTableDateTime = (dateStr) => {
    if (!dateStr) return <span className="text-muted-foreground">—</span>;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return <span className="font-sans text-[11px] font-medium">{dateStr}</span>;
    
    const date = d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
    const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;

    return (
      <div className="flex flex-col text-center font-sans font-medium text-[11px] leading-tight select-none">
        <span className="text-foreground/90">{date}</span>
        {hasTime && <span className="text-muted-foreground text-[10px] mt-0.5">{time}</span>}
      </div>
    );
  };

  const columns = [
    { key: "date",        label: "التاريخ", render: row => renderTableDateTime(row.date) },
    { key: "type",        label: "النوع", render: row => <span className="text-[12px] font-medium">{TYPE_LABELS[row.type] ?? row.type}</span> },
    { key: "trader_name",  label: "التاجر", render: row => <span className="text-[12px] font-semibold truncate max-w-[110px] block">{row.trader_name}</span> },
    { key: "amount",      label: "المبلغ", render: row => <span className="font-sans font-semibold text-[12px] text-primary">{formatMoney(row.amount)}</span> },
    { key: "description", label: "الوصف", sortable: false, render: row => <span className="text-muted-foreground text-[12px] truncate max-w-[150px] block" title={row.description}>{row.description || "—"}</span> },
    
  ];

  return (
    <div className="flex flex-col gap-4 p-1 max-w-full overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/50 pb-2">
        <div>
          <h2 className="text-base font-bold">سجل المعاملات المالية</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">جميع القيود والعمليات المسجّلة في الصندوق والديون</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground font-medium">من:</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="rounded border border-input bg-background px-2 py-0.5 h-7 text-[11px] font-sans outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground font-medium">إلى:</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="rounded border border-input bg-background px-2 py-0.5 h-7 text-[11px] font-sans outline-none focus:ring-1 focus:ring-ring" />
          </div>
          
          <div className="flex items-center gap-1">
            <button onClick={load} title="تحديث البيانات"
              className="p-1 h-7 w-7 rounded border border-border bg-background hover:bg-accent flex items-center justify-center transition-colors">
              <RefreshCw size={12} className={loading ? "animate-spin text-muted-foreground" : "text-foreground"} />
            </button>

            {(from || to) && (
              <button onClick={() => { setFrom(""); setTo(""); }}
                className="h-7 px-2 rounded border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 text-destructive text-[10px] font-medium transition-colors flex items-center gap-0.5">
                <X size={11} /> مسح الفلتر
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-3 py-1.5 text-[11px]">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-[11px]">جارٍ تحميل الحركات الماليّة...</div>
      ) : (
        <div className="p-0.5">
          <DataTable 
            columns={columns} 
            data={rows}
            searchKeys={["trader_name", "description", "type", "notes"]}
            emptyText="لا توجد عمليات تطابق الفلاتر المحددة" 
          />
        </div>
      )}
    </div>
  );
}