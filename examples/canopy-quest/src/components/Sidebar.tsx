import { NavLink } from "react-router-dom";
import {
  Activity,
  LayoutDashboard,
  ShieldCheck,
  Sword,
  Trophy,
  Wallet as WalletIcon,
  Trees,
} from "lucide-react";
import { useQuests } from "../hooks/useQuests";

export const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/quests", label: "Quests", icon: Sword },
  { to: "/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/activity", label: "Activity", icon: Activity },
  { to: "/validators", label: "Validators", icon: ShieldCheck },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
] as const;

export function Sidebar() {
  const { summary, level } = useQuests();
  const open = summary.totalCount - summary.completedCount;

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Trees size={19} />
        </span>
        <span className="col" style={{ gap: 2 }}>
          <span className="brand-name">Canopy Quest</span>
          <span className="brand-sub">Level {level.level}</span>
        </span>
      </div>

      <nav className="nav">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            <Icon size={17} />
            {label}
            {to === "/quests" && open > 0 && <span className="nav-badge">{open}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="small faint">
          {summary.completedCount}/{summary.totalCount} quests · {summary.xp.toLocaleString()} XP
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  return (
    <nav className="mobile-nav">
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
