import {
  authedFetch,
  ensureServerReachable,
  resetFixture,
  deleteFixture,
} from "./client";
import { TEST_DIR } from "./fixtures";

const LINK_PATH = `${TEST_DIR}/link-test.md`;
const LINK_TARGET_PATH = `${TEST_DIR}/link-target.md`;

const LINK_FIXTURE = `---
title: Link Test
---

# Notes

Some content here.

See also [[link-target]] for details.
`;

const LINK_TARGET_FIXTURE = `---
title: Link Target
---

# Target Note

This is the target note.
`;

beforeAll(async () => {
  await ensureServerReachable();
  await resetFixture(LINK_FIXTURE, LINK_PATH);
  await resetFixture(LINK_TARGET_FIXTURE, LINK_TARGET_PATH);
});

afterAll(async () => {
  await deleteFixture(LINK_PATH);
  await deleteFixture(LINK_TARGET_PATH);
});

describe("GET /links/{path}", () => {
  test("returns 200 with links array for existing file", async () => {
    const res = await authedFetch(`/links/${LINK_PATH}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("includes outgoing link to link-target", async () => {
    const res = await authedFetch(`/links/${LINK_PATH}`);
    const body = await res.json() as { target: string; direction: string }[];
    const outgoing = body.find(
      (l) => l.target.includes("link-target") && l.direction === "outgoing"
    );
    expect(outgoing).toBeDefined();
  });

  test("returns 404 for non-existent file", async () => {
    const res = await authedFetch("/links/does-not-exist.md");
    expect(res.status).toBe(404);
  });
});

describe("POST /links/ and DELETE /links/", () => {
  const linkTestPath = `${TEST_DIR}/link-crud.md`;

  beforeEach(async () => {
    await resetFixture("# Test\n\nSome content.\n", linkTestPath);
  });

  afterEach(async () => {
    await deleteFixture(linkTestPath);
  });

  test("creates and then deletes a wiki-link", async () => {
    // Create link
    const createRes = await authedFetch("/links/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: linkTestPath,
        target: "link-target",
        position: "end",
      }),
    });
    expect(createRes.status).toBe(200);

    // Wait for Obsidian to re-index the file
    await new Promise((r) => setTimeout(r, 1000));

    // Verify the link exists
    const listRes = await authedFetch(`/links/${linkTestPath}`);
    const listBody = await listRes.json() as { target: string; direction: string }[];
    const found = listBody.find(
      (l) => l.target.includes("link-target") && l.direction === "outgoing"
    );
    expect(found).toBeDefined();

    // Delete the link
    const deleteRes = await authedFetch("/links/", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: linkTestPath,
        target: "link-target",
      }),
    });
    expect(deleteRes.status).toBe(200);
  });
});

describe("GET /links/suggest/{path}", () => {
  test("returns 200 with suggestions array", async () => {
    const res = await authedFetch(`/links/suggest/${LINK_PATH}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("returns 404 for non-existent file", async () => {
    const res = await authedFetch("/links/suggest/does-not-exist.md");
    expect(res.status).toBe(404);
  });
});
