import { useState, useMemo } from "react";
import { Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

/**
 * DataTable — جدول عام مع بحث + فرز + ترقيم
 * Props:
 *   columns  — [{ key, label, sortable?, render?(row) }]
 *   data     — مصفوفة الصفوف
 *   actions? — (row) => ReactNode  (عمود الإجراءات)
 *   pageSize — عدد الصفوف في الصفحة (افتراضي 20)
 *   searchKeys — مفاتيح البحث (افتراضي: كل الأعمدة)
 *   emptyText — نص عند عدم وجود بيانات
 */
export default function DataTable({
  columns = [],
  data = [],
  actions,
  pageSize = 20,
  searchKeys,
  emptyText = "لا توجد بيانات",
}) {
  const [query, setQuery]       = useState("");
  const [sortKey, setSortKey]   = useState(null);
  const [sortDir, setSortDir]   = useState("asc");
  const [page, setPage]         = useState(1);

  const keys = searchKeys ?? columns.map(c => c.key);

  // فلترة
  const filtered = useMemo(() => {
    if (!query.trim()) return data;
    const q = query.trim().toLowerCase();
    return data.filter(row =>
      keys.some(k => String(row[k] ?? "").toLowerCase().includes(q))
    );
  }, [data, query, keys]);

  // فرز
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = typeof av === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "ar");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // ترقيم
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  }

  function SortIcon({ colKey }) {
    if (sortKey !== colKey) return <ChevronsUpDown size={13} className="text-muted-foreground" />;
    return sortDir === "asc"
      ? <ChevronUp size={13} className="text-primary" />
      : <ChevronDown size={13} className="text-primary" />;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* شريط البحث */}
      <div className="relative">
        <Search size={15} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setPage(1); }}
          placeholder="بحث..."
          className="w-full rounded-md border border-input bg-background pe-9 ps-3 py-2 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* الجدول */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap ${col.sortable !== false ? "cursor-pointer select-none hover:text-foreground" : ""}`}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable !== false && <SortIcon colKey={col.key} />}
                  </span>
                </th>
              ))}
              {actions && <th className="px-3 py-2.5 text-start font-medium text-muted-foreground">إجراءات</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paged.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-3 py-8 text-center text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            ) : paged.map((row, i) => (
              <tr key={row.id ?? i} className="hover:bg-muted/30 transition-colors">
                {columns.map(col => (
                  <td key={col.key} className="px-3 py-2.5 whitespace-nowrap">
                    {col.render ? col.render(row) : (row[col.key] ?? "—")}
                  </td>
                ))}
                {actions && (
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ترقيم الصفحات */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {sorted.length} نتيجة — صفحة {currentPage} من {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-40"
            >
              السابق
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 rounded border border-border hover:bg-accent disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
