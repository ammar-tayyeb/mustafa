import { useState, useRef, useEffect } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

/**
 * EntityCombobox — بحث + كتابة اسم جديد + Find-or-Create
 * Props:
 *   items        — [{ id, label }]
 *   value        — id المحدد حالياً
 *   onChange     — (id, label) => void
 *   placeholder  — نص placeholder
 *   disabled     — boolean
 */
export default function EntityCombobox({ items = [], value, onChange, placeholder = "اختر أو اكتب...", disabled = false }) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState("");
  const inputRef              = useRef(null);
  const containerRef          = useRef(null);

  const selectedLabel = items.find(i => i.id === value)?.label ?? "";

  // إغلاق عند النقر خارج المكوّن
  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = query.trim()
    ? items.filter(i => i.label.includes(query.trim()))
    : items;

  const exactMatch = items.find(i => i.label === query.trim());

  function handleSelect(item) {
    onChange(item.id, item.label);
    setOpen(false);
    setQuery("");
  }

  function handleAddNew() {
    if (!query.trim()) return;
    onChange(null, query.trim()); // id=null يعني "جديد" → findOrCreate يُنفَّذ عند الحفظ
    setOpen(false);
    setQuery("");
  }

  function handleInputClick() {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* زر العرض */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleInputClick}
        className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent disabled:opacity-50"
      >
        <span className={selectedLabel ? "text-foreground" : "text-muted-foreground"}>
          {selectedLabel || placeholder}
        </span>
        <ChevronsUpDown size={14} className="text-muted-foreground shrink-0 ms-2" />
      </button>

      {/* القائمة المنسدلة */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ابحث أو اكتب اسماً جديداً..."
              className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              onKeyDown={e => {
                if (e.key === "Enter") {
                  if (filtered.length === 1) handleSelect(filtered[0]);
                  else if (query.trim() && !exactMatch) handleAddNew();
                }
                if (e.key === "Escape") { setOpen(false); setQuery(""); }
              }}
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Check size={14} className={item.id === value ? "opacity-100" : "opacity-0"} />
                  {item.label}
                </button>
              </li>
            ))}
            {query.trim() && !exactMatch && (
              <li>
                <button
                  type="button"
                  onClick={handleAddNew}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-primary hover:bg-accent"
                >
                  <Plus size={14} />
                  إضافة «{query.trim()}» كجديد
                </button>
              </li>
            )}
            {filtered.length === 0 && !query.trim() && (
              <li className="px-3 py-2 text-sm text-muted-foreground">لا توجد عناصر</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
