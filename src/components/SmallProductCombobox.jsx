import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

/**
 * SmallProductCombobox المحدث
 * تصميم محسّن مع:
 * - أيقونة بحث
 * - قائمة منسدلة أسلس
 * - عرض سريع للعناصر
 * - دعم لوحة مفاتيح (Arrow Up/Down, Enter, Escape)
 */
export function SmallProductCombobox({
  items = [],
  value = "",
  onChange = () => {},
  placeholder = "ابحث أو اختر...",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // تصفية الخيارات
  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(search.toLowerCase())
  );

  // اختيار عنصر
  function handleSelect(item) {
    onChange(item.id, item.label);
    setSearch("");
    setOpen(false);
    setSelectedIndex(-1);
  }

  // معالجة المفاتيح
  function handleKeyDown(e) {
    if (!open) {
      if (e.key === "ArrowDown") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && filtered[selectedIndex]) {
          handleSelect(filtered[selectedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        setSelectedIndex(-1);
        break;
      default:
        break;
    }
  }

  // إغلاق عند النقر خارج
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
        setSelectedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* حقل الإدخال */}
      <div className="relative flex items-center">
        <Search
          className="absolute right-2 text-muted-foreground pointer-events-none"
          size={14}
        />
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value ? value : placeholder}
          className="w-full rounded border border-input bg-background px-7 py-0.5 text-[11px] h-6 outline-none focus:ring-1 focus:ring-ring text-right pr-6"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSelectedIndex(-1);
            }}
            className="absolute left-1 text-muted-foreground hover:text-foreground"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* القائمة المنسدلة */}
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-input rounded shadow-lg z-50 max-h-40 overflow-y-auto">
          {filtered.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full text-right px-3 py-1.5 text-[11px] font-medium transition-colors ${
                selectedIndex === idx
                  ? "bg-primary text-primary-foreground"
                  : value === item.id
                    ? "bg-primary/20 text-primary"
                    : "hover:bg-muted text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* حالة "لا توجد نتائج" */}
      {open && search && filtered.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-input rounded shadow-lg z-50 p-2 text-[10px] text-muted-foreground text-center">
          لا توجد نتائج لـ "{search}"
        </div>
      )}
    </div>
  );
}