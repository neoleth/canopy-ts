import type { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { MobileNav, Sidebar } from "./Sidebar";
import { XPToasts } from "./XPProgress";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Navbar />
        <main className="content">{children}</main>
      </div>
      <MobileNav />
      <XPToasts />
    </div>
  );
}
