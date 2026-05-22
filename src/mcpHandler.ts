import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { z } from "zod";
import express from "express";
import { TFile } from "obsidian";

import { VaultOperations } from "./vaultOperations";
import { PatchFailed, PatchOperation, PatchTargetType } from "markdown-patch";
import openapiYaml from "../docs/openapi.yaml";
import graphVisualizerHtml from "./apps/graph-visualizer.html";
import { ERROR_CODE_MESSAGES } from "./constants";
import { CanvasData, LocalRestApiSettings } from "./types";

const PERIODS = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;

// Minimal structural type for McpServer — typed as a plain interface rather than the SDK's
// McpServer class to avoid TypeScript heap OOM from evaluating ToolCallback<ZodRawShape>.
interface MinimalMcpServer {
  tool(name: string, description: string, schema: unknown, callback: (args: unknown) => Promise<CallToolResult>): { remove: () => void };
  registerTool(name: string, config: { title?: string; description?: string; inputSchema?: unknown; outputSchema?: unknown; annotations?: unknown; _meta?: Record<string, unknown> }, callback: (args: unknown) => Promise<CallToolResult>): { remove: () => void };
  connect(transport: StreamableHTTPServerTransport): Promise<void>;
  resource(name: string, uri: string, meta: unknown, handler: (uri: URL) => Promise<unknown>): void;
}

const GRAPH_VISUALIZER_URI = "ui://obsidian-local-rest-api/graph-visualizer.html";
const MCP_APP_MIME_TYPE = "text/html;type=mcp-app";

export class McpHandler {
  private readonly transports: Map<string, { transport: StreamableHTTPServerTransport; server: MinimalMcpServer }> = new Map();
  private readonly externalTools: Array<{
    name: string;
    description: string;
    schema: Record<string, z.ZodTypeAny>;
    callback: (args: Record<string, unknown>) => Promise<unknown>;
  }> = [];

  constructor(
    private readonly ops: VaultOperations,
    private readonly settings: LocalRestApiSettings,
  ) {}

  private createMcpServer(): MinimalMcpServer {
    const server = new McpServer({
      name: "obsidian-local-rest-api",
      version: "1.0.0",
    }) as unknown as MinimalMcpServer;
    this.registerResources(server);
    this.registerTools(server);
    for (const ext of this.externalTools) {
      this.tool(server, ext.name, ext.description, ext.schema, async (args) =>
        this.text(await ext.callback(args as Record<string, unknown>)),
      );
    }
    return server;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tool(server: MinimalMcpServer, name: string, description: string, schema: any, callback: (args: any) => Promise<CallToolResult>): { remove: () => void } {
    return server.tool(name, description, schema, async (args: unknown) => {
      try {
        const result = await callback(args);
        if (this.settings.enableVerboseLogging) {
          console.debug(`[MCP] ${name} => ok`);
        }
        return result;
      } catch (e) {
        if (this.settings.enableVerboseLogging) {
          console.debug(`[MCP] ${name} => error`);
        }
        throw e;
      }
    });
  }

  public registerTool(
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    callback: (args: Record<string, unknown>) => Promise<unknown>,
  ): () => void {
    this.externalTools.push({ name, description, schema, callback });
    return () => {
      const idx = this.externalTools.findIndex((t) => t.name === name);
      if (idx >= 0) this.externalTools.splice(idx, 1);
    };
  }

  async handleRequest(
    req: express.Request,
    res: express.Response,
  ): Promise<void> {
    // Ensure the Accept header satisfies the SDK's validation which
    // requires both application/json and text/event-stream, even when
    // enableJsonResponse is true and we never actually stream SSE.
    // Clients like Windsurf's mcp-go may only send application/json.
    const accept = req.headers["accept"] ?? "";
    if (!accept.includes("text/event-stream")) {
      req.headers["accept"] = accept
        ? `${accept}, text/event-stream`
        : "application/json, text/event-stream";
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          this.transports.set(id, { transport, server });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) this.transports.delete(transport.sessionId);
      };
      const server = this.createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    const entry = this.transports.get(sessionId);
    if (!entry) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    await entry.transport.handleRequest(req, res, req.body);
  }

  private text(data: unknown) {
    return {
      content: [
        {
          type: "text" as const,
          text:
            typeof data === "string" ? data : JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private getActiveFile(): TFile {
    const file = this.ops.app.workspace.getActiveFile();
    if (!file) throw new Error("No active file");
    return file;
  }

  private registerResources(server: MinimalMcpServer): void {
    server.resource(
      "openapi-spec",
      "obsidian://local-rest-api/openapi.yaml",
      {
        mimeType: "application/yaml",
        description:
          "Full OpenAPI specification for the Obsidian Local REST API. " +
          "Contains complete request/response schemas, parameter descriptions, " +
          "and usage examples for every endpoint.",
      },
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: "application/yaml",
            text: openapiYaml,
          },
        ],
      }),
    );

    server.resource(
      "graph-visualizer",
      GRAPH_VISUALIZER_URI,
      {
        mimeType: MCP_APP_MIME_TYPE,
        description:
          "Interactive force-directed graph visualization of the vault's note connections. " +
          "Renders nodes (notes) and edges (wiki-links) with D3.js. Supports zoom, " +
          "drag, folder filtering, orphan/hub highlighting, and tooltips.",
      },
      async (uri: URL) => ({
        contents: [
          {
            uri: uri.href,
            mimeType: MCP_APP_MIME_TYPE,
            text: graphVisualizerHtml,
          },
        ],
      }),
    );
  }

  private registerTools(server: MinimalMcpServer): void {
    this.tool(server,
      "vault_list",
      "List files and subdirectories inside a vault directory. " +
        "Returns an array of names; directory entries end with '/'. " +
        "Omit path or pass an empty string to list the vault root.",
      { path: z.string().optional().describe("Directory path relative to vault root (default: root)") },
      async ({ path }: { path?: string }) => {
        const files = await this.ops.listVaultDirectory(path ?? "");
        return this.text({ files });
      },
    );

    this.tool(server,
      "vault_read",
      "Read a vault file's content and metadata. " +
        "Returns a JSON object with: content (full markdown text), path, " +
        "tags (array of tag strings), frontmatter (parsed YAML front-matter as an object), " +
        "stat ({ctime, mtime, size}), " +
        "links (array of vault-relative paths this file links to), " +
        "and backlinks (array of vault-relative paths of files that link here). " +
        "Throws if the file does not exist.\n\n" +
        "When targetType and target are both provided, returns only the matched section " +
        "as a plain string (markdown) or JSON value (frontmatter) instead of the full object. " +
        "Use vault_get_document_map first to discover available targets.",
      {
        path: z.string().describe("File path relative to vault root"),
        targetType: z
          .enum(["heading", "block", "frontmatter"])
          .optional()
          .describe("Type of section to extract: 'heading', 'block' reference, or 'frontmatter' key"),
        target: z
          .string()
          .optional()
          .describe(
            "Section to extract. Heading text, block reference ID (without '^'), or frontmatter key. " +
              "Separate nested heading levels with '::' (e.g. 'Heading 1::Subheading').",
          ),
        targetDelimiter: z
          .string()
          .optional()
          .describe("Delimiter for nested heading paths (default: '::')"),
      },
      async ({
        path,
        targetType,
        target,
        targetDelimiter,
      }: {
        path: string;
        targetType?: "heading" | "block" | "frontmatter";
        target?: string;
        targetDelimiter?: string;
      }) => {
        const file = this.ops.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`);
        if ((targetType == null) !== (target == null)) {
          throw new Error("targetType and target must be provided together");
        }
        if (targetType && target) {
          const section = await this.ops.readFileSection(file, targetType, target, targetDelimiter);
          return this.text(section);
        }
        const meta = await this.ops.getFileMetadataObject(file);
        return this.text(meta);
      },
    );

    this.tool(server,
      "vault_write",
      "Create or overwrite a vault file with the given content. " +
        "Creates any missing parent directories automatically. " +
        "Overwrites without warning if the file already exists.",
      {
        path: z.string().describe("File path relative to vault root"),
        content: z.string().describe("Full file content (markdown text)"),
      },
      async ({ path, content }: { path: string; content: string }) => {
        await this.ops.writeFileContent(path, content);
        return this.text({ message: "OK" });
      },
    );

    this.tool(server,
      "vault_append",
      "Append content to the end of a vault file. " +
        "Creates the file if it does not already exist.",
      {
        path: z.string().describe("File path relative to vault root"),
        content: z.string().describe("Content to append"),
      },
      async ({ path, content }: { path: string; content: string }) => {
        await this.ops.appendFileContent(path, content);
        return this.text({ message: "OK" });
      },
    );

    this.tool(server,
      "vault_patch",
      "Patch a specific section of a vault file by targeting a heading, block reference, or frontmatter field.\n\n" +
        "- targetType: 'heading' targets the content beneath a markdown heading (the heading line itself is not part of the section and must not appear in the supplied content); 'block' targets a block reference (the ID after '^'); 'frontmatter' targets a YAML front-matter key.\n" +
        "- target: the heading text, block ID, or frontmatter key. For nested headings use '::' as delimiter (e.g. 'Heading 1::Subheading'); customise with targetDelimiter.\n" +
        "- operation: 'append' adds content after the section, 'prepend' adds before, 'replace' replaces entirely.\n" +
        "- contentType: 'text/markdown' (default) treats content as markdown. 'application/json' parses it as JSON — useful for setting typed frontmatter values or appending rows to a table (pass a 2-D array of row cells).\n" +
        "- createTargetIfMissing: set to true to create the heading or frontmatter key if it does not exist yet.\n" +
        "- trimTargetWhitespace: strip leading/trailing whitespace from the target section before patching.\n" +
        "- rejectIfContentPreexists: fail the patch if the content string already appears in the target section — use this as an idempotency guard so a retry does not duplicate content.\n" +
        "- targetScope: controls what portion of the target the operation acts on. 'content' (default) patches only the content below the heading or at the block; 'marker' patches only the heading line or block-ID token itself; 'markerAndContent' patches the heading/block-ID together with its content. Only applicable to heading and block targets.\n\n" +
        "To discover valid heading names and block IDs before patching, call vault_get_document_map first.",
      {
        path: z.string().describe("File path relative to vault root"),
        targetType: z
          .enum(["heading", "block", "frontmatter"])
          .describe("Type of target section: 'heading', 'block' reference, or 'frontmatter' key"),
        target: z
          .string()
          .describe(
            "The section to patch. Heading text, block reference ID (without '^'), or frontmatter key. " +
              "Separate nested heading levels with '::' (e.g. 'Heading 1::Subheading').",
          ),
        operation: z
          .enum(["replace", "prepend", "append"])
          .describe("How to apply the content: replace the section, prepend before it, or append after it"),
        content: z.unknown().describe("Content to apply. For contentType 'text/markdown' pass a string. For contentType 'application/json' you may pass a native JSON value (number, boolean, array, object) and it will be serialised automatically."),
        contentType: z
          .string()
          .optional()
          .describe(
            "MIME type of content. 'text/markdown' (default) or 'application/json'. " +
              "Use 'application/json' to set typed frontmatter values or to append/prepend table rows (2-D array).",
          ),
        createTargetIfMissing: z
          .boolean()
          .optional()
          .describe("Create the heading or frontmatter key if it does not already exist (default: false)"),
        trimTargetWhitespace: z
          .boolean()
          .optional()
          .describe("Trim whitespace from the target section before applying the operation (default: false)"),
        rejectIfContentPreexists: z
          .boolean()
          .optional()
          .describe("If true, fail the patch when the content already appears in the target section (default: false). Use to make append/prepend operations idempotent on retry."),
        targetDelimiter: z
          .string()
          .optional()
          .describe("Delimiter for nested heading paths (default: '::')"),
        targetScope: z
          .enum(["content", "marker", "markerAndContent"])
          .optional()
          .describe(
            "Controls which part of the target the operation acts on. " +
              "'content' (default): patch the content below the heading or at the block. " +
              "'marker': patch only the heading line or block-ID token. " +
              "'markerAndContent': patch the heading/block-ID together with its content. " +
              "Only applicable to heading and block targets.",
          ),
      },
      async ({
        path,
        targetType,
        target,
        operation,
        content,
        contentType,
        createTargetIfMissing,
        trimTargetWhitespace,
        rejectIfContentPreexists,
        targetDelimiter,
        targetScope,
      }: {
        path: string;
        targetType: PatchTargetType;
        target: string;
        operation: PatchOperation;
        content: unknown;
        contentType?: string;
        createTargetIfMissing?: boolean;
        trimTargetWhitespace?: boolean;
        rejectIfContentPreexists?: boolean;
        targetDelimiter?: string;
        targetScope?: "content" | "marker" | "markerAndContent";
      }) => {
        try {
          await this.ops.patchFileSection(
            path,
            targetType,
            target,
            operation,
            content,
            contentType ?? "text/markdown",
            { createTargetIfMissing, trimTargetWhitespace, rejectIfContentPreexists, targetDelimiter, targetScope },
          );
        } catch (e) {
          if (e instanceof PatchFailed) {
            throw new Error(e.message);
          }
          throw e;
        }
        return this.text({ message: "OK" });
      },
    );

    this.tool(server,
      "vault_delete",
      "Delete a file from the vault. Throws if the file does not exist.",
      { path: z.string().describe("File path relative to vault root") },
      async ({ path }: { path: string }) => {
        await this.ops.deleteVaultFile(path);
        return this.text({ message: "OK" });
      },
    );

    this.tool(server,
      "vault_get_document_map",
      "Return the structure of a vault file as a document map: the list of heading paths, " +
        "block reference IDs, and frontmatter field names present in the file. " +
        "Use this before vault_read or vault_patch with targeting to discover what targets are available " +
        "without parsing the full markdown content yourself.",
      { path: z.string().describe("File path relative to vault root") },
      async ({ path }: { path: string }) => {
        const file = this.ops.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`);
        const map = await this.ops.getDocumentMapObject(file);
        return this.text(map);
      },
    );

    this.tool(server,
      "active_file_get_path",
      "Return the vault-relative path of the file currently open in Obsidian. " +
        "Use this path with vault_read, vault_write, vault_append, vault_patch, " +
        "vault_get_document_map, or vault_delete to operate on the active file. " +
        "Throws if no file is active.",
      {},
      async () => {
        const file = this.getActiveFile();
        return this.text({ path: file.path });
      },
    );

    this.tool(server,
      "periodic_note_get_path",
      "Return the vault-relative path of the current periodic note for the given period " +
        "(daily, weekly, monthly, quarterly, or yearly). " +
        "Creates the note file if it does not already exist, applying any configured template. " +
        "Requires the Periodic Notes or Calendar plugin to be installed and configured. " +
        "Use the returned path with vault_read, vault_write, vault_append, vault_patch, " +
        "or vault_get_document_map to operate on the note.",
      {
        period: z
          .enum(PERIODS)
          .describe("Periodic note period: 'daily', 'weekly', 'monthly', 'quarterly', or 'yearly'"),
      },
      async ({ period }: { period: typeof PERIODS[number] }) => {
        const [file, err] = await this.ops.periodicGetOrCreateNote(period, Date.now());
        if (err || !file)
          throw new Error(
            `Could not get or create periodic note: ${err != null ? ERROR_CODE_MESSAGES[err] : "unknown error"}`,
          );
        return this.text({ path: file.path });
      },
    );

    this.tool(server,
      "search_query",
      "Search vault files using a JsonLogic query evaluated against each note's metadata.\n\n" +
        "The query is a JSON object following the JsonLogic spec (https://jsonlogic.com/operations.html). " +
        "It is evaluated against a NoteJson object for each file; files where the result is truthy are returned.\n\n" +
        "Each NoteJson has: path (string), content (string), tags (string[]), frontmatter (object), stat ({ctime, mtime, size}), links (string[]), backlinks (string[]).\n\n" +
        "Extra operators available beyond standard JsonLogic:\n" +
        "- {\"glob\": [\"*.foo\", {\"var\": \"path\"}]} — glob pattern match\n" +
        "- {\"regexp\": [\"^daily/\", {\"var\": \"path\"}]} — regular expression match\n\n" +
        "Returns an array of {filename, result} objects where result is the truthy value the query produced for that file.\n\n" +
        "Examples:\n" +
        "- Find by tag: {\"in\": [\"myTag\", {\"var\": \"tags\"}]}\n" +
        "- Find by frontmatter field: {\"==\": [{\"var\": \"frontmatter.status\"}, \"done\"]}\n" +
        "- Find by path glob: {\"glob\": [\"journal/*\", {\"var\": \"path\"}]}",
      {
        query: z
          .record(z.unknown())
          .describe("JsonLogic query object to evaluate against each note"),
      },
      async ({ query }: { query: unknown }) => {
        const results = await this.ops.searchJsonLogic(query);
        return this.text(results);
      },
    );

    this.tool(server,
      "search_simple",
      "Search vault files using Obsidian's built-in simple search. " +
        "Returns an array of {filename, score, matches} objects sorted by relevance score. " +
        "Each match includes the matched text and surrounding context characters (controlled by contextLength).",
      {
        query: z.string().describe("Search query string"),
        contextLength: z
          .number()
          .optional()
          .describe("Number of characters of surrounding context to return per match (default: 100)"),
      },
      async ({ query, contextLength }: { query: string; contextLength?: number }) => {
        const results = await this.ops.simpleSearch(query, contextLength);
        return this.text(results);
      },
    );

    this.tool(server,
      "tag_list",
      "Return all tags used across the vault, each with a usage count. " +
        "Tag names do not include the leading '#'. " +
        "This tool is read-only. To add a tag to a specific file, use vault_patch with " +
        "targetType 'frontmatter', target 'tags', operation 'append', contentType 'application/json', " +
        "and content [\"tag-name\"] (set createTargetIfMissing to true if the file may have no tags yet). " +
        "To remove a tag, read the current tags list with vault_read, filter client-side, then replace " +
        "the whole field with vault_patch using operation 'replace'. " +
        "For full examples, read the OpenAPI spec resource at obsidian://local-rest-api/openapi.yaml.",
      {},
      async () => {
        return this.text({ tags: this.ops.getAllTags() });
      },
    );

    this.tool(server,
      "command_list",
      "Return all registered Obsidian commands. " +
        "Each entry has an 'id' and a human-readable 'name'. " +
        "Pass the 'id' to command_execute to run a command.",
      {},
      async () => {
        return this.text({ commands: this.ops.listCommands() });
      },
    );

    this.tool(server,
      "command_execute",
      "Execute an Obsidian command by its ID. " +
        "Use command_list to discover available command IDs. " +
        "Throws if the command ID does not exist.",
      { commandId: z.string().describe("The command ID to execute (e.g. 'editor:toggle-bold')") },
      async ({ commandId }: { commandId: string }) => {
        this.ops.executeCommand(commandId);
        return this.text({ message: "OK" });
      },
    );

    this.tool(server,
      "open_file",
      "Open a file in the Obsidian UI. " +
        "If the file does not exist, Obsidian will create a new document at that path. " +
        "Set newLeaf to true to open in a new pane rather than the current one.",
      {
        path: z.string().describe("File path relative to vault root"),
        newLeaf: z.boolean().optional().describe("Open in a new leaf/pane (default: false)"),
      },
      async ({ path, newLeaf }: { path: string; newLeaf?: boolean }) => {
        this.ops.openVaultFile(path, newLeaf);
        return this.text({ message: "OK" });
      },
    );

    // --- Graph tools ---

    server.registerTool(
      "graph_get",
      {
        title: "Vault Graph",
        description:
          "Return the full graph structure of the vault as nodes and edges. " +
          "Each node includes path, name, tags, link count, and backlink count. " +
          "Each edge represents a wiki-link from source to target. " +
          "Use the optional filter parameter to limit results to paths containing the filter string.",
        inputSchema: {
          filter: z.string().optional().describe("Optional path filter string (case-insensitive substring match)"),
        },
        _meta: {
          ui: {
            resourceUri: GRAPH_VISUALIZER_URI,
          },
        },
      },
      async (args: unknown) => {
        const { filter } = args as { filter?: string };
        return this.text(this.ops.getGraph(filter));
      },
    );

    this.tool(server,
      "graph_analyze",
      "Analyze the vault graph structure and return computed metrics: " +
        "total node/edge counts, orphan notes (no links in or out), " +
        "hub notes (highest degree), and connected components. " +
        "Useful for understanding vault structure and finding isolated or central notes.",
      {
        topN: z.number().optional().describe("Number of top hubs to return (default: 10)"),
      },
      async ({ topN }: { topN?: number }) => {
        return this.text(this.ops.analyzeGraph(topN));
      },
    );

    this.tool(server,
      "graph_neighbors",
      "Return the local graph neighborhood of a specific note. " +
        "Returns all notes within N link-hops of the specified note, " +
        "similar to Obsidian's local graph view. " +
        "Each node includes a depth field indicating distance from the root.",
      {
        path: z.string().describe("File path relative to vault root"),
        depth: z.number().optional().describe("Maximum link-hop depth to traverse (default: 1)"),
      },
      async ({ path, depth }: { path: string; depth?: number }) => {
        return this.text(this.ops.getNeighbors(path, depth));
      },
    );

    // --- Link tools ---

    this.tool(server,
      "link_list",
      "List all outgoing and incoming wiki-links for a note. " +
        "Each link includes target path, display text, line number, character position, " +
        "surrounding context text, and direction (outgoing/incoming).",
      {
        path: z.string().describe("File path relative to vault root"),
      },
      async ({ path }: { path: string }) => {
        return this.text(await this.ops.listLinks(path));
      },
    );

    this.tool(server,
      "link_create",
      "Insert a wiki-link into a note. Creates a [[target]] or [[target|display]] link. " +
        "Can optionally target a specific heading with [[target#heading]]. " +
        "Position can be a specific line/character, 'end' to append, or omitted to append.",
      {
        path: z.string().describe("File path of the note to add the link to"),
        target: z.string().describe("Target note name or path for the wiki-link"),
        displayText: z.string().optional().describe("Optional display text for the link (e.g. [[target|display]])"),
        heading: z.string().optional().describe("Optional heading to link to (e.g. [[target#heading]])"),
        position: z.union([
          z.object({
            line: z.number().describe("0-indexed line number"),
            ch: z.number().optional().describe("Character position within the line"),
          }),
          z.literal("end"),
        ]).optional().describe("Where to insert the link: {line, ch}, 'end', or omit to append"),
      },
      async ({ path, target, displayText, heading, position }: {
        path: string;
        target: string;
        displayText?: string;
        heading?: string;
        position?: { line: number; ch?: number } | "end";
      }) => {
        await this.ops.createLink(path, target, displayText, heading, position);
        return this.text({ message: "OK" });
      },
    );

    this.tool(server,
      "link_delete",
      "Remove a wiki-link from a note. Matches [[target]], [[target|display]], " +
        "[[target#heading]], and [[target#heading|display]] patterns. " +
        "Optionally restrict deletion to a specific line number.",
      {
        path: z.string().describe("File path of the note to remove the link from"),
        target: z.string().describe("Target note name to match in the wiki-link"),
        line: z.number().optional().describe("Optional 0-indexed line number to restrict deletion to"),
      },
      async ({ path, target, line }: { path: string; target: string; line?: number }) => {
        const found = await this.ops.deleteLink(path, target, line);
        return this.text({ deleted: found });
      },
    );

    this.tool(server,
      "link_suggest",
      "Analyze a note's content and suggest potential wiki-links to existing notes. " +
        "Finds unlinked mentions — places where another note's name appears in the text " +
        "but is not already wrapped in a [[wiki-link]]. " +
        "Useful for enriching vault connectivity.",
      {
        path: z.string().describe("File path relative to vault root"),
      },
      async ({ path }: { path: string }) => {
        return this.text(await this.ops.suggestLinksAsync(path));
      },
    );

    // --- Block tools ---

    this.tool(server,
      "block_list",
      "List all block references (^block-id) in a file. " +
        "Returns each block's ID, content (the paragraph containing the block ref), " +
        "and line number.",
      {
        path: z.string().describe("File path relative to vault root"),
      },
      async ({ path }: { path: string }) => {
        return this.text(await this.ops.listBlocks(path));
      },
    );

    this.tool(server,
      "block_create",
      "Add a block reference ID (^block-id) to a specific line in a note. " +
        "The block ID is appended to the end of the specified line. " +
        "Throws if the block ID already exists in the file.",
      {
        path: z.string().describe("File path relative to vault root"),
        line: z.number().describe("0-indexed line number to add the block ID to"),
        blockId: z.string().describe("Block reference ID (alphanumeric and hyphens, no ^ prefix)"),
      },
      async ({ path, line, blockId }: { path: string; line: number; blockId: string }) => {
        await this.ops.createBlock(path, line, blockId);
        return this.text({ message: "OK" });
      },
    );

    this.tool(server,
      "block_read",
      "Read the content of a specific block reference in a file. " +
        "Returns the block ID, its content (the full paragraph), and line number.",
      {
        path: z.string().describe("File path relative to vault root"),
        blockId: z.string().describe("Block reference ID to read (without ^ prefix)"),
      },
      async ({ path, blockId }: { path: string; blockId: string }) => {
        return this.text(await this.ops.readBlock(path, blockId));
      },
    );

    this.tool(server,
      "transclusion_create",
      "Insert a transclusion (embed) into a note. " +
        "Creates either ![[note#^block]] for block transclusions " +
        "or ![[note#heading]] for heading transclusions. " +
        "Position can be a line number, 'end', or omitted to append.",
      {
        path: z.string().describe("File path of the note to add the transclusion to"),
        targetNote: z.string().describe("Target note name or path to transclude from"),
        targetRef: z.string().describe("Block ID (without ^) or heading text to transclude"),
        refType: z.enum(["block", "heading"]).describe("Type of reference: 'block' for ^block-id, 'heading' for heading text"),
        position: z.union([
          z.object({ line: z.number().describe("0-indexed line number") }),
          z.literal("end"),
        ]).optional().describe("Where to insert: {line}, 'end', or omit to append"),
      },
      async ({ path, targetNote, targetRef, refType, position }: {
        path: string;
        targetNote: string;
        targetRef: string;
        refType: "block" | "heading";
        position?: { line: number } | "end";
      }) => {
        await this.ops.createTransclusion(path, targetNote, targetRef, refType, position);
        return this.text({ message: "OK" });
      },
    );

    // --- Canvas tools ---

    this.tool(server,
      "canvas_list",
      "List all .canvas files in the vault. Returns an array of file paths.",
      {},
      async () => {
        return this.text({ files: this.ops.listCanvasFiles() });
      },
    );

    this.tool(server,
      "canvas_read",
      "Read and parse a canvas file. Returns the full JSON Canvas structure " +
        "with nodes (text, file, link, group) and edges between them. " +
        "Follows the JSON Canvas spec 1.0.",
      {
        path: z.string().describe("Path to the .canvas file relative to vault root"),
      },
      async ({ path }: { path: string }) => {
        return this.text(await this.ops.readCanvas(path));
      },
    );

    this.tool(server,
      "canvas_create",
      "Create a new canvas file with initial nodes and edges. " +
        "The path must end with .canvas extension. " +
        "Nodes can be text, file, link, or group types per JSON Canvas spec 1.0.",
      {
        path: z.string().describe("Path for the new .canvas file (must end with .canvas)"),
        nodes: z.array(z.object({
          id: z.string(),
          type: z.enum(["text", "file", "link", "group"]),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          color: z.string().optional(),
          text: z.string().optional(),
          file: z.string().optional(),
          subpath: z.string().optional(),
          url: z.string().optional(),
          label: z.string().optional(),
          background: z.string().optional(),
          backgroundStyle: z.enum(["cover", "ratio", "repeat"]).optional(),
        })).optional().describe("Initial nodes to place on the canvas"),
        edges: z.array(z.object({
          id: z.string(),
          fromNode: z.string(),
          fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
          fromEnd: z.enum(["none", "arrow"]).optional(),
          toNode: z.string(),
          toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
          toEnd: z.enum(["none", "arrow"]).optional(),
          color: z.string().optional(),
          label: z.string().optional(),
        })).optional().describe("Initial edges connecting nodes"),
      },
      async ({ path, nodes, edges }: {
        path: string;
        nodes?: Array<Record<string, unknown>>;
        edges?: Array<Record<string, unknown>>;
      }) => {
        await this.ops.createCanvas(path, {
          nodes: (nodes ?? []) as unknown as CanvasData["nodes"],
          edges: (edges ?? []) as unknown as CanvasData["edges"],
        });
        return this.text({ message: "OK" });
      },
    );

    this.tool(server,
      "canvas_add_node",
      "Add a node to an existing canvas. Node types: " +
        "'text' (with text content), 'file' (referencing a vault file), " +
        "'link' (external URL), 'group' (visual container). " +
        "Throws if a node with the same ID already exists.",
      {
        path: z.string().describe("Path to the .canvas file"),
        node: z.object({
          id: z.string(),
          type: z.enum(["text", "file", "link", "group"]),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          color: z.string().optional(),
          text: z.string().optional(),
          file: z.string().optional(),
          subpath: z.string().optional(),
          url: z.string().optional(),
          label: z.string().optional(),
          background: z.string().optional(),
          backgroundStyle: z.enum(["cover", "ratio", "repeat"]).optional(),
        }).describe("The node to add"),
      },
      async ({ path, node }: { path: string; node: Record<string, unknown> }) => {
        const result = await this.ops.addCanvasNode(path, node as unknown as CanvasData["nodes"][0]);
        return this.text(result);
      },
    );

    this.tool(server,
      "canvas_add_edge",
      "Add an edge between two nodes on a canvas. " +
        "Edges connect a fromNode to a toNode, optionally specifying sides and arrow endpoints. " +
        "Throws if the edge ID already exists or if source/target nodes are not found.",
      {
        path: z.string().describe("Path to the .canvas file"),
        edge: z.object({
          id: z.string(),
          fromNode: z.string(),
          fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
          fromEnd: z.enum(["none", "arrow"]).optional(),
          toNode: z.string(),
          toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
          toEnd: z.enum(["none", "arrow"]).optional(),
          color: z.string().optional(),
          label: z.string().optional(),
        }).describe("The edge to add"),
      },
      async ({ path, edge }: { path: string; edge: Record<string, unknown> }) => {
        const result = await this.ops.addCanvasEdge(path, edge as unknown as CanvasData["edges"][0]);
        return this.text(result);
      },
    );

    this.tool(server,
      "canvas_delete_node",
      "Remove a node from a canvas by its ID. " +
        "Also removes all edges connected to the deleted node.",
      {
        path: z.string().describe("Path to the .canvas file"),
        nodeId: z.string().describe("ID of the node to delete"),
      },
      async ({ path, nodeId }: { path: string; nodeId: string }) => {
        const result = await this.ops.deleteCanvasNode(path, nodeId);
        return this.text(result);
      },
    );

    this.tool(server,
      "canvas_update",
      "Replace the entire content of a canvas file with new nodes and edges. " +
        "Use this for bulk updates or restructuring a canvas.",
      {
        path: z.string().describe("Path to the .canvas file"),
        nodes: z.array(z.object({
          id: z.string(),
          type: z.enum(["text", "file", "link", "group"]),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          color: z.string().optional(),
          text: z.string().optional(),
          file: z.string().optional(),
          subpath: z.string().optional(),
          url: z.string().optional(),
          label: z.string().optional(),
          background: z.string().optional(),
          backgroundStyle: z.enum(["cover", "ratio", "repeat"]).optional(),
        })).describe("Complete list of nodes"),
        edges: z.array(z.object({
          id: z.string(),
          fromNode: z.string(),
          fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
          fromEnd: z.enum(["none", "arrow"]).optional(),
          toNode: z.string(),
          toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
          toEnd: z.enum(["none", "arrow"]).optional(),
          color: z.string().optional(),
          label: z.string().optional(),
        })).describe("Complete list of edges"),
      },
      async ({ path, nodes, edges }: {
        path: string;
        nodes: Array<Record<string, unknown>>;
        edges: Array<Record<string, unknown>>;
      }) => {
        await this.ops.updateCanvas(path, {
          nodes: nodes as unknown as CanvasData["nodes"],
          edges: edges as unknown as CanvasData["edges"],
        });
        return this.text({ message: "OK" });
      },
    );
  }
}
