import { config as loadEnv } from "dotenv";
import {
  config,
  higgsfield,
  HiggsfieldError,
  TimeoutError,
  type V2Response,
} from "@higgsfield/client/v2";

// Load HF_CREDENTIALS ("key-id:key-secret") from .env.local at runtime.
// quiet: true keeps dotenv from logging anything about the file's contents.
loadEnv({ path: ".env.local", quiet: true });

const MODEL = "bytedance/seedance-2.5/text-to-video";

async function main(): Promise<number> {
  const credentials = process.env.HF_CREDENTIALS;
  if (!credentials || !credentials.includes(":")) {
    console.error(
      "HF_CREDENTIALS is missing or not in key-id:key-secret format. Add it to .env.local.",
    );
    return 1;
  }

  config({
    credentials,
    // Video generation often takes longer than the SDK's 5-minute default.
    maxPollTime: 15 * 60 * 1000,
    pollInterval: 5000,
  });

  console.log(`Submitting request to ${MODEL} and waiting for completion...`);

  let result: V2Response;
  try {
    result = await higgsfield.subscribe(MODEL, {
      input: {
        prompt: "A cinematic scene at sunset",
        duration: 5,
        resolution: "720p",
        aspect_ratio: "16:9",
      },
      withPolling: true,
    });
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.error(`Timed out waiting for the generation: ${err.message}`);
    } else if (err instanceof HiggsfieldError) {
      console.error(`Higgsfield API error (${err.name}): ${err.message}`);
    } else {
      console.error("Unexpected error:", err instanceof Error ? err.message : err);
    }
    return 1;
  }

  // The API may report statuses beyond the SDK's typed union (e.g. canceled),
  // so compare as a plain string.
  const status = String(result.status);
  const requestId = result.request_id;

  switch (status) {
    case "completed": {
      const url = result.video?.url;
      if (!url) {
        console.error(`Request ${requestId} completed but returned no video URL.`);
        return 1;
      }
      console.log(`Request ${requestId} completed.`);
      console.log(`Video URL: ${url}`);
      return 0;
    }
    case "nsfw":
      console.error(`Request ${requestId} was blocked by content moderation (nsfw).`);
      return 1;
    case "failed":
      console.error(`Request ${requestId} failed.`);
      return 1;
    case "canceled":
    case "cancelled":
      console.error(`Request ${requestId} was canceled.`);
      return 1;
    default:
      console.error(`Request ${requestId} ended with unexpected status "${status}".`);
      return 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});
