import { BrowserRouter, Routes, Route } from "react-router";
import AppLayout from "./components/AppLayout";
import Traders from "./pages/Traders";
import TradersDebts from "./pages/TraderDebts";
import Drivers from "./pages/Drivers";
import Invoices from "./pages/Invoices";
import Transactions from "./pages/Transactions";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Withdrawals from "./pages/Withdrawals";
import { DataProvider } from "./context/DataContext.jsx";

export default function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index path="/" element={<Invoices />} />
            <Route path="traders" element={<Traders />} />
            <Route path="debts" element={<TradersDebts />} />
            <Route path="drivers" element={<Drivers />} />
            <Route path="withdrawals" element={<Withdrawals />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}
