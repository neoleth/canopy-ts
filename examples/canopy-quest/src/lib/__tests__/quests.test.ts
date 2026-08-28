import { describe, expect, it } from "vitest";
import {
  QUESTS,
  dailyStreak,
  evaluateQuests,
  getLevelFromXP,
  getLevelProgress,
  getXPForNextLevel,
  hasDailyForDay,
  isSameUTCDay,
  mergeEvidence,
  recordNetworkDay,
  totalXP,
  utcDayKey,
  xpForLevel,
} from "../quests";
import { emptyEvidence } from "../storage";
import type { QuestEvidence } from "../../types/quest";

const DAY = 86_400_000;

function evidence(overrides: Partial<QuestEvidence> = {}): QuestEvidence {
  return { ...emptyEvidence(), ...overrides };
}

describe("level curve", () => {
  it("matches the published thresholds for levels 1-5", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(250);
    expect(xpForLevel(4)).toBe(450);
    expect(xpForLevel(5)).toBe(700);
  });

  it("keeps growing by a consistent +50 step past level 5", () => {
    const steps = [6, 7, 8, 9].map((l) => xpForLevel(l) - xpForLevel(l - 1));
    expect(steps).toEqual([300, 350, 400, 450]);
  });

  it("derives the level from XP, including on exact boundaries", () => {
    expect(getLevelFromXP(0)).toBe(1);
    expect(getLevelFromXP(99)).toBe(1);
    expect(getLevelFromXP(100)).toBe(2);
    expect(getLevelFromXP(249)).toBe(2);
    expect(getLevelFromXP(700)).toBe(5);
    expect(getLevelFromXP(999)).toBe(5);
    expect(getLevelFromXP(1000)).toBe(6);
  });

  it("is self-consistent across a wide XP range", () => {
    for (let xp = 0; xp < 20_000; xp += 37) {
      const level = getLevelFromXP(xp);
      expect(xpForLevel(level)).toBeLessThanOrEqual(xp);
      expect(xpForLevel(level + 1)).toBeGreaterThan(xp);
    }
  });

  it("treats invalid XP as level 1 rather than throwing", () => {
    expect(getLevelFromXP(Number.NaN)).toBe(1);
    expect(getLevelFromXP(-500)).toBe(1);
    expect(getLevelProgress(-10).level).toBe(1);
  });

  it("reports progress within the current level", () => {
    const info = getLevelProgress(175);
    expect(info.level).toBe(2);
    expect(info.currentLevelXP).toBe(100);
    expect(info.nextLevelXP).toBe(250);
    expect(info.xpIntoLevel).toBe(75);
    expect(info.xpForLevel).toBe(150);
    expect(info.progress).toBeCloseTo(0.5);
    expect(getXPForNextLevel(175)).toBe(250);
  });
});

describe("daily quest date logic (UTC)", () => {
  it("keys days by UTC date, not local time", () => {
    // 23:30 UTC and 00:30 UTC the next day are different quest days.
    expect(utcDayKey(Date.UTC(2026, 0, 1, 23, 30))).toBe("2026-01-01");
    expect(utcDayKey(Date.UTC(2026, 0, 2, 0, 30))).toBe("2026-01-02");
    expect(isSameUTCDay(Date.UTC(2026, 0, 1, 0, 1), Date.UTC(2026, 0, 1, 23, 59))).toBe(true);
    expect(isSameUTCDay(Date.UTC(2026, 0, 1, 23, 59), Date.UTC(2026, 0, 2, 0, 1))).toBe(false);
  });

  it("records a day once, so a daily reward cannot be claimed twice", () => {
    const at = Date.UTC(2026, 2, 3, 10);
    const first = recordNetworkDay(evidence(), at);
    const second = recordNetworkDay(first, at + 3 * 3600_000);
    expect(first.networkDaysUTC).toEqual(["2026-03-03"]);
    expect(second).toBe(first);
    expect(second.networkDaysUTC).toHaveLength(1);
  });

  it("only counts the daily quest as done for the day it was earned", () => {
    const at = Date.UTC(2026, 2, 3, 10);
    const recorded = recordNetworkDay(evidence(), at);
    expect(hasDailyForDay(recorded, at)).toBe(true);
    expect(hasDailyForDay(recorded, at + DAY)).toBe(false);
  });

  it("counts consecutive-day streaks and breaks on a gap", () => {
    const today = Date.UTC(2026, 5, 10, 12);
    const consecutive = evidence({
      networkDaysUTC: ["2026-06-08", "2026-06-09", "2026-06-10"],
    });
    expect(dailyStreak(consecutive, today)).toBe(3);

    const gapped = evidence({ networkDaysUTC: ["2026-06-06", "2026-06-09", "2026-06-10"] });
    expect(dailyStreak(gapped, today)).toBe(2);

    const stale = evidence({ networkDaysUTC: ["2026-06-01"] });
    expect(dailyStreak(stale, today)).toBe(0);
  });
});

describe("quest verification", () => {
  it("leaves every quest incomplete with no evidence", () => {
    const summary = evaluateQuests(evidence(), Date.UTC(2026, 0, 1));
    expect(summary.completedCount).toBe(0);
    expect(summary.xp).toBe(0);
    expect(summary.quests).toHaveLength(QUESTS.length);
  });

  it("completes each quest only from its own evidence", () => {
    const now = Date.UTC(2026, 0, 5, 9);
    const full = evidence({
      walletAddress: "a".repeat(40),
      heightQueried: { height: 1234, at: now },
      validatorsLoaded: { count: 4, at: now },
      eventsInspected: { count: 2, address: "a".repeat(40), at: now },
      transactions: [{ hash: "f".repeat(64), at: now }],
      networkDaysUTC: [utcDayKey(now)],
    });
    const summary = evaluateQuests(full, now);
    expect(summary.completedCount).toBe(QUESTS.length);
    // 100 + 50 + 100 + 100 + 250 + 100 daily
    expect(summary.xp).toBe(700);
  });

  it("does not award transaction XP without a recorded hash", () => {
    const now = Date.UTC(2026, 0, 5, 9);
    const partial = evidence({ walletAddress: "b".repeat(40), heightQueried: { height: 1, at: now } });
    const summary = evaluateQuests(partial, now);
    const tx = summary.quests.find((q) => q.definition.id === "first-transaction");
    expect(tx?.status).toBe("active");
    expect(summary.xp).toBe(150);
  });

  it("expires the daily quest once the UTC day rolls over", () => {
    const earned = Date.UTC(2026, 0, 5, 9);
    const record = recordNetworkDay(evidence(), earned);
    const nextDay = evaluateQuests(record, earned + DAY);
    const daily = nextDay.quests.find((q) => q.definition.daily);
    expect(daily?.status).toBe("active");
    expect(daily?.completedToday).toBe(false);
  });

  it("awards daily XP once per distinct day played", () => {
    const at = Date.UTC(2026, 0, 5, 9);
    const threeDays = evidence({ networkDaysUTC: ["2026-01-03", "2026-01-04", "2026-01-05"] });
    expect(totalXP(threeDays, at)).toBe(300);
  });
});

describe("evidence merging across profiles", () => {
  const older = { height: 10, at: 1_000 };
  const newer = { height: 20, at: 2_000 };

  it("keeps the most recent network-scoped facts", () => {
    const merged = mergeEvidence(
      evidence({ heightQueried: older, networkDaysUTC: ["2026-01-01"] }),
      evidence({ heightQueried: newer, networkDaysUTC: ["2026-01-02"] }),
    );
    expect(merged.heightQueried).toEqual(newer);
    expect(merged.networkDaysUTC).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("never credits one address with another's events or transactions", () => {
    const target = evidence({ walletAddress: "a".repeat(40) });
    const carried = evidence({
      walletAddress: "b".repeat(40),
      eventsInspected: { count: 5, address: "b".repeat(40), at: 3_000 },
      transactions: [{ hash: "c".repeat(64), at: 3_000 }],
    });
    const merged = mergeEvidence(target, carried);
    expect(merged.walletAddress).toBe("a".repeat(40));
    expect(merged.eventsInspected).toBeNull();
    expect(merged.transactions).toEqual([]);
  });
});
