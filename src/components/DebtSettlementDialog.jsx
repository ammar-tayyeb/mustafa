import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { formatMoney } from "../lib/money.js";

export default function DebtSettlementDialog({ invoice, onConfirm, onClose, saving = false }) {
  const [amount, setAmount] = useState("");

  useEffect(() => {
    setAmount(invoice?.remaining ? String(invoice.remaining) : "");
  }, [invoice]);

  if (!invoice) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    await onConfirm(Number(amount));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">تسديد دين السحب</h3>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50" aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 rounded-md bg-muted/40 p-3 text-sm">
          <div className="flex justify-between gap-3"><span>إجمالي الدين</span><strong>{formatMoney(invoice.total_final)}</strong></div>
          <div className="mt-1 flex justify-between gap-3 text-destructive"><span>المتبقي</span><strong>{formatMoney(invoice.remaining)}</strong></div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="debt-settlement-amount" className="text-sm font-semibold">المبلغ المسدد</label>
            <input
              id="debt-settlement-amount"
              type="number"
              min="1"
              max={invoice.remaining}
              step="1"
              required
              value={amount}
              onChange={event => setAmount(event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">إلغاء</button>
            <button type="submit" disabled={saving} className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              {saving ? "جارٍ التسديد..." : "تأكيد التسديد"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
