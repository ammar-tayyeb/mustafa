import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

/**
 * SmallProductCombobox — مكون محسّن للاختيار من قائمة
 * يعمل مع المنتجات والسواق بارتفاع صغير 24px
 * 
 * Props:
 *   items: Array<{id, label}> — خيارات الاختيار
 *   value: string | null — القيمة المختارة (ID أو النص المباشر)
 *   onChange: (id, label) => void —콜백عند الاختيار
 *   placeholder: string — نص placeholder
 */
export function SmallProductCombobox({ items = [], value, onChange, placeholder = "ابحث..." }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // ─── ابحث عن العنصر المختار ─────────────────────────────────────────
  const selectedItem = items.find(it => it.id === value);
  const displayLabel = selectedItem?.label || "";

  // ─── فلترة الخيارات بناءً على البحث ────────────────────────────────
  const filtered = items.filter(it =>
    it.label.toLowerCase().includes(search.toLowerCase()) ||
    (it.id && it.id.toLowerCase?.().includes(search.toLowerCase()))
  );

  // ─── إغلاق عند النقر خارج المكون ──────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // ─── معالج الاختيار ──────────────────────────────────────────────
  function handleSelect(item) {
    onChange(item.id, item.label);
    setSearch("");
    setOpen(false);
  }

  // ─── معالج Enter أو Tab للإنشاء السريع ────────────────────────────
  function handleKeyDown(e) {
    if ((e.key === "Enter" || e.key === "Tab") && search.trim() && filtered.length === 0) {
      // إذا أدخل نص جديد، أرسله كقيمة
      onChange(search.trim(), search.trim());
      setSearch("");
      setOpen(false);
      e.preventDefault();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full h-6">
      {/* زر الإدخال الرئيسي */}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full h-6 px-1.5 rounded border border-input bg-background text-[11px] font-sans font-medium outline-none focus:ring-1 focus:ring-ring hover:border-foreground/30 transition-colors flex items-center justify-between"
      >
        <span className="truncate text-left flex-1">{displayLabel || placeholder}</span>
        <ChevronDown
          size={14}
          className={`shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* القائمة المنسدلة */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-background border border-input rounded shadow-lg z-50 max-h-48 overflow-y-auto">
          {/* حقل البحث */}
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-1.5 py-1 text-[11px] border-b border-border bg-muted/30 outline-none focus:ring-1 focus:ring-ring font-sans sticky top-0 z-10"
            autoFocus
          />

          {/* خيارات البحث */}
          {filtered.length > 0 ? (
            filtered.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className="w-full text-left px-1.5 py-1 text-[11px] hover:bg-accent transition-colors font-sans truncate"
              >
                {item.label}
              </button>
            ))
          ) : search.trim() ? (
            <div className="px-1.5 py-2 text-[10px] text-muted-foreground text-center italic">
              لا توجد نتائج — اضغط Enter لإنشاء "{search.trim()}"
            </div>
          ) : (
            <div className="px-1.5 py-2 text-[10px] text-muted-foreground text-center">
              لا توجد خيارات
            </div>
          )}
        </div>
      )}
    </div>
  );
}