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
  activeFiles: string[];
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
  "engine-bridge": { label: "البريدج", icon: "🌉" },
  "schema-style-classify": { label: "تصنيف Schema", icon: "📐" },
  "forward-pass": { label: "التمرير الأمامي", icon: "➡️" },
  retroactive: { label: "التصحيح الرجعي", icon: "🔄" },
  "reverse-pass": { label: "التمرير العكسي", icon: "⬅️" },
  viterbi: { label: "Viterbi", icon: "🧬" },
  "render-first": { label: "العرض الأول", icon: "🖥️" },
  "gemini-context": { label: "Gemini سياق", icon: "🤖" },
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
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      <div
        className="h-full rounded-full bg-gradient-to-l from-cyan-400 to-blue-600 transition-all duration-300"
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
    <>
      <div
        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors ${
          isActive
            ? "border border-cyan-700/40 bg-cyan-950/60"
            : isLast
              ? "bg-zinc-800/60"
              : "bg-transparent"
        }`}
      >
        <span className="shrink-0 text-sm">{meta.icon}</span>
        <span className="min-w-[100px] font-medium text-zinc-200">
          {meta.label}
        </span>
        <span className="tabular-nums text-zinc-500">
          {entry.lineCount} سطر
        </span>
        {entry.changes > 0 && (
          <span className="tabular-nums text-amber-400">Δ{entry.changes}</span>
        )}
        {entry.latencyMs > 0 && (
          <span className="ms-auto tabular-nums text-zinc-600">
            {entry.latencyMs}ms
          </span>
        )}
        {isActive && (
          <span className="relative ms-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
          </span>
        )}
      </div>
      {entry.activeFiles.length > 0 && (
        <div className="-mt-0.5 flex flex-wrap gap-1 px-3 pb-1">
          {entry.activeFiles.map((f) => (
            <span
              key={f}
              className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[9px] text-cyan-400/70"
            >
              {f}
            </span>
          ))}
        </div>
      )}
    </>
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

const TypeDistBar: React.FC<{ dist: Record<string, number> }> = ({ dist }) => {
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const entries = Object.entries(dist).sort(([, a], [, b]) => b - a);
  return (
    <div className="space-y-1">
      <div className="flex h-2 gap-px overflow-hidden rounded-full">
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
              className={`inline-block h-1.5 w-1.5 rounded-full ${TYPE_COLORS[type] ?? "bg-zinc-500"}`}
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
          addLog(
            `▶ بداية run — المصدر: ${event.source} | ${event.input.lineCount} سطر`
          );
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
                  activeFiles: event.activeFiles,
                },
              ],
            };
          });
          addLog(
            `${getStageMeta(event.stage).icon} ${getStageMeta(event.stage).label} — ${event.lineCount} سطر${event.changes > 0 ? ` | ${event.changes} تغيير` : ""}${event.latencyMs > 0 ? ` | ${event.latencyMs}ms` : ""}${event.activeFiles.length > 0 ? `\n    📁 ${event.activeFiles.join(" · ")}` : ""}`
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

        case "engine-bridge":
          addLog(
            `🌉 البريدج — المصدر: ${event.source} | ${event.elementCount} عنصر | ${event.latencyMs}ms`
          );
          break;

        case "file-open":
          addLog(
            `📂 فتح ملف: ${event.fileName} (نوع: ${event.fileType} | وضع: ${event.mode})`
          );
          break;

        case "file-extract-done":
          addLog(
            `📦 استخراج: ${event.fileName} — طريقة: ${event.method}${event.usedOcr ? " (OCR)" : ""} | ${event.textLength} حرف | ${event.schemaElementCount} عنصر schema | ${event.latencyMs}ms`
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
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [logEntries]);

  if (!visible) return null;

  const completedStages = run?.stages.map((s) => s.stage) ?? [];
  const activeStageIndex = run && !run.finished ? completedStages.length : -1;
  const appliedCorrections =
    run?.aiCorrections.filter((c) => c.applied).length ?? 0;

  const downloadLog = () => {
    if (logEntries.length === 0) return;
    const header = run
      ? `Pipeline Run: ${run.runId}\nSource: ${run.source}\nLines: ${run.inputLines} | Chars: ${run.inputChars}\nDuration: ${run.finished ? `${(run.totalDurationMs / 1000).toFixed(1)}s` : "in-progress"}\n${"─".repeat(50)}\n\n`
      : "";
    const blob = new Blob([header + logEntries.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline-log-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      ref={panelRef}
      dir="rtl"
      className="fixed bottom-4 left-4 z-[9999] flex max-h-[85vh] w-[420px] select-none flex-col overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base">📡</span>
          <span className="text-sm font-semibold text-zinc-200">
            مراقب الـ Pipeline
          </span>
          {run && !run.finished && (
            <span className="animate-pulse text-[10px] tabular-nums text-cyan-400">
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {run && (
            <span className="text-[10px] tabular-nums text-zinc-500">
              {run.finished
                ? `${(run.totalDurationMs / 1000).toFixed(1)}s`
                : `${(elapsed / 1000).toFixed(1)}s`}
            </span>
          )}
          <button
            onClick={downloadLog}
            disabled={logEntries.length === 0}
            className="px-1 text-sm leading-none text-zinc-500 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-30"
            title="تحميل السجل"
          >
            ⬇
          </button>
          <button
            onClick={onClose}
            className="px-1 text-lg leading-none text-zinc-500 transition-colors hover:text-zinc-300"
            title="إغلاق (Ctrl+Shift+M)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Run Info ── */}
      {run ? (
        <div className="space-y-1 border-b border-zinc-800/50 px-4 py-2 text-[11px] text-zinc-400">
          <div className="flex justify-between">
            <span>
              المصدر: <span className="text-zinc-300">{run.source}</span>
            </span>
            <span>
              {run.inputLines} سطر · {run.inputChars} حرف
            </span>
          </div>
          <ProgressBar
            current={completedStages.length}
            total={KNOWN_STAGES.length}
          />
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-zinc-600">
          في انتظار عملية لصق أو استيراد ملف...
        </div>
      )}

      {/* ── Stages ── */}
      {run && (
        <div className="max-h-[220px] space-y-1 overflow-y-auto border-b border-zinc-800/50 px-3 py-2">
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
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs ${
                  isActive ? "border border-cyan-800/30 bg-cyan-950/30" : ""
                }`}
              >
                <span
                  className={`shrink-0 text-sm ${isPending ? "opacity-30" : "opacity-20"}`}
                >
                  {meta.icon}
                </span>
                <span
                  className={`min-w-[100px] font-medium ${isPending ? "text-zinc-600" : "text-zinc-700 line-through"}`}
                >
                  {meta.label}
                </span>
                {isSkipped && (
                  <span className="text-[10px] text-zinc-700">تخطي</span>
                )}
                {isActive && (
                  <span className="relative ms-auto flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── AI Corrections Summary ── */}
      {run && run.aiCorrections.length > 0 && (
        <div className="border-b border-zinc-800/50 px-4 py-2 text-[11px]">
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
        <div className="border-b border-zinc-800/50 px-4 py-2">
          <TypeDistBar dist={run.finalTypeDist} />
        </div>
      )}

      {/* ── Live Log ── */}
      <div
        ref={logRef}
        className="max-h-[180px] min-h-[100px] flex-1 space-y-0.5 overflow-y-auto px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-500"
      >
        {logEntries.length === 0 ? (
          <div className="py-4 text-center text-zinc-700">
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
