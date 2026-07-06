import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

export function SmallProductCombobox({ items = [], value = "", onChange, placeholder = "اختر..." }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = items.filter(item =>
    item.label.toLowerCase().includes(search.toLowerCase()) ||
    item.id.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (item) => {
    onChange(item.id, item.label);
    setOpen(false);
    setSearch("");
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        setHighlighted(Math.min(highlighted + 1, filtered.length - 1));
        e.preventDefault();
        break;
      case "ArrowUp":
        setHighlighted(Math.max(highlighted - 1, 0));
        e.preventDefault();
        break;
      case "Enter":
        if (filtered.length > 0) {
          handleSelect(filtered[highlighted]);
        }
        e.preventDefault();
        break;
      case "Escape":
        setOpen(false);
        e.preventDefault();
        break;
      default:
        break;
    }
  };

  const displayValue = items.find(item => item.id === value || item.label === value)?.label || value;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? search : displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded border border-input bg-background px-1.5 py-0.5 text-[11px] h-6 outline-none focus:ring-1 focus:ring-ring text-right pr-5"
        />
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="absolute left-0.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
          tabIndex="-1"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-background border border-border rounded shadow-md z-50 max-h-48 overflow-y-auto">
          {filtered.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setHighlighted(idx)}
              className={`w-full text-left px-2 py-1 text-[11px] transition-colors ${
                idx === highlighted
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {open && filtered.length === 0 && search.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-background border border-border rounded shadow-md z-50 p-2">
          <p className="text-[10px] text-muted-foreground text-center">لا توجد نتائج</p>
        </div>
      )}
    </div>
  );
}