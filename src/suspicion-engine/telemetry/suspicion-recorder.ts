import type { SuspicionTelemetryEvent } from "@/suspicion-engine/types";
import type { SuspicionTelemetryListener } from "./suspicion-metrics";

export class SuspicionRecorder implements SuspicionTelemetryListener {
  private readonly events: SuspicionTelemetryEvent[] = [];
  private readonly maxEvents: number;

  constructor(maxEvents: number = 1000) {
    this.maxEvents = maxEvents;
  }

  onEvent(event: SuspicionTelemetryEvent): void {
    if (this.events.length >= this.maxEvents) {
      this.events.shift();
    }
    this.events.push(event);
  }

  getEvents(): readonly SuspicionTelemetryEvent[] {
    return this.events;
  }

  getEventsByType(
    eventType: SuspicionTelemetryEvent["eventType"]
  ): readonly SuspicionTelemetryEvent[] {
    return this.events.filter((e) => e.eventType === eventType);
  }

  clear(): void {
    this.events.length = 0;
  }

  getSummary(): {
    readonly totalEvents: number;
    readonly byType: Record<string, number>;
    readonly totalDurationMs: number;
  } {
    const byType: Record<string, number> = {};
    let totalDurationMs = 0;

    for (const event of this.events) {
      byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
      totalDurationMs += event.durationMs;
    }

    return {
      totalEvents: this.events.length,
      byType,
      totalDurationMs,
    };
  }
}
