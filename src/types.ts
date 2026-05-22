// eslint-disable-next-line no-restricted-imports -- Moment type is not re-exported by 'obsidian'; import type causes no runtime bundling
import type { Moment } from "moment";
import { FileStats, TFile } from "obsidian";
import { IPeriodicNoteSettings } from "obsidian-daily-notes-interface";

export enum ErrorCode {
  TextContentEncodingRequired = 40010,
  ContentTypeSpecificationRequired = 40011,
  InvalidContentType = 40012,
  InvalidContentForContentType = 40015,
  MissingTargetTypeHeader = 40053,
  InvalidTargetTypeHeader = 40054,
  MissingTargetHeader = 40055,
  InvalidTargetScopeHeader = 40059,
  MissingOperation = 40056,
  InvalidOperation = 40057,
  InvalidTargetHeader = 40058,
  PeriodIsNotEnabled = 40060,
  InvalidFilterQuery = 40070,
  PatchFailed = 40080,
  InvalidSearch = 40090,
  ApiKeyAuthorizationRequired = 40101,
  PeriodDoesNotExist = 40460,
  PeriodicNoteDoesNotExist = 40461,
  RequestMethodValidOnlyForFiles = 40510,
  ConflictingTargetSpecification = 42200,
  ErrorPreparingSimpleSearch = 50010,
}

export interface LocalRestApiSettings {
  apiKey?: string;
  crypto?: {
    cert: string;
    privateKey: string;
    publicKey: string;
  };
  port: number;
  insecurePort: number;
  enableInsecureServer: boolean;
  enableSecureServer?: boolean;

  authorizationHeaderName?: string;
  bindingHost?: string;
  subjectAltNames?: string;
  enableVerboseLogging?: boolean;
}

export interface PeriodicNoteInterface {
  settings: IPeriodicNoteSettings;
  loaded: boolean;
  create: (date: Moment) => Promise<TFile>;
  get: (date: Moment, all: Record<string, TFile>) => TFile;
  getAll: () => Record<string, TFile>;
}

declare module "obsidian" {
  interface App {
    setting: {
      containerEl: HTMLElement;
      openTabById(id: string): void;
      pluginTabs: Array<{
        id: string;
        name: string;
        plugin: {
          [key: string]: PluginManifest;
        };
        instance?: {
          description: string;
          id: string;
          name: string;
        };
      }>;
      activeTab: SettingTab;
      open(): void;
    };
    commands: {
      executeCommandById(id: string): void;
      commands: {
        [key: string]: Command;
      };
    };
    plugins: {
      plugins: {
        [key: string]: PluginManifest;
      };
    };
    internalPlugins: {
      plugins: {
        [key: string]: {
          instance: {
            description: string;
            id: string;
            name: string;
          };
          enabled: boolean;
        };
        workspaces: {
          instance: {
            description: string;
            id: string;
            name: string;
            activeWorkspace: Workspace;
            saveWorkspace(workspace: Workspace): void;
            loadWorkspace(workspace: string): void;
          };
          enabled: boolean;
        };
      };
    };
  }
  interface View {
    file: TFile;
  }
}

export interface ErrorResponseDescriptor {
  statusCode?: number;
  message?: string;
  errorCode?: ErrorCode;
}

export interface CannedResponse {
  message: string;
  errorCode?: number;
}

export interface SearchContext {
  match: {
    start: number;
    end: number;
    source: "filename" | "content";
  };
  context: string;
}

export interface SearchResponseItem {
  filename: string;
  score?: number;
  matches: SearchContext[];
}

export interface SearchJsonResponseItem {
  filename: string;
  result: unknown;
}

export interface FileMetadataObject {
  tags: string[];
  frontmatter: Record<string, unknown>;
  stat: FileStats;
  path: string;
  content: string;
  links: string[];
  backlinks: string[];
}

export interface DocumentMapObject {
  headings: string[];
  blocks: string[];
  frontmatterFields: string[];
}

// --- Graph types ---

export interface GraphNode {
  path: string;
  name: string;
  tags: string[];
  linkCount: number;
  backlinkCount: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphAnalysis {
  totalNodes: number;
  totalEdges: number;
  orphans: string[];
  hubs: Array<{ path: string; degree: number }>;
  connectedComponents: string[][];
}

export interface GraphNeighborNode extends GraphNode {
  depth: number;
}

export interface GraphNeighborData {
  root: string;
  maxDepth: number;
  nodes: GraphNeighborNode[];
  edges: GraphEdge[];
}

// --- Link types ---

export interface LinkInfo {
  target: string;
  displayText?: string;
  line: number;
  ch: number;
  context: string;
  direction: "outgoing" | "incoming";
}

export interface LinkSuggestion {
  notePath: string;
  noteName: string;
  mentions: Array<{ line: number; context: string }>;
}

// --- Block types ---

export interface BlockInfo {
  id: string;
  content: string;
  line: number;
}

// --- Canvas types (JSON Canvas spec 1.0) ---

export interface CanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  // text node
  text?: string;
  // file node
  file?: string;
  subpath?: string;
  // link node
  url?: string;
  // group node
  label?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  fromEnd?: "none" | "arrow";
  toNode: string;
  toSide?: "top" | "right" | "bottom" | "left";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}
