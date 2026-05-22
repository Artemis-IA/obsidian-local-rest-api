import {
  authedFetch,
  unauthFetch,
  ensureServerReachable,
  resetFixture,
  deleteFixture,
} from "./client";
import { TEST_PATH, FIXTURE_DOCUMENT } from "./fixtures";

beforeAll(async () => {
  await ensureServerReachable();
  await resetFixture(FIXTURE_DOCUMENT, TEST_PATH);
});

afterAll(async () => {
  await deleteFixture(TEST_PATH);
});

describe("GET /graph/", () => {
  test("returns 200 with nodes and edges arrays", async () => {
    const res = await authedFetch("/graph/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
  });

  test("each node has path, name, tags, linkCount, backlinkCount", async () => {
    const res = await authedFetch("/graph/");
    const body = await res.json();
    expect(body.nodes.length).toBeGreaterThan(0);
    const node = body.nodes[0];
    expect(typeof node.path).toBe("string");
    expect(typeof node.name).toBe("string");
    expect(Array.isArray(node.tags)).toBe(true);
    expect(typeof node.linkCount).toBe("number");
    expect(typeof node.backlinkCount).toBe("number");
  });

  test("filter parameter narrows results", async () => {
    const allRes = await authedFetch("/graph/");
    const allBody = await allRes.json();

    const filteredRes = await authedFetch("/graph/?filter=__integration_tests__");
    const filteredBody = await filteredRes.json();

    expect(filteredBody.nodes.length).toBeLessThanOrEqual(allBody.nodes.length);
    for (const node of filteredBody.nodes) {
      expect(node.path.toLowerCase()).toContain("__integration_tests__");
    }
  });

  test("returns 401 without auth", async () => {
    const res = await unauthFetch("/graph/");
    expect(res.status).toBe(401);
  });
});

describe("GET /graph/analyze/", () => {
  test("returns 200 with analysis metrics", async () => {
    const res = await authedFetch("/graph/analyze/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.totalNodes).toBe("number");
    expect(typeof body.totalEdges).toBe("number");
    expect(Array.isArray(body.orphans)).toBe(true);
    expect(Array.isArray(body.hubs)).toBe(true);
    expect(Array.isArray(body.connectedComponents)).toBe(true);
  });

  test("topN parameter limits hub count", async () => {
    const res = await authedFetch("/graph/analyze/?topN=2");
    const body = await res.json();
    expect(body.hubs.length).toBeLessThanOrEqual(2);
  });
});

describe("GET /graph/neighbors/", () => {
  test("returns 200 with nodes and edges for existing file", async () => {
    const res = await authedFetch(`/graph/neighbors/${TEST_PATH}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    // The root note itself should be in the result
    const root = body.nodes.find((n: { path: string }) => n.path === TEST_PATH);
    expect(root).toBeDefined();
    expect(root.depth).toBe(0);
  });

  test("returns 200 with isolated node for non-existent file", async () => {
    const res = await authedFetch("/graph/neighbors/does-not-exist.md");
    expect(res.status).toBe(200);
    const body = await res.json();
    // Non-existent file is treated as an isolated node with no connections
    expect(body.nodes.length).toBe(1);
    expect(body.edges.length).toBe(0);
  });
});
