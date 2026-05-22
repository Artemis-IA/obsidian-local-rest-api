import {
  getAllTags,
  App,
  CachedMetadata,
  Command,
  prepareSimpleSearch,
  TFile,
} from "obsidian";
import * as periodicNotes from "obsidian-daily-notes-interface";
import path from "path";
import {
  applyPatch,
  getDocumentMap,
  PatchInstruction,
  PatchOperation,
  PatchTargetType,
} from "markdown-patch";
 
const jsonLogic = require("json-logic-js") as {
  apply: (logic: unknown, data?: unknown) => unknown;
  add_operation: (name: string, code: (...args: unknown[]) => unknown) => void;
};
 
const WildcardRegexp = require("glob-to-regexp") as (pattern: string) => RegExp;

export class FileNotFoundError extends Error {}
export class CommandNotFoundError extends Error {}

import {
  BlockInfo,
  CanvasData,
  DocumentMapObject,
  ErrorCode,
  FileMetadataObject,
  GraphAnalysis,
  GraphData,
  GraphEdge,
  GraphNeighborData,
  GraphNeighborNode,
  GraphNode,
  LinkInfo,
  LinkSuggestion,
  PeriodicNoteInterface,
  SearchContext,
  SearchJsonResponseItem,
  SearchResponseItem,
} from "./types";
import { toArrayBuffer } from "./utils";

export class VaultOperations {
  constructor(readonly app: App) {
    jsonLogic.add_operation(
      "glob",
      (pattern: string | undefined, field: string | undefined) => {
        if (typeof field === "string" && typeof pattern === "string") {
          return WildcardRegexp(pattern).test(field);
        }
        return false;
      },
    );
    jsonLogic.add_operation(
      "regexp",
      (pattern: string | undefined, field: string | undefined) => {
        if (typeof field === "string" && typeof pattern === "string") {
          return new RegExp(pattern).test(field);
        }
        return false;
      },
    );
  }

  private waitForFileCache(
    file: TFile,
    timeoutMs = 5000,
  ): Promise<CachedMetadata | null> {
    const existingCache = this.app.metadataCache.getFileCache(file);
    if (existingCache) {
      return Promise.resolve(existingCache);
    }

    return new Promise((resolve) => {
      let resolved = false;

      const onCacheChange = (...data: unknown[]) => {
        const changedFile = data[0];
        if (!(changedFile instanceof TFile)) return;
        if (changedFile.path === file.path && !resolved) {
          resolved = true;
          this.app.metadataCache.off("changed", onCacheChange);
          window.clearTimeout(timeoutId);
          resolve(this.app.metadataCache.getFileCache(file));
        }
      };

      const timeoutId = window.setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.app.metadataCache.off("changed", onCacheChange);
          console.warn(
            `[REST API] Timeout waiting for metadata cache for ${file.path} after ${timeoutMs}ms`,
          );
          resolve(this.app.metadataCache.getFileCache(file));
        }
      }, timeoutMs);

      this.app.metadataCache.on("changed", onCacheChange);

      const cacheAfterListener = this.app.metadataCache.getFileCache(file);
      if (cacheAfterListener && !resolved) {
        resolved = true;
        this.app.metadataCache.off("changed", onCacheChange);
        window.clearTimeout(timeoutId);
        resolve(cacheAfterListener);
      }
    });
  }

  async getDocumentMapObject(file: TFile): Promise<DocumentMapObject> {
    const content = await this.app.vault.adapter.read(file.path);
    const documentMap = getDocumentMap(content);

    return {
      headings: Object.keys(documentMap.heading)
        .filter((h) => h)
        .map((h) => h.split("\x1f").join("::")),
      blocks: Object.keys(documentMap.block),
      frontmatterFields: Object.keys(documentMap.frontmatter),
    };
  }

  async readFileSection(
    file: TFile,
    targetType: string,
    target: string,
    targetDelimiter = "::",
  ): Promise<unknown> {
    const content = await this.app.vault.adapter.read(file.path);
    const documentMap = getDocumentMap(content);

    if (targetType === "frontmatter") {
      const value: unknown = documentMap.frontmatter[target];
      if (value === undefined)
        throw new Error(`Frontmatter key not found: ${target}`);
      return value;
    }

    const mapKey =
      targetType === "heading"
        ? target.split(targetDelimiter).join("\x1f")
        : target;

    const entry =
      targetType === "heading"
        ? documentMap.heading[mapKey]
        : documentMap.block[mapKey];

    if (!entry) throw new Error(`${targetType} not found: ${target}`);

    return content.substring(entry.content.start, entry.content.end);
  }

  buildBacklinksIndex(): Record<string, string[]> {
    const index: Record<string, string[]> = {};
    for (const [sourcePath, targets] of Object.entries(
      this.app.metadataCache.resolvedLinks,
    )) {
      for (const targetPath of Object.keys(targets)) {
        (index[targetPath] ??= []).push(sourcePath);
      }
    }
    return index;
  }

  async getFileMetadataObject(
    file: TFile,
    backlinksIndex?: Record<string, string[]>,
    includeContent = true,
  ): Promise<FileMetadataObject> {
    const cache = await this.waitForFileCache(file);

    const frontmatter = { ...(cache?.frontmatter ?? {}) };
    delete frontmatter.position;

    const directTags = (cache?.tags ?? [])
      .filter((tag) => tag)
      .map((tag) => tag.tag);
    const frontmatterTags = Array.isArray(frontmatter.tags)
      ? (frontmatter.tags as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
    const filteredTags: string[] = [...frontmatterTags, ...directTags]
      .filter((tag) => tag)
      .map((tag) => tag.replace(/^#/, ""))
      .filter((value, index, self) => self.indexOf(value) === index);

    const links = Object.keys(
      this.app.metadataCache.resolvedLinks[file.path] ?? {},
    );

    const index = backlinksIndex ?? this.buildBacklinksIndex();
    const backlinks = index[file.path] ?? [];

    return {
      tags: filteredTags,
      frontmatter: frontmatter,
      stat: file.stat,
      path: file.path,
      content: includeContent ? await this.app.vault.cachedRead(file) : "",
      links,
      backlinks,
    };
  }

  async resolvePathAndTarget(rawPath: string): Promise<{
    filePath: string;
    targetType?: string;
    target?: string;
  } | null> {
    const normalizedPath = rawPath.endsWith("/")
      ? rawPath.slice(0, -1)
      : rawPath;
    if (!normalizedPath) return null;

    let exactStat = null;
    try {
      exactStat = await this.app.vault.adapter.stat(normalizedPath);
    } catch {
      // ENOTDIR: a path component is a file, not a directory;
      // fall through to the backward walk which will find the actual file.
    }
    if (exactStat?.type === "file") {
      return { filePath: normalizedPath };
    }

    const segments = normalizedPath.split("/");
    for (let i = segments.length - 1; i >= 1; i--) {
      const candidate = segments.slice(0, i).join("/");
      let s = null;
      try {
        s = await this.app.vault.adapter.stat(candidate);
      } catch {
        continue;
      }
      if (s?.type === "file") {
        const remainder = segments.slice(i);
        const targetType = remainder[0];
        const target =
          targetType === "heading"
            ? remainder.slice(1).join("::")
            : remainder[1];
        return { filePath: candidate, targetType, target };
      }
    }

    return null;
  }

  async listVaultDirectory(dirPath: string): Promise<string[]> {
    const normalizedPath = dirPath.endsWith("/")
      ? dirPath.slice(0, -1)
      : dirPath;
    const prefix = normalizedPath ? normalizedPath + "/" : "";
    const files = [
      ...new Set(
        this.app.vault
          .getFiles()
          .map((e) => e.path)
          .filter((filename) => filename.startsWith(prefix))
          .map((filename) => {
            const subPath = filename.slice(prefix.length);
            if (subPath.indexOf("/") > -1) {
              return subPath.slice(0, subPath.indexOf("/") + 1);
            }
            return subPath;
          }),
      ),
    ];
    files.sort();
    return files;
  }

  async readFileContent(filePath: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${filePath}`);
    }
    return this.app.vault.read(file);
  }

  async writeFileContent(
    filePath: string,
    content: string | Buffer,
  ): Promise<void> {
    try {
      await this.app.vault.createFolder(path.dirname(filePath));
    } catch {
      // folder already exists
    }
    if (typeof content === "string") {
      await this.app.vault.adapter.write(filePath, content);
    } else {
      await this.app.vault.adapter.writeBinary(
        filePath,
        toArrayBuffer(content),
      );
    }
  }

  async appendFileContent(filePath: string, content: string): Promise<void> {
    try {
      await this.app.vault.createFolder(path.dirname(filePath));
    } catch {
      // folder already exists
    }
    let fileContents = "";
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      fileContents = await this.app.vault.read(file);
      if (!fileContents.endsWith("\n")) {
        fileContents += "\n";
      }
    }
    fileContents += content;
    await this.app.vault.adapter.write(filePath, fileContents);
  }

  async deleteVaultFile(filePath: string): Promise<void> {
    const pathExists = await this.app.vault.adapter.exists(filePath);
    if (!pathExists) {
      throw new FileNotFoundError(`File not found: ${filePath}`);
    }
    await this.app.vault.adapter.remove(filePath);
  }

  // Throws PatchFailed on patch error; caller is responsible for mapping to
  // the appropriate HTTP error code or MCP error.
  async patchFileSection(
    filePath: string,
    targetType: PatchTargetType,
    target: string,
    operation: PatchOperation,
    content: unknown,
    contentType: string,
    options?: {
      createTargetIfMissing?: boolean;
      rejectIfContentPreexists?: boolean;
      trimTargetWhitespace?: boolean;
      targetDelimiter?: string;
      targetScope?: string;
    },
  ): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      throw new FileNotFoundError(`File not found: ${filePath}`);
    }
    const fileContents = await this.app.vault.read(file);

    const delimiter = options?.targetDelimiter ?? "::";
    const resolvedTarget: string | string[] =
      targetType === "heading" ? target.split(delimiter) : target;

    const instruction: PatchInstruction = {
      operation,
      targetType,
      target: resolvedTarget,
      contentType,
      content,
      rejectIfContentPreexists: options?.rejectIfContentPreexists ?? false,
      trimTargetWhitespace: options?.trimTargetWhitespace ?? false,
      createTargetIfMissing: options?.createTargetIfMissing ?? false,
      ...(options?.targetScope ? { targetScope: options.targetScope } : {}),
    } as PatchInstruction;

    const patched = applyPatch(fileContents, instruction);
    await this.app.vault.adapter.write(filePath, patched);
    return patched;
  }

  getPeriodicNoteInterface(): Record<string, PeriodicNoteInterface> {
    return {
      daily: {
        settings: periodicNotes.getDailyNoteSettings(),
        loaded: periodicNotes.appHasDailyNotesPluginLoaded(),
        create: periodicNotes.createDailyNote,
        get: periodicNotes.getDailyNote,
        getAll: periodicNotes.getAllDailyNotes,
      },
      weekly: {
        settings: periodicNotes.getWeeklyNoteSettings(),
        loaded: periodicNotes.appHasWeeklyNotesPluginLoaded(),
        create: periodicNotes.createWeeklyNote,
        get: periodicNotes.getWeeklyNote,
        getAll: periodicNotes.getAllWeeklyNotes,
      },
      monthly: {
        settings: periodicNotes.getMonthlyNoteSettings(),
        loaded: periodicNotes.appHasMonthlyNotesPluginLoaded(),
        create: periodicNotes.createMonthlyNote,
        get: periodicNotes.getMonthlyNote,
        getAll: periodicNotes.getAllMonthlyNotes,
      },
      quarterly: {
        settings: periodicNotes.getQuarterlyNoteSettings(),
        loaded: periodicNotes.appHasQuarterlyNotesPluginLoaded(),
        create: periodicNotes.createQuarterlyNote,
        get: periodicNotes.getQuarterlyNote,
        getAll: periodicNotes.getAllQuarterlyNotes,
      },
      yearly: {
        settings: periodicNotes.getYearlyNoteSettings(),
        loaded: periodicNotes.appHasYearlyNotesPluginLoaded(),
        create: periodicNotes.createYearlyNote,
        get: periodicNotes.getYearlyNote,
        getAll: periodicNotes.getAllYearlyNotes,
      },
    };
  }

  periodicGetInterface(
    period: string,
  ): [PeriodicNoteInterface | null, ErrorCode | null] {
    const periodic = this.getPeriodicNoteInterface();
    if (!periodic[period]) {
      return [null, ErrorCode.PeriodDoesNotExist];
    }
    if (!periodic[period].loaded) {
      return [null, ErrorCode.PeriodIsNotEnabled];
    }
    return [periodic[period], null];
  }

  periodicGetNote(
    periodName: string,
    timestamp: number,
  ): [TFile | null, ErrorCode | null] {
    const [period, err] = this.periodicGetInterface(periodName);
    if (err || !period) {
      return [null, err ?? ErrorCode.PeriodDoesNotExist];
    }
    const now = window.moment(timestamp);
    const all = period.getAll();

    const file = period.get(now, all);
    if (!file) {
      return [null, ErrorCode.PeriodicNoteDoesNotExist];
    }
    return [file, null];
  }

  async periodicGetOrCreateNote(
    periodName: string,
    timestamp: number,
  ): Promise<[TFile | null, ErrorCode | null]> {
    const [gottenFile, err] = this.periodicGetNote(periodName, timestamp);
    let file = gottenFile;
    if (err === ErrorCode.PeriodicNoteDoesNotExist) {
      const [period] = this.periodicGetInterface(periodName);
      if (!period) {
        return [null, ErrorCode.PeriodDoesNotExist];
      }
      const now = window.moment(Date.now());

      file = await period.create(now);
      await this.waitForFileCache(file);
    } else if (err) {
      return [null, err];
    }

    return [file, null];
  }

  async simpleSearch(
    query: string,
    contextLength = 100,
  ): Promise<SearchResponseItem[]> {
    const results: SearchResponseItem[] = [];
    const search = prepareSimpleSearch(query);

    for (const file of this.app.vault.getMarkdownFiles()) {
      const cachedContents = await this.app.vault.cachedRead(file);

      const filenamePrefix = file.basename + "\n\n";
      const result = search(filenamePrefix + cachedContents);
      const positionOffset = filenamePrefix.length;

      if (result) {
        const contextMatches: SearchContext[] = [];
        for (const match of result.matches) {
          if (match[0] < positionOffset && match[1] <= positionOffset) {
            contextMatches.push({
              match: {
                start: match[0],
                end: Math.min(match[1], file.basename.length),
                source: "filename",
              },
              context: file.basename,
            });
          } else if (match[0] >= positionOffset) {
            contextMatches.push({
              match: {
                start: match[0] - positionOffset,
                end: match[1] - positionOffset,
                source: "content",
              },
              context: cachedContents.slice(
                Math.max(match[0] - positionOffset - contextLength, 0),
                match[1] - positionOffset + contextLength,
              ),
            });
          }
        }

        results.push({
          filename: file.path,
          score: result.score,
          matches: contextMatches,
        });
      }
    }

    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return results;
  }

  async searchJsonLogic(
    query: unknown,
  ): Promise<SearchJsonResponseItem[]> {
    const results: SearchJsonResponseItem[] = [];
    const backlinksIndex = this.buildBacklinksIndex();
    const includeContent = JSON.stringify(query).includes('"content"');

    for (const file of this.app.vault.getMarkdownFiles()) {
      const fileContext = await this.getFileMetadataObject(file, backlinksIndex, includeContent);

      try {
        const fileResult = jsonLogic.apply(query, fileContext);

        if (this.isTruthy(fileResult)) {
          results.push({ filename: file.path, result: fileResult });
        }
      } catch (e) {
        const error = e as Error;
        throw new Error(`${error.message} (while processing ${file.path})`);
      }
    }

    return results;
  }

  private isTruthy(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return Boolean(value);
  }

  getAllTags(): Array<{ name: string; count: number }> {
    const tagCounts: Record<string, number> = {};
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) continue;
      const fileTags = getAllTags(cache);
      if (!fileTags) continue;
      for (const rawTag of fileTags) {
        const tag = rawTag.startsWith("#") ? rawTag.slice(1) : rawTag;
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        const parts = tag.split("/");
        for (let i = 1; i < parts.length; i++) {
          const parent = parts.slice(0, i).join("/");
          tagCounts[parent] = (tagCounts[parent] || 0) + 1;
        }
      }
    }
    const tags: { name: string; count: number }[] = [];
    for (const [tag, count] of Object.entries(tagCounts)) {
      if (!tag) continue;
      tags.push({ name: tag, count });
    }
    return tags;
  }

  listCommands(): Command[] {
    const commands: Command[] = [];
    for (const commandName in this.app.commands.commands) {
      commands.push({
        id: commandName,
        name: this.app.commands.commands[commandName].name,
      });
    }
    return commands;
  }

  executeCommand(commandId: string): void {
    const cmd = this.app.commands.commands[commandId];
    if (!cmd) {
      throw new CommandNotFoundError(`Command not found: ${commandId}`);
    }
    this.app.commands.executeCommandById(commandId);
  }

  openVaultFile(filePath: string, newLeaf = false): void {
    void this.app.workspace.openLinkText(filePath, "/", newLeaf);
  }

  // --- Graph operations ---

  getGraph(filter?: string): GraphData {
    const files = this.app.vault.getMarkdownFiles();
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    const backlinksIndex = this.buildBacklinksIndex();
    const edgeSet = new Set<string>();
    const edges: GraphEdge[] = [];
    const nodes: GraphNode[] = [];

    for (const file of files) {
      if (filter && !file.path.toLowerCase().includes(filter.toLowerCase())) {
        continue;
      }

      const cache = this.app.metadataCache.getFileCache(file);
      const fileTags = cache ? (getAllTags(cache) ?? []) : [];
      const tags = fileTags
        .map((t: string) => (t.startsWith("#") ? t.slice(1) : t))
        .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index);

      const outgoing = Object.keys(resolvedLinks[file.path] ?? {});
      const incoming = backlinksIndex[file.path] ?? [];

      nodes.push({
        path: file.path,
        name: file.basename,
        tags,
        linkCount: outgoing.length,
        backlinkCount: incoming.length,
      });

      for (const target of outgoing) {
        const key = `${file.path}->${target}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ source: file.path, target });
        }
      }
    }

    return { nodes, edges };
  }

  analyzeGraph(topN = 10): GraphAnalysis {
    const graph = this.getGraph();
    const degree: Record<string, number> = {};

    for (const node of graph.nodes) {
      degree[node.path] = (degree[node.path] ?? 0);
    }
    for (const edge of graph.edges) {
      degree[edge.source] = (degree[edge.source] ?? 0) + 1;
      degree[edge.target] = (degree[edge.target] ?? 0) + 1;
    }

    const orphans = graph.nodes
      .filter((n) => (degree[n.path] ?? 0) === 0)
      .map((n) => n.path);

    const hubs = Object.entries(degree)
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([path, deg]) => ({ path, degree: deg }));

    // Connected components via BFS
    const adjacency: Record<string, Set<string>> = {};
    for (const node of graph.nodes) {
      adjacency[node.path] = new Set();
    }
    for (const edge of graph.edges) {
      if (adjacency[edge.source]) adjacency[edge.source].add(edge.target);
      if (adjacency[edge.target]) adjacency[edge.target].add(edge.source);
    }

    const visited = new Set<string>();
    const components: string[][] = [];

    for (const node of graph.nodes) {
      if (visited.has(node.path)) continue;
      const component: string[] = [];
      const queue = [node.path];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.push(current);
        for (const neighbor of adjacency[current] ?? []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }
      components.push(component);
    }

    return {
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      orphans,
      hubs,
      connectedComponents: components,
    };
  }

  getNeighbors(rootPath: string, maxDepth = 1): GraphNeighborData {
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    const backlinksIndex = this.buildBacklinksIndex();
    const visited = new Map<string, number>();
    const edges: GraphEdge[] = [];
    const edgeSet = new Set<string>();
    const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];

    visited.set(rootPath, 0);

    while (queue.length > 0) {
      const { path: current, depth } = queue.shift()!;
      if (depth >= maxDepth) continue;

      const outgoing = Object.keys(resolvedLinks[current] ?? {});
      const incoming = backlinksIndex[current] ?? [];
      const neighbors = [...new Set([...outgoing, ...incoming])];

      for (const neighbor of neighbors) {
        const edgeKey = outgoing.includes(neighbor)
          ? `${current}->${neighbor}`
          : `${neighbor}->${current}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          if (outgoing.includes(neighbor)) {
            edges.push({ source: current, target: neighbor });
          } else {
            edges.push({ source: neighbor, target: current });
          }
        }

        if (!visited.has(neighbor)) {
          visited.set(neighbor, depth + 1);
          queue.push({ path: neighbor, depth: depth + 1 });
        }
      }
    }

    const nodes: GraphNeighborNode[] = [];
    for (const [nodePath, depth] of visited.entries()) {
      const file = this.app.vault.getAbstractFileByPath(nodePath);
      if (!(file instanceof TFile)) {
        nodes.push({
          path: nodePath,
          name: nodePath.replace(/\.md$/, "").split("/").pop() ?? nodePath,
          tags: [],
          linkCount: 0,
          backlinkCount: 0,
          depth,
        });
        continue;
      }
      const cache = this.app.metadataCache.getFileCache(file);
      const fileTags = cache ? (getAllTags(cache) ?? []) : [];
      const tags = fileTags
        .map((t: string) => (t.startsWith("#") ? t.slice(1) : t))
        .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index);

      nodes.push({
        path: nodePath,
        name: file.basename,
        tags,
        linkCount: Object.keys(resolvedLinks[nodePath] ?? {}).length,
        backlinkCount: (backlinksIndex[nodePath] ?? []).length,
        depth,
      });
    }

    return { root: rootPath, maxDepth, nodes, edges };
  }

  // --- Link operations ---

  async listLinks(filePath: string): Promise<LinkInfo[]> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) throw new FileNotFoundError(`File not found: ${filePath}`);

    const content = await this.app.vault.cachedRead(file);
    const lines = content.split("\n");
    const cache = this.app.metadataCache.getFileCache(file);
    const links: LinkInfo[] = [];

    // Outgoing links from cache
    if (cache?.links) {
      for (const link of cache.links) {
        const line = link.position.start.line;
        links.push({
          target: link.link,
          displayText: link.displayText,
          line,
          ch: link.position.start.col,
          context: lines[line] ?? "",
          direction: "outgoing",
        });
      }
    }

    // Incoming links (backlinks)
    const backlinksIndex = this.buildBacklinksIndex();
    const incoming = backlinksIndex[filePath] ?? [];
    for (const sourcePath of incoming) {
      const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(sourceFile instanceof TFile)) continue;
      const sourceCache = this.app.metadataCache.getFileCache(sourceFile);
      const sourceContent = await this.app.vault.cachedRead(sourceFile);
      const sourceLines = sourceContent.split("\n");
      if (sourceCache?.links) {
        for (const link of sourceCache.links) {
          const resolved = this.app.metadataCache.resolvedLinks[sourcePath]?.[filePath];
          if (resolved !== undefined && link.link.includes(file.basename.replace(/\.md$/, ""))) {
            links.push({
              target: sourcePath,
              displayText: link.displayText,
              line: link.position.start.line,
              ch: link.position.start.col,
              context: sourceLines[link.position.start.line] ?? "",
              direction: "incoming",
            });
          }
        }
      }
    }

    return links;
  }

  async createLink(
    filePath: string,
    targetNote: string,
    displayText?: string,
    heading?: string,
    position?: { line: number; ch?: number } | "end",
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) throw new FileNotFoundError(`File not found: ${filePath}`);

    let linkText = `[[${targetNote}`;
    if (heading) linkText += `#${heading}`;
    if (displayText) linkText += `|${displayText}`;
    linkText += "]]";

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    if (position === "end") {
      const newContent = content.endsWith("\n")
        ? content + linkText + "\n"
        : content + "\n" + linkText + "\n";
      await this.app.vault.adapter.write(filePath, newContent);
    } else if (position) {
      const lineIdx = Math.min(position.line, lines.length - 1);
      const line = lines[lineIdx];
      const ch = position.ch ?? line.length;
      lines[lineIdx] = line.slice(0, ch) + linkText + line.slice(ch);
      await this.app.vault.adapter.write(filePath, lines.join("\n"));
    } else {
      // Default: append to end
      const newContent = content.endsWith("\n")
        ? content + linkText + "\n"
        : content + "\n" + linkText + "\n";
      await this.app.vault.adapter.write(filePath, newContent);
    }
  }

  async deleteLink(filePath: string, targetNote: string, line?: number): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) throw new FileNotFoundError(`File not found: ${filePath}`);

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    // Match [[target]], [[target|display]], [[target#heading]], [[target#heading|display]]
    const escapedTarget = targetNote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const linkPattern = new RegExp(
      `\\[\\[${escapedTarget}(?:#[^\\]|]*)?(?:\\|[^\\]]*)?\\]\\]`,
      "g",
    );

    let found = false;
    if (line !== undefined) {
      const lineIdx = Math.min(line, lines.length - 1);
      if (linkPattern.test(lines[lineIdx])) {
        lines[lineIdx] = lines[lineIdx].replace(linkPattern, "");
        found = true;
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        if (linkPattern.test(lines[i])) {
          lines[i] = lines[i].replace(linkPattern, "");
          found = true;
          break;
        }
      }
    }

    if (found) {
      await this.app.vault.adapter.write(filePath, lines.join("\n"));
    }
    return found;
  }

  async suggestLinksAsync(filePath: string): Promise<LinkSuggestion[]> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) throw new FileNotFoundError(`File not found: ${filePath}`);

    const content = await this.app.vault.cachedRead(file);
    const lines = content.split("\n");
    const suggestions: LinkSuggestion[] = [];
    const allFiles = this.app.vault.getMarkdownFiles();
    const resolvedOutgoing = Object.keys(
      this.app.metadataCache.resolvedLinks[filePath] ?? {},
    );

    for (const otherFile of allFiles) {
      if (otherFile.path === filePath) continue;
      if (resolvedOutgoing.includes(otherFile.path)) continue;

      const name = otherFile.basename;
      if (name.length < 3) continue; // Skip very short names

      const namePattern = new RegExp(
        `(?<![\\[\\w])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\]\\w])`,
        "gi",
      );

      const mentions: Array<{ line: number; context: string }> = [];
      for (let i = 0; i < lines.length; i++) {
        if (namePattern.test(lines[i])) {
          mentions.push({ line: i, context: lines[i] });
        }
      }

      if (mentions.length > 0) {
        suggestions.push({
          notePath: otherFile.path,
          noteName: name,
          mentions,
        });
      }
    }

    return suggestions;
  }

  // --- Block operations ---

  async listBlocks(filePath: string): Promise<BlockInfo[]> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) throw new FileNotFoundError(`File not found: ${filePath}`);

    const content = await this.app.vault.cachedRead(file);
    const lines = content.split("\n");
    const blocks: BlockInfo[] = [];
    const blockPattern = /\^([a-zA-Z0-9-]+)\s*$/;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(blockPattern);
      if (match) {
        // Collect the block content (paragraph above the ^id)
        let blockContent = lines[i];
        let j = i - 1;
        while (j >= 0 && lines[j].trim() !== "") {
          blockContent = lines[j] + "\n" + blockContent;
          j--;
        }
        blocks.push({
          id: match[1],
          content: blockContent.trim(),
          line: i,
        });
      }
    }

    return blocks;
  }

  async createBlock(filePath: string, line: number, blockId: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) throw new FileNotFoundError(`File not found: ${filePath}`);

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const lineIdx = Math.min(line, lines.length - 1);

    // Check if block ID already exists
    if (content.includes(`^${blockId}`)) {
      throw new Error(`Block ID "${blockId}" already exists in ${filePath}`);
    }

    // Append ^blockId to the line
    lines[lineIdx] = lines[lineIdx].trimEnd() + ` ^${blockId}`;
    await this.app.vault.adapter.write(filePath, lines.join("\n"));
  }

  async readBlock(filePath: string, blockId: string): Promise<BlockInfo> {
    const blocks = await this.listBlocks(filePath);
    const block = blocks.find((b) => b.id === blockId);
    if (!block) throw new Error(`Block "${blockId}" not found in ${filePath}`);
    return block;
  }

  async createTransclusion(
    filePath: string,
    targetNote: string,
    targetRef: string,
    refType: "block" | "heading",
    position?: { line: number } | "end",
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) throw new FileNotFoundError(`File not found: ${filePath}`);

    const separator = refType === "block" ? "#^" : "#";
    const transclusion = `![[${targetNote}${separator}${targetRef}]]`;

    const content = await this.app.vault.read(file);
    const lines = content.split("\n");

    if (position === "end" || !position) {
      const newContent = content.endsWith("\n")
        ? content + transclusion + "\n"
        : content + "\n" + transclusion + "\n";
      await this.app.vault.adapter.write(filePath, newContent);
    } else {
      const lineIdx = Math.min(position.line, lines.length);
      lines.splice(lineIdx, 0, transclusion);
      await this.app.vault.adapter.write(filePath, lines.join("\n"));
    }
  }

  // --- Canvas operations (JSON Canvas spec 1.0) ---

  listCanvasFiles(): string[] {
    return this.app.vault
      .getFiles()
      .filter((f) => f.extension === "canvas")
      .map((f) => f.path)
      .sort();
  }

  async readCanvas(filePath: string): Promise<CanvasData> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) throw new FileNotFoundError(`File not found: ${filePath}`);
    if (file.extension !== "canvas") throw new Error(`Not a canvas file: ${filePath}`);

    const content = await this.app.vault.read(file);
    const data = JSON.parse(content) as CanvasData;
    return {
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
    };
  }

  async createCanvas(filePath: string, data: CanvasData): Promise<void> {
    if (!filePath.endsWith(".canvas")) {
      throw new Error("Canvas files must have a .canvas extension");
    }
    try {
      await this.app.vault.createFolder(path.dirname(filePath));
    } catch {
      // folder already exists
    }
    const content = JSON.stringify(
      { nodes: data.nodes ?? [], edges: data.edges ?? [] },
      null,
      2,
    );
    await this.app.vault.adapter.write(filePath, content);
  }

  async addCanvasNode(
    filePath: string,
    node: CanvasData["nodes"][0],
  ): Promise<CanvasData> {
    const canvas = await this.readCanvas(filePath);
    if (canvas.nodes.some((n) => n.id === node.id)) {
      throw new Error(`Node with id "${node.id}" already exists`);
    }
    canvas.nodes.push(node);
    await this.app.vault.adapter.write(filePath, JSON.stringify(canvas, null, 2));
    return canvas;
  }

  async addCanvasEdge(
    filePath: string,
    edge: CanvasData["edges"][0],
  ): Promise<CanvasData> {
    const canvas = await this.readCanvas(filePath);
    if (canvas.edges.some((e) => e.id === edge.id)) {
      throw new Error(`Edge with id "${edge.id}" already exists`);
    }
    if (!canvas.nodes.some((n) => n.id === edge.fromNode)) {
      throw new Error(`Source node "${edge.fromNode}" not found`);
    }
    if (!canvas.nodes.some((n) => n.id === edge.toNode)) {
      throw new Error(`Target node "${edge.toNode}" not found`);
    }
    canvas.edges.push(edge);
    await this.app.vault.adapter.write(filePath, JSON.stringify(canvas, null, 2));
    return canvas;
  }

  async deleteCanvasNode(filePath: string, nodeId: string): Promise<CanvasData> {
    const canvas = await this.readCanvas(filePath);
    const idx = canvas.nodes.findIndex((n) => n.id === nodeId);
    if (idx === -1) throw new Error(`Node "${nodeId}" not found`);
    canvas.nodes.splice(idx, 1);
    // Remove connected edges
    canvas.edges = canvas.edges.filter(
      (e) => e.fromNode !== nodeId && e.toNode !== nodeId,
    );
    await this.app.vault.adapter.write(filePath, JSON.stringify(canvas, null, 2));
    return canvas;
  }

  async updateCanvas(filePath: string, data: CanvasData): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) throw new FileNotFoundError(`File not found: ${filePath}`);
    if (file.extension !== "canvas") throw new Error(`Not a canvas file: ${filePath}`);

    const content = JSON.stringify(
      { nodes: data.nodes ?? [], edges: data.edges ?? [] },
      null,
      2,
    );
    await this.app.vault.adapter.write(filePath, content);
  }
}
