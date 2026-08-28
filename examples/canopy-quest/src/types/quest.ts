/** How a quest is verified. Each kind maps to a real SDK result recorded in evidence. */
export type QuestKind =
  | "wallet"
  | "height"
  | "validators"
  | "events"
  | "transaction"
  | "daily";

export type QuestStatus = "locked" | "active" | "completed";

export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  /** What the player has to do, in one line. */
  requirement: string;
  kind: QuestKind;
  xp: number;
  /** How many units of progress complete the quest. */
  target: number;
  /** Daily quests reset every UTC day and can be earned once per day. */
  daily?: boolean;
}

/**
 * Verifiable facts recorded by the Canopy client layer. Nothing in the UI
 * writes these directly — they are only appended when an SDK call actually
 * succeeded, so a quest cannot be "completed" by clicking around.
 */
export interface QuestEvidence {
  /** Address of the connected wallet, once one exists. */
  walletAddress: string | null;
  /** Latest block height returned by `fetchHeight`, and when. */
  heightQueried: { height: number; at: number } | null;
  /** Number of validators returned by the last successful `validators()` sweep. */
  validatorsLoaded: { count: number; at: number } | null;
  /** Result of the last successful `eventsByAddress()` query for the wallet. */
  eventsInspected: { count: number; address: string; at: number } | null;
  /** Hashes of transactions this app submitted and the node accepted. */
  transactions: Array<{ hash: string; at: number }>;
  /** UTC dates (YYYY-MM-DD) on which at least one successful RPC call was made. */
  networkDaysUTC: string[];
}

export interface QuestProgress {
  definition: QuestDefinition;
  status: QuestStatus;
  progress: number;
  target: number;
  /** Completion timestamp for one-shot quests. */
  completedAt: number | null;
  /** For daily quests: whether it is complete for the current UTC day. */
  completedToday?: boolean;
}

export interface QuestSummary {
  quests: QuestProgress[];
  xp: number;
  completedCount: number;
  totalCount: number;
}

export interface LevelInfo {
  level: number;
  xp: number;
  /** Total XP at which the current level started. */
  currentLevelXP: number;
  /** Total XP required to reach the next level, or null at the cap-free top. */
  nextLevelXP: number;
  /** 0..1 progress through the current level. */
  progress: number;
  xpIntoLevel: number;
  xpForLevel: number;
}
