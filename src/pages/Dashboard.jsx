import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { TrendingUp, Users, FileText, AlertCircle, Wallet, Package } from "lucide-react";
import { getDashboardStats } from "../lib/db.js";
import { formatMoney, fromInt } from "../lib/money.js";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-start gap-3">
      <div className={`p-2 rounded-md bg-muted ${color}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold mt-0.5 truncate ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [from, setFrom]     = useState("");
  const [to, setTo]         = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      setStats(await getDashboardStats({ from: from || null, to: to || null }));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-20 text-muted-foreground">جارٍ التحميل...</div>;
  if (error)   return <div className="rounded-md bg-destructive/10 text-destructive px-4 py-3 text-sm">{error}</div>;
  if (!stats)  return null;

  const salesData = (stats.salesByDay ?? []).map(r => ({
    date: r.date?.slice(5) ?? "",
    total: fromInt(r.total),
  }));

  const productData = (stats.topProducts ?? []).map(r => ({
    name: r.product_name,
    value: fromInt(r.total_amount),
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* رأس الصفحة */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">لوحة المعلومات</h2>
          <p className="text-sm text-muted-foreground mt-0.5">ملخص مالي وتشغيلي</p>
        </div>
        {/* فلتر الفترة */}
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
          <span className="text-muted-foreground text-sm">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
          {(from || to) && (
            <button onClick={() => { setFrom(""); setTo(""); }}
              className="text-xs text-muted-foreground hover:text-foreground underline">
              مسح
            </button>
          )}
        </div>
      </div>

      {/* بطاقات الإجماليات */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard icon={TrendingUp}  label="إجمالي المبيعات"  value={formatMoney(stats.totalSales)}  color="text-primary" />
        <StatCard icon={Wallet}      label="إجمالي العمولات"  value={formatMoney(stats.totalComm)}   color="text-indigo-500" />
        <StatCard icon={Package}     label="إجمالي الحمالية"  value={formatMoney(stats.totalPort)}   color="text-amber-500" />
        <StatCard icon={AlertCircle} label="إجمالي الديون"    value={formatMoney(stats.totalDebt)}   color="text-destructive" />
        <StatCard icon={FileText}    label="الفواتير"
          value={`${stats.postedCount} مُرحّلة`}
          sub={`${stats.draftCount} مسودة`}
          color="text-green-600" />
        <StatCard icon={Users}       label="التجار"           value={stats.tradersCount}             color="text-blue-500" />
      </div>

      {/* الرسوم البيانية */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* مبيعات يومية */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-4">المبيعات اليومية</h3>
          {salesData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={salesData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={v => v.toLocaleString("ar-SA")} />
                <Tooltip formatter={v => [v.toLocaleString("ar-SA", { minimumFractionDigits: 2 }), "المبيعات"]} />
                <Bar dataKey="total" fill={COLORS[0]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* توزيع المواد */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-4">أكثر المواد مبيعاً (بالقيمة)</h3>
          {productData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">لا توجد بيانات</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={productData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {productData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => [v.toLocaleString("ar-SA", { minimumFractionDigits: 2 }), "القيمة"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* أعلى التجار ديوناً */}
      {stats.topDebtors?.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">أعلى التجار ديوناً</h3>
          <div className="flex flex-col gap-2">
            {stats.topDebtors.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium">{t.name}</span>
                </div>
                <span className="text-sm font-bold text-destructive">{formatMoney(t.debt_fils)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* أكثر المواد مبيعاً — جدول */}
      {stats.topProducts?.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">أكثر المواد مبيعاً</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start py-2 px-2 font-medium text-muted-foreground">المادة</th>
                  <th className="text-center py-2 px-2 font-medium text-muted-foreground">الوزن الكلي (كجم)</th>
                  <th className="text-center py-2 px-2 font-medium text-muted-foreground">القيمة الإجمالية</th>
                </tr>
              </thead>
              <tbody>
                {stats.topProducts.map((p, i) => (
                  <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="py-2 px-2 font-medium">{p.product_name}</td>
                    <td className="py-2 px-2 text-center">{fromInt(p.total_weight).toFixed(2)}</td>
                    <td className="py-2 px-2 text-center font-semibold text-primary">{formatMoney(p.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
