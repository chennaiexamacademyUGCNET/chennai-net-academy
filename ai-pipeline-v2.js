// ============================================================
// Chennai NET Academy — AI Pipeline v2
// 2-Pass: Generate → Verify → Save to review queue
// lib/ai-pipeline-v2.js
// ============================================================

import { createClient } from "@supabase/supabase-js";
import {
  buildGenerationPromptV2,
  buildVerificationPrompt,
  buildStudyNotesPromptV2,
  getGenerationMatrix,
} from "./question-prompts-v2";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── Claude API call (shared) ─────────────────────────────────
async function callClaude(prompt, maxTokens = 4000, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const raw = data.content?.[0]?.text || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      return { success: true, data: JSON.parse(cleaned) };
    } catch (err) {
      if (attempt === maxRetries) return { success: false, error: err.message };
      await sleep(2000 * attempt);
    }
  }
}

// ── Pass 1: Generate questions ────────────────────────────────
async function generateQuestions(topic, difficulty, variant, questionsPerType) {
  const subject = topic.units?.subjects?.name || "Paper I";
  const unit = topic.units?.name || "";

  const prompt = buildGenerationPromptV2({
    subject,
    unit,
    topic: topic.name,
    difficulty,
    variant,
    questionsPerType,
  });

  return callClaude(prompt, 4000);
}

// ── Pass 2: Verify each question ─────────────────────────────
async function verifyQuestion(question) {
  const prompt = buildVerificationPrompt(question);
  const result = await callClaude(prompt, 800);

  if (!result.success) {
    // Verification failed → default to needs_edit (don't auto-approve)
    return {
      is_accurate: false,
      confidence: 5,
      issues: ["Verification API call failed"],
      verdict: "needs_edit",
    };
  }
  return result.data;
}

// ── Save questions to review queue ───────────────────────────
async function saveToReviewQueue(topicId, subjectId, unitId, questions, difficulty, variant) {
  const supabase = getSupabaseAdmin();

  const rows = questions.map((q) => {
    const correctAnswers = q.correct_answers
      ? q.correct_answers
      : q.correct_answer
      ? [q.correct_answer]
      : [];

    return {
      topic_id: topicId,
      subject_id: subjectId,
      unit_id: unitId,
      type: q.type,
      question_text: q.question || q.assertion || "",
      question_data: q,
      options: q.options || [],
      correct_answers: correctAnswers,
      explanation: q.explanation || "",
      difficulty: q.difficulty || difficulty,
      variant,
      confidence_score: q._verificationScore ?? q.confidence ?? 9,
      review_status: q._reviewStatus || "pending",
      review_issues: q._reviewIssues || [],
      is_ai_generated: true,
      created_at: new Date().toISOString(),
    };
  });

  const { data, error } = await supabase
    .from("questions")
    .insert(rows)
    .select("id");

  if (error) throw new Error(`Insert error: ${error.message}`);
  return data?.length || 0;
}

// ── Process one topic × one difficulty × variant ─────────────
export async function processTopicVariant({
  topic,
  difficulty,
  variant,
  questionsPerType = 1,
  skipVerification = false,
  autoApproveThreshold = 8, // confidence ≥ 8 → auto-approve
}) {
  const subject = topic.units?.subjects?.name || "Paper I";
  const unit = topic.units?.name || "";
  const subjectId = topic.units?.subjects?.id;
  const unitId = topic.unit_id;

  console.log(`  ▶ [${difficulty}] variant ${variant}: ${topic.name}`);

  // Pass 1 — Generate
  const genResult = await generateQuestions(topic, difficulty, variant, questionsPerType);
  if (!genResult.success) {
    return { status: "error", error: `Generation failed: ${genResult.error}` };
  }

  const questions = genResult.data?.questions || [];
  if (questions.length === 0) {
    return { status: "error", error: "No questions returned" };
  }

  let approved = 0, pending = 0, rejected = 0;
  const processedQuestions = [];

  for (const q of questions) {
    if (skipVerification) {
      // Skip verify — mark all as pending for manual review
      q._reviewStatus = "pending";
      q._verificationScore = q.confidence || 7;
      q._reviewIssues = ["Verification skipped — manual review required"];
      pending++;
    } else {
      // Pass 2 — Verify
      await sleep(300); // small delay between verification calls
      const verification = await verifyQuestion(q);

      q._verificationScore = verification.confidence || 5;
      q._reviewIssues = verification.issues || [];

      if (verification.verdict === "approve" && verification.confidence >= autoApproveThreshold) {
        q._reviewStatus = "approved";
        // Apply any corrections from verifier
        if (verification.corrected_answer) q.correct_answer = verification.corrected_answer;
        if (verification.corrected_explanation) q.explanation = verification.corrected_explanation;
        approved++;
      } else if (verification.verdict === "reject" || verification.confidence < 6) {
        q._reviewStatus = "rejected";
        rejected++;
      } else {
        q._reviewStatus = "pending"; // needs human review
        pending++;
      }
    }

    processedQuestions.push(q);
  }

  // Save all (approved + pending) — skip rejected
  const toSave = processedQuestions.filter((q) => q._reviewStatus !== "rejected");

  let saved = 0;
  if (toSave.length > 0) {
    saved = await saveToReviewQueue(
      topic.id, subjectId, unitId,
      toSave, difficulty, variant
    );
  }

  return {
    status: "success",
    topicName: topic.name,
    difficulty,
    variant,
    generated: questions.length,
    approved,
    pending,
    rejected,
    saved,
  };
}

// ── Process all topics — full matrix ─────────────────────────
export async function runPipelineV2({
  subjectFilter = null,
  questionsPerType = 1,
  skipVerification = false,
  pendingOnly = true,
  delayBetweenCalls = 1200,
  onProgress = null,
}) {
  const topics = pendingOnly
    ? await fetchPendingTopicsV2(subjectFilter)
    : await fetchAllTopicsV2(subjectFilter);

  const matrix = getGenerationMatrix(questionsPerType);
  const totalJobs = topics.length * matrix.length; // topics × (difficulty × variant)

  console.log(`\n🚀 Pipeline v2 — ${topics.length} topics × ${matrix.length} variants = ${totalJobs} jobs`);

  const results = {
    totalTopics: topics.length,
    totalJobs,
    completedJobs: 0,
    failedJobs: 0,
    totalGenerated: 0,
    totalApproved: 0,
    totalPending: 0,
    totalRejected: 0,
    errors: [],
    startedAt: new Date().toISOString(),
  };

  let jobCount = 0;

  for (const topic of topics) {
    // Generate study notes first (once per topic)
    await generateAndSaveStudyNotes(topic);
    await sleep(800);

    for (const { difficulty, variant } of matrix) {
      jobCount++;
      const progress = {
        current: jobCount,
        total: totalJobs,
        percent: Math.round((jobCount / totalJobs) * 100),
        currentTopic: topic.name,
        difficulty,
        variant,
      };

      if (onProgress) onProgress({ ...progress, results });

      const outcome = await processTopicVariant({
        topic,
        difficulty,
        variant,
        questionsPerType,
        skipVerification,
      });

      if (outcome.status === "success") {
        results.completedJobs++;
        results.totalGenerated += outcome.generated || 0;
        results.totalApproved += outcome.approved || 0;
        results.totalPending += outcome.pending || 0;
        results.totalRejected += outcome.rejected || 0;
      } else {
        results.failedJobs++;
        results.errors.push({
          topic: topic.name, difficulty, variant, error: outcome.error,
        });
      }

      await sleep(delayBetweenCalls);
    }
  }

  results.finishedAt = new Date().toISOString();
  return results;
}

// ── Generate and save study notes ────────────────────────────
export async function generateAndSaveStudyNotes(topic) {
  const supabase = getSupabaseAdmin();
  const subject = topic.units?.subjects?.name || "Paper I";
  const unit = topic.units?.name || "";

  const prompt = buildStudyNotesPromptV2(subject, unit, topic.name);
  const result = await callClaude(prompt, 1500);

  if (!result.success) return;

  const { error } = await supabase
    .from("topics")
    .update({
      study_notes: result.data.study_notes,
      key_points: result.data.key_points || [],
      ai_generated_at: new Date().toISOString(),
    })
    .eq("id", topic.id);

  if (error) console.error("Study notes save error:", error.message);
}

// ── Fetch helpers ─────────────────────────────────────────────
export async function fetchAllTopicsV2(subjectFilter = null) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("topics").select(`
    id, name, unit_id,
    units ( id, name, subject_id,
      subjects ( id, name )
    )
  `).order("id");

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  if (subjectFilter && subjectFilter !== "all") {
    return (data || []).filter(
      (t) => t.units?.subjects?.name === subjectFilter
    );
  }
  return data || [];
}

export async function fetchPendingTopicsV2(subjectFilter = null) {
  const supabase = getSupabaseAdmin();

  // Topics with 0 questions
  const { data: doneIds } = await supabase
    .from("questions")
    .select("topic_id")
    .not("topic_id", "is", null);

  const completedIds = [...new Set((doneIds || []).map((r) => r.topic_id))];

  let query = supabase.from("topics").select(`
    id, name, unit_id,
    units ( id, name, subject_id,
      subjects ( id, name )
    )
  `).order("id");

  if (completedIds.length > 0) {
    query = query.not("id", "in", `(${completedIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  if (subjectFilter && subjectFilter !== "all") {
    return (data || []).filter(
      (t) => t.units?.subjects?.name === subjectFilter
    );
  }
  return data || [];
}

// ── Review queue stats ────────────────────────────────────────
export async function getReviewStats() {
  const supabase = getSupabaseAdmin();

  const [total, approved, pending, rejected, topics] = await Promise.all([
    supabase.from("questions").select("id", { count: "exact", head: true }),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("review_status", "approved"),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("review_status", "rejected"),
    supabase.from("topics").select("id", { count: "exact", head: true }),
  ]);

  return {
    total: total.count || 0,
    approved: approved.count || 0,
    pending: pending.count || 0,
    rejected: rejected.count || 0,
    totalTopics: topics.count || 0,
    approvalRate: total.count
      ? Math.round(((approved.count || 0) / total.count) * 100)
      : 0,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
