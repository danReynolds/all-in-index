import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { Transcript } from "../lib/types";
import { anthropic } from "../pipeline/llm";
import { nameSpeakers } from "../pipeline/speakers";

function transcript(): Transcript {
  return {
    episodeId: "E281",
    provider: "assemblyai",
    speakerMap: {},
    utterances: Array.from({ length: 11 }, (_, index) => ({
      cluster: String.fromCharCode(65 + index),
      speaker: "Unknown",
      text: "An example excerpt.",
      startMs: index * 1000,
      endMs: (index + 1) * 1000,
    })),
    meta: {},
  };
}

function toolResponse(stopReason: Anthropic.Message["stop_reason"], input: unknown, outputTokens: number) {
  return {
    stop_reason: stopReason,
    usage: { output_tokens: outputTokens },
    content: [{ type: "tool_use", name: "submit_speaker_map", input }],
  };
}

function mockResponses(t: TestContext, ...responses: ReturnType<typeof toolResponse>[]) {
  const requests: Anthropic.MessageCreateParams[] = [];
  const previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
  const { messages } = anthropic();
  if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = previousKey;

  t.mock.method(messages, "create", async (request: Anthropic.MessageCreateParams) => {
    const response = responses[requests.length];
    requests.push(request);
    assert.ok(response, "Unexpected Anthropic request");
    return response;
  });
  return requests;
}

test("speaker mapping retries a truncated response once with more output room", async (t) => {
  const source = transcript();
  const mapping = source.utterances.map(({ cluster }) => ({
    cluster, speaker: "Guest", confidence: "medium", evidence: "The other speakers introduce this voice.",
  }));
  const requests = mockResponses(t,
    toolResponse("max_tokens", { mapping }, 3328),
    toolResponse("tool_use", { mapping, notes: "One cluster may fuse two voices.", distinctSpeakers: 12, mergedClusters: ["A"] }, 3100),
  );

  const resolved = await nameSpeakers(source);
  assert.equal(resolved.speakerMapNotes, "One cluster may fuse two voices.");
  assert.equal(resolved.distinctSpeakers, 12);
  assert.deepEqual(resolved.mergedClusters, ["A"]);
  assert.equal(resolved.speakerMap.K, "Guest");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].max_tokens, 3328);
  assert.deepEqual(requests[1], { ...requests[0], max_tokens: 6656 });
});

test("speaker mapping rejects a second truncation without applying a partial mapping", async (t) => {
  const input = { mapping: [], notes: "Looks complete structurally.", distinctSpeakers: 11 };
  const requests = mockResponses(t,
    toolResponse("max_tokens", input, 3328),
    toolResponse("max_tokens", input, 6656),
  );
  const source = transcript();

  await assert.rejects(nameSpeakers(source), /truncated \(stop_reason=max_tokens, output_tokens=6656\)/);
  assert.deepEqual(source, transcript());
  assert.equal(requests.length, 2);
});

test("speaker mapping rejects missing diagnostics when the provider reports tool_use", async (t) => {
  const requests = mockResponses(t, toolResponse("tool_use", { mapping: [] }, 1024));
  const source = transcript();

  await assert.rejects(nameSpeakers(source), /stop_reason=tool_use[\s\S]*"notes"[\s\S]*"distinctSpeakers"/);
  assert.deepEqual(source, transcript());
  assert.equal(requests.length, 1);
});
