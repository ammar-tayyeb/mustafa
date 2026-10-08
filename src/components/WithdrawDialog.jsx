import { useEffect, useState } from "react";
import { Wallet, X } from "lucide-react";
import { processWithdrawal } from "../lib/db.js";
import { useDataContext } from "../context/DataContext.jsx";

const EMPTY_FORM = {
  amount: "",
  withdrawerType: "partner",
  selectedPersonId: "",
  customName: "",
};

export default function WithdrawDialog({ open, onClose, onSaved, onError }) {
  const { drivers, merchants, refreshData } = useDataContext();
  const [amount, setAmount] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [withdrawerType, setWithdrawerType] = useState(EMPTY_FORM.withdrawerType);
  const [selectedPersonId, setSelectedPersonId] = useState(EMPTY_FORM.selectedPersonId);
  const [customName, setCustomName] = useState(EMPTY_FORM.customName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setAmountInput("");
    setWithdrawerType(EMPTY_FORM.withdrawerType);
    setSelectedPersonId(EMPTY_FORM.selectedPersonId);
    setCustomName(EMPTY_FORM.customName);
    setSaving(false);
  }, [open]);

  function handleAmountChange(event) {
    const valueWithoutCommas = event.target.value.replace(/,/g, "");
    if (!/^\d*$/.test(valueWithoutCommas)) return;

    const numericValue = valueWithoutCommas === "" ? "" : Number(valueWithoutCommas);
    setAmount(numericValue);
    setAmountInput(valueWithoutCommas === "" ? "" : numericValue.toLocaleString("en-US"));
  }

  function handleTypeChange(event) {
    setWithdrawerType(event.target.value);
    setSelectedPersonId("");
    setCustomName("");
  }

  async function handleConfirmWithdraw(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const numericAmount = Number(amount);
      const selectedPerson = withdrawerType === "grocer"
        ? merchants.find(merchant => String(merchant.id) === String(selectedPersonId))
        : drivers.find(driver => String(driver.id) === String(selectedPersonId));
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) throw new Error("مبلغ السحب غير صحيح");
      if (withdrawerType !== "partner" && !selectedPerson) throw new Error("اختر الشخص الساحب");

      await processWithdrawal({
        amount: numericAmount,
        withdrawerType,
        personId: selectedPersonId || null,
        personName: selectedPerson?.name || customName,
        date: new Date().toISOString(),
      });
      await refreshData();
      await onSaved?.();
      onClose();
    } catch (error) {
      onError?.(error);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="withdraw-dialog-title">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 id="withdraw-dialog-title" className="flex items-center gap-2 text-lg font-bold"><Wallet size={19} /> سحب مبلغ</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleConfirmWithdraw} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="withdraw-amount" className="text-sm font-semibold">المبلغ المراد سحبه</label>
            <input id="withdraw-amount" type="text" inputMode="numeric" required value={amountInput} onChange={handleAmountChange} className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="0" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="withdrawer-type" className="text-sm font-semibold">نوع الساحب</label>
            <select id="withdrawer-type" value={withdrawerType} onChange={handleTypeChange} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="partner">شريك / علوة</option>
              <option value="grocer">بقال</option>
              <option value="driver">سائق</option>
            </select>
          </div>

          {withdrawerType === "grocer" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="withdrawer-merchant" className="text-sm font-semibold">اسم البقال</label>
              <select id="withdrawer-merchant" required value={selectedPersonId} onChange={event => setSelectedPersonId(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">اختر البقال</option>
                {merchants.map(merchant => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
              </select>
            </div>
          )}

          {withdrawerType === "driver" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="withdrawer-driver" className="text-sm font-semibold">اسم السائق</label>
              <select id="withdrawer-driver" required value={selectedPersonId} onChange={event => setSelectedPersonId(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">اختر السائق</option>
                {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
              </select>
            </div>
          )}

          {withdrawerType === "partner" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="withdrawer-custom-name" className="text-sm font-semibold">اسم الشريك أو الشخص</label>
              <input id="withdrawer-custom-name" type="text" required value={customName} onChange={event => setCustomName(event.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="اكتب الاسم" />
            </div>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">إلغاء</button>
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "تأكيد السحب"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
