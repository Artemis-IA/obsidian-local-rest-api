local Delete = import 'delete.jsonnet';
local Get = import 'get.jsonnet';
local Patch = import 'patch.jsonnet';
local Post = import 'post.jsonnet';
local Put = import 'put.jsonnet';

local ParamDay = import 'day.param.jsonnet';
local ParamMonth = import 'month.param.jsonnet';
local ParamPath = import 'path.param.jsonnet';
local ParamPeriod = import 'period.param.jsonnet';
local ParamYear = import 'year.param.jsonnet';

local TargetingShared = importstr 'lib/descriptions/targeting.md';
local GetShared = TargetingShared + '\n' + importstr 'lib/descriptions/get-shared.md';
local PostShared = TargetingShared + '\n' + importstr 'lib/descriptions/post-shared.md';
local PutShared = TargetingShared + '\n' + importstr 'lib/descriptions/put-shared.md';
local PatchDescription(fileRef) =
  'Inserts content into ' + fileRef + ' relative to a heading, block reference, or frontmatter field within that document.\n\n' + Patch.description;


std.manifestYamlDoc(
  {
    openapi: '3.0.2',
    info: {
      title: 'Local REST API for Obsidian',
      description: importstr 'lib/descriptions/info.md',
      version: '1.0',
    },
    servers: [
      {
        url: 'https://{host}:{port}',
        description: 'HTTPS (Secure Mode)',
        variables: {
          port: {
            default: '27124',
            description: 'HTTPS port',
          },
          host: {
            default: '127.0.0.1',
            description: 'Binding host',
          },
        },
      },
      {
        url: 'http://{host}:{port}',
        description: 'HTTP (Insecure Mode)',
        variables: {
          port: {
            default: '27123',
            description: 'HTTP port',
          },
          host: {
            default: '127.0.0.1',
            description: 'Binding host',
          },
        },
      },
    ],
    components: {
      securitySchemes: {
        apiKeyAuth: {
          description: 'Find your API Key in your Obsidian settings\nin the "Local REST API" section under "Plugins".\n',
          type: 'http',
          scheme: 'bearer',
        },
      },
      schemas: {
        NoteJson: {
          type: 'object',
          required: [
            'tags',
            'frontmatter',
            'stat',
            'path',
            'content',
            'links',
            'backlinks',
          ],
          properties: {
            tags: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            frontmatter: {
              type: 'object',
            },
            stat: {
              type: 'object',
              required: [
                'ctime',
                'mtime',
                'size',
              ],
              properties: {
                ctime: {
                  type: 'number',
                },
                mtime: {
                  type: 'number',
                },
                size: {
                  type: 'number',
                },
              },
            },
            path: {
              type: 'string',
            },
            content: {
              type: 'string',
            },
            links: {
              type: 'array',
              description: 'Vault-relative paths of files this file links to.',
              items: {
                type: 'string',
              },
            },
            backlinks: {
              type: 'array',
              description: 'Vault-relative paths of files that link to this file.',
              items: {
                type: 'string',
              },
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Message describing the error.',
              example: 'A brief description of the error.',
            },
            errorCode: {
              type: 'number',
              description: 'A 5-digit error code uniquely identifying this particular type of error.\n',
              example: 40149,
            },
          },
        },
      },
    },
    security: [
      {
        apiKeyAuth: [],
      },
    ],
    tags: [
      { name: 'Vault Files' },
      { name: 'Active File' },
      { name: 'Periodic Notes' },
      { name: 'Vault Directories' },
      { name: 'Search' },
      { name: 'Commands' },
      { name: 'Open' },
      { name: 'System' },
      { name: 'MCP' },
      { name: 'Graph' },
      { name: 'Links' },
      { name: 'Blocks' },
      { name: 'Transclusions' },
      { name: 'Canvas' },
    ],
    paths: {
      '/active/': {
        get: Get {
          tags: ['Active File'],
          summary: 'Return the content of the active file open in Obsidian.\n',
          description: (importstr 'lib/descriptions/active-get.md') + '\n' + GetShared,
        },
        put: Put {
          tags: [
            'Active File',
          ],
          summary: 'Update the content of the active file open in Obsidian.\n',
          description: PutShared,
        },
        post: Post {
          tags: [
            'Active File',
          ],
          summary: 'Append content to the active file open in Obsidian.\n',
          description: (importstr 'lib/descriptions/active-post.md') + '\n' + PostShared,
        },
        patch: Patch {
          tags: [
            'Active File',
          ],
          summary: 'Partially update content in the currently open note.\n',
          description: PatchDescription('the currently-open note'),
        },
        delete: Delete {
          tags: [
            'Active File',
          ],
          summary: 'Deletes the currently-active file in Obsidian.\n',
        },
      },
      '/vault/{filename}': {
        get: Get {
          tags: [
            'Vault Files',
          ],
          summary: 'Return the content of a single file in your vault.\n',
          description: (importstr 'lib/descriptions/vault-file-get.md') + '\n' + GetShared,
          parameters: [ParamPath] + super.parameters,
        },
        put: Put {
          tags: [
            'Vault Files',
          ],
          summary: 'Create a new file in your vault or update the content of an existing one.\n',
          description: 'Creates a new file in your vault or updates the content of an existing one if the specified file already exists.\n\n' + PutShared,
          parameters: [ParamPath] + super.parameters,
        },
        post: Post {
          tags: [
            'Vault Files',
          ],
          summary: 'Append content to a new or existing file.\n',
          description: (importstr 'lib/descriptions/vault-file-post.md') + '\n' + PostShared,
          parameters: [ParamPath] + super.parameters,
        },
        patch: Patch {
          tags: [
            'Vault Files',
          ],
          summary: 'Partially update content in an existing note.\n',
          description: PatchDescription('an existing note'),
          parameters: [ParamPath] + super.parameters,
        },
        delete: Delete {
          tags: [
            'Vault Files',
          ],
          summary: 'Delete a particular file in your vault.\n',
          parameters: Delete.parameters + [ParamPath],
        },
      },
      '/vault/': {
        get: {
          tags: [
            'Vault Directories',
          ],
          summary: 'List files that exist in the root of your vault.\n',
          description: importstr 'lib/descriptions/vault-list.md',
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      files: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                      },
                    },
                  },
                  example: {
                    files: [
                      'mydocument.md',
                      'somedirectory/',
                    ],
                  },
                },
              },
            },
            '404': {
              description: 'Directory does not exist',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/vault/{pathToDirectory}/': {
        get: {
          tags: [
            'Vault Directories',
          ],
          summary: 'List files that exist in the specified directory.\n',
          parameters: [
            {
              name: 'pathToDirectory',
              'in': 'path',
              description: 'Path to list files from (relative to your vault root).  Note that empty directories will not be returned.\n\nNote: this particular interactive tool requires that you provide an argument for this field, but the API itself will allow you to list the root folder of your vault. If you would like to try listing content in the root of your vault using this interactive tool, use the above "List files that exist in the root of your vault" form above.\n',
              required: true,
              schema: {
                type: 'string',
                format: 'path',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      files: {
                        type: 'array',
                        items: {
                          type: 'string',
                        },
                      },
                    },
                  },
                  example: {
                    files: [
                      'mydocument.md',
                      'somedirectory/',
                    ],
                  },
                },
              },
            },
            '404': {
              description: 'Directory does not exist',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/periodic/{period}/': {
        get: Get {
          tags: [
            'Periodic Notes',
          ],
          summary: 'Get current periodic note for the specified period.\n',
          description: (importstr 'lib/descriptions/periodic-current-get.md') + '\n' + GetShared,
          parameters: [ParamPeriod] + super.parameters,
        },
        put: Put {
          tags: [
            'Periodic Notes',
          ],
          summary: 'Update the content of the current periodic note for the specified period.\n',
          description: PutShared,
          parameters: [ParamPeriod] + super.parameters,
        },
        post: Post {
          tags: [
            'Periodic Notes',
          ],
          summary: 'Append content to the current periodic note for the specified period.\n',
          description: (importstr 'lib/descriptions/periodic-current-post.md') + '\n' + PostShared,
          parameters: [ParamPeriod] + super.parameters,
        },
        patch: Patch {
          tags: [
            'Periodic Notes',
          ],
          summary: 'Partially update content in the current periodic note for the specified period.\n',
          description: PatchDescription('the current periodic note for the specified period'),
          parameters: [ParamPeriod] + super.parameters,
        },
        delete: Delete {
          tags: [
            'Periodic Notes',
          ],
          summary: 'Delete the current periodic note for the specified period.\n',
          parameters+: [ParamPeriod],
        },
      },
      '/periodic/{period}/{year}/{month}/{day}/': {
        get: Get {
          tags: [
            'Periodic Notes',
          ],
          summary: 'Get the periodic note for the specified period and date.\n',
          description: (importstr 'lib/descriptions/periodic-date-get.md') + '\n' + GetShared,
          parameters: [ParamYear, ParamMonth, ParamDay, ParamPeriod] + super.parameters,
        },
        put: Put {
          tags: [
            'Periodic Notes',
          ],
          summary: 'Update the content of the periodic note for the specified period and date.\n',
          description: PutShared,
          parameters: [ParamYear, ParamMonth, ParamDay, ParamPeriod] + super.parameters,
        },
        post: Post {
          tags: [
            'Periodic Notes',
          ],
          summary: 'Append content to the periodic note for the specified period and date.\n',
          description: (importstr 'lib/descriptions/periodic-date-post.md') + '\n' + PostShared,
          parameters: [ParamYear, ParamMonth, ParamDay, ParamPeriod] + super.parameters,
        },
        patch: Patch {
          tags: [
            'Periodic Notes',
          ],
          summary: 'Partially update content in the periodic note for the specified period and date.\n',
          description: PatchDescription('a periodic note for the specified period and date'),
          parameters: [ParamYear, ParamMonth, ParamDay, ParamPeriod] + super.parameters,
        },
        delete: Delete {
          tags: [
            'Periodic Notes',
          ],
          summary: 'Delete the periodic note for the specified period and date.\n',
          description: 'Deletes the periodic note for the specified period.\n',
          parameters+: [ParamYear, ParamMonth, ParamDay, ParamPeriod],
        },
      },
      '/tags/': {
        get: {
          tags: [
            'Tags',
          ],
          summary: 'Get a list of all tags with metadata.\n',
          description: 'Returns all tags found across all files in the vault, drawn from both inline (`#tag`) and frontmatter tag syntax. Each tag is returned without the `#` prefix. Hierarchical tags (e.g. `work/tasks`) also contribute a count to every parent prefix (e.g. `work`), mirroring how Obsidian displays tag counts in its sidebar.\n',
          responses: {
            '200': {
              description: 'A list of tags with their usage counts.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tags: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: {
                              type: 'string',
                              description: 'Tag name without the leading `#`.',
                            },
                            count: {
                              type: 'number',
                              description: 'Number of times this tag is used across the vault.',
                            },
                          },
                        },
                      },
                    },
                  },
                  example: {
                    tags: [
                      { name: 'project', count: 3 },
                      { name: 'important', count: 1 },
                      { name: 'work', count: 2 },
                      { name: 'work/tasks', count: 2 },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      '/commands/': {
        get: {
          tags: [
            'Commands',
          ],
          summary: 'Get a list of available commands.\n',
          responses: {
            '200': {
              description: 'A list of available commands.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      commands: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: {
                              type: 'string',
                            },
                            name: {
                              type: 'string',
                            },
                          },
                        },
                      },
                    },
                  },
                  example: {
                    commands: [
                      {
                        id: 'global-search:open',
                        name: 'Search: Search in all files',
                      },
                      {
                        id: 'graph:open',
                        name: 'Graph view: Open graph view',
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      '/commands/{commandId}/': {
        post: {
          tags: [
            'Commands',
          ],
          summary: 'Execute a command.\n',
          parameters: [
            {
              name: 'commandId',
              'in': 'path',
              description: 'The id of the command to execute',
              required: true,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '204': {
              description: 'Success',
            },
            '404': {
              description: 'The command you specified does not exist.',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/search/': {
        post: {
          tags: [
            'Search',
          ],
          summary: 'Search for documents matching a specified search query\n',
          description: importstr 'lib/descriptions/search-post.md',
          requestBody: {
            required: true,
            content: {
              'application/vnd.olrapi.jsonlogic+json': {
                schema: {
                  type: 'object',
                  externalDocs: {
                    url: 'https://jsonlogic.com/operations.html',
                  },
                },
                examples: {
                  find_by_frontmatter_value: {
                    summary: 'Find notes having a certain frontmatter field value.',
                    value: '{\n  "==": [\n    {"var": "frontmatter.myField"},\n    "myValue"\n  ]\n}\n',
                  },
                  find_by_frontmatter_url_glob: {
                    summary: 'Find notes having URL or a matching URL glob frontmatter field.',
                    value: '{\n  "or": [\n    {"===": [{"var": "frontmatter.url"}, "https://myurl.com/some/path/"]},\n    {"glob": [{"var": "frontmatter.url-glob"}, "https://myurl.com/some/path/"]}\n  ]\n}\n',
                  },
                  find_by_tag: {
                    summary: 'Find notes having a certain tag',
                    value: '{\n  "in": [\n    "myTag",\n    {"var": "tags"}\n  ]\n}\n',
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: [
                        'filename',
                        'result',
                      ],
                      properties: {
                        filename: {
                          type: 'string',
                          description: 'Path to the matching file',
                        },
                        result: {
                          oneOf: [
                            {
                              type: 'string',
                            },
                            {
                              type: 'number',
                            },
                            {
                              type: 'array',
                              items: {},
                            },
                            {
                              type: 'object',
                            },
                            {
                              type: 'boolean',
                            },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': {
              description: 'Bad request.  Make sure you have specified an acceptable\nContent-Type for your search query.\n',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      '/search/simple/': {
        post: {
          tags: [
            'Search',
          ],
          summary: 'Search for documents matching a specified text query\n',
          parameters: [
            {
              name: 'query',
              'in': 'query',
              description: 'Your search query',
              required: true,
              schema: {
                type: 'string',
              },
            },
            {
              name: 'contextLength',
              'in': 'query',
              description: 'How much context to return around the matching string',
              required: false,
              schema: {
                type: 'number',
                default: 100,
              },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        filename: {
                          type: 'string',
                          description: 'Path to the matching file',
                        },
                        score: {
                          type: 'number',
                        },
                        matches: {
                          type: 'array',
                          items: {
                            type: 'object',
                            required: [
                              'match',
                              'context',
                            ],
                            properties: {
                              match: {
                                type: 'object',
                                required: [
                                  'start',
                                  'end',
                                ],
                                properties: {
                                  start: {
                                    type: 'number',
                                  },
                                  end: {
                                    type: 'number',
                                  },
                                },
                              },
                              context: {
                                type: 'string',
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/open/{filename}': {
        post: {
          tags: [
            'Open',
          ],
          summary: 'Open the specified document in the Obsidian user interface.\n',
          description: 'Note: Obsidian will create a new document at the path you have\nspecified if such a document did not already exist.\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'Path to the file to return (relative to your vault root).\n',
              required: true,
              schema: {
                type: 'string',
                format: 'path',
              },
            },
            {
              name: 'newLeaf',
              'in': 'query',
              description: 'Open this as a new leaf?',
              required: false,
              schema: {
                type: 'boolean',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
            },
          },
        },
      },
      '/': {
        get: {
          tags: [
            'System',
          ],
          summary: 'Returns basic details about the server.\n',
          description: 'Returns basic details about the server as well as your authentication status.\n\nThis is the only API request that does *not* require authentication.\n',
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      ok: {
                        type: 'string',
                        description: "'OK'",
                      },
                      versions: {
                        type: 'object',
                        properties: {
                          obsidian: {
                            type: 'string',
                            description: 'Obsidian plugin API version',
                          },
                          'self': {
                            type: 'string',
                            description: 'Plugin version.',
                          },
                        },
                      },
                      service: {
                        type: 'string',
                        description: "'Obsidian Local REST API'",
                      },
                      authenticated: {
                        type: 'boolean',
                        description: 'Is your current request authenticated?',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/openapi.yaml': {
        get: {
          tags: [
            'System',
          ],
          summary: 'Returns OpenAPI YAML document describing the capabilities of this API.\n',
          responses: {
            '200': {
              description: 'Success',
            },
          },
        },
      },
      '/mcp/': {
        get: {
          tags: ['MCP'],
          summary: 'Open a server-sent events stream for an existing MCP session.\n',
          description: 'Opens a long-lived SSE stream so the server can push messages to the client for an existing session. Requires the session ID returned by the `initialize` response.\n',
          parameters: [
            {
              name: 'Mcp-Session-Id',
              'in': 'header',
              description: 'Session ID returned by the server on initialization.',
              required: true,
              schema: {
                type: 'string',
              },
            },
            {
              name: 'MCP-Protocol-Version',
              'in': 'header',
              description: 'MCP protocol version negotiated during initialization (e.g. `2025-06-18`). Required on all requests after initialization. Unrecognised values are rejected with 400.',
              required: false,
              schema: {
                type: 'string',
              },
            },
          ],
          responses: {
            '200': {
              description: 'SSE stream opened. The server pushes JSON-RPC messages as server-sent events.',
              content: {
                'text/event-stream': {
                  schema: {
                    type: 'string',
                  },
                },
              },
            },
            '400': {
              description: 'Unsupported MCP-Protocol-Version.',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error',
                  },
                },
              },
            },
            '404': {
              description: 'Session not found.',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error',
                  },
                },
              },
            },
            '401': {
              description: 'API key required.',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['MCP'],
          summary: 'Send a JSON-RPC 2.0 message to the MCP server.\n',
          description: importstr 'lib/descriptions/mcp.md',
          parameters: [
            {
              name: 'Mcp-Session-Id',
              'in': 'header',
              description: 'Session ID returned by the server on initialization. Omit for the initial `initialize` request; required for all subsequent requests.',
              required: false,
              schema: {
                type: 'string',
              },
            },
            {
              name: 'MCP-Protocol-Version',
              'in': 'header',
              description: 'MCP protocol version negotiated during initialization (e.g. `2025-06-18`). Required on all requests after initialization. Unrecognised values are rejected with 400.',
              required: false,
              schema: {
                type: 'string',
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'A JSON-RPC 2.0 request message.',
                  required: ['jsonrpc', 'method'],
                  properties: {
                    jsonrpc: {
                      type: 'string',
                      enum: ['2.0'],
                      description: 'JSON-RPC version. Must be "2.0".',
                    },
                    id: {
                      oneOf: [{ type: 'string' }, { type: 'number' }],
                      description: 'Request identifier. Include for calls that expect a response; omit for notifications.',
                    },
                    method: {
                      type: 'string',
                      description: 'MCP method to invoke.',
                      enum: [
                        'initialize',
                        'tools/list',
                        'tools/call',
                        'resources/list',
                        'resources/read',
                        'prompts/list',
                        'prompts/get',
                        'ping',
                      ],
                    },
                    params: {
                      type: 'object',
                      description: 'Method-specific parameters.',
                    },
                  },
                },
                examples: {
                  list_tools: {
                    summary: 'List all available MCP tools',
                    value: {
                      jsonrpc: '2.0',
                      id: 1,
                      method: 'tools/list',
                      params: {},
                    },
                  },
                  call_vault_read: {
                    summary: 'Read a vault file (tools/call)',
                    value: {
                      jsonrpc: '2.0',
                      id: 2,
                      method: 'tools/call',
                      params: {
                        name: 'vault_read',
                        arguments: {
                          path: 'path/to/note.md',
                        },
                      },
                    },
                  },
                  call_vault_patch: {
                    summary: 'Patch a heading in a vault file (tools/call)',
                    value: {
                      jsonrpc: '2.0',
                      id: 3,
                      method: 'tools/call',
                      params: {
                        name: 'vault_patch',
                        arguments: {
                          path: 'path/to/note.md',
                          targetType: 'heading',
                          target: 'My Section',
                          operation: 'append',
                          content: 'New line of content\n',
                        },
                      },
                    },
                  },
                  read_openapi_resource: {
                    summary: 'Read the OpenAPI spec resource (resources/read)',
                    value: {
                      jsonrpc: '2.0',
                      id: 4,
                      method: 'resources/read',
                      params: {
                        uri: 'obsidian://local-rest-api/openapi.yaml',
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Message handled. Response body contains the JSON-RPC result, or may be empty for notifications. On session initialization the `Mcp-Session-Id` response header contains the new session ID.',
              headers: {
                'Mcp-Session-Id': {
                  description: 'Session ID assigned by the server. Present only on the `initialize` response.',
                  schema: {
                    type: 'string',
                  },
                },
              },
            },
            '400': {
              description: 'Unsupported MCP-Protocol-Version.',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error',
                  },
                },
              },
            },
            '404': {
              description: 'Session not found.',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error',
                  },
                },
              },
            },
            '401': {
              description: 'API key required.',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error',
                  },
                },
              },
            },
          },
        },
      },
      // ---- Graph endpoints ----
      '/graph/': {
        get: {
          tags: ['Graph'],
          summary: 'Return the full graph structure of the vault as nodes and edges.\n',
          description: 'Each node includes path, name, tags, link count, and backlink count. Each edge represents a wiki-link from source to target. Use the optional `filter` query parameter to limit results to paths containing the filter string.\n',
          parameters: [
            {
              name: 'filter',
              'in': 'query',
              description: 'Optional path filter string (case-insensitive substring match).',
              required: false,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      nodes: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            path: { type: 'string' },
                            name: { type: 'string' },
                            tags: { type: 'array', items: { type: 'string' } },
                            linkCount: { type: 'number' },
                            backlinkCount: { type: 'number' },
                          },
                        },
                      },
                      edges: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            source: { type: 'string' },
                            target: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/graph/analyze/': {
        get: {
          tags: ['Graph'],
          summary: 'Analyze the vault graph structure and return computed metrics.\n',
          description: 'Returns total node/edge counts, orphan notes (no links in or out), hub notes (highest degree), and connected components.\n',
          parameters: [
            {
              name: 'topN',
              'in': 'query',
              description: 'Number of top hubs to return (default: 10).',
              required: false,
              schema: { type: 'number', default: 10 },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      totalNodes: { type: 'number' },
                      totalEdges: { type: 'number' },
                      orphans: { type: 'array', items: { type: 'string' } },
                      hubs: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            path: { type: 'string' },
                            degree: { type: 'number' },
                          },
                        },
                      },
                      connectedComponents: {
                        type: 'array',
                        items: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/graph/neighbors/{filename}': {
        get: {
          tags: ['Graph'],
          summary: 'Return the local graph neighborhood of a specific note.\n',
          description: 'Returns all notes within N link-hops of the specified note, similar to Obsidian\'s local graph view. Each node includes a depth field indicating distance from the root.\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'File path relative to vault root.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
            {
              name: 'depth',
              'in': 'query',
              description: 'Maximum link-hop depth to traverse (default: 1).',
              required: false,
              schema: { type: 'number', default: 1 },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      nodes: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            path: { type: 'string' },
                            name: { type: 'string' },
                            depth: { type: 'number' },
                          },
                        },
                      },
                      edges: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            source: { type: 'string' },
                            target: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'File not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },

      // ---- Link endpoints ----
      '/links/{filename}': {
        get: {
          tags: ['Links'],
          summary: 'List all outgoing and incoming wiki-links for a note.\n',
          description: 'Each link includes target path, display text, line number, character position, surrounding context text, and direction (outgoing/incoming).\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'File path relative to vault root.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      links: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            target: { type: 'string' },
                            displayText: { type: 'string' },
                            line: { type: 'number' },
                            ch: { type: 'number' },
                            context: { type: 'string' },
                            direction: { type: 'string', enum: ['outgoing', 'incoming'] },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'File not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/links/': {
        post: {
          tags: ['Links'],
          summary: 'Insert a wiki-link into a note.\n',
          description: 'Creates a [[target]] or [[target|display]] link. Can optionally target a specific heading with [[target#heading]]. Position can be a specific line/character, "end" to append, or omitted to append.\n',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['path', 'target'],
                  properties: {
                    path: { type: 'string', description: 'File path of the note to add the link to.' },
                    target: { type: 'string', description: 'Target note name or path for the wiki-link.' },
                    displayText: { type: 'string', description: 'Optional display text for the link.' },
                    heading: { type: 'string', description: 'Optional heading to link to.' },
                    position: { description: 'Where to insert the link: {line, ch}, "end", or omit to append.' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Success' },
            '400': {
              description: 'Bad request',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
            '404': {
              description: 'File not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
        delete: {
          tags: ['Links'],
          summary: 'Remove a wiki-link from a note.\n',
          description: 'Matches [[target]], [[target|display]], [[target#heading]], and [[target#heading|display]] patterns. Optionally restrict deletion to a specific line number.\n',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['path', 'target'],
                  properties: {
                    path: { type: 'string', description: 'File path of the note to remove the link from.' },
                    target: { type: 'string', description: 'Target note name to match in the wiki-link.' },
                    line: { type: 'number', description: 'Optional 0-indexed line number to restrict deletion to.' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Success' },
            '400': {
              description: 'Bad request',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
            '404': {
              description: 'File not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/links/suggest/{filename}': {
        get: {
          tags: ['Links'],
          summary: 'Suggest potential wiki-links to existing notes.\n',
          description: 'Finds unlinked mentions — places where another note\'s name appears in the text but is not already wrapped in a [[wiki-link]].\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'File path relative to vault root.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      suggestions: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            noteName: { type: 'string' },
                            notePath: { type: 'string' },
                            line: { type: 'number' },
                            ch: { type: 'number' },
                            context: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'File not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },

      // ---- Block endpoints ----
      '/blocks/{filename}': {
        get: {
          tags: ['Blocks'],
          summary: 'List all block references in a file.\n',
          description: 'Returns each block\'s ID, content (the paragraph containing the block ref), and line number.\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'File path relative to vault root.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      blocks: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            content: { type: 'string' },
                            line: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'File not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
        post: {
          tags: ['Blocks'],
          summary: 'Add a block reference ID to a specific line in a note.\n',
          description: 'The block ID is appended to the end of the specified line. Throws if the block ID already exists in the file.\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'File path relative to vault root.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['line', 'blockId'],
                  properties: {
                    line: { type: 'number', description: '0-indexed line number to add the block ID to.' },
                    blockId: { type: 'string', description: 'Block reference ID (alphanumeric and hyphens, no ^ prefix).' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Success' },
            '400': {
              description: 'Bad request',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
            '404': {
              description: 'File not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/blocks/{filename}/{blockId}': {
        get: {
          tags: ['Blocks'],
          summary: 'Read the content of a specific block reference in a file.\n',
          description: 'Returns the block ID, its content (the full paragraph), and line number.\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'File path relative to vault root.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
            {
              name: 'blockId',
              'in': 'path',
              description: 'Block reference ID to read (without ^ prefix).',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      content: { type: 'string' },
                      line: { type: 'number' },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'Block or file not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },

      // ---- Transclusion endpoints ----
      '/transclusions/': {
        post: {
          tags: ['Transclusions'],
          summary: 'Insert a transclusion (embed) into a note.\n',
          description: 'Creates either ![[note#^block]] for block transclusions or ![[note#heading]] for heading transclusions.\n',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['path', 'targetNote', 'targetRef', 'refType'],
                  properties: {
                    path: { type: 'string', description: 'File path of the note to add the transclusion to.' },
                    targetNote: { type: 'string', description: 'Target note name or path to transclude from.' },
                    targetRef: { type: 'string', description: 'Block ID (without ^) or heading text to transclude.' },
                    refType: { type: 'string', enum: ['block', 'heading'], description: 'Type of reference.' },
                    position: { description: 'Where to insert: {line}, "end", or omit to append.' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Success' },
            '400': {
              description: 'Bad request',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
            '404': {
              description: 'File not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },

      // ---- Canvas endpoints ----
      '/canvas/': {
        get: {
          tags: ['Canvas'],
          summary: 'List all .canvas files in the vault.\n',
          description: 'Returns an array of file paths for all canvas files.\n',
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      files: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Canvas'],
          summary: 'Create a new canvas file.\n',
          description: 'Creates a new canvas file with initial nodes and edges. The path must end with .canvas extension. Follows JSON Canvas spec 1.0.\n',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['path'],
                  properties: {
                    path: { type: 'string', description: 'Path for the new .canvas file.' },
                    nodes: { type: 'array', description: 'Initial nodes to place on the canvas.', items: { type: 'object' } },
                    edges: { type: 'array', description: 'Initial edges connecting nodes.', items: { type: 'object' } },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Created' },
            '400': {
              description: 'Bad request',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/canvas/{filename}': {
        get: {
          tags: ['Canvas'],
          summary: 'Read and parse a canvas file.\n',
          description: 'Returns the full JSON Canvas structure with nodes and edges. Follows JSON Canvas spec 1.0.\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'Path to the .canvas file relative to vault root.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      nodes: { type: 'array', items: { type: 'object' } },
                      edges: { type: 'array', items: { type: 'object' } },
                    },
                  },
                },
              },
            },
            '404': {
              description: 'Canvas file not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
        put: {
          tags: ['Canvas'],
          summary: 'Replace the entire content of a canvas file.\n',
          description: 'Replaces all nodes and edges in an existing canvas file.\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'Path to the .canvas file relative to vault root.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['nodes', 'edges'],
                  properties: {
                    nodes: { type: 'array', items: { type: 'object' } },
                    edges: { type: 'array', items: { type: 'object' } },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Success' },
            '404': {
              description: 'Canvas file not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/canvas/{filename}/nodes': {
        post: {
          tags: ['Canvas'],
          summary: 'Add a node to an existing canvas.\n',
          description: 'Node types: text (with text content), file (referencing a vault file), link (external URL), group (visual container). Throws if a node with the same ID already exists.\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'Path to the .canvas file.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'type', 'x', 'y', 'width', 'height'],
                  properties: {
                    id: { type: 'string' },
                    type: { type: 'string', enum: ['text', 'file', 'link', 'group'] },
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number' },
                    height: { type: 'number' },
                    text: { type: 'string' },
                    file: { type: 'string' },
                    url: { type: 'string' },
                    label: { type: 'string' },
                    color: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Success' },
            '404': {
              description: 'Canvas file not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/canvas/{filename}/edges': {
        post: {
          tags: ['Canvas'],
          summary: 'Add an edge between two nodes on a canvas.\n',
          description: 'Edges connect a fromNode to a toNode, optionally specifying sides and arrow endpoints.\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'Path to the .canvas file.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'fromNode', 'toNode'],
                  properties: {
                    id: { type: 'string' },
                    fromNode: { type: 'string' },
                    toNode: { type: 'string' },
                    fromSide: { type: 'string', enum: ['top', 'right', 'bottom', 'left'] },
                    toSide: { type: 'string', enum: ['top', 'right', 'bottom', 'left'] },
                    fromEnd: { type: 'string', enum: ['none', 'arrow'] },
                    toEnd: { type: 'string', enum: ['none', 'arrow'] },
                    label: { type: 'string' },
                    color: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Success' },
            '404': {
              description: 'Canvas file not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/canvas/{filename}/nodes/{nodeId}': {
        delete: {
          tags: ['Canvas'],
          summary: 'Remove a node from a canvas by its ID.\n',
          description: 'Also removes all edges connected to the deleted node.\n',
          parameters: [
            {
              name: 'filename',
              'in': 'path',
              description: 'Path to the .canvas file.',
              required: true,
              schema: { type: 'string', format: 'path' },
            },
            {
              name: 'nodeId',
              'in': 'path',
              description: 'ID of the node to delete.',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': { description: 'Success' },
            '404': {
              description: 'Canvas file not found',
              content: { 'application/json': { schema: { '$ref': '#/components/schemas/Error' } } },
            },
          },
        },
      },

      '/obsidian-local-rest-api.crt': {
        get: {
          tags: [
            'System',
          ],
          summary: 'Returns the certificate in use by this API.\n',
          responses: {
            '200': {
              description: 'Success',
            },
          },
        },
      },
    },
  },
  quote_keys=false,
  indent_array_in_object=true,
)
