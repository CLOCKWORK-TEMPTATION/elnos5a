import type {
  SuspicionTelemetryEvent,
  TelemetryEventType,
  SuspicionBand,
} from "@/suspicion-engine/types";

export interface SuspicionTelemetryListener {
  onEvent(event: SuspicionTelemetryEvent): void;
}

export function createTelemetryEvent(
  eventType: TelemetryEventType,
  params: {
    readonly lineIndex?: number;
    readonly band?: SuspicionBand;
    readonly resolverName?: string;
    readonly signalCount?: number;
    readonly durationMs?: number;
    readonly metadata?: Record<string, string | number | boolean | null>;
  }
): SuspicionTelemetryEvent {
  return {
    eventType,
    lineIndex: params.lineIndex ?? null,
    band: params.band ?? null,
    resolverName: params.resolverName ?? null,
    signalCount: params.signalCount ?? 0,
    durationMs: params.durationMs ?? 0,
    timestamp: Date.now(),
    metadata: params.metadata ?? {},
  };
}
