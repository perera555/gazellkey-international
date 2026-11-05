import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { isAssistantEnabled, runAssistant } from "@/lib/assistant";
import { handleError } from "@/utils/handleError";

// Website chat assistant. The browser sends the conversation so far (text
// only, newest last); the reply streams back as plain text.
//   POST /api/chat  { messages: [{ role: "user" | "assistant", content }] }

const MAX_HISTORY = 12; // only the latest turns are sent to Claude (cost)
const MAX_MESSAGE_LENGTH = 1500;

const ChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(60),
});

// Simple per-visitor limit (in memory - one server): 20 messages per 10 minutes
const WINDOW_MS = 10 * 60_000;
const LIMIT = 20;
const recent = new Map<string, number[]>();

function allowed(visitor: string) {
  const now = Date.now();
  const times = (recent.get(visitor) ?? []).filter((time) => now - time < WINDOW_MS);
  if (times.length >= LIMIT) {
    recent.set(visitor, times);
    return false;
  }
  times.push(now);
  recent.set(visitor, times);
  if (recent.size > 5000) {
    recent.clear(); // keep memory bounded
  }
  return true;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAssistantEnabled()) {
      return NextResponse.json(
        { message: "The chat assistant is not set up yet. Please use the Contact page and our team will help you." },
        { status: 503 },
      );
    }
    const visitor = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
    if (!allowed(visitor)) {
      return NextResponse.json(
        { message: "You have sent a lot of messages. Please wait a few minutes, or contact our team directly." },
        { status: 429 },
      );
    }

    const body = ChatRequestSchema.parse(await request.json());
    // the conversation must start with the visitor and end with their new message
    let history = body.messages.slice(-MAX_HISTORY);
    while (history.length > 0 && history[0].role != "user") {
      history = history.slice(1);
    }
    const last = history.at(-1);
    if (last == undefined || last.role != "user") {
      return NextResponse.json({ message: "Please type a message." }, { status: 400 });
    }
    if (last.content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ message: `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.` }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          await runAssistant(history, (text) => controller.enqueue(encoder.encode(text)));
        } catch (error) {
          console.error("Chat assistant failed", error);
          const busy = error instanceof Anthropic.RateLimitError || (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500);
          controller.enqueue(
            encoder.encode(
              busy
                ? "\n\nSorry, the assistant is busy right now. Please try again in a minute, or contact our team."
                : "\n\nSorry, something went wrong. Please try again, or contact our team on the Contact page.",
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    return handleError(error);
  }
}
