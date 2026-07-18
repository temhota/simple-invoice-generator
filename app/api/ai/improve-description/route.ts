import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
  descriptionImprovementInstructions,
  descriptionImprovementRequestSchema,
  descriptionImprovementSchema,
} from "@/lib/ai-description";
import { consumeAiDescriptionRequest } from "@/lib/database";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  const input = descriptionImprovementRequestSchema.safeParse(payload);
  if (!input.success) {
    return NextResponse.json(
      { error: input.error.issues[0]?.message ?? "Invalid description" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI suggestions are not configured yet." }, { status: 503 });
  }

  if (!await consumeAiDescriptionRequest(userId)) {
    return NextResponse.json({ error: "Daily AI suggestion limit reached. Try again later." }, { status: 429 });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const response = await openai.responses.parse({
      model: "gpt-5-nano",
      instructions: descriptionImprovementInstructions,
      input: input.data.description,
      max_output_tokens: 500,
      reasoning: { effort: "minimal" },
      store: false,
      safety_identifier: createHash("sha256").update(userId).digest("hex"),
      text: {
        format: zodTextFormat(descriptionImprovementSchema, "invoice_description_improvement"),
      },
    });

    if (!response.output_parsed) {
      return NextResponse.json({ error: "AI could not produce a suggestion." }, { status: 502 });
    }

    return NextResponse.json({ improvement: response.output_parsed });
  } catch (error) {
    console.error("OpenAI description improvement failed", error);
    return NextResponse.json({ error: "AI suggestion is temporarily unavailable." }, { status: 502 });
  }
}
