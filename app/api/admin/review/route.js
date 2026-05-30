// ============================================================
// Chennai NET Academy — Admin Review Queue API
// app/api/admin/review/route.js
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function isAdmin(req) {
  return req.headers.get("x-admin-secret") === process.env.ADMIN_SECRET_KEY;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── GET — fetch questions for review ────────────────────────
export async function GET(request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status   = searchParams.get("status") || "pending";
  const subject  = searchParams.get("subject") || null;
  const type     = searchParams.get("type") || null;
  const difficulty = searchParams.get("difficulty") || null;
  const page     = parseInt(searchParams.get("page") || "1");
  const limit    = parseInt(searchParams.get("limit") || "20");
  const offset   = (page - 1) * limit;

  const supabase = getSupabaseAdmin();

  // Stats mode
  if (searchParams.get("stats") === "1") {
    const [total, approved, pending, rejected, needsEdit] = await Promise.all([
      supabase.from("questions").select("id", { count: "exact", head: true }),
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("review_status", "approved"),
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("review_status", "rejected"),
      supabase.from("questions").select("id", { count: "exact", head: true }).eq("review_status", "needs_edit"),
    ]);
    return NextResponse.json({
      success: true,
      stats: {
        total: total.count || 0,
        approved: approved.count || 0,
        pending: pending.count || 0,
        rejected: rejected.count || 0,
        needsEdit: needsEdit.count || 0,
        approvalRate: total.count
          ? Math.round(((approved.count || 0) / total.count) * 100) : 0,
      },
    });
  }

  // Fetch questions with joins
  let query = supabase
    .from("questions")
    .select(`
      id, type, question_text, question_data, options,
      correct_answers, explanation, difficulty, variant,
      confidence_score, review_status, review_issues,
      created_at, topic_id, subject_id, unit_id,
      topics ( name ),
      subjects ( name ),
      units ( name )
    `, { count: "exact" })
    .eq("review_status", status)
    .order("confidence_score", { ascending: true })
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (subject && subject !== "all") {
    query = query.eq("subjects.name", subject);
  }
  if (type) query = query.eq("type", type);
  if (difficulty) query = query.eq("difficulty", difficulty);

  const { data: questions, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    questions: questions || [],
    pagination: { page, limit, total: count || 0, pages: Math.ceil((count || 0) / limit) },
  });
}

// ── POST — review actions ────────────────────────────────────
export async function POST(request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, question_id, question_ids, edits } = body;
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  // ── Approve single ──────────────────────────────────────
  if (action === "approve" && question_id) {
    const { error } = await supabase
      .from("questions")
      .update({ review_status: "approved", reviewed_at: now, reviewed_by: "admin" })
      .eq("id", question_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "approved", id: question_id });
  }

  // ── Reject single ───────────────────────────────────────
  if (action === "reject" && question_id) {
    const { error } = await supabase
      .from("questions")
      .update({ review_status: "rejected", reviewed_at: now, reviewed_by: "admin" })
      .eq("id", question_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "rejected", id: question_id });
  }

  // ── Edit + approve ──────────────────────────────────────
  if (action === "edit_approve" && question_id && edits) {
    const updates = {
      review_status: "approved",
      reviewed_at: now,
      reviewed_by: "admin",
    };
    if (edits.question_text)  updates.question_text  = edits.question_text;
    if (edits.correct_answers) updates.correct_answers = edits.correct_answers;
    if (edits.explanation)     updates.explanation    = edits.explanation;
    if (edits.options)         updates.options        = edits.options;
    // Merge edited fields into question_data too
    if (edits.question_data)   updates.question_data  = edits.question_data;

    const { error } = await supabase
      .from("questions")
      .update(updates)
      .eq("id", question_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "edited_and_approved", id: question_id });
  }

  // ── Bulk approve (high confidence) ─────────────────────
  if (action === "bulk_approve" && question_ids?.length > 0) {
    const { error } = await supabase
      .from("questions")
      .update({ review_status: "approved", reviewed_at: now, reviewed_by: "admin_bulk" })
      .in("id", question_ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, action: "bulk_approved", count: question_ids.length });
  }

  // ── Auto-approve all high confidence pending ────────────
  if (action === "auto_approve_high_confidence") {
    const threshold = body.threshold || 8;
    const { data, error } = await supabase
      .from("questions")
      .update({ review_status: "approved", reviewed_at: now, reviewed_by: "auto" })
      .eq("review_status", "pending")
      .gte("confidence_score", threshold)
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true,
      action: "auto_approved",
      count: data?.length || 0,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
