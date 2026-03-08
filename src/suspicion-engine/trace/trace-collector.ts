import type { PassVote, LineRepair } from "@/suspicion-engine/types";

export class TraceCollector {
  private readonly votes = new Map<number, PassVote[]>();
  private readonly repairs = new Map<number, LineRepair[]>();

  addVote(lineIndex: number, vote: PassVote): void {
    const existing = this.votes.get(lineIndex);
    if (existing) {
      existing.push(vote);
    } else {
      this.votes.set(lineIndex, [vote]);
    }
  }

  addRepair(lineIndex: number, repair: LineRepair): void {
    const existing = this.repairs.get(lineIndex);
    if (existing) {
      existing.push(repair);
    } else {
      this.repairs.set(lineIndex, [repair]);
    }
  }

  getVotes(lineIndex: number): readonly PassVote[] {
    return this.votes.get(lineIndex) ?? [];
  }

  getRepairs(lineIndex: number): readonly LineRepair[] {
    return this.repairs.get(lineIndex) ?? [];
  }

  getAllVotes(): ReadonlyMap<number, readonly PassVote[]> {
    return this.votes;
  }

  getAllRepairs(): ReadonlyMap<number, readonly LineRepair[]> {
    return this.repairs;
  }

  clear(): void {
    this.votes.clear();
    this.repairs.clear();
  }
}

/** Singleton instance — mirrors the pipelineRecorder pattern */
export const traceCollector = new TraceCollector();
