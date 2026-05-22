import {
  authedFetch,
  ensureServerReachable,
  resetFixture,
  deleteFixture,
} from "./client";
import { TEST_PATH, FIXTURE_DOCUMENT, BLOCK_BETA } from "./fixtures";

beforeAll(async () => {
  await ensureServerReachable();
  await resetFixture(FIXTURE_DOCUMENT, TEST_PATH);
});

afterAll(async () => {
  await deleteFixture(TEST_PATH);
});

describe("GET /blocks/{path}", () => {
  test("returns 200 with blocks array", async () => {
    const res = await authedFetch(`/blocks/${TEST_PATH}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.blocks)).toBe(true);
  });

  test("includes beta-block from fixture", async () => {
    const res = await authedFetch(`/blocks/${TEST_PATH}`);
    const body = await res.json();
    const block = body.blocks.find((b: { id: string }) => b.id === BLOCK_BETA);
    expect(block).toBeDefined();
    expect(typeof block.content).toBe("string");
    expect(typeof block.line).toBe("number");
  });

  test("returns 404 for non-existent file", async () => {
    const res = await authedFetch("/blocks/does-not-exist.md");
    expect(res.status).toBe(404);
  });
});

describe("GET /blocks/{path}/{blockId}", () => {
  test("returns 200 with block content for existing block", async () => {
    const res = await authedFetch(`/blocks/${TEST_PATH}/${BLOCK_BETA}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(BLOCK_BETA);
    expect(typeof body.content).toBe("string");
    expect(typeof body.line).toBe("number");
  });

  test("returns 404 for non-existent block", async () => {
    const res = await authedFetch(`/blocks/${TEST_PATH}/nonexistent-block`);
    expect(res.status).toBe(404);
  });
});

describe("POST /blocks/{path}", () => {
  const blockTestPath = "__integration_tests__/block-create-test.md";

  beforeEach(async () => {
    await resetFixture("# Test\n\nLine zero content.\n\nLine two content.\n", blockTestPath);
  });

  afterEach(async () => {
    await deleteFixture(blockTestPath);
  });

  test("adds a block reference to a specific line", async () => {
    const res = await authedFetch(`/blocks/${blockTestPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line: 2, blockId: "new-test-block" }),
    });
    expect(res.status).toBe(200);

    // Verify it was created
    const readRes = await authedFetch(`/blocks/${blockTestPath}/new-test-block`);
    expect(readRes.status).toBe(200);
    const body = await readRes.json();
    expect(body.id).toBe("new-test-block");
  });
});

describe("POST /transclusions/", () => {
  const transclusionPath = "__integration_tests__/transclusion-test.md";

  beforeEach(async () => {
    await resetFixture("# Test\n\nSome content.\n", transclusionPath);
  });

  afterEach(async () => {
    await deleteFixture(transclusionPath);
  });

  test("inserts a block transclusion", async () => {
    const res = await authedFetch("/transclusions/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: transclusionPath,
        targetNote: "fixture",
        targetRef: BLOCK_BETA,
        refType: "block",
        position: "end",
      }),
    });
    expect(res.status).toBe(200);

    // Verify content contains the transclusion
    const readRes = await authedFetch(`/vault/${transclusionPath}`);
    const text = await readRes.text();
    expect(text).toContain(`![[fixture#^${BLOCK_BETA}]]`);
  });

  test("inserts a heading transclusion", async () => {
    const res = await authedFetch("/transclusions/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: transclusionPath,
        targetNote: "fixture",
        targetRef: "Alpha",
        refType: "heading",
        position: "end",
      }),
    });
    expect(res.status).toBe(200);

    const readRes = await authedFetch(`/vault/${transclusionPath}`);
    const text = await readRes.text();
    expect(text).toContain("![[fixture#Alpha]]");
  });
});
