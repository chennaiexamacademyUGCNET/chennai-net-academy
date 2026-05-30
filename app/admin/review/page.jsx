"use client";
// ============================================================
// Chennai NET Academy — Admin Review Queue
// app/admin/review/page.jsx
// ============================================================

import { useState, useEffect, useCallback } from "react";

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET || "";

const TYPE_LABELS = {
  mcq_single: "MCQ Single",
  mcq_multiple: "MCQ Multiple",
  true_false: "True/False",
  assertion_reason: "Assertion-Reason",
  match_following: "Match Following",
  sequence_order: "Sequence Order",
  fill_blanks: "Fill Blanks",
  statement_based: "Statement Based",
};

const DIFFICULTY_COLORS = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  hard: "bg-red-100 text-red-700",
};

const STATUS_COLORS = {
  pending: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  needs_edit: "bg-purple-100 text-purple-700",
};

function adminFetch(url, opts = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": ADMIN_SECRET,
      ...(opts.headers || {}),
    },
  });
}

// ── Confidence badge ─────────────────────────────────────────
function ConfidenceBadge({ score }) {
  const color =
    score >= 8 ? "bg-green-500" : score >= 6 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs font-semibold text-gray-600">{score}/10</span>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  const colors = {
    gray: "border-gray-200 text-gray-700",
    green: "border-green-200 text-green-700",
    orange: "border-orange-200 text-orange-700",
    red: "border-red-200 text-red-700",
    purple: "border-purple-200 text-purple-700",
  };
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value ?? "—"}</div>
      <div className="text-xs mt-1 font-medium opacity-80">{label}</div>
    </div>
  );
}

// ── Question Card ─────────────────────────────────────────────
function QuestionCard({ question, onAction, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(question.question_text);
  const [editExpl, setEditExpl] = useState(question.explanation);
  const [loading, setLoading] = useState(false);

  const qData = question.question_data || {};
  const issues = question.review_issues || [];

  async function handleAction(action) {
    setLoading(true);
    const body = { action, question_id: question.id };
    if (action === "edit_approve") {
      body.edits = { question_text: editText, explanation: editExpl };
    }
    await onAction(body);
    setLoading(false);
    setEditing(false);
  }

  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden transition-all ${
        selected ? "border-indigo-400 shadow-md" : "border-gray-200"
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect(question.id)}
          className="mt-1 rounded"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
              {TYPE_LABELS[question.type] || question.type}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[question.difficulty]}`}>
              {question.difficulty}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[question.review_status]}`}>
              {question.review_status}
            </span>
            <ConfidenceBadge score={question.confidence_score} />
            <span className="text-xs text-gray-400 ml-auto">
              #{question.id} · {question.topics?.name}
            </span>
          </div>

          {/* Question text */}
          {editing ? (
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 min-h-16"
            />
          ) : (
            <p
              className="text-sm text-gray-800 cursor-pointer"
              onClick={() => setExpanded(!expanded)}
            >
              {question.question_text}
            </p>
          )}

          {/* Issues */}
          {issues.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {issues.map((issue, i) => (
                <span key={i} className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full">
                  ⚠ {issue}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {(expanded || editing) && (
        <div className="px-4 pb-3 border-t border-gray-50 pt-3 space-y-2">
          {/* Options */}
          {(question.options || []).length > 0 && (
            <div className="space-y-1">
              {(question.options || []).map((opt, i) => {
                const letter = opt[0];
                const isCorrect = (question.correct_answers || []).includes(letter);
                return (
                  <div
                    key={i}
                    className={`text-sm px-3 py-1.5 rounded-lg ${
                      isCorrect
                        ? "bg-green-50 text-green-800 font-medium"
                        : "bg-gray-50 text-gray-600"
                    }`}
                  >
                    {isCorrect && "✓ "}
                    {opt}
                  </div>
                );
              })}
            </div>
          )}

          {/* Assertion-Reason special display */}
          {question.type === "assertion_reason" && (
            <div className="text-sm text-gray-600 space-y-1">
              <div className="px-3 py-1.5 bg-blue-50 rounded-lg">{qData.assertion}</div>
              <div className="px-3 py-1.5 bg-purple-50 rounded-lg">{qData.reason}</div>
            </div>
          )}

          {/* Explanation */}
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            {editing ? (
              <>
                <div className="font-medium mb-1">Explanation:</div>
                <textarea
                  value={editExpl}
                  onChange={(e) => setEditExpl(e.target.value)}
                  className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none"
                  rows={2}
                />
              </>
            ) : (
              <>
                <span className="font-medium">Explanation: </span>
                {question.explanation}
              </>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      {question.review_status === "pending" || question.review_status === "needs_edit" ? (
        <div className="px-4 py-2 border-t border-gray-50 flex gap-2 flex-wrap">
          {!editing ? (
            <>
              <button
                onClick={() => handleAction("approve")}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => { setEditing(true); setExpanded(true); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-indigo-50 hover:bg-indigo-100"
              >
                ✎ Edit
              </button>
              <button
                onClick={() => handleAction("reject")}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
              >
                ✕ Reject
              </button>
              <button
                onClick={() => setExpanded(!expanded)}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-600"
              >
                {expanded ? "▲ Less" : "▼ More"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleAction("edit_approve")}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                ✓ Save & Approve
              </button>
              <button
                onClick={() => { setEditing(false); setEditText(question.question_text); setEditExpl(question.explanation); }}
                className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400">
          {question.review_status === "approved" ? "✅ Approved" : "❌ Rejected"} · {question.reviewed_at?.slice(0, 10)}
        </div>
      )}
    </div>
  );
}

// ── Main Review Page ──────────────────────────────────────────
export default function ReviewPage() {
  const [stats, setStats] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState("pending");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [diffFilter, setDiffFilter] = useState("all");
  const [page, setPage] = useState(1);

  const fetchStats = useCallback(async () => {
    const res = await adminFetch("/api/admin/review?stats=1");
    const data = await res.json();
    if (data.success) setStats(data.stats);
  }, []);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: statusFilter, page, limit: 20 });
    if (subjectFilter !== "all") params.set("subject", subjectFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (diffFilter !== "all") params.set("difficulty", diffFilter);

    const res = await adminFetch(`/api/admin/review?${params}`);
    const data = await res.json();
    if (data.success) {
      setQuestions(data.questions || []);
      setPagination(data.pagination);
    }
    setLoading(false);
    setSelectedIds(new Set());
  }, [statusFilter, subjectFilter, typeFilter, diffFilter, page]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  async function handleAction(body) {
    const res = await adminFetch("/api/admin/review", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      await fetchQuestions();
      await fetchStats();
    }
  }

  async function bulkApprove() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    await handleAction({ action: "bulk_approve", question_ids: [...selectedIds] });
    setBulkLoading(false);
  }

  async function autoApproveHighConfidence() {
    setBulkLoading(true);
    await handleAction({ action: "auto_approve_high_confidence", threshold: 8 });
    setBulkLoading(false);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map((q) => q.id)));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🔍 Question Review Queue</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review AI-generated questions before they go live to students
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total Questions" value={stats?.total} color="gray" />
        <StatCard label="✅ Approved" value={stats?.approved} color="green" />
        <StatCard label="⏳ Pending" value={stats?.pending} color="orange" />
        <StatCard label="✎ Needs Edit" value={stats?.needsEdit} color="purple" />
        <StatCard label="❌ Rejected" value={stats?.rejected} color="red" />
      </div>

      {/* Approval rate */}
      {stats && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Approval Rate</span>
            <span className="font-semibold">{stats.approvalRate}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: `${stats.approvalRate}%` }}
            />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Status",
              value: statusFilter,
              set: setStatusFilter,
              options: [
                ["pending", "Pending"],
                ["approved", "Approved"],
                ["rejected", "Rejected"],
                ["needs_edit", "Needs Edit"],
              ],
            },
            {
              label: "Subject",
              value: subjectFilter,
              set: setSubjectFilter,
              options: [
                ["all", "All Subjects"],
                ["Paper I", "Paper I"],
                ["Environmental Sciences", "Env Sciences"],
              ],
            },
            {
              label: "Type",
              value: typeFilter,
              set: setTypeFilter,
              options: [
                ["all", "All Types"],
                ...Object.entries(TYPE_LABELS),
              ],
            },
            {
              label: "Difficulty",
              value: diffFilter,
              set: setDiffFilter,
              options: [
                ["all", "All Levels"],
                ["easy", "Easy"],
                ["medium", "Medium"],
                ["hard", "Hard"],
              ],
            },
          ].map(({ label, value, set, options }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <select
                value={value}
                onChange={(e) => { set(e.target.value); setPage(1); }}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {options.map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          onClick={selectAll}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          {selectedIds.size === questions.length && questions.length > 0 ? "Deselect All" : "Select All"}
        </button>
        {selectedIds.size > 0 && (
          <button
            onClick={bulkApprove}
            disabled={bulkLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            ✓ Approve Selected ({selectedIds.size})
          </button>
        )}
        {statusFilter === "pending" && (
          <button
            onClick={autoApproveHighConfidence}
            disabled={bulkLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            ⚡ Auto-Approve Confidence ≥ 8
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {pagination.total} questions · Page {page}/{pagination.pages}
        </span>
      </div>

      {/* Question list */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading questions...</div>
      ) : questions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">✅</div>
          <div className="font-medium">No questions in this queue</div>
          <div className="text-sm mt-1">All caught up!</div>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              selected={selectedIds.has(q.id)}
              onSelect={toggleSelect}
              onAction={handleAction}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-40 hover:bg-gray-50"
          >
            ← Prev
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-500">
            {page} / {pagination.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
            disabled={page === pagination.pages}
            className="px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-700 disabled:opacity-40 hover:bg-gray-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
