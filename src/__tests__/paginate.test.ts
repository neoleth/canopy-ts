import { describe, it, expect, vi } from "vitest";
import { paginate, PageParams } from "../rpc.js";

describe("paginate", () => {
  it("yields items across multiple pages and stops on a short final page", async () => {
    const fetchPage = vi.fn(async (opts: { pageParams?: PageParams }) => {
      const page = opts.pageParams!.page;
      if (page === 1) return { results: ["a", "b"] };
      if (page === 2) return { results: ["c"] }; // shorter than per_page=2 -> last page
      throw new Error("should not fetch a 3rd page");
    });

    const items: string[] = [];
    for await (const item of paginate<string>(fetchPage, { pageParams: { per_page: 2 } })) {
      items.push(item);
    }

    expect(items).toEqual(["a", "b", "c"]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("stops immediately on an empty first page", async () => {
    const fetchPage = vi.fn(async () => ({ results: [] }));

    const items: unknown[] = [];
    for await (const item of paginate(fetchPage)) items.push(item);

    expect(items).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("treats a missing/non-array results field as an empty page instead of throwing", async () => {
    const fetchPage = vi.fn(async () => ({} as any));

    const items: unknown[] = [];
    for await (const item of paginate(fetchPage)) items.push(item);

    expect(items).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("advances page numbers starting from init.pageParams.page and defaults per_page to 20", async () => {
    const calls: number[] = [];
    const fetchPage = vi.fn(async (opts: { pageParams?: PageParams }) => {
      calls.push(opts.pageParams!.page);
      expect(opts.pageParams!.per_page).toBe(20);
      // full page every time until page 4, so we can assert it actually advances
      return calls.length < 3 ? { results: new Array(20).fill("x") } : { results: [] };
    });

    const items: unknown[] = [];
    for await (const item of paginate(fetchPage, { pageParams: { page: 5 } })) items.push(item);

    expect(calls).toEqual([5, 6, 7]);
  });

  it("passes requestOptions through to every page fetch", async () => {
    const fetchPage = vi.fn(async (opts: { baseUrl?: string; pageParams?: PageParams }) => {
      expect(opts.baseUrl).toBe("http://node:50002");
      return { results: [] };
    });

    for await (const _ of paginate(fetchPage, { requestOptions: { baseUrl: "http://node:50002" } })) {
      // no-op
    }

    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
