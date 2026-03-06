"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  pipelineRecorder,
  type PipelineEvent,
  type RecordedAICorrection,
} from "@/extensions/pipeline-recorder";

// ─── أنواع ─────────────────────────────────────────────────────────

interface StageEntry {
  stage: string;
  lineCount: number;
  changes: number;
  latencyMs: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface RunState {
  runId: string;
  source: string;
  inputLines: number;
  inputChars: number;
  startedAt: number;
  stages: StageEntry[];
  aiCorrections: RecordedAICorrection[];
  finished: boolean;
  totalDurationMs: number;
  finalTypeDist: Record<string, number>;
}

// ─── ثوابت المراحل ──────────────────────────────────────────────────

const STAGE_META: Record<string, { label: string; icon: string }> = {
  "schema-style-classify": { label: "تصنيف Schema", icon: "📐" },
  "forward-pass": { label: "التمرير الأمامي", icon: "➡️" },
  retroactive: { label: "التصحيح الرجعي", icon: "🔄" },
  "reverse-pass": { label: "التمرير العكسي", icon: "⬅️" },
  viterbi: { label: "Viterbi", icon: "🧬" },
  "render-first": { label: "العرض الأول", icon: "🖥️" },
  "gemini-context": { label: "Gemini سياق", icon: "🤖" },
  "gemini-doubt": { label: "Gemini شك", icon: "🔍" },
  "claude-review": { label: "Claude مراجعة", icon: "🧠" },
};

const getStageMeta = (stage: string) =>
  STAGE_META[stage] ?? { label: stage, icon: "⚙️" };

// ─── مكون شريط التقدم ──────────────────────────────────────────────

const ProgressBar: React.FC<{ current: number; total: number }> = ({
  current,
  total,
}) => {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300 bg-gradient-to-l from-cyan-400 to-blue-600"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

// ─── مكون مرحلة واحدة ──────────────────────────────────────────────

const StageRow: React.FC<{
  entry: StageEntry;
  isActive: boolean;
  isLast: boolean;
}> = ({ entry, isActive, isLast }) => {
  const meta = getStageMeta(entry.stage);
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors ${
        isActive
          ? "bg-cyan-950/60 border border-cyan-700/40"
          : isLast
            ? "bg-zinc-800/60"
            : "bg-transparent"
      }`}
    >
      <span className="text-sm shrink-0">{meta.icon}</span>
      <span className="font-medium text-zinc-200 min-w-[100px]">
        {meta.label}
      </span>
      <span className="text-zinc-500 tabular-nums">{entry.lineCount} سطر</span>
      {entry.changes > 0 && (
        <span className="text-amber-400 tabular-nums">
          Δ{entry.changes}
        </span>
      )}
      {entry.latencyMs > 0 && (
        <span className="text-zinc-600 tabular-nums ms-auto">
          {entry.latencyMs}ms
        </span>
      )}
      {isActive && (
        <span className="relative flex h-2 w-2 ms-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
        </span>
      )}
    </div>
  );
};

// ─── مكون توزيع الأنواع ──────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  action: "bg-emerald-500",
  dialogue: "bg-blue-500",
  character: "bg-purple-500",
  scene_header_1: "bg-amber-500",
  scene_header_2: "bg-orange-500",
  scene_header_3: "bg-yellow-500",
  transition: "bg-red-500",
  parenthetical: "bg-pink-500",
  basmala: "bg-teal-500",
};

const TypeDistBar: React.FC<{ dist: Record<string, number> }> = ({
  dist,
}) => {
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const entries = Object.entries(dist).sort(([, a], [, b]) => b - a);
  return (
    <div className="space-y-1">
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {entries.map(([type, count]) => (
          <div
            key={type}
            className={`${TYPE_COLORS[type] ?? "bg-zinc-500"} transition-all duration-500`}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${type}: ${count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-zinc-400">
        {entries.map(([type, count]) => (
          <span key={type} className="flex items-center gap-1">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${TYPE_COLORS[type] ?? "bg-zinc-500"}`}
            />
            {type.replace(/_/g, " ")} ({count})
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── المكون الرئيسي ──────────────────────────────────────────────

const KNOWN_STAGES = [
  "schema-style-classify",
  "forward-pass",
  "retroactive",
  "reverse-pass",
  "viterbi",
  "render-first",
  "gemini-context",
  "gemini-doubt",
  "claude-review",
];

export const PipelineMonitor: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  const [run, setRun] = useState<RunState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [logEntries, setLogEntries] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString("ar-EG", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setLogEntries((prev) => [...prev.slice(-60), `[${ts}] ${msg}`]);
  }, []);

  useEffect(() => {
    const unsub = pipelineRecorder.subscribe((event: PipelineEvent) => {
      switch (event.kind) {
        case "run-start":
          setRun({
            runId: event.runId,
            source: event.source,
            inputLines: event.input.lineCount,
            inputChars: event.input.textLength,
            startedAt: performance.now(),
            stages: [],
            aiCorrections: [],
            finished: false,
            totalDurationMs: 0,
            finalTypeDist: {},
          });
          setElapsed(0);
          addLog(`▶ بداية run — المصدر: ${event.source} | ${event.input.lineCount} سطر`);
          break;

        case "snapshot":
          setRun((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              stages: [
                ...prev.stages,
                {
                  stage: event.stage,
                  lineCount: event.lineCount,
                  changes: event.changes,
                  latencyMs: event.latencyMs,
                  timestamp: performance.now(),
                  metadata: event.metadata,
                },
              ],
            };
          });
          addLog(
            `${getStageMeta(event.stage).icon} ${getStageMeta(event.stage).label} — ${event.lineCount} سطر${event.changes > 0 ? ` | ${event.changes} تغيير` : ""}${event.latencyMs > 0 ? ` | ${event.latencyMs}ms` : ""}`
          );
          break;

        case "ai-correction":
          setRun((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              aiCorrections: [...prev.aiCorrections, event.correction],
            };
          });
          addLog(
            `🤖 تصحيح AI [${event.correction.lineIndex}]: ${event.correction.previousType} → ${event.correction.correctedType} (${event.correction.applied ? "✅" : "❌"})`
          );
          break;

        case "run-end":
          setRun((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              finished: true,
              totalDurationMs: event.totalDurationMs,
              finalTypeDist: event.finalTypeDist,
            };
          });
          addLog(
            `✅ اكتمل في ${(event.totalDurationMs / 1000).toFixed(1)}s — ${event.totalVerdicts} تصحيح AI`
          );
          break;
      }
    });

    return unsub;
  }, [addLog]);

  // مؤقت الوقت المنقضي
  useEffect(() => {
    if (run && !run.finished) {
      timerRef.current = setInterval(() => {
        setElapsed(Math.round(performance.now() - run.startedAt));
      }, 100);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [run?.finished, run?.startedAt, run]);

  // Auto-scroll log
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logEntries]);

  if (!visible) return null;

  const completedStages = run?.stages.map((s) => s.stage) ?? [];
  const activeStageIndex = run && !run.finished ? completedStages.length : -1;
  const appliedCorrections = run?.aiCorrections.filter((c) => c.applied).length ?? 0;

  return (
    <div
      ref={panelRef}
      dir="rtl"
      className="fixed bottom-4 left-4 z-[9999] w-[420px] max-h-[85vh] rounded-xl border border-zinc-700/50 bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden select-none"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-base">📡</span>
          <span className="text-sm font-semibold text-zinc-200">
            مراقب الـ Pipeline
          </span>
          {run && !run.finished && (
            <span className="text-[10px] text-cyan-400 tabular-nums animate-pulse">
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {run && (
            <span className="text-[10px] text-zinc-500 tabular-nums">
              {run.finished
                ? `${(run.totalDurationMs / 1000).toFixed(1)}s`
                : `${(elapsed / 1000).toFixed(1)}s`}
            </span>
          )}
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none px-1 transition-colors"
            title="إغلاق (Ctrl+Shift+M)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Run Info ── */}
      {run ? (
        <div className="px-4 py-2 text-[11px] text-zinc-400 border-b border-zinc-800/50 space-y-1">
          <div className="flex justify-between">
            <span>المصدر: <span className="text-zinc-300">{run.source}</span></span>
            <span>{run.inputLines} سطر · {run.inputChars} حرف</span>
          </div>
          <ProgressBar current={completedStages.length} total={KNOWN_STAGES.length} />
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-zinc-600">
          في انتظار عملية لصق أو استيراد ملف...
        </div>
      )}

      {/* ── Stages ── */}
      {run && (
        <div className="px-3 py-2 space-y-1 border-b border-zinc-800/50 max-h-[220px] overflow-y-auto">
          {KNOWN_STAGES.map((stageKey, idx) => {
            const entry = run.stages.find((s) => s.stage === stageKey);
            const isActive = idx === activeStageIndex;
            const isPending = !entry && !run.finished;
            const isSkipped = !entry && run.finished;

            if (entry) {
              return (
                <StageRow
                  key={stageKey}
                  entry={entry}
                  isActive={isActive}
                  isLast={idx === completedStages.length - 1}
                />
              );
            }

            const meta = getStageMeta(stageKey);
            return (
              <div
                key={stageKey}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs ${
                  isActive
                    ? "bg-cyan-950/30 border border-cyan-800/30"
                    : ""
                }`}
              >
                <span className={`text-sm shrink-0 ${isPending ? "opacity-30" : "opacity-20"}`}>
                  {meta.icon}
                </span>
                <span className={`font-medium min-w-[100px] ${isPending ? "text-zinc-600" : "text-zinc-700 line-through"}`}>
                  {meta.label}
                </span>
                {isSkipped && (
                  <span className="text-zinc-700 text-[10px]">تخطي</span>
                )}
                {isActive && (
                  <span className="relative flex h-2 w-2 ms-auto">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── AI Corrections Summary ── */}
      {run && run.aiCorrections.length > 0 && (
        <div className="px-4 py-2 border-b border-zinc-800/50 text-[11px]">
          <span className="text-zinc-400">
            تصحيحات AI:{" "}
            <span className="text-emerald-400">{appliedCorrections} مطبّق</span>
            {" · "}
            <span className="text-zinc-600">
              {run.aiCorrections.length - appliedCorrections} مرفوض
            </span>
          </span>
        </div>
      )}

      {/* ── Type Distribution ── */}
      {run?.finished && Object.keys(run.finalTypeDist).length > 0 && (
        <div className="px-4 py-2 border-b border-zinc-800/50">
          <TypeDistBar dist={run.finalTypeDist} />
        </div>
      )}

      {/* ── Live Log ── */}
      <div
        ref={logRef}
        className="flex-1 min-h-[100px] max-h-[180px] overflow-y-auto px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-500 space-y-0.5"
      >
        {logEntries.length === 0 ? (
          <div className="text-center text-zinc-700 py-4">
            السجل فارغ — الصق نص أو افتح ملف
          </div>
        ) : (
          logEntries.map((entry, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {entry}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
