import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getAllSettings, getDebtInvoices, getDrivers, getTransactions, getTraders, settleDebtWithdrawal } from "../lib/db.js";
import { DEFAULT_MATERIALS, FIXED_MATERIAL_NAME } from "../lib/materials.js";

export const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [drivers, setDrivers] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [debtInvoices, setDebtInvoices] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [materialsList, setMaterialsList] = useState(DEFAULT_MATERIALS);

  const refreshData = useCallback(async () => {
    const [merchantRows, driverRows, rawDebtInvoiceRows, transactionRows, settings] = await Promise.all([getTraders(), getDrivers(), getDebtInvoices(), getTransactions(), getAllSettings()]);
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
    setSettlements(transactionRows.filter(transaction => transaction.type === "debt_withdrawal_settlement"));
    const names = String(settings.products_list || "").split("\n").map(name => name.trim()).filter(Boolean);
    const materialNames = [...new Set([FIXED_MATERIAL_NAME, ...names])];
    setMaterialsList(materialNames.map(name => ({ name, isFixed: name === FIXED_MATERIAL_NAME })));
    return { merchants: merchantRows, drivers: driverRows, debtInvoices: debtInvoiceRows, transactions: transactionRows, materialsList: materialNames };
  }, []);

  const settleDebtInvoice = useCallback(async (withdrawalId, amount) => {
    await settleDebtWithdrawal({ withdrawalId, amount });
    return refreshData();
  }, [refreshData]);

  useEffect(() => {
    refreshData().catch(() => {});
  }, [refreshData]);

  return (
    <DataContext.Provider value={{ drivers, merchants, debtInvoices, transactions, settlements, materialsList, setDrivers, setMerchants, refreshData, settleDebtInvoice }}>
      {children}
    </DataContext.Provider>
  );
}

export function useDataContext() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useDataContext must be used inside DataProvider");
  return context;
}
