/**
 * Quest + XP engine.
 *
 * Everything here is a pure function of {@link QuestEvidence} — the record of
 * SDK calls that actually succeeded. The UI never marks a quest complete; it
 * re-evaluates these functions against evidence written by `lib/canopy.ts`
 * results, so progress always reflects something the network really did.
 */
import type {
  LevelInfo,
  QuestDefinition,
  QuestEvidence,
  QuestProgress,
  QuestSummary,
} from "../types/quest";

export const QUESTS: QuestDefinition[] = [
  {
    id: "enter-canopy",
    title: "Enter Canopy",
    description: "Every quest starts with a key. Create or import a Canopy wallet to begin.",
    requirement: "Create or connect a wallet",
    kind: "wallet",
    xp: 100,
    target: 1,
  },
  {
    id: "know-the-network",
    title: "Know the Network",
    description: "Read the chain tip straight from a Canopy node over RPC.",
    requirement: "Query the current block height",
    kind: "height",
    xp: 50,
    target: 1,
  },
  {
    id: "validator-scout",
    title: "Validator Scout",
    description: "Canopy is secured by its validator set. Go and look at it.",
    requirement: "Load the validator list",
    kind: "validators",
    xp: 100,
    target: 1,
  },
  {
    id: "blockchain-explorer",
    title: "Blockchain Explorer",
    description: "Pull the on-chain event history for your own address.",
    requirement: "Inspect activity for your address",
    kind: "events",
    xp: 100,
    target: 1,
  },
  {
    id: "first-transaction",
    title: "First Transaction",
    description: "Sign a send locally and broadcast it to the network.",
    requirement: "Submit a transaction the node accepts",
    kind: "transaction",
    xp: 250,
    target: 1,
  },
  {
    id: "daily-explorer",
    title: "Daily Explorer",
    description: "Come back each day and touch the chain. Resets at 00:00 UTC.",
    requirement: "Make a successful network call today",
    kind: "daily",
    xp: 100,
    target: 1,
    daily: true,
  },
];

export function questById(id: string): QuestDefinition | undefined {
  return QUESTS.find((q) => q.id === id);
}

// --- daily-quest date handling ---------------------------------------------

/**
 * The day key a daily quest is scored against. UTC is used everywhere so the
 * reset is the same instant for every player regardless of local timezone.
 */
export function utcDayKey(at: number | Date = Date.now()): string {
  const date = at instanceof Date ? at : new Date(at);
  return date.toISOString().slice(0, 10);
}

export function isSameUTCDay(a: number | Date, b: number | Date): boolean {
  return utcDayKey(a) === utcDayKey(b);
}

/** True when the daily quest has already been earned for `at`'s UTC day. */
export function hasDailyForDay(evidence: QuestEvidence, at: number | Date = Date.now()): boolean {
  return evidence.networkDaysUTC.includes(utcDayKey(at));
}

/**
 * Record a successful network interaction against its UTC day. Idempotent:
 * a day already present is never added twice, so the daily reward cannot be
 * claimed more than once per day.
 */
export function recordNetworkDay(evidence: QuestEvidence, at: number = Date.now()): QuestEvidence {
  const key = utcDayKey(at);
  if (evidence.networkDaysUTC.includes(key)) return evidence;
  return { ...evidence, networkDaysUTC: [...evidence.networkDaysUTC, key] };
}

/** Consecutive-day streak ending today (or yesterday, if today is unplayed). */
export function dailyStreak(evidence: QuestEvidence, at: number = Date.now()): number {
  const days = new Set(evidence.networkDaysUTC);
  let streak = 0;
  let cursor = new Date(at);
  if (!days.has(utcDayKey(cursor))) {
    cursor = new Date(cursor.getTime() - 86_400_000);
    if (!days.has(utcDayKey(cursor))) return 0;
  }
  while (days.has(utcDayKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

/**
 * Fold network-scoped discoveries (chain tip, validator set, days played)
 * from one profile into another. Address-scoped facts — this wallet's events
 * and transactions — are never carried across, so switching wallets never
 * credits one address with another's activity.
 */
export function mergeEvidence(target: QuestEvidence, carried: QuestEvidence): QuestEvidence {
  const latest = <T extends { at: number }>(a: T | null, b: T | null): T | null => {
    if (!a) return b;
    if (!b) return a;
    return b.at > a.at ? b : a;
  };

  return {
    ...target,
    heightQueried: latest(target.heightQueried, carried.heightQueried),
    validatorsLoaded: latest(target.validatorsLoaded, carried.validatorsLoaded),
    networkDaysUTC: Array.from(
      new Set([...target.networkDaysUTC, ...carried.networkDaysUTC]),
    ).sort(),
  };
}

// --- quest evaluation ------------------------------------------------------

/** Progress (0..target) and completion time for one quest, from evidence. */
function evaluate(
  definition: QuestDefinition,
  evidence: QuestEvidence,
  now: number,
): { progress: number; completedAt: number | null } {
  switch (definition.kind) {
    case "wallet":
      return {
        progress: evidence.walletAddress ? 1 : 0,
        completedAt: evidence.walletAddress ? 0 : null,
      };
    case "height":
      return {
        progress: evidence.heightQueried ? 1 : 0,
        completedAt: evidence.heightQueried?.at ?? null,
      };
    case "validators":
      return {
        progress: evidence.validatorsLoaded ? 1 : 0,
        completedAt: evidence.validatorsLoaded?.at ?? null,
      };
    case "events":
      return {
        progress: evidence.eventsInspected ? 1 : 0,
        completedAt: evidence.eventsInspected?.at ?? null,
      };
    case "transaction":
      return {
        progress: Math.min(evidence.transactions.length, definition.target),
        completedAt: evidence.transactions[0]?.at ?? null,
      };
    case "daily": {
      const done = hasDailyForDay(evidence, now);
      return { progress: done ? 1 : 0, completedAt: done ? now : null };
    }
    default:
      return { progress: 0, completedAt: null };
  }
}

export function evaluateQuests(evidence: QuestEvidence, now: number = Date.now()): QuestSummary {
  const quests: QuestProgress[] = QUESTS.map((definition) => {
    const { progress, completedAt } = evaluate(definition, evidence, now);
    const complete = progress >= definition.target;
    return {
      definition,
      status: complete ? "completed" : "active",
      progress,
      target: definition.target,
      completedAt: complete ? completedAt : null,
      completedToday: definition.daily ? complete : undefined,
    };
  });

  const completedCount = quests.filter((q) => q.status === "completed").length;
  return {
    quests,
    xp: totalXP(evidence, now),
    completedCount,
    totalCount: quests.length,
  };
}

/**
 * Total XP: one-shot quests score once, the daily quest scores once per
 * distinct UTC day on which a network call succeeded. Derived, not
 * accumulated, so it can never drift or be double-counted.
 */
export function totalXP(evidence: QuestEvidence, now: number = Date.now()): number {
  let xp = 0;
  for (const definition of QUESTS) {
    if (definition.daily) {
      xp += definition.xp * evidence.networkDaysUTC.length;
      continue;
    }
    const { progress } = evaluate(definition, evidence, now);
    if (progress >= definition.target) xp += definition.xp;
  }
  return xp;
}

// --- levels ----------------------------------------------------------------

/**
 * Total XP needed to reach `level`.
 *
 * Level 1 starts at 0 and each level costs 50 XP more than the one before:
 * 100, 150, 200, 250, 300 … which gives the published curve
 * (L2 100, L3 250, L4 450, L5 700) and continues consistently past level 5.
 * Closed form: 25·L² + 25·L − 50.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 25 * level * level + 25 * level - 50;
}

export function getLevelFromXP(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 1;
  // Invert 25L² + 25L − 50 ≤ xp, then correct for float error.
  let level = Math.floor((-25 + Math.sqrt(625 + 100 * (xp + 50))) / 50);
  level = Math.max(1, level);
  while (xpForLevel(level + 1) <= xp) level += 1;
  while (level > 1 && xpForLevel(level) > xp) level -= 1;
  return level;
}

export function getXPForNextLevel(xp: number): number {
  return xpForLevel(getLevelFromXP(xp) + 1);
}

/** Everything the XP bar needs: level, band boundaries, and 0..1 progress. */
export function getLevelProgress(xp: number): LevelInfo {
  const safeXP = Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0;
  const level = getLevelFromXP(safeXP);
  const currentLevelXP = xpForLevel(level);
  const nextLevelXP = xpForLevel(level + 1);
  const xpForThisLevel = nextLevelXP - currentLevelXP;
  const xpIntoLevel = safeXP - currentLevelXP;
  return {
    level,
    xp: safeXP,
    currentLevelXP,
    nextLevelXP,
    progress: xpForThisLevel > 0 ? Math.min(1, xpIntoLevel / xpForThisLevel) : 0,
    xpIntoLevel,
    xpForLevel: xpForThisLevel,
  };
}
