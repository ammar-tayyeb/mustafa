import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  getAllSettings,
  getDebtInvoices,
  getDrivers,
  getTransactions,
  getTraders,
  getWithdrawals,
  processWithdrawal,
  deleteWithdrawal,
  settleDebtWithdrawal,
  getClosedDriverSheets,
} from "../lib/db.js";
import { DEFAULT_MATERIALS, FIXED_MATERIAL_NAME } from "../lib/materials.js";

export const DataContext = createContext(null);

const COMMISSIONS_STORAGE_KEY = "warehouse_driver_open_commissions";

function loadStoredCommissions() {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = localStorage.getItem(COMMISSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function DataProvider({ children }) {
  const [drivers, setDrivers] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [debtInvoices, setDebtInvoices] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [closedDriverSheets, setClosedDriverSheets] = useState([]);
  const [driverCommissions, setDriverCommissions] = useState(loadStoredCommissions);
  const [materialsList, setMaterialsList] = useState(DEFAULT_MATERIALS);

  const refreshData = useCallback(async () => {
    const [merchantRows, driverRows, rawDebtInvoiceRows, transactionRows, withdrawalRows, settings, closedSheetRows] = await Promise.all([
      getTraders(),
      getDrivers(),
      getDebtInvoices(),
      getTransactions(),
      getWithdrawals(),
      getAllSettings(),
      getClosedDriverSheets(),
    ]);
    const debtInvoiceRows = rawDebtInvoiceRows.map(invoice => {
      if (invoice.personId) return invoice;
      const people = invoice.personType === "driver" ? driverRows : merchantRows;
      const person = people.find(row => row.name === invoice.personName);
      return { ...invoice, personId: person?.id || null };
    });
    setMerchants(merchantRows);
    setDrivers(driverRows);
    setDebtInvoices(debtInvoiceRows);
    setTransactions(transactionRows);
    setWithdrawals(withdrawalRows);
    setClosedDriverSheets(closedSheetRows);
    setSettlements(transactionRows.filter(transaction => transaction.type === "debt_withdrawal_settlement"));
    const names = String(settings.products_list || "").split("\n").map(name => name.trim()).filter(Boolean);
    const materialNames = [...new Set([FIXED_MATERIAL_NAME, ...names])];
    setMaterialsList(materialNames.map(name => ({ name, isFixed: name === FIXED_MATERIAL_NAME })));
    return {
      merchants: merchantRows,
      drivers: driverRows,
      debtInvoices: debtInvoiceRows,
      transactions: transactionRows,
      withdrawals: withdrawalRows,
      closedDriverSheets: closedSheetRows,
      materialsList: materialNames,
    };
  }, []);

  const setDriverCommission = useCallback((driverId, rate) => {
    setDriverCommissions(prev => {
      const next = { ...prev, [driverId]: rate };
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(COMMISSIONS_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const clearDriverCommission = useCallback((driverId) => {
    setDriverCommissions(prev => {
      const next = { ...prev };
      delete next[driverId];
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(COMMISSIONS_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const getDriverCommission = useCallback((driverId) => {
    return driverCommissions[driverId] ?? 0;
  }, [driverCommissions]);

  const addWithdrawal = useCallback(async (withdrawalData) => {
    const id = await processWithdrawal(withdrawalData);
    await refreshData();
    return id;
  }, [refreshData]);

  const deleteWithdrawalEntry = useCallback(async (id) => {
    await deleteWithdrawal(id);
    await refreshData();
  }, [refreshData]);

  const settleDebtInvoice = useCallback(async (withdrawalId, amount) => {
    await settleDebtWithdrawal({ withdrawalId, amount });
    return refreshData();
  }, [refreshData]);

  useEffect(() => {
    refreshData().catch(() => {});
  }, [refreshData]);

  return (
    <DataContext.Provider
      value={{
        drivers,
        merchants,
        debtInvoices,
        transactions,
        settlements,
        withdrawals,
        closedDriverSheets,
        driverCommissions,
        materialsList,
        setDrivers,
        setMerchants,
        refreshData,
        settleDebtInvoice,
        addWithdrawal,
        deleteWithdrawalEntry,
        setDriverCommission,
        clearDriverCommission,
        getDriverCommission,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useDataContext() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useDataContext must be used inside DataProvider");
  return context;
}
