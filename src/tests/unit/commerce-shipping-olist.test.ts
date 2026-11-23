// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db/client";
import { commerceTransaction } from "@/repositories/commerce";
import { commerceOlistRequest } from "@/services/commerce/olist-client";
import { OlistRequestError } from "@/services/olist/olist";
import { processCommerceShippingOlist } from "@/services/commerce/shipping-olist";

vi.mock("@/lib/db/client", () => ({ getPool: vi.fn() }));
vi.mock("@/repositories/commerce", () => ({ commerceTransaction: vi.fn() }));
vi.mock("@/services/commerce/olist-client", () => ({ commerceOlistRequest: vi.fn() }));

const tenantId = "10000000-0000-4000-8000-000000000001";
const orderId = "20000000-0000-4000-8000-000000000002";
const shipment = {
  id: "30000000-0000-4000-8000-000000000003", tenant_id: tenantId, order_id: orderId,
  tracking_code: "AB123456789BR", tracking_url: "https://tracking.example.com/AB123456789BR",
  sales_order_id: "22", invoice_id: "33",
};
const query = vi.fn();
const transactionQuery = vi.fn();
type Job = typeof shipment;
let candidates: Job[];
let current: Job | undefined;
let leases: Map<string, string>;
let acknowledgmentOwned: boolean;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("COMMERCE_ENABLED", "true");
  candidates = [{ ...shipment }]; current = { ...shipment };
  leases = new Map(); acknowledgmentOwned = true;
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.startsWith("select s.id")) {
      if (sql.includes("limit $3")) return { rows: candidates.slice(0, Number(params[2])) };
      const owned = leases.get(String(params[2])) === params[3];
      return { rows: owned && current ? [{ ...current }] : [] };
    }
    if (sql.startsWith("insert into commerce_olist_leases")) {
      const [key, token] = params as string[];
      if (leases.has(key)) return { rows: [], rowCount: 0 };
      leases.set(key, token);
      return { rows: [{ token }], rowCount: 1 };
    }
    if (sql.startsWith("delete from commerce_olist_leases")) {
      if (leases.get(String(params[0])) === params[1]) leases.delete(String(params[0]));
    }
    return { rows: [], rowCount: 1 };
  });
  transactionQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.startsWith("select token")) {
      return { rows: [], rowCount: acknowledgmentOwned && leases.get(String(params[0])) === params[1] ? 1 : 0 };
    }
    if (sql.startsWith("update commerce_order_shipments")) {
      candidates = candidates.filter(row => row.id !== params[1]);
    }
    return { rows: [], rowCount: 1 };
  });
  vi.mocked(getPool).mockReturnValue({ query } as never);
  vi.mocked(commerceTransaction).mockImplementation(async callback => callback({ query: transactionQuery } as never));
  vi.mocked(commerceOlistRequest).mockResolvedValue({});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const leaseKey = `commerce-olist:${tenantId}:${orderId}`;
const failures = () => query.mock.calls.filter(([sql]) => sql.startsWith("update commerce_order_shipments"));
const writes = () => transactionQuery.mock.calls.filter(([sql]) => !sql.startsWith("select token"));

describe("Olist shipment tracking synchronization", () => {
  it("PUTs only primary tracking to both dispatch endpoints and commits tracking plus one event", async () => {
    expect(await processCommerceShippingOlist(tenantId, 2, orderId)).toBe(1);
    const payload = { codigoRastreamento: shipment.tracking_code, urlRastreamento: shipment.tracking_url };
    expect(vi.mocked(commerceOlistRequest).mock.calls).toEqual([
      [tenantId, "/pedidos/22/despacho", "PUT", payload, expect.any(AbortSignal)],
      [tenantId, "/notas/33/despacho", "PUT", payload, expect.any(AbortSignal)],
    ]);
    expect(transactionQuery).toHaveBeenCalledWith(expect.stringContaining("update commerce_olist_orders"),
      [tenantId, orderId, shipment.tracking_code, shipment.tracking_url]);
    expect(transactionQuery).toHaveBeenCalledWith(expect.stringContaining("olist_tracking_error=null"),
      [tenantId, shipment.id, shipment.tracking_code]);
    const event = transactionQuery.mock.calls.find(([sql]) => sql.includes("'olist.tracking'"))!;
    expect(event[1].slice(0, 2)).toEqual([tenantId, orderId]);
    expect(JSON.parse(event[1][2])).toEqual({ source: "shipping", ...payload });
    expect(commerceTransaction).toHaveBeenCalledOnce();
    expect(leases.size).toBe(0);
  });

  it("selects only configured, opted-in tenants and paid production orders with authorized existing documents", async () => {
    candidates = [];
    expect(await processCommerceShippingOlist(tenantId, 2, orderId)).toBe(0);
    const [sql, params] = query.mock.calls[0];
    for (const clause of [
      "j.tenant_id=s.tenant_id and j.order_id=s.order_id", "c.settings->>'enabled'='true'",
      "i.tenant_id=s.tenant_id and i.provider='olist'", "i.status<>'disabled'", "i.credentials_encrypted is not null",
      "o.payment_status='paid'", "o.payment_environment='production'", "o.cancelled_at is null", "o.deleted_at is null",
      "j.sales_order_id ~", "j.invoice_id ~", "j.invoice_status in (6,7)", "st.enabled", "t.status='active'",
      "s.olist_tracking_next_at<=now()", "s.olist_tracking_synced_code is distinct from s.tracking_code",
      "j.tracking_code is distinct from s.tracking_code", "j.tracking_url is distinct from s.tracking_url",
      "nullif(btrim(s.tracking_code),'') is not null", "nullif(btrim(s.tracking_url),'') is not null",
      "s.tenant_id=$1", "s.order_id=$2",
    ]) expect(sql).toContain(clause);
    expect(params).toEqual([tenantId, orderId, 2]);
    expect(commerceOlistRequest).not.toHaveBeenCalled();
  });

  it("skips already synchronized tracking and still detects URL-only changes in SQL", async () => {
    await processCommerceShippingOlist();
    expect(await processCommerceShippingOlist()).toBe(0);
    expect(commerceOlistRequest).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("or j.tracking_url is distinct from s.tracking_url");
    candidates = [{ ...shipment, tracking_url: "https://tracking.example.com/new" }];
    current = { ...candidates[0] };
    await processCommerceShippingOlist();
    expect(vi.mocked(commerceOlistRequest).mock.calls[2][3]).toHaveProperty("urlRastreamento", current.tracking_url);
  });

  it("shares the durable ERP order lease, skips active owners, and allows expired-lease takeover", async () => {
    leases.set(leaseKey, "other-worker");
    expect(await processCommerceShippingOlist()).toBe(0);
    expect(commerceOlistRequest).not.toHaveBeenCalled();
    const claim = query.mock.calls.find(([sql]) => sql.startsWith("insert into commerce_olist_leases"))!;
    expect(claim[0]).toContain("on conflict(lock_key) do update");
    expect(claim[0]).toContain("commerce_olist_leases.expires_at<=now() returning token");
    expect(claim[1]).toEqual([leaseKey, expect.any(String)]);
    leases.delete(leaseKey);
    expect(await processCommerceShippingOlist()).toBe(1);
  });

  it("serializes overlapping scheduled workers without holding a transaction across ERP I/O", async () => {
    let finish!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>(resolve => { finish = resolve; });
    const ready = new Promise<void>(resolve => { entered = resolve; });
    vi.mocked(commerceOlistRequest).mockImplementationOnce(async () => {
      entered(); await blocked;
      expect(commerceTransaction).not.toHaveBeenCalled();
      return {};
    });
    const first = processCommerceShippingOlist();
    await ready;
    expect(await processCommerceShippingOlist()).toBe(0);
    finish();
    expect(await first).toBe(1);
    expect(commerceOlistRequest).toHaveBeenCalledTimes(2);
    expect(commerceTransaction).toHaveBeenCalledOnce();
  });

  it("rechecks live eligibility and lease ownership after claiming and before the second PUT", async () => {
    current = undefined;
    expect(await processCommerceShippingOlist()).toBe(0);
    expect(commerceOlistRequest).not.toHaveBeenCalled();
    expect(leases.size).toBe(0);
    current = { ...shipment };
    vi.mocked(commerceOlistRequest).mockImplementationOnce(async () => { current = undefined; return {}; });
    expect(await processCommerceShippingOlist()).toBe(1);
    expect(commerceOlistRequest).toHaveBeenCalledOnce();
    expect(writes()).toHaveLength(0);
    const liveReads = query.mock.calls.filter(([sql]) => sql.startsWith("select s.id") && sql.includes("exists(select 1"));
    expect(liveReads).toHaveLength(3);
    for (const [sql, params] of liveReads) {
      expect(sql).toContain("o.cancelled_at is null");
      expect(sql).toContain("c.settings->>'enabled'='true'");
      expect(sql).toContain("token=$4 and expires_at>now()");
      expect(params).toEqual([tenantId, shipment.id, leaseKey, expect.any(String)]);
    }
  });

  it.each(["tracking_code", "tracking_url", "sales_order_id", "invoice_id"] as const)(
    "does not acknowledge stale tracking when %s changes during the first PUT", async field => {
      vi.mocked(commerceOlistRequest).mockImplementationOnce(async () => {
        current = { ...shipment, [field]: "changed" }; return {};
      });
      await processCommerceShippingOlist();
      expect(commerceOlistRequest).toHaveBeenCalledOnce();
      expect(writes()).toHaveLength(0);
      expect(failures()).toHaveLength(0);
    },
  );

  it("fences success acknowledgment and release against a replacement lease token", async () => {
    vi.mocked(commerceOlistRequest).mockImplementationOnce(async () => ({})).mockImplementationOnce(async () => {
      leases.set(leaseKey, "replacement"); return {};
    });
    await processCommerceShippingOlist();
    expect(writes()).toHaveLength(0);
    expect(leases.get(leaseKey)).toBe("replacement");
    expect(transactionQuery.mock.calls[0][0]).toContain("token=$2 and expires_at>now() for update");
    expect(query.mock.calls.at(-1)).toEqual([
      "delete from commerce_olist_leases where lock_key=$1 and token=$2", [leaseKey, expect.any(String)],
    ]);
  });

  it("records only the sent snapshot if tracking changes during the second PUT, leaving the new pair eligible", async () => {
    vi.mocked(commerceOlistRequest).mockImplementationOnce(async () => ({})).mockImplementationOnce(async () => {
      current = { ...shipment, tracking_code: "NEW123", tracking_url: "https://tracking.example.com/NEW123" }; return {};
    });
    await processCommerceShippingOlist();
    expect(transactionQuery).toHaveBeenCalledWith(expect.stringContaining("update commerce_olist_orders"),
      [tenantId, orderId, shipment.tracking_code, shipment.tracking_url]);
    const ack = writes().find(([sql]) => sql.startsWith("update commerce_order_shipments"))!;
    expect(ack[0]).toContain("olist_tracking_next_at=now()");
    expect(ack[0]).not.toMatch(/set tracking_code=/);
  });

  it.each([
    [401, "olist_tracking_reconnect_required"], [403, "olist_tracking_reconnect_required"],
    [429, "olist_tracking_rate_limited"], [422, "olist_tracking_rejected"], [500, "olist_tracking_unavailable"],
  ])("persists safe admin diagnostics and durable backoff for HTTP %s", async (status, code) => {
    vi.mocked(commerceOlistRequest).mockRejectedValueOnce(new OlistRequestError("private access_token customer@example.com", Number(status), {}));
    expect(await processCommerceShippingOlist()).toBe(1);
    expect(writes()).toHaveLength(0);
    expect(failures()).toHaveLength(1);
    const [sql, params] = failures()[0];
    expect(sql).toContain("now()+interval '5 minutes'");
    expect(sql).toContain("token=$5 and expires_at>now()");
    expect(sql).toContain("expires_at>now() for update");
    expect(sql).toContain("tracking_code is distinct from $6 or tracking_url is distinct from $7");
    expect(params).toEqual([tenantId, shipment.id, code, leaseKey, expect.any(String), shipment.tracking_code, shipment.tracking_url]);
    expect(JSON.stringify([query.mock.calls, transactionQuery.mock.calls])).not.toContain("private access_token");
    expect(leases.size).toBe(0);
  });

  it("replays only idempotent dispatch PUTs after a partial or uncertain failure", async () => {
    vi.mocked(commerceOlistRequest).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("lost response"));
    await processCommerceShippingOlist();
    expect(writes()).toHaveLength(0);
    expect(failures()[0][1][2]).toBe("olist_tracking_unavailable");
    await processCommerceShippingOlist();
    expect(vi.mocked(commerceOlistRequest).mock.calls.map(call => call.slice(1, 3))).toEqual([
      ["/pedidos/22/despacho", "PUT"], ["/notas/33/despacho", "PUT"],
      ["/pedidos/22/despacho", "PUT"], ["/notas/33/despacho", "PUT"],
    ]);
    expect(writes().filter(([sql]) => sql.includes("'olist.tracking'"))).toHaveLength(1);
  });

  it("defers a failed database acknowledgment without reporting success or replaying creation operations", async () => {
    transactionQuery.mockRejectedValueOnce(new Error("ack database failure"));
    expect(await processCommerceShippingOlist()).toBe(1);
    expect(commerceOlistRequest).toHaveBeenCalledTimes(2);
    expect(writes()).toHaveLength(0);
    expect(failures()[0][1][2]).toBe("olist_tracking_unavailable");
    expect(leases.size).toBe(0);
  });

  it("always releases its lease when a live-state database read fails", async () => {
    const normal = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith("select s.id") && sql.includes("exists(select 1")) throw new Error("DB unavailable");
      return normal(sql, params);
    });
    await expect(processCommerceShippingOlist()).rejects.toThrow("DB unavailable");
    expect(commerceOlistRequest).not.toHaveBeenCalled();
    expect(leases.size).toBe(0);
  });

  it.each([
    { tracking_code: "bad\ncode" }, { tracking_url: "javascript:alert(1)" },
    { tracking_url: "http://tracking.example.com" }, { tracking_url: "https://user:pass@tracking.example.com" },
  ])("rejects invalid tracking without any ERP call: %j", async patch => {
    current = { ...shipment, ...patch };
    await processCommerceShippingOlist();
    expect(commerceOlistRequest).not.toHaveBeenCalled();
    expect(failures()[0][1][2]).toBe("olist_tracking_invalid");
  });

  it("isolates a failing shipment so the next tenant can still sync", async () => {
    const other = { ...shipment, id: "other-shipment", tenant_id: "other-tenant", order_id: "other-order" };
    candidates.push(other);
    vi.mocked(commerceOlistRequest).mockRejectedValueOnce(new Error("offline"));
    const normal = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      if (sql.startsWith("select s.id") && params[0] === other.tenant_id) current = other;
      return normal(sql, params);
    });
    expect(await processCommerceShippingOlist()).toBe(2);
    expect(failures()).toHaveLength(1);
    expect(vi.mocked(commerceOlistRequest).mock.calls.slice(1).every(call => call[0] === other.tenant_id)).toBe(true);
  });

  it("bounds batch size, defaults to two and stops after the invocation time budget", async () => {
    candidates = [];
    await processCommerceShippingOlist();
    await processCommerceShippingOlist(tenantId, 999);
    await processCommerceShippingOlist(tenantId, 1.9, orderId);
    expect(query.mock.calls.map(([, params]) => params)).toEqual([
      [null, null, 2], [tenantId, null, 10], [tenantId, orderId, 1],
    ]);
    candidates = [{ ...shipment }];
    vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(35000);
    expect(await processCommerceShippingOlist()).toBe(0);
    expect(commerceOlistRequest).not.toHaveBeenCalled();
  });

  it("does no work when disabled, given an empty limit, or called for an order without tenant scope", async () => {
    await expect(processCommerceShippingOlist(undefined, 2, orderId)).rejects.toThrow("requires tenantId");
    expect(await processCommerceShippingOlist(tenantId, 0)).toBe(0);
    vi.stubEnv("COMMERCE_ENABLED", "false");
    expect(await processCommerceShippingOlist()).toBe(0);
    expect(getPool).not.toHaveBeenCalled();
  });
});
