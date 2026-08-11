import { describe, it, expect, vi, afterEach } from "vitest";
import { committeeData, committeesData, retiredCommittees, subsidizedCommittees } from "../rpc.js";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Task 6: committeeData, committeesData, retiredCommittees, subsidizedCommittees", () => {
  describe("committeeData()", () => {
    it("queries committee data by committee ID at latest height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ id: 1, lastChainHeight: 100, lastRootHeight: 50 })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await committeeData(1, { retry: false });

      expect(result.id).toBe(1);
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/committee-data");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.id).toBe(1);
      expect(body.height).toBe(0);
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ id: 1 }));
      vi.stubGlobal("fetch", fetchMock);

      await committeeData(1, { height: 100, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(100);
    });

    it("throws on invalid committee ID", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ id: 1 })));

      expect(committeeData(-1, { retry: false })).rejects.toThrow();
      expect(committeeData("invalid" as any, { retry: false })).rejects.toThrow();
    });
  });

  describe("committeesData()", () => {
    it("queries all committees data at latest height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ committees: [{ id: 1 }, { id: 2 }] })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await committeesData({ retry: false });

      expect(result.committees).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/committees-data");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(0);
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ committees: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await committeesData({ height: 200, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(200);
    });
  });

  describe("retiredCommittees()", () => {
    it("queries retired committee IDs at latest height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ retiredCommittees: [1, 2, 3] })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await retiredCommittees({ retry: false });

      expect(result.retiredCommittees).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/retired-committees");
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ retiredCommittees: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await retiredCommittees({ height: 150, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(150);
    });
  });

  describe("subsidizedCommittees()", () => {
    it("queries subsidized committee IDs at latest height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        json({ subsidizedCommittees: [0, 1] })
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await subsidizedCommittees({ retry: false });

      expect(result.subsidizedCommittees).toBeDefined();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/subsidized-committees");
    });

    it("queries at specific height", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ subsidizedCommittees: [] }));
      vi.stubGlobal("fetch", fetchMock);

      await subsidizedCommittees({ height: 300, retry: false });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.height).toBe(300);
    });
  });
});
