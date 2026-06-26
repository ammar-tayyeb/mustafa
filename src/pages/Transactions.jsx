import { useState, useEffect, useCallback } from "react";
import { getTransactions } from "../lib/db.js";
import { formatMoney } from "../lib/money.js";
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
      setRows(await getTransactions({ from: from || null, to: to || null }));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: "date",        label: "التاريخ" },
    { key: "type",        label: "النوع", render: row => TYPE_LABELS[row.type] ?? row.type },
    { key: "trader_name", label: "التاجر" },
    { key: "amount",      label: "المبلغ", render: row => formatMoney(row.amount) },
    { key: "description", label: "الوصف", sortable: false },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold">سجل المعاملات</h2>
        <p className="text-sm text-muted-foreground mt-0.5">جميع العمليات المالية المسجّلة</p>
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
          <button onClick={() => { setFrom(""); setTo(""); }}
            className="text-sm text-muted-foreground hover:text-foreground underline">
            مسح الفلتر
          </button>
        )}
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}

      {loading ? <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div> : (
        <DataTable columns={columns} data={rows}
          searchKeys={["trader_name", "description", "type"]}
          emptyText="لا توجد معاملات" />
      )}
    </div>
  );
}
