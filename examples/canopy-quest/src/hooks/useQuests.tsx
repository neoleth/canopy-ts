/**
 * Quest progress state.
 *
 * Evidence is only ever written by `record*` calls made from a *successful*
 * SDK result, so quest completion tracks reality. XP and levels are derived
 * from that evidence on every render rather than accumulated, which makes
 * double-claiming structurally impossible.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  evaluateQuests,
  getLevelProgress,
  dailyStreak,
  mergeEvidence,
  recordNetworkDay,
} from "../lib/quests";
import { loadEvidence, loadProfile, saveEvidence, saveProfile } from "../lib/storage";
import type { QuestEvidence, QuestSummary, LevelInfo } from "../types/quest";
import { useWallet } from "./useWallet";

export interface XPToast {
  id: number;
  xp: number;
  title: string;
  levelUp?: number;
}

interface QuestContextValue {
  evidence: QuestEvidence;
  summary: QuestSummary;
  level: LevelInfo;
  streak: number;
  alias: string;
  setAlias: (alias: string) => void;
  toasts: XPToast[];
  dismissToast: (id: number) => void;
  recordHeight: (height: number) => void;
  recordValidators: (count: number) => void;
  recordEvents: (address: string, count: number) => void;
  recordTransaction: (hash: string) => void;
  resetProgress: () => void;
}

const QuestContext = createContext<QuestContextValue | null>(null);

let toastSeq = 0;

export function QuestProvider({ children }: { children: ReactNode }) {
  const { session } = useWallet();
  const address = session?.address ?? null;

  const [evidence, setEvidence] = useState<QuestEvidence>(() => loadEvidence(null));
  const [alias, setAliasState] = useState<string>(() => loadProfile().alias);
  const [toasts, setToasts] = useState<XPToast[]>([]);
  const previous = useRef<{ xp: number; level: number; completed: Set<string> } | null>(null);

  // Progress is stored per address; switching wallets swaps the profile in.
  // Network-scoped facts discovered before connecting (a height read on the
  // landing page, say) carry forward — they really happened.
  useEffect(() => {
    previous.current = null;
    setEvidence((carried) => {
      const loaded = loadEvidence(address);
      const merged = mergeEvidence(
        address ? { ...loaded, walletAddress: address } : loaded,
        carried,
      );
      saveEvidence(address, merged);
      return merged;
    });
  }, [address]);

  const update = useCallback(
    (mutate: (current: QuestEvidence) => QuestEvidence) => {
      setEvidence((current) => {
        const next = recordNetworkDay(mutate(current));
        if (next === current) return current;
        saveEvidence(current.walletAddress, next);
        return next;
      });
    },
    [],
  );

  const recordHeight = useCallback(
    (height: number) =>
      update((current) => ({ ...current, heightQueried: { height, at: Date.now() } })),
    [update],
  );

  const recordValidators = useCallback(
    (count: number) =>
      update((current) => ({ ...current, validatorsLoaded: { count, at: Date.now() } })),
    [update],
  );

  const recordEvents = useCallback(
    (eventAddress: string, count: number) =>
      update((current) => ({
        ...current,
        eventsInspected: { address: eventAddress, count, at: Date.now() },
      })),
    [update],
  );

  const recordTransaction = useCallback(
    (hash: string) =>
      update((current) =>
        current.transactions.some((t) => t.hash === hash)
          ? current
          : { ...current, transactions: [{ hash, at: Date.now() }, ...current.transactions] },
      ),
    [update],
  );

  const resetProgress = useCallback(() => {
    setEvidence((current) => {
      const cleared: QuestEvidence = {
        walletAddress: current.walletAddress,
        heightQueried: null,
        validatorsLoaded: null,
        eventsInspected: null,
        transactions: [],
        networkDaysUTC: [],
      };
      saveEvidence(current.walletAddress, cleared);
      previous.current = null;
      return cleared;
    });
  }, []);

  const setAlias = useCallback((next: string) => {
    setAliasState(next);
    saveProfile({ alias: next });
  }, []);

  const summary = useMemo(() => evaluateQuests(evidence), [evidence]);
  const level = useMemo(() => getLevelProgress(summary.xp), [summary.xp]);
  const streak = useMemo(() => dailyStreak(evidence), [evidence]);

  // Announce newly completed quests and level-ups.
  useEffect(() => {
    const completed = new Set(
      summary.quests.filter((q) => q.status === "completed").map((q) => q.definition.id),
    );
    const before = previous.current;
    previous.current = { xp: summary.xp, level: level.level, completed };
    if (!before) return;

    const fresh = summary.quests.filter(
      (q) => q.status === "completed" && !before.completed.has(q.definition.id),
    );
    if (fresh.length === 0 && summary.xp === before.xp) return;

    const levelUp = level.level > before.level ? level.level : undefined;
    const next: XPToast[] = fresh.map((q) => ({
      id: ++toastSeq,
      xp: q.definition.xp,
      title: q.definition.title,
      levelUp,
    }));
    if (next.length === 0 && levelUp) {
      next.push({ id: ++toastSeq, xp: summary.xp - before.xp, title: "Progress", levelUp });
    }
    // Cap the queue so a burst of completions never buries the page.
    if (next.length > 0) setToasts((current) => [...current, ...next].slice(-3));
  }, [summary, level.level]);

  // Toasts self-dismiss so they never pile up on a long session.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => setToasts((current) => current.slice(1)), 2800);
    return () => clearTimeout(timer);
  }, [toasts]);

  const dismissToast = useCallback(
    (id: number) => setToasts((current) => current.filter((t) => t.id !== id)),
    [],
  );

  const value = useMemo<QuestContextValue>(
    () => ({
      evidence,
      summary,
      level,
      streak,
      alias,
      setAlias,
      toasts,
      dismissToast,
      recordHeight,
      recordValidators,
      recordEvents,
      recordTransaction,
      resetProgress,
    }),
    [
      evidence,
      summary,
      level,
      streak,
      alias,
      setAlias,
      toasts,
      dismissToast,
      recordHeight,
      recordValidators,
      recordEvents,
      recordTransaction,
      resetProgress,
    ],
  );

  return <QuestContext.Provider value={value}>{children}</QuestContext.Provider>;
}

export function useQuests(): QuestContextValue {
  const ctx = useContext(QuestContext);
  if (!ctx) throw new Error("useQuests must be used inside <QuestProvider>");
  return ctx;
}
