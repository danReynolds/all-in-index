import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { ANTHROPIC_API_KEY, EXTRACTION_MODEL } from "./config";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  return (_client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY() }));
}

export interface CallToolArgs<T> {
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
 * The `messages.create` params for a structured tool call — shared by the
 * synchronous path and the batch path (a batch request is just these params
 * plus a custom_id), so both stay byte-identical and keep prompt caching.
 */
function toolParams(args: CallToolArgs<unknown>): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model: args.model ?? EXTRACTION_MODEL,
    max_tokens: args.maxTokens ?? 4096,
    system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }],
    tools: [
      {
        name: args.toolName,
        description: args.toolDescription,
        input_schema: args.inputSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: args.toolName },
    messages: [{ role: "user", content: args.user }],
  };
}

/** Pull the forced tool call out of a completed message and validate it. */
function parseToolMessage<T>(message: Anthropic.Message, args: CallToolArgs<T>): T {
  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error(`Model did not return a ${args.toolName} tool call.`);
  }
  return args.validate.parse(block.input);
}

/**
 * Force the model to emit a single structured tool call and return the
 * validated input. The system prompt is marked for prompt caching so repeated
 * calls within a run (and across episodes) reuse it cheaply.
 */
export async function callTool<T>(args: CallToolArgs<T>): Promise<T> {
  const res = await anthropic().messages.create(toolParams(args));
  return parseToolMessage(res, args);
}

export type BatchOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Run many structured tool calls through the Message Batches API — same model,
 * prompts, and validation as callTool, billed at 50% and processed async. Submit
 * one request per item, poll to completion, and return validated results keyed by
 * customId (results may arrive out of order; the custom_id matches them back).
 * A request that errors or fails validation comes back as { ok: false } rather
 * than throwing, so the caller can retry just the failures. Used for bulk
 * re-extraction; the synchronous callTool stays the path for near-real-time runs.
 */
export async function callToolBatch<T>(
  items: Array<{ customId: string; args: CallToolArgs<T> }>,
  opts: { pollMs?: number; label?: string } = {},
): Promise<Map<string, BatchOutcome<T>>> {
  const out = new Map<string, BatchOutcome<T>>();
  if (items.length === 0) return out;

  const argsById = new Map(items.map((i) => [i.customId, i.args]));
  const client = anthropic();
  const batch = await client.messages.batches.create({
    requests: items.map((i) => ({ custom_id: i.customId, params: toolParams(i.args) })),
  });
  const label = opts.label ? `batch ${opts.label}` : "batch";
  console.log(`  [${label}] submitted ${items.length} requests (id ${batch.id})`);

  const pollMs = opts.pollMs ?? 12_000;
  const started = Date.now();
  let status = batch;
  while (status.processing_status !== "ended") {
    await new Promise((r) => setTimeout(r, pollMs));
    status = await client.messages.batches.retrieve(batch.id);
    const c = status.request_counts;
    const mins = Math.round((Date.now() - started) / 6000) / 10;
    console.log(`  [${label}] ${c.succeeded}✓ ${c.errored}✗ ${c.processing}… (${mins}m)`);
  }

  const results = await client.messages.batches.results(batch.id);
  for await (const entry of results) {
    const args = argsById.get(entry.custom_id);
    if (!args) continue;
    if (entry.result.type === "succeeded") {
      try {
        out.set(entry.custom_id, { ok: true, value: parseToolMessage(entry.result.message, args) });
      } catch (e) {
        out.set(entry.custom_id, { ok: false, error: `validate: ${e instanceof Error ? e.message : e}` });
      }
    } else {
      const detail =
        entry.result.type === "errored"
          ? entry.result.error?.error?.message ?? "errored"
          : entry.result.type;
      out.set(entry.custom_id, { ok: false, error: detail });
    }
  }
  return out;
}
