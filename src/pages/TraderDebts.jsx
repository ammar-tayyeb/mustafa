import { useState, useEffect, useCallback, useMemo } from "react";
import { CreditCard, ArrowLeftRight, Printer, Search, ChevronDown } from "lucide-react";
import { getTraders, getTraderUnpaidInvoices, getInvoiceItems, paySpecificInvoice, getAllSettings } from "../lib/db.js";
import { formatMoney, toInt } from "../lib/money.js";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { useDataContext } from "../context/DataContext.jsx";

// ─── مكوّن الفاتورة الكاملة للطباعة المجمعة (ورقة مستقلة لكل قائمة) ───
// ملاحظة: يُنسخ innerHTML إلى iframe لا يحمّل Tailwind، لذلك التنسيق هنا
// يعتمد على كلاسات getPrintStyles و inline styles فقط.
function PrintableInvoice({ invoice, rows, traderName, marketName, dateTime }) {
  return (
    <div className="print-page-wrapper">
      <div className="invoice-book-container">
        <div className="flex-row-header">
          <div style={{ textAlign: 'right' }}>
            <h2 className="text-xl font-black text-red-900" style={{ margin: 0 }}>{marketName}</h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', fontWeight: 'bold', color: '#000' }}>مُجاز لبيع الفواكه والخُضر بالجملة</p>
            <p style={{ margin: 0, fontSize: '11px', color: '#4b5563' }}>موصل - سوق جملة نينوى - الأيمن</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <div className="border-box-office" style={{ color: '#000' }}>رقم المكتب ( ٣٥ )</div>
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#000' }}>ID: #{invoice.id.slice(0, 8)}</div>
          </div>
        </div>

        <div className="flex-row-info" style={{ color: '#000' }}>
          <div className="info-item">
            <span className="font-bold">حضرة السيد :</span>
            <span className="dotted-line">{traderName}</span>
          </div>
          <div className="info-item">
            <span className="font-bold">التاريخ والوقت :</span>
            <span className="dotted-line" style={{ fontFamily: 'monospace' }}>{dateTime}</span>
          </div>
        </div>

        <table className="invoice-book-table">
          <thead>
            <tr>
              <th style={{ width: "5%" }}>ت</th>
              <th style={{ width: "22%" }}>المبلغ</th>
              <th style={{ width: "13%" }}>الوزن</th>
              <th style={{ width: "13%" }}>السعر</th>
              <th style={{ width: "11%" }}>العدد</th>
              <th style={{ width: "20%" }}>النوع (المادة)</th>
              <th style={{ width: "16%" }}> التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${invoice.id}-row-${index}`}>
                <td>{row.number}</td>
                <td className="font-bold">{row.amount}</td>
                <td>{row.weight}</td>
                <td>{row.price}</td>
                <td>{row.count}</td>
                <td style={{ fontWeight: '700' }}>{row.type}</td>
                <td>{row.details}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '8px', color: '#000', fontSize: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', border: '1px solid #000', padding: '8px', backgroundColor: '#f9fafb', minWidth: '240px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>الحساب الإجمالي:</span>
              <span className="font-bold">{formatMoney(invoice.total_final)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #000', paddingTop: '4px' }}>
              <span>المبلغ الواصل:</span>
              <span className="font-bold" style={{ color: '#065f46' }}>{formatMoney(invoice.paid_amount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #000', paddingTop: '4px' }} className="font-bold">
              <span>المتبقي :</span>
              <span className="font-black" style={{ color: '#b91c1c' }}>{formatMoney(invoice.remaining)}</span>
            </div>
          </div>

          <div className="signatures" style={{ flex: 1, display: 'flex', justifyContent: 'space-around', paddingTop: '24px' }}>
            <div>توقيع المستلم: ........................</div>
            <div>توقيع الحسابات: ........................</div>
          </div>
        </div>

        <div style={{ marginTop: '12px', fontSize: '10px', color: '#4b5563', borderTop: '1px dashed #000', paddingTop: '4px' }}>
          <span>ملاحظات الفاتورة: {invoice.notes || "لا يوجد ملاحظات إضافية."}</span>
        </div>
      </div>
    </div>
  );
}

export default function TradersDebts() {
  const { drivers, debtInvoices, settleDebtInvoice } = useDataContext();
  const [traders, setTraders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTrader, setSelectedTrader] = useState(null);
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null); // القائمة المفتوحة حالياً (واحدة فقط)
  const [selectedInvoices, setSelectedInvoices] = useState([]); // معرفات القوائم المحددة (Checkbox)
  const [confirmPaySelected, setConfirmPaySelected] = useState(false);
  const [payingSelected, setPayingSelected] = useState(false);
  const [batchPrintInvoices, setBatchPrintInvoices] = useState(null); // قوائم (مع بنودها) قيد الطباعة المجمعة
  const [printingSelected, setPrintingSelected] = useState(false);
  const [printingDebtInvoiceIds, setPrintingDebtInvoiceIds] = useState([]);
  const [expandedDebtInvoiceId, setExpandedDebtInvoiceId] = useState(null);
  const [selectedDebtInvoiceIds, setSelectedDebtInvoiceIds] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [marketName, setMarketName] = useState("مكتب الموصل");

  // استمارة التسديد لقائمة محددة
  const [activeInvoiceToPay, setActiveInvoiceToPay] = useState(null);
  const [payForm, setPayForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), notes: "" });
  const [submitting, setSubmitting] = useState(false);

  // جلب اسم السوق من الإعدادات للطباعة
  useEffect(() => {
    getAllSettings().then(s => {
      if (s?.market_name) setMarketName(s.market_name);
    });
  }, []);

  // تحميل التجار المسجلين لديهم ديون
  const loadTraders = useCallback(async () => {
    const res = await getTraders();
    setTraders(res.filter(t => t.debt_fils > 0));
  }, []);

  useEffect(() => { loadTraders(); }, [loadTraders]);

  useEffect(() => {
    const handleAfterPrint = () => setPrintingDebtInvoiceIds([]);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const printDebtInvoices = (invoiceIds) => {
    setPrintingDebtInvoiceIds(invoiceIds);
    window.setTimeout(() => window.print(), 0);
  };

  const toggleDebtInvoiceSelection = (invoiceId) => {
    setSelectedDebtInvoiceIds(previous => previous.includes(invoiceId)
      ? previous.filter(id => id !== invoiceId)
      : [...previous, invoiceId]);
  };

  const debtPeople = useMemo(() => [
    ...traders.map(trader => ({ ...trader, personType: "grocer", debtAmount: Number(trader.debt_fils || 0) })),
    ...drivers
      .filter(driver => Number(driver.debt || 0) > 0)
      .map(driver => ({ ...driver, personType: "driver", debtAmount: Number(driver.debt || 0) })),
  ], [traders, drivers]);

  const filteredDebtPeople = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return debtPeople;
    return debtPeople.filter(person =>
      person.name.toLowerCase().includes(query) ||
      (person.phone && person.phone.includes(query))
    );
  }, [debtPeople, searchQuery]);

  const selectedDebtInvoices = useMemo(() => {
    if (!selectedTrader) return [];
    return debtInvoices.filter(invoice =>
      String(invoice.personId) === String(selectedTrader.id) &&
      invoice.personType === selectedTrader.personType &&
      Number(invoice.remaining) > 0
    );
  }, [debtInvoices, selectedTrader]);

  const displayedInvoices = useMemo(() => [
    ...unpaidInvoices,
    ...selectedDebtInvoices.map(invoice => ({
      ...invoice,
      isWithdrawalDebt: true,
      product_summary: "سحب",
      notes: invoice.details,
      items: [],
    })),
  ], [unpaidInvoices, selectedDebtInvoices]);

  const checkedDebtInvoices = useMemo(
    () => selectedDebtInvoices.filter(invoice => selectedDebtInvoiceIds.includes(invoice.id)),
    [selectedDebtInvoices, selectedDebtInvoiceIds]
  );

  // فتح/إغلاق قائمة (Accordion): فتح قائمة يغلق السابقة، والضغط على المفتوحة يغلقها
  const toggleExpanded = (invoiceId) => {
    setExpandedInvoiceId(prev => (prev === invoiceId ? null : invoiceId));
  };

  // تحديد / إلغاء تحديد قائمة
  const toggleInvoiceSelection = (invoiceId) => {
    setSelectedInvoices(prev =>
      prev.includes(invoiceId) ? prev.filter(id => id !== invoiceId) : [...prev, invoiceId]
    );
  };

  // القوائم المحددة فعلياً (تتجاهل أي معرف لم يعد موجوداً بعد التسديد)
  const checkedInvoices = useMemo(
    () => displayedInvoices.filter(inv => selectedInvoices.includes(inv.id)),
    [displayedInvoices, selectedInvoices]
  );

  // مجموع المبالغ المطلوبة (المتبقي) للقوائم المحددة
  const calculateSelectedTotal = (invoices) =>
    invoices.reduce((sum, inv) => sum + Number(inv.remaining || 0), 0);

  const selectedTotal = useMemo(() => calculateSelectedTotal(checkedInvoices), [checkedInvoices]);

  const formatInvoiceDate = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("ar-IQ-u-nu-latn");
  };

  const handleSelectTrader = async (trader) => {
    setSelectedTrader(trader);
    setLoadingInvoices(true);
    setActiveInvoiceToPay(null);
    setExpandedInvoiceId(null);
    setSelectedInvoices([]);
    setSelectedDebtInvoiceIds([]);
    try {
      const invoices = trader.personType === "grocer" ? await getTraderUnpaidInvoices(trader.id) : [];
      const invoicesWithItems = await Promise.all(
        invoices.map(async invoice => ({
          ...invoice,
          items: await getInvoiceItems(invoice.id),
        }))
      );
      setUnpaidInvoices(invoicesWithItems);
    } catch (e) {
      alert("خطأ أثناء جلب القوائم: " + e.message);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const openPayModal = (invoice) => {
    setActiveInvoiceToPay(invoice);
    setPayForm({
      // تم إلغاء القسمة على 1000 ليتم ملء المبلغ بالكامل ومباشرة
      amount: invoice.remaining.toString(),
      date: new Date().toISOString().slice(0, 10),
      notes: `تسديد كامل القائمة رقم ${invoice.id.slice(0, 6)}`
    });
  };

  const handleInvoicePayment = async (e) => {
    e.preventDefault();
    if (!payForm.amount || Number(payForm.amount) <= 0) return;
    
    const amountInFils = toInt(payForm.amount);
    if (amountInFils > activeInvoiceToPay.remaining) {
      alert("المبلغ المدخل أكبر من المتبقي في هذه القائمة!");
      return;
    }

    setSubmitting(true);
    try {
      if (activeInvoiceToPay.isWithdrawalDebt) {
        await settleDebtInvoice(activeInvoiceToPay.withdrawalId, amountInFils);
      } else {
        await paySpecificInvoice({
          trader_id: selectedTrader.id,
          invoice_id: activeInvoiceToPay.id,
          amount: amountInFils,
          date: payForm.date,
          notes: payForm.notes
        });
      }
      
      await loadTraders();
      await refreshTraderInvoices(selectedTrader);
      setActiveInvoiceToPay(null);
    } catch (error) {
      alert("فشل التسديد: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // إعادة تحميل قوائم التاجر الحالي مع بنودها
  const refreshTraderInvoices = async (trader) => {
    const invoices = trader.personType === "grocer" ? await getTraderUnpaidInvoices(trader.id) : [];
    const withItems = await Promise.all(
      invoices.map(async invoice => ({ ...invoice, items: await getInvoiceItems(invoice.id) }))
    );
    setUnpaidInvoices(withItems);
  };

  // ─── تسديد القوائم المحددة بالكامل ───
  // كل قائمة تُسدَّد عبر paySpecificInvoice (يخصم من دين التاجر ويصفّر المتبقي
  // ويسجّل الدفعة). لا توجد حالة "مسددة" في النظام: القائمة المسددة = متبقيها صفر
  // فتختفي تلقائياً من هذه الصفحة. التنفيذ تتابعي ويتوقف عند أول خطأ، وإعادة
  // المحاولة آمنة لأن المتبقي يُعاد جلبه من قاعدة البيانات قبل كل تنفيذ.
  const handlePaySelectedInvoices = async () => {
    if (payingSelected || !selectedTrader || checkedInvoices.length === 0) return;
    setPayingSelected(true);

    const trader = selectedTrader;
    const ids = checkedInvoices.map(inv => inv.id);
    let paidCount = 0;

    try {
      const fresh = trader.personType === "grocer" ? await getTraderUnpaidInvoices(trader.id) : [];
      const salesTargets = fresh.filter(inv => ids.includes(inv.id) && Number(inv.remaining) > 0);
      const withdrawalTargets = selectedDebtInvoices.filter(inv => ids.includes(inv.id) && Number(inv.remaining) > 0);
      const date = new Date().toISOString().slice(0, 10);

      for (const inv of salesTargets) {
        await paySpecificInvoice({
          trader_id: trader.id,
          invoice_id: inv.id,
          amount: Number(inv.remaining),
          date,
          notes: `تسديد كامل القائمة رقم ${inv.id.slice(0, 6)}`,
        });
        paidCount++;
      }
      for (const inv of withdrawalTargets) {
        await settleDebtInvoice(inv.withdrawalId, Number(inv.remaining));
        paidCount++;
      }
      setSelectedInvoices([]);
    } catch (error) {
      alert(`تم تسديد ${paidCount} من ${ids.length} قائمة قبل حدوث الخطأ: ${error?.message || error}`);
    } finally {
      setConfirmPaySelected(false);
      try {
        await refreshTraderInvoices(trader);
        await loadTraders();
      } catch (e) {
        console.error("خطأ في تحديث البيانات بعد التسديد:", e);
      }
      setPayingSelected(false);
    }
  };

  // الستايل المشترك الثابت الموجه للطباعة الصارمة والـ Iframe
  // ملاحظة مهمة: هذا الـ iframe لا يحمّل Tailwind إطلاقاً،
  // لذلك أي تنسيق نحتاجه بالطباعة يجب أن يكون هنا كـ CSS صريح
  // أو مكتوب كـ inline style داخل الـ JSX، وليس كـ className من Tailwind.
  const getPrintStyles = () => `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
    html, body {
      width: 100%;
    }
    body {
      margin: 0;
      padding: 0;
      direction: rtl;
      background-color: #fff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: A5 landscape;
      margin: 0.4cm;
    }
    .print-page-wrapper {
      page-break-after: always;
      break-after: page;
      box-sizing: border-box;
      width: 100%;
    }
    .print-page-wrapper:last-child {
      page-break-after: avoid;
      break-after: auto;
    }
    @media print {
      .print-page-wrapper {
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .print-page-wrapper:last-child {
        page-break-after: avoid;
        break-after: auto;
      }
    }
    .invoice-book-container {
      border: 2px solid #000 !important;
      padding: 14px;
      background-color: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-family: 'Cairo', sans-serif;
      box-sizing: border-box;
      width: 100%;
    }
    .invoice-book-container,
    .invoice-book-container * {
      font-family: 'Cairo', Arial, sans-serif;
      font-variant-numeric: tabular-nums;
    }
    .flex-row-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
    }
    .flex-row-info {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      border-bottom: 1px solid #000;
      padding-bottom: 6px;
      font-size: 13px;
    }
    .info-item {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 48%;
    }
    .dotted-line {
      border-bottom: 1px dotted #000;
      flex-grow: 1;
      padding-bottom: 2px;
      font-weight: bold;
      font-size: 14px;
    }
    .invoice-book-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      margin-bottom: 12px;
    }
    .invoice-book-table th {
      background-color: #7f1d1d !important;
      color: #ffffff !important;
      border: 1px solid #000 !important;
      padding: 6px 4px;
      font-size: 13px;
      font-weight: bold;
      text-align: center;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .invoice-book-table td {
      border: 1px solid #000 !important;
      padding: 6px;
      font-size: 13px;
      text-align: center;
      height: 38px;
      color: #000 !important;
    }
    .footer-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      font-size: 12px;
      font-weight: bold;
      margin-top: 14px;
    }
    .signatures {
      display: flex;
      justify-content: space-around;
      width: 60%;
    }
    .text-red-900 { color: #7f1d1d !important; }
    .font-black { font-weight: 900; }
    .font-bold { font-weight: 700; }
    .text-xl { font-size: 20px; }
    .border-box-office { border: 1px solid #000; padding: 2px 8px; font-weight: bold; font-size: 12px; border-radius: 3px; }
  `;

  const executePrint = (htmlContent) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <html lang="ar-IQ-u-nu-latn" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>طباعة الحسابات</title>
          <style>${getPrintStyles()}</style>
        </head>
        <body>${htmlContent}</body>
      </html>
    `);
    doc.close();

    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      document.body.removeChild(iframe);
    }, 350);
  };

  // طباعة الوصل: نفس مسار الطباعة المجمعة (PrintableInvoice) ليكون الناتج مطابقاً تماماً
  const printSingleDebt = (invoiceId) => {
    const inv = displayedInvoices.find(i => i.id === invoiceId);
    if (!inv) return;
    setBatchPrintInvoices([inv]);
  };

  const printAllTraderInvoices = () => {
    const printArea = document.getElementById("all-trader-invoices-print-zone");
    if (printArea) executePrint(printArea.innerHTML);
  };

  // ─── الطباعة المجمعة للقوائم المحددة ───
  // 1) نجلب بنود كل قائمة محددة  2) نرسمها في المنطقة المخفية  3) الـ effect يطبعها
  const printSelectedInvoices = async () => {
    if (printingSelected || checkedInvoices.length === 0) return;
    setPrintingSelected(true);
    try {
      const withItems = await Promise.all(
        checkedInvoices.map(async inv => ({ ...inv, items: await getInvoiceItems(inv.id) }))
      );
      setBatchPrintInvoices(withItems);
    } catch (e) {
      alert("خطأ أثناء تجهيز الطباعة: " + (e?.message || e));
      setPrintingSelected(false);
    }
  };

  useEffect(() => {
    if (!batchPrintInvoices) return;
    const zone = document.getElementById("selected-invoices-print-zone");
    if (zone) executePrint(zone.innerHTML);
    setBatchPrintInvoices(null);
    setPrintingSelected(false);
  }, [batchPrintInvoices]);

  // توليد الوقت والتاريخ الحالي معاً بدقة (أرقام لاتينية 1,2,3)
  const currentDateTime = useMemo(() => {
    const now = new Date();
    const timeString = now.toLocaleTimeString("ar-IQ-u-nu-latn", { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateString = now.toLocaleDateString("ar-IQ-u-nu-latn");
    return `${timeString} | ${dateString}`;
  }, [unpaidInvoices, selectedTrader]);

  // مطابقة تنسيق الوزن تماماً لصفحة القوائم: رقم فقط بدون وحدة "كجم"
  const formatWeightValue = (value) => {
    const numericValue = Number(value || 0);
    return numericValue.toLocaleString("en-US", { numberingSystem: "latn" });
  };

  const buildInvoiceRows = (invoice) => {
    const minimumRows = 4;

    if (invoice.items?.length) {
      const realRows = invoice.items.map((item, index) => ({
        number: index + 1,
        amount: formatMoney(item.final_amount ?? 0),
        weight: formatWeightValue(item.net_weight),
        price: Number(item.price ?? 0).toLocaleString("en-US", { numberingSystem: "latn" }),
        count: Number(item.basket_count ?? 0).toLocaleString("en-US", { numberingSystem: "latn" }),
        type: item.product_name || "—",
        details: "جملة",
      }));

      const fillerRows = Array.from({ length: Math.max(0, minimumRows - realRows.length) }, (_, index) => {
        const rowNumber = realRows.length + index + 1;
        return {
          number: rowNumber,
          amount: "",
          weight: "",
          price: "",
          count: "",
          type: "",
          details: "",
        };
      });

      return [...realRows, ...fillerRows];
    }

    return Array.from({ length: minimumRows }, (_, index) => ({
      number: index + 1,
      amount: index === 0 ? formatMoney(invoice.remaining ?? 0) : "",
      weight: "",
      price: "",
      count: "",
      type: index === 0 ? (invoice.product_summary || "قيد دين يدوي") : "",
      details: index === 0 ? (invoice.notes || invoice.product_summary || "قيد دين يدوي") : "",
    }));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
      
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
        .invoice-book-container {
          border: 2px solid #000 !important;
          padding: 14px;
          background-color: #fff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          font-family: 'Cairo', sans-serif;
          direction: rtl;
          border-radius: 4px;
          box-sizing: border-box;
          width: 100%;
        }
        .flex-row-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #000;
          padding-bottom: 6px;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .flex-row-info {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          border-bottom: 1px solid #000;
          padding-bottom: 6px;
          font-size: 13px;
        }
        .info-item {
          display: flex;
          align-items: center;
          gap: 4px;
          width: 48%;
        }
        .dotted-line {
          border-bottom: 1px dotted #000;
          flex-grow: 1;
          padding-bottom: 2px;
          font-weight: bold;
          font-size: 14px;
        }
        .invoice-book-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 12px;
          margin-bottom: 12px;
        }
        .invoice-book-table th {
          background-color: #7f1d1d !important;
          color: #fff !important;
          border: 1px solid #000 !important;
          padding: 6px 4px;
          font-size: 13px;
          font-weight: bold;
          text-align: center;
        }
        .invoice-book-table td {
          border: 1px solid #000 !important;
          padding: 6px;
          font-size: 13px;
          text-align: center;
          height: 38px;
          color: #000 !important;
        }
        .footer-row {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          font-size: 12px;
          font-weight: bold;
          margin-top: 14px;
        }
        .signatures {
          display: flex;
          justify-content: space-around;
          width: 60%;
        }
        .border-box-office {
          border: 1px solid #000;
          padding: 2px 8px;
          font-weight: bold;
          font-size: 12px;
          border-radius: 3px;
        }
      `}</style>

      {/* القسم الأيمن: قائمة التجار */}
      <div className="md:col-span-4 border border-border rounded-xl bg-card p-4 flex flex-col gap-4 overflow-y-auto no-print print:hidden">
        <div>
          <h3 className="font-bold text-lg">أرصدة الديون</h3>
            <p className="text-xs text-muted-foreground">اختر بقالاً أو سائقاً لعرض قوائم دينه</p>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="ابحث باسم البگال أو رقم الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-input bg-background pr-9 pl-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
          />
        </div>
        
        <div className="flex flex-col gap-2">
          {filteredDebtPeople.map(t => (
            <button
              key={`${t.personType}-${t.id}`}
              onClick={() => handleSelectTrader(t)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border text-right transition-all ${
                selectedTrader?.id === t.id && selectedTrader?.personType === t.personType
                  ? "border-primary bg-primary/5 ring-1 ring-primary" 
                  : "border-border bg-background hover:bg-accent"
              }`}
            >
              <div>
                <p className="font-medium text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.phone || "بلا هاتف"}</p>
              </div>
              <span className="text-sm font-semibold text-destructive">{formatMoney(t.debtAmount)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* القسم الأيسر: Master-Detail لقوائم التاجر */}
      <div className="md:col-span-8 print:col-span-12 print:w-full print:border-0 print:bg-white print:p-0 border border-border rounded-xl bg-card p-4 flex flex-col gap-4 overflow-y-auto">
        {selectedTrader ? (
          <>
            <div className="flex items-center justify-between border-b pb-3 border-border no-print">
              <div>
                <h3 className="font-bold text-lg text-primary">قوائم الديون المستحقة</h3>
                <p className="text-xs text-muted-foreground">العميل الحالي: {selectedTrader.name}</p>
              </div>
              
              <button
                onClick={printAllTraderInvoices}
                className="flex items-center gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 px-3 py-2 rounded-lg transition-colors"
              >
                <Printer size={14} /> طباعة القوائم ({displayedInvoices.length})
              </button>
            </div>

            {selectedDebtInvoices.length < 0 && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <div>
                    <h4 className="font-bold text-base text-destructive">قوائم ديون السحوبات</h4>
                    <p className="text-xs text-muted-foreground">مبالغ تحولت إلى دين على {selectedTrader.name}</p>
                  </div>
                  <div className="no-print flex items-center gap-2">
                    <span className="text-xs font-semibold text-destructive">{selectedDebtInvoices.length} قائمة</span>
                    {checkedDebtInvoices.length > 0 && (
                      <button type="button" onClick={() => printDebtInvoices(checkedDebtInvoices.map(invoice => invoice.id))} className="flex items-center gap-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-primary hover:bg-accent">
                        <Printer size={13} /> طباعة المحدد ({checkedDebtInvoices.length})
                      </button>
                    )}
                  </div>
                </div>

                {selectedDebtInvoices.map(invoice => {
                  const isExpanded = expandedDebtInvoiceId === invoice.id;
                  const isPrinting = printingDebtInvoiceIds.includes(invoice.id);
                  const debtRows = Array.from({ length: 4 }, (_, index) => ({
                    number: index + 1,
                    amount: index === 0 ? formatMoney(invoice.total_final) : "",
                    weight: "",
                    price: "",
                    count: "",
                    type: index === 0 ? "سحب" : "",
                    details: index === 0 ? invoice.details : "",
                  }));
                  return (
                    <div
                      key={invoice.id}
                      className={`rounded-lg border border-border bg-background ${
                        printingDebtInvoiceIds.length > 0 && !printingDebtInvoiceIds.includes(invoice.id) ? "print:hidden" : ""
                      }`}
                    >
                      <div className="print:hidden flex items-center gap-2 rounded-lg px-3 py-3 hover:bg-accent/50">
                        <input
                          type="checkbox"
                          checked={selectedDebtInvoiceIds.includes(invoice.id)}
                          onChange={() => toggleDebtInvoiceSelection(invoice.id)}
                          aria-label="تحديد قائمة دين السحب"
                          className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
                        />
                        <button
                          type="button"
                          onClick={() => setExpandedDebtInvoiceId(prev => prev === invoice.id ? null : invoice.id)}
                          className="flex flex-1 items-center justify-between gap-3 text-right"
                        >
                          <span className="text-sm text-muted-foreground">{formatInvoiceDate(invoice.date)}</span>
                          <span className="flex flex-1 items-center justify-center gap-3 text-sm font-bold">
                            <span>{formatMoney(invoice.total_final)}</span>
                            <span className="text-destructive">سحب</span>
                          </span>
                          <ChevronDown size={16} className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                      </div>

                      {(isExpanded || isPrinting) && (
                        <div className={`${isPrinting ? "" : "border-t border-border p-3"}`}>
                          <div className="invoice-book-container print:w-full print:bg-white print:shadow-none">
                            <div className="flex-row-header print:flex">
                            <div>
                              <h4 className="text-lg font-black text-red-900" style={{ margin: 0 }}>قائمة دين</h4>
                              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "#4b5563" }}>رقم القائمة: {invoice.id.slice(0, 14)}</p>
                            </div>
                            <div style={{ textAlign: "left", fontSize: "12px", color: "#000" }}>
                              <div className="font-bold">{selectedTrader.name}</div>
                              <div>{formatInvoiceDate(invoice.date)}</div>
                            </div>
                            <div className="no-print print:hidden flex gap-2">
                                <button type="button" onClick={() => printDebtInvoices([invoice.id])} className="flex items-center gap-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-primary hover:bg-accent">
                                <Printer size={13} /> طباعة القائمة
                              </button>
                              {invoice.remaining > 0 && (
                                <button type="button" onClick={() => openPayModal(invoice)} className="flex items-center gap-1 rounded bg-green-600 px-2 py-1.5 text-xs text-white hover:bg-green-700">
                                  <CreditCard size={13} /> تسديد
                                </button>
                              )}
                            </div>
                            </div>
                            <table className="invoice-book-table">
                              <thead>
                                <tr>
                                  <th style={{ width: "5%" }}>ت</th>
                                  <th style={{ width: "22%" }}>المبلغ</th>
                                  <th style={{ width: "13%" }}>الوزن</th>
                                  <th style={{ width: "13%" }}>السعر</th>
                                  <th style={{ width: "11%" }}>العدد</th>
                                  <th style={{ width: "20%" }}>النوع (المادة)</th>
                                  <th style={{ width: "16%" }}>التفاصيل</th>
                                </tr>
                              </thead>
                              <tbody>
                                {debtRows.map(row => (
                                  <tr key={`${invoice.id}-debt-row-${row.number}`}>
                                    <td>{row.number}</td>
                                    <td className="font-bold">{row.amount}</td>
                                    <td>{row.weight}</td>
                                    <td>{row.price}</td>
                                    <td>{row.count}</td>
                                    <td style={{ fontWeight: "700" }}>{row.type}</td>
                                    <td>{row.details}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="mt-2 flex justify-between border-t border-dashed border-black pt-2 text-sm font-bold" style={{ color: "#000" }}>
                              <span>المتبقي من قائمة الدين</span><span className="text-destructive">{formatMoney(invoice.remaining)}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* ── شريط الإجراءات: يظهر عند تحديد قائمة أو أكثر ── */}
            {!loadingInvoices && checkedInvoices.length > 0 && (
              <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 no-print">
                <div className="flex items-center gap-4 text-xs">
                  <div>
                    القوائم المحددة:{" "}
                    <span className="font-bold text-sm">{checkedInvoices.length}</span>
                  </div>
                  <div>
                    المبلغ المطلوب:{" "}
                    <span className="font-bold text-sm text-destructive">{formatMoney(selectedTotal)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmPaySelected(true)}
                    disabled={payingSelected}
                    className="flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    <CreditCard size={13} /> {payingSelected ? "جارٍ التسديد..." : "تسديد القوائم المحددة"}
                  </button>
                  <button
                    type="button"
                    onClick={printSelectedInvoices}
                    disabled={printingSelected}
                    className="flex items-center gap-1 rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent disabled:opacity-60"
                  >
                    <Printer size={13} /> {printingSelected ? "جارٍ التجهيز..." : "طباعة القوائم المحددة"}
                  </button>
                </div>
              </div>
            )}

            {loadingInvoices ? (
              <div className="text-center py-12 text-muted-foreground text-sm no-print">جارٍ جلب القوائم الحالية...</div>
            ) : displayedInvoices.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12 no-print">لا توجد قوائم دين أو مبيعات معلقة لهذا الشخص.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {displayedInvoices.map(inv => {
                  const isOpen = inv.id === expandedInvoiceId;
                  const isChecked = selectedInvoices.includes(inv.id);
                  return (
                    <div
                      key={inv.id}
                      className={`rounded-lg border bg-background transition-colors print:shadow-none print:border-none print:m-0 print:p-0 print:w-full ${
                        isOpen ? "border-primary ring-1 ring-primary" : "border-border"
                      } ${isChecked ? "bg-primary/5" : ""}`}
                    >
                      {/* ── الشريط المختصر: الضغط عليه يفتح/يغلق ── */}
                      <div
                        aria-expanded={isOpen}
                        className="flex select-none items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50 no-print print:hidden"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleInvoiceSelection(inv.id)}
                          aria-label="تحديد القائمة"
                          className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
                        />
                        <div className="flex flex-1 items-center justify-between gap-3">
                          <span className="text-sm text-muted-foreground">{formatInvoiceDate(inv.date)}</span>
                          <span className="text-sm font-bold">{formatMoney(inv.total_final)}</span>
                        </div>
                        <button
                          type="button"
                          title="عرض التفاصيل"
                          aria-label={isOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                          aria-expanded={isOpen}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpanded(inv.id);
                          }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-accent"
                        >
                          <ChevronDown
                            size={16}
                            className={`text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>

                      {/* ── التفاصيل: حركة انزلاق عبر grid-template-rows (0fr → 1fr) ── */}
                      <div
                        aria-hidden={!isOpen}
                        className={`grid transition-[grid-template-rows,visibility] duration-300 ease-in-out ${
                          isOpen ? "grid-rows-[1fr] visible" : "grid-rows-[0fr] invisible"
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="flex flex-col gap-3 border-t border-border p-3 print:block print:m-0 print:p-0 print:w-full">

                            <div className="flex items-center justify-between rounded bg-muted/40 p-2 no-print">
                              <div className="text-xs font-medium">
                                قائمة #{inv.id.slice(0, 8)} | متبقي:{" "}
                                <span className="font-bold text-destructive">{formatMoney(inv.remaining)}</span>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => printSingleDebt(inv.id)} className="flex items-center gap-1 rounded border border-border bg-background p-1.5 text-xs text-primary hover:bg-accent">
                                  <Printer size={13} /> طباعة الوصل
                                </button>
                                <button onClick={() => openPayModal(inv)} className="flex items-center gap-1 rounded bg-green-600 p-1.5 text-xs text-white hover:bg-green-700">
                                  <CreditCard size={13} /> تسديد القائمة
                                </button>
                              </div>
                            </div>

                            <div id={`invoice-book-print-${inv.id}`} className="invoice-book-container print:block print:shadow-none print:border-none print:m-0 print:p-0 print:w-full">
                              <div className="flex-row-header print:flex">
                                <div style={{ textAlign: 'right' }}>
                                  <h2 className="text-xl font-black text-red-900" style={{ margin: 0 }}>{marketName}</h2>
                                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', fontWeight: 'bold', color: '#000' }}>مُجاز لبيع الفواكه والخُضر بالجملة</p>
                                  <p style={{ margin: 0, fontSize: '11px', color: '#4b5563' }}>موصل - سوق جملة نينوى - الأيمن</p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                  <div className="border-box-office" style={{ color: '#000' }}>رقم المكتب ( ٣٥ )</div>
                                  <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#000' }}>ID: #{inv.id.slice(0, 8)}</div>
                                </div>
                              </div>

                              <div className="flex-row-info" style={{ color: '#000' }}>
                                <div className="info-item">
                                  <span className="font-bold">حضرة السيد :</span>
                                  <span className="dotted-line">{selectedTrader.name}</span>
                                </div>
                                <div className="info-item">
                                  <span className="font-bold">التاريخ والوقت :</span>
                                  <span className="dotted-line" style={{ fontFamily: 'monospace' }}>{currentDateTime}</span>
                                </div>
                              </div>

                              <table className="invoice-book-table">
                                <thead>
                                  <tr>
                                    <th style={{ width: "5%" }}>ت</th>
                                    <th style={{ width: "22%" }}>المبلغ</th>
                                    <th style={{ width: "13%" }}>الوزن</th>
                                    <th style={{ width: "13%" }}>السعر</th>
                                    <th style={{ width: "11%" }}>العدد</th>
                                    <th style={{ width: "20%" }}>النوع (المادة)</th>
                                    <th style={{ width: "16%" }}> التفاصيل</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {buildInvoiceRows(inv).map((row, index) => (
                                    <tr key={`${inv.id}-row-${index}`}>
                                      <td>{row.number}</td>
                                      <td className="font-bold">{row.amount}</td>
                                      <td>{row.weight}</td>
                                      <td>{row.price}</td>
                                      <td>{row.count}</td>
                                      <td style={{ fontWeight: '700' }}>{row.type}</td>
                                      <td>{row.details}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              <div className="print:flex" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '8px', color: '#000', fontSize: '12px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', border: '1px solid #000', padding: '8px', backgroundColor: '#f9fafb', minWidth: '240px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>الحساب الإجمالي:</span>
                                    <span className="font-bold">{formatMoney(inv.total_final)}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #000', paddingTop: '4px' }}>
                                    <span>المبلغ الواصل:</span>
                                    <span className="font-bold" style={{ color: '#065f46' }}>{formatMoney(inv.paid_amount)}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #000', paddingTop: '4px' }} className="font-bold">
                                    <span>المتبقي :</span>
                                    <span className="font-black" style={{ color: '#b91c1c' }}>{formatMoney(inv.remaining)}</span>
                                  </div>
                                </div>

                                <div className="signatures" style={{ flex: 1, display: 'flex', justifyContent: 'space-around', paddingTop: '24px' }}>
                                  <div>توقيع المستلم: ........................</div>
                                  <div>توقيع الحسابات: ........................</div>
                                </div>
                              </div>

                              <div style={{ marginTop: '12px', fontSize: '10px', color: '#4b5563', borderTop: '1px dashed #000', paddingTop: '4px' }}>
                                <span>ملاحظات الفاتورة: {inv.notes || "لا يوجد ملاحظات إضافية."}</span>
                              </div>
                            </div>

                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-20 no-print">
            <ArrowLeftRight size={32} className="stroke-[1.5]" />
            <p className="text-sm">قم باختيار بگال من القائمة اليمنى لعرض السجلات.</p>
          </div>
        )}
      </div>

      {/* منطقة مخفية تماماً مخصصة لتجميع وطباعة كافة الوصولات دفعة واحدة للبگال المختار */}
      <div id="all-trader-invoices-print-zone" className="hidden">
        {displayedInvoices.map(inv => (
          <div key={`bulk-${inv.id}`} className="print-page-wrapper">
            <div className="invoice-book-container">
              <div className="flex-row-header">
                <div style={{ textAlign: 'right' }}>
                  <h2 className="text-xl font-black text-red-900" style={{ margin: 0 }}>{marketName}</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', fontWeight: 'bold', color: '#000' }}>مُجاز لبيع الفواكه والخُضر بالجملة</p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#4b5563' }}>موصل - سوق جملة نينوى - الأيمن</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <div className="border-box-office" style={{ color: '#000' }}>رقم المكتب ( ٣٥ )</div>
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#000' }}>ID: #{inv.id.slice(0, 8)}</div>
                </div>
              </div>

              <div className="flex-row-info" style={{ color: '#000' }}>
                <div className="info-item">
                  <span className="font-bold">حضرة السيد :</span>
                  <span className="dotted-line">{selectedTrader?.name}</span>
                </div>
                <div className="info-item">
                  <span className="font-bold">التاريخ والوقت :</span>
                  <span className="dotted-line" style={{ fontFamily: 'monospace' }}>{currentDateTime}</span>
                </div>
              </div>

              <table className="invoice-book-table">
                <thead>
                  <tr>
                    <th style={{ width: "5%" }}>ت</th>
                    <th style={{ width: "22%" }}>المبلغ</th>
                    <th style={{ width: "13%" }}>الوزن</th>
                    <th style={{ width: "13%" }}>السعر</th>
                    <th style={{ width: "11%" }}>العدد</th>
                    <th style={{ width: "20%" }}>النوع (المادة)</th>
                    <th style={{ width: "16%" }}> التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {buildInvoiceRows(inv).map((row, index) => (
                    <tr key={`bulk-${inv.id}-row-${index}`}>
                      <td>{row.number}</td>
                      <td className="font-bold">{row.amount}</td>
                      <td>{row.weight}</td>
                      <td>{row.price}</td>
                      <td>{row.count}</td>
                      <td style={{ fontWeight: '700' }}>{row.type}</td>
                      <td>{row.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '8px', color: '#000', fontSize: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', border: '1px solid #000', padding: '8px', backgroundColor: '#f9fafb', minWidth: '240px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>الحساب الإجمالي:</span>
                    <span className="font-bold">{formatMoney(inv.total_final)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #000', paddingTop: '4px' }}>
                    <span>المبلغ الواصل:</span>
                    <span className="font-bold" style={{ color: '#065f46' }}>{formatMoney(inv.paid_amount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #000', paddingTop: '4px' }} className="font-bold">
                    <span>المتبقي :</span>
                    <span className="font-black" style={{ color: '#b91c1c' }}>{formatMoney(inv.remaining)}</span>
                  </div>
                </div>

                <div className="signatures" style={{ flex: 1, display: 'flex', justifyContent: 'space-around', paddingTop: '24px' }}>
                  <div>توقيع المستلم: ........................</div>
                  <div>توقيع الحسابات: ........................</div>
                </div>
              </div>

              <div style={{ marginTop: '12px', fontSize: '10px', color: '#4b5563', borderTop: '1px dashed #000', paddingTop: '4px' }}>
                <span>ملاحظات الفاتورة: {inv.notes || "لا يوجد ملاحظات إضافية."}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* منطقة مخفية للطباعة المجمعة: كل قائمة فاتورة كاملة على ورقة مستقلة */}
      <div id="selected-invoices-print-zone" className="hidden">
        {batchPrintInvoices?.map(inv => (
          <PrintableInvoice
            key={`batch-${inv.id}`}
            invoice={inv}
            rows={buildInvoiceRows(inv)}
            traderName={selectedTrader?.name}
            marketName={marketName}
            dateTime={currentDateTime}
          />
        ))}
      </div>

      <ConfirmDialog
        open={confirmPaySelected}
        title="تسديد القوائم المحددة"
        message={`سيتم تسديد ${checkedInvoices.length} قائمة بمبلغ إجمالي ${formatMoney(selectedTotal)} وخصمه من دين البگال. هل تريد المتابعة؟`}
        confirmText="تسديد"
        onConfirm={handlePaySelectedInvoices}
        onCancel={() => setConfirmPaySelected(false)}
      />

      {/* نافذة التسديد المنبثقة (Modal) */}
      {activeInvoiceToPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 no-print">
          <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-sm mx-4 p-5 flex flex-col gap-4">
            <div>
              <h4 className="font-bold text-base text-green-600">تسديد دفعة لقائمة محددة</h4>
              <p className="text-xs text-muted-foreground mt-0.5">البگال: {selectedTrader?.name}</p>
            </div>
            
            <div className="bg-muted/50 p-2.5 rounded text-xs flex justify-between">
              <span>المتبقي بالقائمة:</span>
              <span className="font-bold text-destructive">{formatMoney(activeInvoiceToPay.remaining)}</span>
            </div>

            <form onSubmit={handleInvoicePayment} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">المبلغ الواصل</label>
                <input
                  required
                  type="number"
                  step="1"
                  min="1"
                  value={payForm.amount}
                  onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">التاريخ</label>
                <input
                  required
                  type="date"
                  value={payForm.date}
                  onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
 
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">ملاحظة القيد</label>
                <input
                  value={payForm.notes}
                  onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" onClick={() => setActiveInvoiceToPay(null)} className="px-3 py-1.5 rounded border border-border text-xs hover:bg-accent">إلغاء</button>
                <button type="submit" disabled={submitting} className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white font-medium text-xs disabled:opacity-60">
                  {submitting ? "جارٍ الحفظ..." : "تأكيد الواصل"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}