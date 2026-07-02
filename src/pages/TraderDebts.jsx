import { useState, useEffect, useCallback, useMemo } from "react";
import { CreditCard, Calendar, ShoppingBag, ArrowLeftRight, Printer, Search } from "lucide-react";
import { getTraders, getTraderUnpaidInvoices, paySpecificInvoice, getAllSettings } from "../lib/db.js";
import { formatMoney, toInt } from "../lib/money.js";

export default function TradersDebts() {
  const [traders, setTraders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTrader, setSelectedTrader] = useState(null);
  const [unpaidInvoices, setUnpaidInvoices] = useState([]);
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

  // تصفية التجار حركياً بناءً على نص البحث
  const filteredTraders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return traders;
    return traders.filter(t => 
      t.name.toLowerCase().includes(query) || 
      (t.phone && t.phone.includes(query))
    );
  }, [traders, searchQuery]);

  const handleSelectTrader = async (trader) => {
    setSelectedTrader(trader);
    setLoadingInvoices(true);
    setActiveInvoiceToPay(null);
    try {
      const invoices = await getTraderUnpaidInvoices(trader.id);
      setUnpaidInvoices(invoices);
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
      await paySpecificInvoice({
        trader_id: selectedTrader.id,
        invoice_id: activeInvoiceToPay.id,
        amount: amountInFils,
        date: payForm.date,
        notes: payForm.notes
      });
      
      await loadTraders();
      const updatedInvoices = await getTraderUnpaidInvoices(selectedTrader.id);
      setUnpaidInvoices(updatedInvoices);
      setActiveInvoiceToPay(null);
    } catch (error) {
      alert("فشل التسديد: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // الستايل المشترك الثابت الموجه للطباعة الصارمة والـ Iframe
  const getPrintStyles = () => `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
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
      box-sizing: border-box;
      width: 100%;
    }
    .print-page-wrapper:last-child {
      page-break-after: avoid;
    }
    .invoice-book-container {
      border: 2px solid #000 !important;
      padding: 14px;
      background-color: #fff !important;
      font-family: 'Cairo', sans-serif;
      box-sizing: border-box;
      width: 100%;
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
    iframe.style.fixed = "position: fixed; right: 0; bottom: 0; width: 0; height: 0; border: 0;";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <html>
        <head>
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

  const printSingleDebt = (invoiceId) => {
    const element = document.getElementById(`invoice-book-print-${invoiceId}`);
    if (element) executePrint(`<div class="print-page-wrapper">${element.innerHTML}</div>`);
  };

  const printAllTraderInvoices = () => {
    const printArea = document.getElementById("all-trader-invoices-print-zone");
    if (printArea) executePrint(printArea.innerHTML);
  };

  // توليد الوقت والتاريخ الحالي معاً بدقة وبشكل حي
  const currentDateTime = useMemo(() => {
    const now = new Date();
    const timeString = now.toLocaleTimeString("ar-IQ", { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateString = now.toLocaleDateString("ar-IQ");
    return `${timeString} | ${dateString}`;
  }, [unpaidInvoices, selectedTrader]);

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
      <div className="md:col-span-4 border border-border rounded-xl bg-card p-4 flex flex-col gap-4 overflow-y-auto no-print">
        <div>
          <h3 className="font-bold text-lg">أرصدة ديون التجار</h3>
          <p className="text-xs text-muted-foreground">اختر تاجر لعرض تفاصيل قوائمه</p>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="ابحث باسم التاجر أو رقم الهاتف..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-input bg-background pr-9 pl-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
          />
        </div>
        
        <div className="flex flex-col gap-2">
          {filteredTraders.map(t => (
            <button
              key={t.id}
              onClick={() => handleSelectTrader(t)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border text-right transition-all ${
                selectedTrader?.id === t.id 
                  ? "border-primary bg-primary/5 ring-1 ring-primary" 
                  : "border-border bg-background hover:bg-accent"
              }`}
            >
              <div>
                <p className="font-medium text-sm">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.phone || "بلا هاتف"}</p>
              </div>
              <span className="text-sm font-semibold text-destructive">{formatMoney(t.debt_fils)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* القسم الأيسر: عرض تفاصيل القوائم */}
      <div className="md:col-span-8 border border-border rounded-xl bg-card p-4 flex flex-col gap-4 overflow-y-auto">
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
                <Printer size={14} /> طباعة كافة القوائم للتاجر ({unpaidInvoices.length})
              </button>
            </div>

            {loadingInvoices ? (
              <div className="text-center py-12 text-muted-foreground text-sm no-print">جارٍ جلب القوائم الحالية...</div>
            ) : (
              <div className="flex flex-col gap-6">
                {unpaidInvoices.map(inv => (
                  <div key={inv.id} className="relative bg-background rounded-lg border p-4 flex flex-col gap-3">
                    
                    <div className="flex justify-between items-center bg-muted/40 p-2 rounded no-print">
                      <div className="text-xs font-medium">قائمة #{inv.id.slice(0, 8)} | متبقي: <span className="text-destructive font-bold">{formatMoney(inv.remaining)}</span></div>
                      <div className="flex gap-2">
                        <button onClick={() => printSingleDebt(inv.id)} className="p-1.5 border border-border rounded bg-background hover:bg-accent text-primary flex items-center gap-1 text-xs">
                          <Printer size={13} /> طباعة الوصل
                        </button>
                        <button onClick={() => openPayModal(inv)} className="p-1.5 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1 text-xs">
                          <CreditCard size={13} /> تسديد كامل
                        </button>
                      </div>
                    </div>

                    <div id={`invoice-book-print-${inv.id}`} className="invoice-book-container">
                      <div className="flex-row-header">
                        <div style={{ textAlign: 'right' }}>
                          <h2 className="text-xl font-black text-red-900" style={{ margin: 0 }}>{marketName}</h2>
                          <p style={{ margin: '4px 0 0 0', fontSize: '11px', fontWeight: 'bold' }}>مُجاز لبيع الفواكه والخُضر بالجملة</p>
                          <p style={{ margin: 0, fontSize: '11px', color: '#4b5563' }}>موصل - سوق جملة نينوى - الأيمن</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <div className="border-box-office">رقم المكتب ( ٣٥ )</div>
                          <div style={{ fontSize: '11px', fontFamily: 'monospace' }}>ID: #{inv.id.slice(0, 8)}</div>
                        </div>
                      </div>

                      <div className="flex-row-info">
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
                            <th style={{ width: "11%" }}>النوع</th>
                            <th style={{ width: "25%" }}>التفاصيل / المادة</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>١</td>
                            <td className="font-bold">{formatMoney(inv.remaining)}</td>
                            <td>—</td>
                            <td>—</td>
                            <td>—</td>
                            <td>—</td>
                            <td style={{ textAlign: 'right', paddingRight: '8px', fontWeight: '500' }}>{inv.product_summary || "رصيد متبقي بذمة العميل"}</td>
                          </tr>
                          {[2, 3, 4].map(num => (
                            <tr key={num}>
                              <td>{num === 2 ? "٢" : num === 3 ? "٣" : "٤"}</td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                              <td></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="footer-row">
                        <div className="signatures">
                          <div>توقيع المستلم: ........................</div>
                          <div>توقيع الحسابات: ........................</div>
                        </div>
                      </div>
                    </div>

                  </div>
                ))}

                {unpaidInvoices.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-12 no-print">جميع القوائم مسددة بالكامل لهذا التاجر!</p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-20 no-print">
            <ArrowLeftRight size={32} className="stroke-[1.5]" />
            <p className="text-sm">قم باختيار تاجر من القائمة اليمنى لعرض السجلات.</p>
          </div>
        )}
      </div>

      {/* منطقة مخفية تماماً مخصصة لتجميع وطباعة كافة الوصولات دفعة واحدة للتاجر المختار */}
      <div id="all-trader-invoices-print-zone" className="hidden">
        {unpaidInvoices.map(inv => (
          <div key={`bulk-${inv.id}`} className="print-page-wrapper">
            <div className="invoice-book-container">
              <div className="flex-row-header">
                <div style={{ textAlign: 'right' }}>
                  <h2 className="text-xl font-black text-red-900" style={{ margin: 0 }}>{marketName}</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '11px', fontWeight: 'bold' }}>مُجاز لبيع الفواكه والخُضر بالجملة</p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#4b5563' }}>موصل - سوق جملة نينوى - الأيمن</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <div className="border-box-office">رقم المكتب ( ٣٥ )</div>
                  <div style={{ fontSize: '11px', fontFamily: 'monospace' }}>ID: #{inv.id.slice(0, 8)}</div>
                </div>
              </div>

              <div className="flex-row-info">
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
                    <th style={{ width: "11%" }}>النوع</th>
                    <th style={{ width: "25%" }}>التفاصيل / المادة</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>١</td>
                    <td className="font-bold">{formatMoney(inv.remaining)}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td style={{ textAlign: 'right', paddingRight: '8px', fontWeight: '500' }}>{inv.product_summary || "رصيد متبقي بذمة العميل"}</td>
                  </tr>
                  {[2, 3, 4].map(num => (
                    <tr key={num}>
                      <td>{num === 2 ? "٢" : num === 3 ? "٣" : "٤"}</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="footer-row">
                <div className="signatures">
                  <div>توقيع المستلم: ........................</div>
                  <div>توقيع الحسابات: ........................</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* نافذة التسديد المنبثقة (Modal) */}
      {activeInvoiceToPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 no-print">
          <div className="bg-background rounded-lg shadow-xl border border-border w-full max-w-sm mx-4 p-5 flex flex-col gap-4">
            <div>
              <h4 className="font-bold text-base text-green-600">تسديد دفعة لقائمة محددة</h4>
              <p className="text-xs text-muted-foreground mt-0.5">التاجر: {selectedTrader?.name}</p>
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