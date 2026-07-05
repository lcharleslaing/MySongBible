import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout() {
  return (
    <div className="drawer lg:drawer-open bg-base-200">
      <input id="app-sidebar" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content min-h-screen">
        <Topbar />
        <main className="px-4 pb-24 pt-4 sm:px-6 sm:pb-28 sm:pt-6 lg:px-8 lg:pb-32 lg:pt-8">
          <Outlet />
        </main>
      </div>
      <Sidebar />
    </div>
  );
}
