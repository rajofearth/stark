import type { TrackerAdapter } from "../tracker/index.js";

export const linearGraphqlToolSpec = {
  name: "linear_graphql",
  description:
    "Execute a raw GraphQL query or mutation against Linear using S.T.A.R.K configured auth.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: "GraphQL query or mutation document to execute against Linear.",
      },
      variables: {
        type: ["object", "null"],
        description: "Optional GraphQL variables object.",
        additionalProperties: true,
      },
    },
  },
};

export class DynamicToolExecutor {
  constructor(private readonly tracker: TrackerAdapter) {}

  async execute(tool: string | null | undefined, args: unknown): Promise<Record<string, unknown>> {
    if (tool !== "linear_graphql") {
      return failure({
        error: {
          message: `Unsupported dynamic tool: ${JSON.stringify(tool)}.`,
          supportedTools: ["linear_graphql"],
        },
      });
    }
    try {
      const { query, variables } = normalizeLinearGraphqlArguments(args);
      const response = await this.tracker.graphql(query, variables);
      const hasErrors = Array.isArray(response.errors) && response.errors.length > 0;
      return dynamicToolResponse(!hasErrors, response);
    } catch (reason) {
      return failure({
        error: {
          message: "Linear GraphQL tool execution failed.",
          reason: reason instanceof Error ? reason.message : String(reason),
        },
      });
    }
  }
}

function normalizeLinearGraphqlArguments(args: unknown): {
  query: string;
  variables: Record<string, unknown>;
} {
  if (typeof args === "string") {
    const trimmed = args.trim();
    const decoded = tryParseJson(trimmed);
    if (decoded !== null) return normalizeLinearGraphqlArguments(decoded);
    const query = trimmed;
    if (!query) throw new Error("missing_query");
    return { query, variables: {} };
  }
  if (!args || typeof args !== "object") throw new Error("invalid_arguments");
  const record = args as Record<string, unknown>;
  const nested =
    record.arguments ??
    record.input ??
    getNested(record, "toolCall", "arguments") ??
    getNested(record, "toolCall", "input") ??
    getNested(record, "tool_call", "arguments") ??
    getNested(record, "tool_call", "input") ??
    getNested(record, "item", "arguments") ??
    getNested(record, "item", "input") ??
    getNested(record, "function", "arguments") ??
    getNested(record, "function", "input");
  if (typeof record.query !== "string" && nested !== undefined) {
    return normalizeLinearGraphqlArguments(nested);
  }
  const query = typeof record.query === "string" ? record.query.trim() : "";
  if (!query) throw new Error("missing_query");
  if (record.variables === undefined || record.variables === null) return { query, variables: {} };
  if (typeof record.variables === "string") {
    const decodedVariables = tryParseJson(record.variables);
    if (
      decodedVariables &&
      typeof decodedVariables === "object" &&
      !Array.isArray(decodedVariables)
    ) {
      return { query, variables: decodedVariables as Record<string, unknown> };
    }
  }
  if (typeof record.variables !== "object" || Array.isArray(record.variables)) {
    throw new Error("invalid_variables");
  }
  return { query, variables: record.variables as Record<string, unknown> };
}

function tryParseJson(value: string): unknown | null {
  if (!value.startsWith("{")) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function getNested(record: Record<string, unknown>, key: string, nestedKey: string): unknown {
  const value = record[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[nestedKey];
}

function failure(payload: Record<string, unknown>): Record<string, unknown> {
  return dynamicToolResponse(false, payload);
}

function dynamicToolResponse(success: boolean, payload: unknown): Record<string, unknown> {
  const output = JSON.stringify(payload, null, 2);
  return {
    success,
    output,
    contentItems: [{ type: "inputText", text: output }],
  };
}
