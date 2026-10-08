import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Trash2, Wallet } from "lucide-react";
import { calculateNetProfits, deleteWithdrawal, getWithdrawals } from "../lib/db.js";
import { formatMoney } from "../lib/money.js";
import DataTable from "../components/DataTable.jsx";
import WithdrawForm from "../components/WithdrawForm.jsx";
import DebtSettlementDialog from "../components/DebtSettlementDialog.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { useDataContext } from "../context/DataContext.jsx";

const typeLabels = {
  grocer: "بقال",
  driver: "سائق",
  partner: "شريك / من العلوة",
};

function formatWithdrawalDateTime(dateValue) {
  if (!dateValue) return "—";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).replace(",", " -");
}

export default function Withdrawals() {
  const { debtInvoices, settleDebtInvoice, refreshData } = useDataContext();
  const [withdrawals, setWithdrawals] = useState([]);
  const [profits, setProfits] = useState({ totalCommissions: 0, totalWithdrawals: 0, netProfits: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [settlementInvoice, setSettlementInvoice] = useState(null);
  const [settling, setSettling] = useState(false);
  const [deleteConfirmRow, setDeleteConfirmRow] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [rows, totals] = await Promise.all([getWithdrawals(), calculateNetProfits()]);
      setWithdrawals(rows);
      setProfits(totals);
    } catch (e) {
      setError(e?.message || "خطأ في تحميل السحوبات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalsByPerson = useMemo(() => {
    const totals = new Map();
    for (const withdrawal of withdrawals) {
      const key = withdrawal.personName?.trim();
      if (!key) continue;
      const current = totals.get(key) || { personName: key, withdrawerType: withdrawal.withdrawerType, amount: 0 };
      current.amount += Number(withdrawal.amount || 0);
      totals.set(key, current);
    }
    return Array.from(totals.values()).sort((a, b) => b.amount - a.amount);
  }, [withdrawals]);

  function handleDelete(row) {
    const remaining = Math.max(
      0,
      Number(row.debt_amount || 0) - Number(row.debt_paid || 0),
    );
    if (remaining > 0) {
      setError("لا يمكن حذف سحب غير مسدد");
      return;
    }
    setDeleteConfirmRow(row);
  }

  async function confirmDelete() {
    if (!deleteConfirmRow) return;
    try {
      await deleteWithdrawal(deleteConfirmRow.id);
      await refreshData();
      await load();
      setDeleteConfirmRow(null);
    } catch (e) {
      setError(e?.message || "تعذر حذف السحب");
    }
  }

  async function handleSettlement(amount) {
    if (!settlementInvoice) return;
    setSettling(true);
    try {
      await settleDebtInvoice(settlementInvoice.withdrawalId, amount);
      setSettlementInvoice(null);
      await load();
    } catch (e) {
      setError(e?.message || "تعذر تسديد الدين");
    } finally {
      setSettling(false);
    }
  }

  const columns = [
    { key: "date", label: "التاريخ والوقت", render: row => formatWithdrawalDateTime(row.date) },
    { key: "withdrawerType", label: "النوع", render: row => typeLabels[row.withdrawerType] || row.withdrawerType },
    { key: "personName", label: "اسم الشخص" },
    { key: "amount", label: "المبلغ", render: row => <span className="font-bold text-amber-700">{formatMoney(row.amount)}</span> },
    { key: "withdrawalDetails", label: "تفاصيل السحب", render: row => row.withdrawalDetails || "—" },
  ];

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      <div>
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Wallet size={21} /> السحوبات والأرباح</h2>
          <p className="text-sm text-muted-foreground mt-0.5">تسجيل السحوبات ومتابعة نصيب كل شخص وصافي أرباح المكتب</p>
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-1">
          <WithdrawForm
            onSaved={load}
            onError={withdrawalError => setError(`تعذر تسجيل السحب: ${withdrawalError?.message || "خطأ غير معروف"}`)}
          />
        </div>

        <div className="lg:col-span-2 flex flex-col gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4"><p className="text-xs text-muted-foreground">إجمالي العمولات</p><p className="mt-1 text-lg font-bold text-emerald-700">{formatMoney(profits.totalCommissions)}</p></div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4"><p className="text-xs text-muted-foreground">إجمالي السحوبات</p><p className="mt-1 text-lg font-bold text-amber-700">{formatMoney(profits.totalWithdrawals)}</p></div>
        <div className={`rounded-lg border p-4 ${profits.netProfits >= 0 ? "border-blue-200 bg-blue-50/60" : "border-red-200 bg-red-50/60"}`}><p className="text-xs text-muted-foreground">صافي الأرباح</p><p className="mt-1 text-lg font-bold">{formatMoney(profits.netProfits)}</p></div>
      </div>

      <section>
        <h3 className="mb-3 text-base font-bold">إجمالي مسحوبات كل شخص</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {totalsByPerson.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد سحوبات مسجلة بعد</p> : totalsByPerson.map(item => (
            <div key={item.personName} className="rounded-lg border border-border bg-background p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold">{item.personName}</span><span className="text-xs text-muted-foreground">{typeLabels[item.withdrawerType] || item.withdrawerType}</span></div>
              <p className="mt-1 font-bold text-amber-700">{formatMoney(item.amount)}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-lg border border-border bg-background p-1 shadow-sm">
        {loading ? <div className="py-12 text-center text-muted-foreground">جارٍ تحميل السحوبات...</div> : <DataTable columns={columns} data={withdrawals} searchKeys={["personName", "withdrawerType", "date"]} emptyText="لا توجد سحوبات مسجلة" actions={row => {
          const debtInvoice = debtInvoices.find(invoice => invoice.withdrawalId === row.id);
          const remaining = Math.max(0, Number(row.debt_amount || 0) - Number(row.debt_paid || 0));
          const canDelete = remaining === 0;
          return (
            <div className="flex items-center gap-1">
              {debtInvoice && debtInvoice.remaining > 0 && (
                <button title="تسديد الدين" onClick={() => setSettlementInvoice(debtInvoice)} className="rounded p-1.5 text-green-600 hover:bg-green-50">
                  <CreditCard size={16} />
                </button>
              )}
              <button
                title={canDelete ? "حذف السحب" : "لا يمكن حذف سحب غير مسدد"}
                onClick={() => handleDelete(row)}
                disabled={!canDelete}
                className={`rounded p-1.5 ${canDelete ? "text-destructive hover:bg-destructive/10" : "cursor-not-allowed text-muted-foreground opacity-50"}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        }} />}
      </div>
        </div>
      </div>
      <DebtSettlementDialog invoice={settlementInvoice} onConfirm={handleSettlement} onClose={() => setSettlementInvoice(null)} saving={settling} />
      <ConfirmDialog
        open={!!deleteConfirmRow}
        title="تأكيد حذف السحب"
        message={deleteConfirmRow ? `حذف سحب ${formatMoney(deleteConfirmRow.amount)} باسم «${deleteConfirmRow.personName}»؟` : ""}
        danger
        confirmText="حذف"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmRow(null)}
      />
    </div>
  );
}
