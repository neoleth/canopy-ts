/**
 * Wallet session state.
 *
 * The unlocked private key lives in this provider's React state and nowhere
 * else: not in localStorage, not in a log line, not in a network request.
 * Locking (or closing the tab) drops it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { describeError, getAccount } from "../lib/canopy";
import {
  createWallet as createWalletEntry,
  deleteWallet as removeWallet,
  importKeystoreEntry,
  importPrivateKey,
  listWallets,
  unlockWallet,
} from "../lib/wallet";
import type { ImportPrivateKeyArgs } from "../lib/wallet";
import type { ParsedKeystoreEntry } from "@canopynetwork/canopy-ts/keystore";
import type { WalletBalance, WalletSession, WalletSummary } from "../types/wallet";

interface WalletContextValue {
  session: WalletSession | null;
  wallets: WalletSummary[];
  balance: WalletBalance | null;
  balanceLoading: boolean;
  balanceError: string | null;
  createWallet: (nickname: string, password: string) => Promise<ParsedKeystoreEntry>;
  unlock: (address: string, password: string) => Promise<void>;
  importKey: (args: ImportPrivateKeyArgs) => Promise<void>;
  importKeystore: (json: string) => WalletSummary;
  forget: (address: string) => void;
  lock: () => void;
  refreshBalance: () => Promise<void>;
  refreshWallets: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [wallets, setWallets] = useState<WalletSummary[]>(() => listWallets());
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const address = session?.address ?? null;

  const refreshWallets = useCallback(() => setWallets(listWallets()), []);

  const refreshBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const raw = await getAccount(address);
      const amount = typeof raw.amount === "number" ? raw.amount : 0;
      setBalance({ micro: amount, raw: raw as Record<string, unknown> });
    } catch (error) {
      setBalanceError(describeError(error, "Failed to retrieve account balance."));
    } finally {
      setBalanceLoading(false);
    }
  }, [address]);

  // A brand new address has no on-chain account yet, so a failed lookup here is
  // expected — it surfaces as an error message, not a crash.
  useEffect(() => {
    if (address) void refreshBalance();
    else setBalance(null);
  }, [address, refreshBalance]);

  const createWallet = useCallback(
    async (nickname: string, password: string) => {
      const { session: created, backup } = await createWalletEntry(nickname, password);
      setSession(created);
      refreshWallets();
      return backup;
    },
    [refreshWallets],
  );

  const unlock = useCallback(
    async (address: string, password: string) => {
      setSession(await unlockWallet(address, password));
      refreshWallets();
    },
    [refreshWallets],
  );

  const importKey = useCallback(
    async (args: ImportPrivateKeyArgs) => {
      setSession(await importPrivateKey(args));
      refreshWallets();
    },
    [refreshWallets],
  );

  const importKeystore = useCallback(
    (json: string) => {
      const summary = importKeystoreEntry(json);
      refreshWallets();
      return summary;
    },
    [refreshWallets],
  );

  const forget = useCallback(
    (address: string) => {
      removeWallet(address);
      setSession((current) =>
        current && current.address.toLowerCase() === address.toLowerCase() ? null : current,
      );
      refreshWallets();
    },
    [refreshWallets],
  );

  const lock = useCallback(() => setSession(null), []);

  const value = useMemo<WalletContextValue>(
    () => ({
      session,
      wallets,
      balance,
      balanceLoading,
      balanceError,
      createWallet,
      unlock,
      importKey,
      importKeystore,
      forget,
      lock,
      refreshBalance,
      refreshWallets,
    }),
    [
      session,
      wallets,
      balance,
      balanceLoading,
      balanceError,
      createWallet,
      unlock,
      importKey,
      importKeystore,
      forget,
      lock,
      refreshBalance,
      refreshWallets,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
