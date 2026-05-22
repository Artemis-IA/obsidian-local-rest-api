import {
  authedFetch,
  ensureServerReachable,
  deleteFixture,
} from "./client";
import { TEST_DIR } from "./fixtures";

const CANVAS_PATH = `${TEST_DIR}/test-canvas.canvas`;

beforeAll(async () => {
  await ensureServerReachable();
  // Clean up any leftover canvas from a previous run
  await deleteFixture(CANVAS_PATH);
});

afterAll(async () => {
  await deleteFixture(CANVAS_PATH);
});

describe("Canvas CRUD", () => {
  test("GET /canvas/ returns list of canvas files", async () => {
    const res = await authedFetch("/canvas/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.files)).toBe(true);
  });

  test("POST /canvas/ creates a new canvas", async () => {
    const res = await authedFetch("/canvas/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: CANVAS_PATH,
        nodes: [
          { id: "node1", type: "text", x: 0, y: 0, width: 200, height: 100, text: "Hello" },
          { id: "node2", type: "text", x: 300, y: 0, width: 200, height: 100, text: "World" },
        ],
        edges: [
          { id: "edge1", fromNode: "node1", toNode: "node2" },
        ],
      }),
    });
    expect(res.status).toBe(201);
  });

  test("GET /canvas/{path} reads the canvas back", async () => {
    const res = await authedFetch(`/canvas/${CANVAS_PATH}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    expect(body.nodes.length).toBe(2);
    expect(body.edges.length).toBe(1);
  });

  test("POST /canvas/{path}/nodes adds a node", async () => {
    const res = await authedFetch(`/canvas/${CANVAS_PATH}/nodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "node3",
        type: "text",
        x: 600,
        y: 0,
        width: 200,
        height: 100,
        text: "New node",
      }),
    });
    expect(res.status).toBe(200);

    // Verify
    const readRes = await authedFetch(`/canvas/${CANVAS_PATH}`);
    const readBody = await readRes.json();
    expect(readBody.nodes.length).toBe(3);
  });

  test("POST /canvas/{path}/edges adds an edge", async () => {
    const res = await authedFetch(`/canvas/${CANVAS_PATH}/edges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "edge2",
        fromNode: "node2",
        toNode: "node3",
      }),
    });
    expect(res.status).toBe(200);

    const readRes = await authedFetch(`/canvas/${CANVAS_PATH}`);
    const readBody = await readRes.json();
    expect(readBody.edges.length).toBe(2);
  });

  test("DELETE /canvas/{path}/nodes/{nodeId} removes node and connected edges", async () => {
    const res = await authedFetch(`/canvas/${CANVAS_PATH}/nodes/node3`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);

    const readRes = await authedFetch(`/canvas/${CANVAS_PATH}`);
    const readBody = await readRes.json();
    expect(readBody.nodes.length).toBe(2);
    // edge2 (node2→node3) should be removed
    expect(readBody.edges.length).toBe(1);
  });

  test("PUT /canvas/{path} replaces entire canvas", async () => {
    const res = await authedFetch(`/canvas/${CANVAS_PATH}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodes: [
          { id: "replaced1", type: "text", x: 0, y: 0, width: 100, height: 50, text: "Replaced" },
        ],
        edges: [],
      }),
    });
    expect(res.status).toBe(200);

    const readRes = await authedFetch(`/canvas/${CANVAS_PATH}`);
    const readBody = await readRes.json();
    expect(readBody.nodes.length).toBe(1);
    expect(readBody.nodes[0].id).toBe("replaced1");
    expect(readBody.edges.length).toBe(0);
  });

  test("GET /canvas/{path} returns 404 for non-existent canvas", async () => {
    const res = await authedFetch("/canvas/nonexistent.canvas");
    expect(res.status).toBe(404);
  });
});
