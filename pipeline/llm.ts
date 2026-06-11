import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { ANTHROPIC_API_KEY, EXTRACTION_MODEL } from "./config";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  return (_client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY() }));
}

interface CallToolArgs<T> {
  /** System prompt. Cached, so keep the stable instructions here. */
  system: string;
  /** User content (the episode-specific material). */
  user: string;
  toolName: string;
  toolDescription: string;
  /** JSON Schema for the tool input (what the model must produce). */
  inputSchema: Record<string, unknown>;
  /** Zod schema used to validate + type the model's output. */
  validate: z.ZodType<T>;
  maxTokens?: number;
  model?: string;
}

/**
 * Force the model to emit a single structured tool call and return the
 * validated input. The system prompt is marked for prompt caching so repeated
 * calls within a run (and across episodes) reuse it cheaply.
 */
export async function callTool<T>(args: CallToolArgs<T>): Promise<T> {
  const res = await anthropic().messages.create({
    model: args.model ?? EXTRACTION_MODEL,
    max_tokens: args.maxTokens ?? 4096,
    system: [
      {
        type: "text",
        text: args.system,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: args.toolName,
        description: args.toolDescription,
        input_schema: args.inputSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: args.toolName },
    messages: [{ role: "user", content: args.user }],
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error(`Model did not return a ${args.toolName} tool call.`);
  }
  return args.validate.parse(block.input);
}
