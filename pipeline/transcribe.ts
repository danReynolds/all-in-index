import { AssemblyAI } from "assemblyai";
import { ASSEMBLYAI_API_KEY } from "./config";
import type { Episode, Transcript, Utterance } from "../lib/types";

export interface TranscribeOpts {
  /** Optional exact speaker-count hint for diarization. Omit to auto-detect. */
  speakersExpected?: number;
}

/**
 * Submit the episode audio to AssemblyAI with diarization and word timestamps,
 * polling until the transcript is ready. Speakers come back as anonymous
 * clusters ("A", "B", …) — the naming pass (speakers.ts) resolves them to hosts.
 */
export async function transcribeEpisode(
  ep: Episode,
  opts: TranscribeOpts = {},
): Promise<Transcript> {
  const client = new AssemblyAI({ apiKey: ASSEMBLYAI_API_KEY() });

  console.log(`  → submitting audio to AssemblyAI (this can take several minutes)…`);
  const t = await client.transcripts.transcribe({
    audio: ep.audioUrl,
    speaker_labels: true,
    ...(opts.speakersExpected ? { speakers_expected: opts.speakersExpected } : {}),
  });

  if (t.status === "error") {
    throw new Error(`AssemblyAI transcription failed: ${t.error}`);
  }

  const rawUtterances = t.utterances ?? [];
  if (rawUtterances.length === 0) {
    throw new Error(
      "Transcript completed but contained no diarized utterances " +
        "(speaker_labels may have failed for this audio).",
    );
  }

  const utterances: Utterance[] = rawUtterances.map((u) => ({
    cluster: u.speaker,
    speaker: "Unknown", // resolved by the naming pass
    text: u.text,
    startMs: u.start,
    endMs: u.end,
  }));

  const clusters = [...new Set(utterances.map((u) => u.cluster))];
  console.log(
    `  ✓ transcript ready: ${utterances.length} utterances, ${clusters.length} speaker clusters (${clusters.join(", ")})`,
  );

  return {
    episodeId: ep.id,
    provider: "assemblyai",
    speakerMap: {},
    utterances,
    meta: {
      transcriptId: t.id,
      audioDurationSec: t.audio_duration ?? null,
      speechModel: t.speech_model ?? null,
    },
  };
}
