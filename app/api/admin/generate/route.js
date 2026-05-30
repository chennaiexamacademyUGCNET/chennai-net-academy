// ============================================================
// Chennai NET Academy — Admin Generate API v2
// app/api/admin/generate/route.js  (REPLACE previous version)
// ============================================================

import { NextResponse } from "next/server";
import {
  runPipelineV2,
  processTopicVariant,
  getReviewStats,
  fetchAllTopicsV2,
} from "@/lib/ai-pipeline-v2";
import { createClient } from "@supabase/supabase-js";

function isAdmin(req) {
  return req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET_KEY;
}

// ── GET — status + SSE stream ────────────────────────────────
export async function GET(request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // Status fetch
  if (searchParams.get("status") === "1") {
    try {
      const stats = await getReviewStats();
      return NextResponse.json({ success: true, status: stats });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // SSE stream for batch run
  if (searchParams.get("stream") === "1") {
    const encoder = new TextEncoder();
    const subject          = searchParams.get("subject") || null;
    const questionsPerType = parseInt(searchParams.get("qpt") || "1");
    const pendingOnly      = searchParams.get("pending_only") !== "false";
    const skipVerification = searchParams.get("skip_verify") === "1";

    const stream = new ReadableStream({
      async start(controller) {
        function send(data) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }
        try {
          send({ type: "start", message: "Pipeline v2 starting..." });

          await runPipelineV2({
            subjectFilter: subject,
            questionsPerType,
            pendingOnly,
            skipVerification,
            delayBetweenCalls: 1200,
            onProgress: (progress) => send({ type: "progress", ...progress }),
          });

          const finalStats = await getReviewStats();
          send({ type: "complete", status: finalStats });
        } catch (err) {
          send({ type: "error", message: err.message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

// ── POST — single topic or batch ─────────────────────────────
export async function POST(request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    mode,
    topic_id,
    subject,
    questions_per_type = 1,
    difficulty = "medium",
    variant = 1,
    skip_verification = false,
  } = body;

  // ── Single topic + single difficulty/variant ────────────
  if (mode === "single" && topic_id) {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { data: topic, error } = await supabase
        .from("topics")
        .select(`id, name, unit_id, units(id, name, subject_id, subjects(id, name))`)
        .eq("id", topic_id)
        .single();

      if (error || !topic) {
        return NextResponse.json({ error: "Topic not found" }, { status: 404 });
      }

      const result = await processTopicVariant({
        topic,
        difficulty,
        variant,
        questionsPerType: questions_per_type,
        skipVerification: skip_verification,
      });

      return NextResponse.json({ success: result.status === "success", result });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // ── Batch ───────────────────────────────────────────────
  if (mode === "batch") {
    try {
      const results = await runPipelineV2({
        subjectFilter: subject || null,
        questionsPerType: questions_per_type,
        pendingOnly: body.pending_only !== false,
        skipVerification: skip_verification,
        delayBetweenCalls: 1200,
      });
      return NextResponse.json({ success: true, results });
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
}
