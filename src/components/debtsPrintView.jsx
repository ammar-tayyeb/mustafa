import { X } from "lucide-react";
import { formatMoney } from "../lib/money.js";

export default function DebtsPrintView({ 
  trader, 
  invoices = [], 
  singleInvoice = null, 
  onClose 
}) {
  const printTitle = singleInvoice 
    ? `تسديد دين واحد - ${trader.name}` 
    : `كشف ديون شامل - ${trader.name}`;

  const invoicesToPrint = singleInvoice ? [singleInvoice] : invoices;

  if (!trader) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto py-6">
      <div className="bg-white rounded-lg shadow-xl border border-border w-full max-w-4xl mx-4 print:shadow-none print:border-none print:rounded-none">
        
        {/* ─── رأس الطباعة ─── */}
        <div className="print:block hidden p-8 text-center border-b-2 border-gray-300">
          <h1 className="text-3xl font-bold text-gray-900">كشف الديون المستحقة</h1>
          <p className="text-sm text-gray-600 mt-2">نظام إدارة السوق - علوة</p>
          <p className="text-xs text-gray-500 mt-1">التاريخ: {new Date().toLocaleDateString("ar-SA")}</p>
        </div>

        {/* ─── زر الإغلاق ─── */}
        <div className="print:hidden flex items-center justify-end px-5 py-4 border-b border-border">
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X size={16} />
          </button>
        </div>

        <div className="p-8 flex flex-col gap-6">
          
          {/* ─── بيانات التاجر الرئيسية ─── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-b pb-4">
            <div className="border-l-4 border-blue-500 pl-3">
              <p className="text-xs text-gray-600 font-semibold">اسم التاجر</p>
              <p className="text-lg font-bold text-gray-900">{trader.name}</p>
            </div>
            <div className="border-l-4 border-blue-500 pl-3">
              <p className="text-xs text-gray-600 font-semibold">رقم الهاتف</p>
              <p className="text-lg font-bold text-gray-900">{trader.phone || "—"}</p>
            </div>
            <div className="border-l-4 border-red-500 pl-3">
              <p className="text-xs text-gray-600 font-semibold">إجمالي الدين</p>
              <p className="text-lg font-bold text-red-700">{formatMoney(trader.debt_fils)}</p>
            </div>
            <div className="border-l-4 border-gray-500 pl-3">
              <p className="text-xs text-gray-600 font-semibold">عدد القوائم</p>
              <p className="text-lg font-bold text-gray-900">{invoicesToPrint.length}</p>
            </div>
          </div>

          {/* ─── جدول الديون ─── */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-3 text-right">رقم القائمة</th>
                  <th className="border border-gray-300 p-3 text-center">التاريخ</th>
                  <th className="border border-gray-300 p-3 text-right">المادة</th>
                  <th className="border border-gray-300 p-3 text-center">الإجمالي</th>
                  <th className="border border-gray-300 p-3 text-center">المدفوع</th>
                  <th className="border border-gray-300 p-3 text-center font-bold">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {invoicesToPrint.map((inv, idx) => (
                  <tr key={inv.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="border border-gray-300 p-3 font-mono text-xs">
                      {inv.id.slice(0, 8)}
                    </td>
                    <td className="border border-gray-300 p-3 text-center">{inv.date}</td>
                    <td className="border border-gray-300 p-3">
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {inv.product_summary || "دين يدوي"}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-3 text-center font-semibold">
                      {formatMoney(inv.total_final)}
                    </td>
                    <td className="border border-gray-300 p-3 text-center text-green-600 font-semibold">
                      {formatMoney(inv.paid_amount)}
                    </td>
                    <td className="border border-gray-300 p-3 text-center font-bold text-red-700 bg-red-50">
                      {formatMoney(inv.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── ملخص الديون ─── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <p className="text-xs text-gray-600 font-semibold">الإجمالي المستحق</p>
              <p className="text-2xl font-bold text-blue-700">
                {formatMoney(invoicesToPrint.reduce((sum, inv) => sum + inv.total_final, 0))}
              </p>
            </div>
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
              <p className="text-xs text-gray-600 font-semibold">المدفوع منه</p>
              <p className="text-2xl font-bold text-green-700">
                {formatMoney(invoicesToPrint.reduce((sum, inv) => sum + inv.paid_amount, 0))}
              </p>
            </div>
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
              <p className="text-xs text-gray-600 font-semibold">الرصيد المتبقي</p>
              <p className="text-2xl font-bold text-red-700">
                {formatMoney(invoicesToPrint.reduce((sum, inv) => sum + inv.remaining, 0))}
              </p>
            </div>
          </div>

          {/* ─── ملاحظات إضافية ─── */}
          {trader.notes && (
            <div className="bg-gray-50 border-l-4 border-gray-400 p-4 rounded">
              <p className="text-xs text-gray-600 font-semibold mb-1">ملاحظات التاجر</p>
              <p className="text-gray-800">{trader.notes}</p>
            </div>
          )}

          {/* ─── التوقيعات (طباعة فقط) ─── */}
          <div className="print:block hidden mt-8 border-t-2 border-gray-300 pt-6">
            <div className="grid grid-cols-3 gap-8 text-center">
              <div>
                <p className="text-xs text-gray-600 mb-12">التاريخ</p>
                <p className="text-sm font-semibold">_________________</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-12">توقيع التاجر</p>
                <p className="text-sm font-semibold">_________________</p>
              </div>
              <div>
                <p className="text-xs text-gray-600 mb-12">توقيع المسؤول</p>
                <p className="text-sm font-semibold">_________________</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
            background: white;
          }
          .fixed {
            position: static !important;
            background: white !important;
          }
          .print\\:block {
            display: block !important;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}