import { Link } from "react-router-dom";
import { Lock, Trees, Wallet as WalletIcon } from "lucide-react";
import { useCanopy } from "../hooks/useCanopy";
import { useWallet } from "../hooks/useWallet";
import { formatWithSymbol, shortenAddress } from "../lib/format";

/** Top bar: brand (mobile), live network dot, wallet chip, lock button. */
export function Navbar() {
  const { network } = useCanopy();
  const { session, balance, lock } = useWallet();

  const dotClass =
    network.status === "connected" ? "dot ok" : network.status === "error" ? "dot bad" : "dot warn";

  return (
    <header className="topbar">
      <Link to="/" className="row topbar-title" style={{ gap: 8 }}>
        <span className="brand-mark" style={{ width: 26, height: 26, borderRadius: 9 }}>
          <Trees size={15} />
        </span>
        Canopy Quest
      </Link>

      <span className="topbar-spacer" />

      <span className="badge" title={network.error ?? undefined}>
        <span className={dotClass} />
        {network.status === "connected"
          ? `Block ${network.height?.toLocaleString() ?? "—"}`
          : network.status === "error"
            ? "Disconnected"
            : "Connecting…"}
      </span>

      {session ? (
        <div className="topbar-wallet">
          <span className="addr">{shortenAddress(session.address, 5)}</span>
          <span className="bal">{balance ? formatWithSymbol(balance.micro) : "—"}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={lock} title="Lock wallet">
            <Lock size={13} />
          </button>
        </div>
      ) : (
        <Link to="/wallet" className="btn btn-primary btn-sm">
          <WalletIcon size={14} />
          Connect wallet
        </Link>
      )}
    </header>
  );
}
