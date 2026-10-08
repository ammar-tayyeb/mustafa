import { useEffect, useMemo, useRef, useState } from "react";

function getDriverNumber(driver) {
  return String(driver.driver_number ?? driver.driverNumber ?? "").trim();
}

export default function SearchableDriverInput({
  drivers = [],
  value = "",
  onChange,
  placeholder = "ابحث عن رقم السائق",
}) {
  const [searchTerm, setSearchTerm] = useState(String(value || ""));
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    setSearchTerm(String(value || ""));
  }, [value]);

  const filteredDrivers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return drivers.filter((driver) =>
      getDriverNumber(driver).toLowerCase().includes(query)
    );
  }, [drivers, searchTerm]);

  const selectDriver = (driver) => {
    const driverNumber = getDriverNumber(driver);
    setSearchTerm(driverNumber);
    setOpen(false);
    onChange(driver.id, driverNumber);
  };

  const handleInputChange = (event) => {
    const nextValue = event.target.value;
    const normalizedValue = nextValue.trim();
    setSearchTerm(nextValue);
    setOpen(true);

    const exactMatch = drivers.find(
      (driver) => getDriverNumber(driver) === normalizedValue && normalizedValue
    );

    if (exactMatch) {
      selectDriver(exactMatch);
    } else {
      onChange(null, nextValue);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={searchTerm}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={handleInputChange}
        className="w-full h-6 rounded border border-input bg-background px-2 text-[11px] text-center font-extrabold text-primary outline-none focus:ring-1 focus:ring-ring"
      />

      {open && (
        <ul className="absolute z-50 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto top-full left-0 right-0 mt-1">
          {filteredDrivers.length > 0 ? (
            filteredDrivers.map((driver) => (
              <li key={driver.id}>
                <button
                  type="button"
                  onClick={() => selectDriver(driver)}
                  className="w-full px-3 py-1.5 text-right text-[11px] hover:bg-muted"
                >
                  {getDriverNumber(driver)} - {driver.name}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-center text-[10px] text-muted-foreground">
              لا توجد نتائج
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
