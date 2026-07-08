/**
 * money.js — حسابات IQD بالأعداد الصحيحة
 * لا نستخدم وحدات أصغر من الدينار داخل التطبيق.
 */

/** تحويل نص/رقم إلى عدد صحيح بالدينار */
export function toInt(val) {
  if (val === null || val === undefined || val === "") return 0;
  return Math.round(Number(val));
}
/** تحويل قيمة عددية للعرض كدينار كامل */
export function fromInt(val) {
  return Math.round(Number(val) || 0);
}

/** تنسيق مبلغ للعرض بالعربية */
export function formatMoney(intVal, currency = "د.ع") {
  const n = fromInt(intVal);
  return n.toLocaleString("en-US") + (currency ? " " + currency : "");
}

function roundDownToStep(value, step) {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0;
  return Math.floor(value / step) * step;
}

/** تنسيق وزن للعرض */
export function formatWeight(intVal) {
  const n = fromInt(intVal);
  return n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " كجم";
}


export function computeInvoiceItem({
  grossWeight = 0, basketCount = 0, basketWeightEach = 0.5,
  price = 0, basketPrice = 0, commissionRate = 0, porterage = 0, manualFinal = null,
}) {
  const grossW = Number(grossWeight) || 0;
  const bCount = Number(basketCount) || 0;
  const bWeight = Number(basketWeightEach) || 0;
  const priceI = Number(price) || 0;
  const basketPriceI = Number(basketPrice) || 0;
  const commRate = Number(commissionRate) || 0;
  const porterageI = toInt(porterage);

  const netWeight = grossW - (bCount * bWeight);
  const amountBefore = Math.round(netWeight * priceI);
  const rawCommissionValue = Math.round(amountBefore * (commRate / 100));
  const commissionValue = rawCommissionValue;
  const amountAfterComm = amountBefore + commissionValue;
  const basketPriceTotal = Math.round(bCount * basketPriceI);
  const autoFinal = amountAfterComm + porterageI + basketPriceTotal;
  const roundedFinal = roundDownToStep(autoFinal, 250);
  const finalAmount = (manualFinal !== null && manualFinal !== "")
    ? toInt(manualFinal)
    : roundedFinal;

  return {
    // ─── الحقول الخام (يحتاجها db.js للإدراج) ───
    gross_weight: grossW,
    basket_count: bCount,
    basket_weight_each: bWeight,
    price: priceI,
    basket_price: basketPriceI,
    commission_rate: commRate,
    porterage: porterageI,

    // ─── الحقول المحسوبة ───
    net_weight: netWeight,
    amount_before: amountBefore,
    commission_value: commissionValue,
    amount_after_comm: amountAfterComm,
    basket_price_total: basketPriceTotal,
    final_amount: finalAmount,

    // ─── نسخة للعرض في الواجهة فقط ───
    display: {
      netWeight,
      amountBefore,
      commissionValue,
      amountAfterComm,
      basketPriceTotal,
      finalAmount,
    },
  };
}
/** حساب إجماليات الفاتورة من بنودها */
export function computeInvoiceTotals(items, paidAmount = 0) {
  const totalFinal = items.reduce((s, it) => s + toInt(it.final_amount), 0);
  const paidI = toInt(paidAmount);
  const remaining = Math.max(0, totalFinal - paidI);
  
  return { 
    total_final: totalFinal, // هذا رقم خام
    paid_amount: paidI, 
    remaining 
  };
}
