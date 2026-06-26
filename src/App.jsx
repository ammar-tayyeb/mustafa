import { BrowserRouter, Routes, Route } from "react-router";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Traders from "./pages/Traders";
import Vehicles from "./pages/Vehicles";
import Drivers from "./pages/Drivers";
import Invoices from "./pages/Invoices";
import Transactions from "./pages/Transactions";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="traders" element={<Traders />} />
          <Route path="vehicles" element={<Vehicles />} />
          <Route path="drivers" element={<Drivers />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
