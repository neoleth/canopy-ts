import { KeyRound, RefreshCw, Wallet as WalletIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";
import { curveLabel } from "../lib/wallet";
import { formatAmount, formatWithSymbol, shortenAddress } from "../lib/format";
import { networkConfig } from "../lib/canopy";
import { Card } from "./ui";
import { CopyButton } from "./CopyButton";

/** Address + balance summary for the connected wallet. */
export function WalletCard({ showFull = false }: { showFull?: boolean }) {
  const { session, balance, balanceLoading, balanceError, refreshBalance } = useWallet();

  if (!session) {
    return (
      <Card title="Wallet" icon={<WalletIcon size={16} />}>
        <div className="col" style={{ gap: 12 }}>
          <p className="muted small">
            No wallet connected. Create one or import an existing key to start questing.
          </p>
          <Link to="/wallet" className="btn btn-primary btn-block">
            <KeyRound size={14} />
            Set up a wallet
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Wallet"
      icon={<WalletIcon size={16} />}
      action={
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => void refreshBalance()}
          disabled={balanceLoading}
        >
          <RefreshCw size={13} />
          {balanceLoading ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="col" style={{ gap: 6 }}>
          <span className="stat-label">Address</span>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono" style={{ wordBreak: "break-all", fontSize: showFull ? 13 : 14 }}>
              {showFull ? session.address : shortenAddress(session.address, 10)}
            </span>
            <CopyButton value={session.address} />
          </div>
          <span className="small faint">
            {session.nickname ? `${session.nickname} · ` : ""}
            {curveLabel(session.curveType)}
          </span>
        </div>

        <div className="stat">
          <span className="stat-label">Balance</span>
          <span className="stat-value accent">
            {balance ? formatWithSymbol(balance.micro) : balanceLoading ? "…" : "—"}
          </span>
          {balance && (
            <span className="stat-sub mono">
              {balance.micro.toLocaleString()} base units (1 {networkConfig.denomSymbol} ={" "}
              {formatAmount(10 ** networkConfig.denomExponent, 0)} base units)
            </span>
          )}
        </div>

        {balanceError && (
          <div className="alert alert-warn">
            {balanceError} A freshly created address has no on-chain account until it first receives
            funds.
          </div>
        )}
      </div>
    </Card>
  );
}
