/**
 * money.js — حسابات آمنة بالأعداد الصحيحة
 * جميع القيم تُخزَّن مضروبة × 100 (أصغر وحدة) لتجنّب أخطاء Floating point
 */

/** تحويل نص/رقم إلى عدد صحيح آمن (× 100) */
export function toInt(val) {
  if (val === null || val === undefined || val === "") return 0;
  return Math.round(Number(val)); // إزالة ضرب 100
}
/** تحويل عدد صحيح (× 100) إلى رقم عشري للعرض */
/** تحويل القيمة للعرض (بدون كسور) */
export function fromInt(val) {
  return Math.round(Number(val) || 0);
}

/** تنسيق مبلغ للعرض بالعربية */
export function formatMoney(intVal, currency = "د.ع") {
  const n = Math.round(Number(intVal) || 0);
  return n.toLocaleString("en-US") + (currency ? " " + currency : "");
}

/** تنسيق وزن للعرض */
export function formatWeight(intVal) {
  const n = fromInt(intVal);
  return n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " كجم";
}

/**
 * سلسلة حساب بند الفاتورة — الترتيب إلزامي
 *
 * المدخلات (كلها أرقام عشرية من المستخدم):
 *   grossWeight      — الوزن الكلي (كجم)
 *   basketCount      — عدد السلات
 *   basketWeightEach — وزن السلة الواحدة (كجم، افتراضي 0.5)
 *   price            — السعر لكل كجم
 *   commissionRate   — نسبة العمولة % (مثلاً 5)
 *   porterage        — الحمالية (مبلغ رقمي)
 *   manualFinal      — مبلغ نهائي يدوي (اختياري، يتجاوز الحساب)
 *
 * المخرجات (كلها أعداد صحيحة × 100):
 *   netWeight, amountBefore, commissionValue, amountAfterComm, finalAmount
 */
export function computeInvoiceItem({
  grossWeight = 0, basketCount = 0, basketWeightEach = 0.5,
  price = 0, commissionRate = 0, porterage = 0, manualFinal = null,
}) {
  const grossW = Number(grossWeight) || 0;
  const bCount = Number(basketCount) || 0;
  const bWeight = Number(basketWeightEach) || 0;
  const priceI = Number(price) || 0;
  const commRate = Number(commissionRate) || 0;
  const porterageI = Number(porterage) || 0;

  const netWeight = grossW - (bCount * bWeight);
  const amountBefore = Math.round(netWeight * priceI);
  const commissionValue = Math.round(amountBefore * (commRate / 100));
  const amountAfterComm = amountBefore + commissionValue;
  const autoFinal = amountAfterComm + porterageI;
  const finalAmount = (manualFinal !== null && manualFinal !== "")
    ? Number(manualFinal)
    : autoFinal;

  return {
    // ─── الحقول الخام (يحتاجها db.js للإدراج) ───
    gross_weight: grossW,
    basket_count: bCount,
    basket_weight_each: bWeight,
    price: priceI,
    commission_rate: commRate,
    porterage: porterageI,

    // ─── الحقول المحسوبة ───
    net_weight: netWeight,
    amount_before: amountBefore,
    commission_value: commissionValue,
    amount_after_comm: amountAfterComm,
    final_amount: finalAmount,

    // ─── نسخة للعرض في الواجهة فقط ───
    display: {
      netWeight,
      amountBefore,
      commissionValue,
      amountAfterComm,
      finalAmount,
    },
  };
}
/** حساب إجماليات الفاتورة من بنودها */
export function computeInvoiceTotals(items, paidAmount = 0) {
  // تجميع الأرقام الخام فقط
  const totalFinal = items.reduce((s, it) => s + (Number(it.final_amount) || 0), 0);
  const paidI = toInt(paidAmount);
  const remaining = Math.max(0, totalFinal - paidI);
  
  return { 
    total_final: totalFinal, // هذا رقم خام
    paid_amount: paidI, 
    remaining 
  };
}
