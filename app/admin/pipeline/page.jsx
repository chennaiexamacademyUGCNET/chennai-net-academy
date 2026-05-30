"use client";
// ============================================================
// Chennai NET Academy — Admin AI Pipeline Dashboard
// app/admin/pipeline/page.jsx
// ============================================================

import { useState, useEffect, useRef, useCallback } from "react";

const ADMIN_SECRET =
  process.env.NEXT_PUBLIC_ADMIN_SECRET || "admin-secret-change-me";

// ── Helpers ──────────────────────────────────────────────────
function adminFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": ADMIN_SECRET,
      ...(options.headers || {}),
    },
  });
}

// ── Status card component ────────────────────────────────────
function StatCard({ label, value, sub, color = "indigo" }) {
  const colors = {
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-700",
    green: "bg-green-50 border-green-200 text-green-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold">{value ?? "—"}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
      {sub && <div className="text-xs mt-1 opacity-70">{sub}</div>}
    </div>
  );
}

// ── Log entry component ──────────────────────────────────────
function LogEntry({ entry }) {
  const isErr = entry.status === "error";
  return (
    <div
      className={`text-xs px-3 py-1.5 rounded flex items-start gap-2 ${
        isErr ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
      }`}
    >
      <span>{isErr ? "❌" : "✅"}</span>
      <span className="font-medium">{entry.topicName}</span>
      {!isErr && (
        <span className="opacity-70 ml-auto">
          {entry.questionsGenerated} Qs
        </span>
      )}
      {isErr && <span className="opacity-70 ml-auto truncate">{entry.error}</span>}
    </div>
  );
}

// ── Main Pipeline Page ────────────────────────────────────────
export default function PipelinePage() {
  const [status, setStatus] = useState(null);
  const [topics, setTopics] = useState([]);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Batch run state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [log, setLog] = useState([]);
  const [batchDone, setBatchDone] = useState(false);

  // Single topic state
  const [singleTopicId, setSingleTopicId] = useState("");
  const [singleRunning, setSingleRunning] = useState(false);
  const [singleResult, setSingleResult] = useState(null);

  // Config
  const [subject, setSubject] = useState("all");
  const [questionsPerType, setQuestionsPerType] = useState(2);
  const [pendingOnly, setPendingOnly] = useState(true);

  const logEndRef = useRef(null);
  const esRef = useRef(null);

  // ── Fetch status & topics on load ────────────────────────
  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await adminFetch("/api/admin/generate?status=1");
      const data = await res.json();
      if (data.success) setStatus(data.status);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const fetchTopics = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/topics"); // you'll add this route
      const data = await res.json();
      if (data.success) setTopics(data.topics || []);
    } catch {}
  }, []);

  useEffect(() => {
    refreshStatus();
    fetchTopics();
  }, [refreshStatus, fetchTopics]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  // ── Start batch pipeline via SSE ──────────────────────────
  function startBatchPipeline() {
    if (running) return;
    setRunning(true);
    setBatchDone(false);
    setProgress(null);
    setLog([]);

    const params = new URLSearchParams({
      stream: "1",
      qpt: questionsPerType,
      pending_only: pendingOnly ? "true" : "false",
    });
    if (subject !== "all") params.set("subject", subject);

    const es = new EventSource(
      `/api/admin/generate?${params.toString()}&secret=${ADMIN_SECRET}`
    );
    esRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "start") {
        setLog((prev) => [
          ...prev,
          { type: "info", text: msg.message },
        ]);
      }

      if (msg.type === "progress") {
        setProgress({
          current: msg.current,
          total: msg.total,
          percent: msg.percent,
          currentTopic: msg.currentTopic,
        });
        if (msg.results?.log?.length > 0) {
          const latest = msg.results.log[msg.results.log.length - 1];
          setLog((prev) => {
            // Avoid duplicate log entries
            if (prev.find((p) => p.topicId === latest.topicId)) return prev;
            return [...prev, latest];
          });
        }
      }

      if (msg.type === "complete") {
        setRunning(false);
        setBatchDone(true);
        setStatus(msg.status);
        es.close();
      }

      if (msg.type === "error") {
        setRunning(false);
        setLog((prev) => [
          ...prev,
          { type: "info", text: `❌ Error: ${msg.message}` },
        ]);
        es.close();
      }
    };

    es.onerror = () => {
      setRunning(false);
      es.close();
    };
  }

  function stopPipeline() {
    esRef.current?.close();
    setRunning(false);
  }

  // ── Single topic generate ─────────────────────────────────
  async function runSingleTopic() {
    if (!singleTopicId || singleRunning) return;
    setSingleRunning(true);
    setSingleResult(null);
    try {
      const res = await adminFetch("/api/admin/generate", {
        method: "POST",
        body: JSON.stringify({
          mode: "single",
          topic_id: parseInt(singleTopicId),
          questions_per_type: questionsPerType,
        }),
      });
      const data = await res.json();
      setSingleResult(data);
      if (data.success) refreshStatus();
    } catch (e) {
      setSingleResult({ success: false, error: e.message });
    } finally {
      setSingleRunning(false);
    }
  }

  // ── Completion % color ────────────────────────────────────
  const pct = status?.completionPercent || 0;
  const pctColor =
    pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-yellow-400" : "bg-red-400";

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          🤖 AI Question Pipeline
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Syllabus → Claude API → Questions + Study Notes → Supabase
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Topics"
          value={status?.totalTopics}
          color="blue"
        />
        <StatCard
          label="Topics Generated"
          value={status?.topicsGenerated}
          sub={`${pct}% done`}
          color="green"
        />
        <StatCard
          label="Pending Topics"
          value={status?.topicsPending}
          color="orange"
        />
        <StatCard
          label="Questions in DB"
          value={status?.totalQuestions}
          sub="All AI-generated"
          color="indigo"
        />
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Overall Completion</span>
          <span className="font-semibold">{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${pctColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-gray-400">
          {status?.topicsWithNotes || 0} topics have study notes
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">⚙️ Pipeline Config</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Subject Filter
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="all">All Subjects</option>
              <option value="Paper I">Paper I (General)</option>
              <option value="Environmental Sciences">Environmental Sciences</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Questions per Type
            </label>
            <select
              value={questionsPerType}
              onChange={(e) => setQuestionsPerType(parseInt(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value={1}>1 per type (8 total)</option>
              <option value={2}>2 per type (16 total)</option>
              <option value={3}>3 per type (24 total)</option>
              <option value={5}>5 per type (40 total)</option>
            </select>
          </div>

          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pendingOnly}
                onChange={(e) => setPendingOnly(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-600">Pending topics only</span>
            </label>
          </div>
        </div>
      </div>

      {/* Batch Run */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">🚀 Batch Generation</h2>

        <div className="flex gap-3 mb-4">
          <button
            onClick={startBatchPipeline}
            disabled={running}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all ${
              running
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
            }`}
          >
            {running ? "⏳ Running..." : "▶ Start Pipeline"}
          </button>
          {running && (
            <button
              onClick={stopPipeline}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 active:scale-95"
            >
              ⏹ Stop
            </button>
          )}
          <button
            onClick={refreshStatus}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95"
          >
            🔄 Refresh
          </button>
        </div>

        {/* Live progress */}
        {progress && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>
                Processing: <strong>{progress.currentTopic}</strong>
              </span>
              <span>
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {batchDone && (
          <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
            ✅ Pipeline complete! {status?.totalQuestions} questions in DB.
          </div>
        )}

        {/* Log */}
        {log.length > 0 && (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
              Generation Log ({log.filter((l) => l.status).length} topics
              processed)
            </div>
            <div className="max-h-60 overflow-y-auto p-2 space-y-1">
              {log.map((entry, i) =>
                entry.type === "info" ? (
                  <div key={i} className="text-xs text-gray-500 px-2 py-1">
                    {entry.text}
                  </div>
                ) : (
                  <LogEntry key={i} entry={entry} />
                )
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Single Topic */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-4">🎯 Single Topic Generate</h2>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Topic ID
            </label>
            <input
              type="number"
              value={singleTopicId}
              onChange={(e) => setSingleTopicId(e.target.value)}
              placeholder="Enter topic ID from DB..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            onClick={runSingleTopic}
            disabled={singleRunning || !singleTopicId}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all ${
              singleRunning || !singleTopicId
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-teal-600 hover:bg-teal-700 active:scale-95"
            }`}
          >
            {singleRunning ? "⏳ Generating..." : "⚡ Generate"}
          </button>
        </div>

        {singleResult && (
          <div
            className={`mt-3 px-4 py-3 rounded-lg text-sm ${
              singleResult.success
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {singleResult.success ? (
              <span>
                ✅ Generated{" "}
                <strong>{singleResult.result?.questionsGenerated}</strong>{" "}
                questions for <strong>{singleResult.result?.topicName}</strong>
              </span>
            ) : (
              <span>❌ {singleResult.error || singleResult.result?.error}</span>
            )}
          </div>
        )}
      </div>

      {/* Topic Browser */}
      {topics.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">
            📚 Topic Browser ({topics.length} topics)
          </h2>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 w-12">ID</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Topic</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Unit</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Subject</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topics.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400 text-xs">{t.id}</td>
                    <td className="px-3 py-2 text-gray-800">{t.name}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {t.units?.name}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.units?.subjects?.name === "Paper I"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {t.units?.subjects?.name}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => {
                          setSingleTopicId(String(t.id));
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        Generate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
