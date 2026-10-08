import { useState } from "react";
import { Wallet } from "lucide-react";
import { processWithdrawal } from "../lib/db.js";
import { useDataContext } from "../context/DataContext.jsx";

const EMPTY_FORM = {
  amount: "",
  amountInput: "",
  withdrawerType: "partner",
  selectedPersonId: "",
  customName: "",
  details: "",
};

function getErrorMessage(error) {
  if (typeof error === "string") return error;
  if (error?.message) return error.message;
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return "تعذر تسجيل السحب";
    }
  }
  return "تعذر تسجيل السحب";
}

export default function WithdrawForm({ onSaved, onError }) {
  const { drivers, merchants, refreshData } = useDataContext();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  function handleAmountChange(event) {
    const valueWithoutCommas = event.target.value.replace(/,/g, "");
    if (!/^\d*$/.test(valueWithoutCommas)) return;

    const numericValue = valueWithoutCommas === "" ? "" : Number(valueWithoutCommas);
    setForm(current => ({
      ...current,
      amount: numericValue,
      amountInput: valueWithoutCommas === "" ? "" : numericValue.toLocaleString("en-US"),
    }));
  }

  function handleTypeChange(event) {
    setForm(current => ({
      ...current,
      withdrawerType: event.target.value,
      selectedPersonId: "",
      customName: "",
    }));
  }

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);

    try {
      const numericAmount = Number(form.amount);
      const selectedPerson = form.withdrawerType === "grocer"
        ? merchants.find(merchant => String(merchant.id) === String(form.selectedPersonId))
        : drivers.find(driver => String(driver.id) === String(form.selectedPersonId));

      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error("مبلغ السحب غير صحيح");
      }
      if (form.withdrawerType !== "partner" && !selectedPerson) {
        throw new Error("اختر الشخص الساحب");
      }

      await processWithdrawal({
        amount: numericAmount,
        withdrawerType: form.withdrawerType,
        personId: form.selectedPersonId || null,
        personName: selectedPerson?.name || form.customName,
        withdrawalDetails: form.details,
        date: new Date().toISOString(),
      });
      await refreshData();
      await onSaved?.();
      resetForm();
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("خطأ في تسجيل السحب:", error);
      onError?.(new Error(message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-background p-5 shadow-sm">
      <h3 className="mb-5 flex items-center gap-2 text-lg font-bold">
        <Wallet size={19} /> إضافة سحب
      </h3>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="withdraw-amount" className="text-sm font-semibold">المبلغ المراد سحبه</label>
          <input id="withdraw-amount" type="text" inputMode="numeric" required value={form.amountInput} onChange={handleAmountChange} className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="0" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="withdrawer-type" className="text-sm font-semibold">نوع الساحب</label>
          <select id="withdrawer-type" value={form.withdrawerType} onChange={handleTypeChange} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="partner">شريك / علوة</option>
            <option value="grocer">بقال</option>
            <option value="driver">سائق</option>
          </select>
        </div>

        {form.withdrawerType === "grocer" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="withdrawer-merchant" className="text-sm font-semibold">اسم البقال</label>
            <select id="withdrawer-merchant" required value={form.selectedPersonId} onChange={event => setForm(current => ({ ...current, selectedPersonId: event.target.value }))} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">اختر البقال</option>
              {merchants.map(merchant => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
            </select>
          </div>
        )}

        {form.withdrawerType === "driver" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="withdrawer-driver" className="text-sm font-semibold">اسم السائق</label>
            <select id="withdrawer-driver" required value={form.selectedPersonId} onChange={event => setForm(current => ({ ...current, selectedPersonId: event.target.value }))} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">اختر السائق</option>
              {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
            </select>
          </div>
        )}

        {form.withdrawerType === "partner" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="withdrawer-custom-name" className="text-sm font-semibold">اسم الشريك أو الشخص</label>
            <input id="withdrawer-custom-name" type="text" required value={form.customName} onChange={event => setForm(current => ({ ...current, customName: event.target.value }))} className="rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="اكتب الاسم" />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="withdraw-details" className="text-sm font-semibold">تفاصيل / سبب السحب</label>
          <textarea
            id="withdraw-details"
            value={form.details}
            onChange={event => setForm(current => ({ ...current, details: event.target.value }))}
            className="min-h-20 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="اكتب سبب السحب أو أي تفاصيل إضافية"
          />
        </div>

        <button type="submit" disabled={saving} className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? "جارٍ الحفظ..." : "إضافة السحب"}
        </button>
      </form>
    </section>
  );
}
