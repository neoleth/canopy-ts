import { describe, it, expect, vi, afterEach } from "vitest";
import { postQuery, PageParams } from "../rpc.js";

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

afterEach(() => vi.restoreAllMocks());

describe("Task 1: postQuery helper and PageParams", () => {
  describe("PageParams", () => {
    it("has default values", () => {
      const params = new PageParams();
      expect(params.page).toBe(1);
      expect(params.per_page).toBe(20);
      expect(params.order_by).toBeUndefined();
      expect(params.desc).toBe(true);
    });

    it("can be constructed with custom values", () => {
      const params = new PageParams({ page: 2, per_page: 50, order_by: "height", desc: false });
      expect(params.page).toBe(2);
      expect(params.per_page).toBe(50);
      expect(params.order_by).toBe("height");
      expect(params.desc).toBe(false);
    });

    it("converts to API request parameters", () => {
      const params = new PageParams({ page: 2, per_page: 50, order_by: "height", desc: false });
      const dict = params.toDict();
      expect(dict).toEqual({
        pageNumber: 2,
        perPage: 50,
        orderBy: "height",
        desc: false,
      });
    });

    it("omits orderBy when not set", () => {
      const params = new PageParams();
      const dict = params.toDict();
      expect(dict.orderBy).toBeUndefined();
      expect(dict).toEqual({
        pageNumber: 1,
        perPage: 20,
        desc: true,
      });
    });
  });

  describe("postQuery helper", () => {
    it("POSTs to the given path with json body", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ result: "data" }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await postQuery("testOp", "/v1/query/test", { foo: "bar" }, { retry: false });

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][0]).toContain("/v1/query/test");
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
      expect(fetchMock.mock.calls[0][1].body).toContain("foo");
      expect(result).toEqual({ result: "data" });
    });

    it("uses baseUrl when provided", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ result: "ok" }));
      vi.stubGlobal("fetch", fetchMock);

      await postQuery("testOp", "/v1/query/test", {}, { baseUrl: "http://node:50002", retry: false });

      expect(fetchMock.mock.calls[0][0]).toBe("http://node:50002/v1/query/test");
    });

    it("validates response against schema", async () => {
      const fetchMock = vi.fn().mockResolvedValue(json({ invalid: "shape" }));
      vi.stubGlobal("fetch", fetchMock);

      const schema = await import("zod").then(z => z.z.object({ result: z.z.string() }));
      const promise = postQuery("testOp", "/v1/query/test", {}, { retry: false }, schema);

      expect(promise).rejects.toThrow();
    });
  });
});
