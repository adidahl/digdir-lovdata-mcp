import type Database from 'better-sqlite3';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  ABOUT_TOOL,
  callAboutTool,
  type AboutContext,
} from './about.js';
import {
  LIST_SOURCES_TOOL,
  callListSourcesTool,
} from './list-sources.js';
import {
  SEARCH_LEGISLATION_TOOL,
  callSearchLegislationTool,
} from './search-legislation.js';
import {
  FIND_BY_TITLE_TOOL,
  callFindByTitleTool,
} from './find-by-title.js';
import {
  GET_DOCUMENT_TOOL,
  callGetDocumentTool,
} from './get-document.js';
import {
  GET_PROVISION_TOOL,
  callGetProvisionTool,
} from './get-provision.js';
import {
  CHECK_CURRENCY_TOOL,
  callCheckCurrencyTool,
} from './check-currency.js';
import {
  VALIDATE_CITATION_TOOL,
  callValidateCitationTool,
} from './validate-citation.js';
import {
  FORMAT_CITATION_TOOL,
  callFormatCitationTool,
} from './format-citation.js';
import {
  GET_DOCUMENT_CHANGE_PUBLICATIONS_TOOL,
  GET_LOVTIDEND_PUBLICATION_TOOL,
  SEARCH_LOVTIDEND_TOOL,
  callGetDocumentChangePublicationsTool,
  callGetLovtidendPublicationTool,
  callSearchLovtidendTool,
} from './lovtidend.js';

interface ToolContext extends AboutContext {
  db: Database.Database;
}

interface RegisteredTool {
  definition: Tool;
  handler: (
    args: Record<string, unknown>,
    context: ToolContext,
  ) => CallToolResult | Promise<CallToolResult>;
}

const TOOLS: RegisteredTool[] = [
  {
    definition: ABOUT_TOOL,
    handler: (_args, context) => callAboutTool(context),
  },
  {
    definition: LIST_SOURCES_TOOL,
    handler: (_args, context) => callListSourcesTool(context.db),
  },
  {
    definition: SEARCH_LEGISLATION_TOOL,
    handler: (args, context) => callSearchLegislationTool(context.db, args),
  },
  {
    definition: FIND_BY_TITLE_TOOL,
    handler: (args, context) => callFindByTitleTool(context.db, args),
  },
  {
    definition: GET_DOCUMENT_TOOL,
    handler: (args, context) => callGetDocumentTool(context.db, args),
  },
  {
    definition: GET_PROVISION_TOOL,
    handler: (args, context) => callGetProvisionTool(context.db, args),
  },
  {
    definition: CHECK_CURRENCY_TOOL,
    handler: (args, context) => callCheckCurrencyTool(context.db, args),
  },
  {
    definition: VALIDATE_CITATION_TOOL,
    handler: (args, context) => callValidateCitationTool(context.db, args),
  },
  {
    definition: FORMAT_CITATION_TOOL,
    handler: (args, context) => callFormatCitationTool(context.db, args),
  },
  {
    definition: SEARCH_LOVTIDEND_TOOL,
    handler: (args, context) => callSearchLovtidendTool(context.db, args),
  },
  {
    definition: GET_LOVTIDEND_PUBLICATION_TOOL,
    handler: (args, context) => callGetLovtidendPublicationTool(context.db, args),
  },
  {
    definition: GET_DOCUMENT_CHANGE_PUBLICATIONS_TOOL,
    handler: (args, context) => callGetDocumentChangePublicationsTool(context.db, args),
  },
];

const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.definition.name, tool]));

export function registerToolHandlers(
  server: Server,
  context: ToolContext,
): void {
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: TOOLS.map((tool) => tool.definition),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOLS_BY_NAME.get(request.params.name);

    if (!tool) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown tool: ${request.params.name}`,
      );
    }

    const args = request.params.arguments ?? {};

    if (typeof args !== 'object' || Array.isArray(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Tool "${request.params.name}" arguments must be an object.`,
      );
    }

    return tool.handler(args, context);
  });
}
