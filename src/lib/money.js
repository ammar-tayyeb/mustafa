/**
 * money.js — حسابات آمنة بالأعداد الصحيحة
 * جميع القيم تُخزَّن مضروبة × 100 (أصغر وحدة) لتجنّب أخطاء Floating point
 */

/** تحويل نص/رقم إلى عدد صحيح آمن (× 100) */
export function toInt(val) {
  if (val === null || val === undefined || val === "") return 0;
  return Math.round(Number(val) * 100);
}

/** تحويل عدد صحيح (× 100) إلى رقم عشري للعرض */
export function fromInt(val) {
  return (Number(val) || 0) / 100;
}

/** تنسيق مبلغ للعرض بالعربية */
export function formatMoney(intVal, currency = "ريال") {
  const n = fromInt(intVal);
  return n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;
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
  grossWeight = 0,
  basketCount = 0,
  basketWeightEach = 0.5,
  price = 0,
  commissionRate = 0,
  porterage = 0,
  manualFinal = null,
}) {
  // تحويل المدخلات إلى أعداد صحيحة
  const grossW  = toInt(grossWeight);
  const bCount  = Math.round(Number(basketCount) || 0);
  const bWeight = toInt(basketWeightEach);
  const priceI  = toInt(price);
  const commR   = toInt(commissionRate);   // نسبة × 100 (مثلاً 5% = 500)
  const portI   = toInt(porterage);

  // 1. صافي الوزن = الوزن الكلي − (عدد السلات × وزن السلة)
  const netWeight = grossW - bCount * bWeight;

  // 2. المبلغ قبل العمولة = صافي الوزن × السعر ÷ 10000 (لأن كلاهما × 100)
  const amountBefore = Math.round((netWeight * priceI) / 10000);

  // 3. قيمة العمولة = المبلغ × نسبة العمولة ÷ 10000
  const commissionValue = Math.round((amountBefore * commR) / 10000);

  // 4. المبلغ بعد العمولة
  const amountAfterComm = amountBefore - commissionValue;

  // 5. المبلغ النهائي = بعد العمولة − الحمالية (أو يدوي)
  const autoFinal = amountAfterComm - portI;
  const finalAmount = manualFinal !== null ? toInt(manualFinal) : autoFinal;

  return {
    // أعداد صحيحة للتخزين
    gross_weight:       grossW,
    basket_count:       bCount,
    basket_weight_each: bWeight,
    net_weight:         netWeight,
    price:              priceI,
    amount_before:      amountBefore,
    commission_rate:    commR,
    commission_value:   commissionValue,
    amount_after_comm:  amountAfterComm,
    porterage:          portI,
    final_amount:       finalAmount,
    // قيم عشرية للعرض
    display: {
      netWeight:        fromInt(netWeight),
      amountBefore:     fromInt(amountBefore),
      commissionValue:  fromInt(commissionValue),
      amountAfterComm:  fromInt(amountAfterComm),
      porterage:        fromInt(portI),
      finalAmount:      fromInt(finalAmount),
    },
  };
}

/** حساب إجماليات الفاتورة من بنودها */
export function computeInvoiceTotals(items, paidAmount = 0) {
  const totalFinal = items.reduce((s, it) => s + (it.final_amount || 0), 0);
  const paidI = toInt(paidAmount);
  const remaining = Math.max(0, totalFinal - paidI);
  return { total_final: totalFinal, paid_amount: paidI, remaining };
}
