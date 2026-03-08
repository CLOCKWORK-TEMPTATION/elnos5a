import type {
  SuspicionWeightPolicy,
  WeightPolicyProfile,
  RemoteAIResolverPolicy,
} from "@/suspicion-engine/types";

const PROFILES: Record<WeightPolicyProfile, SuspicionWeightPolicy> = {
  "strict-import": {
    profile: "strict-import",
    familyWeights: {
      gateBreak: 1.5,
      contextContradiction: 1.2,
      rawCorruption: 0.8,
      multiPassConflict: 1.3,
      alternativePull: 1.0,
      sourceRisk: 1.5,
    },
    boostFactors: {
      diversityBoost: 1.3,
      criticalMismatchBoost: 2.0,
      consensusTypeBoost: 1.2,
    },
    penaltyFactors: {
      lowConfidencePenalty: 0.3,
      singleFamilyDiscount: 0.7,
    },
    bandThresholds: {
      localReviewMin: 20,
      agentCandidateMin: 50,
      agentForcedMin: 74,
    },
  },
  "balanced-paste": {
    profile: "balanced-paste",
    familyWeights: {
      gateBreak: 1.0,
      contextContradiction: 1.0,
      rawCorruption: 1.0,
      multiPassConflict: 1.0,
      alternativePull: 1.0,
      sourceRisk: 1.0,
    },
    boostFactors: {
      diversityBoost: 1.2,
      criticalMismatchBoost: 1.5,
      consensusTypeBoost: 1.1,
    },
    penaltyFactors: {
      lowConfidencePenalty: 0.2,
      singleFamilyDiscount: 0.8,
    },
    bandThresholds: {
      localReviewMin: 25,
      agentCandidateMin: 55,
      agentForcedMin: 74,
    },
  },
  "ocr-heavy": {
    profile: "ocr-heavy",
    familyWeights: {
      gateBreak: 0.8,
      contextContradiction: 0.7,
      rawCorruption: 2.0,
      multiPassConflict: 0.9,
      alternativePull: 0.8,
      sourceRisk: 1.2,
    },
    boostFactors: {
      diversityBoost: 1.1,
      criticalMismatchBoost: 1.5,
      consensusTypeBoost: 1.0,
    },
    penaltyFactors: {
      lowConfidencePenalty: 0.4,
      singleFamilyDiscount: 0.6,
    },
    bandThresholds: {
      localReviewMin: 15,
      agentCandidateMin: 45,
      agentForcedMin: 70,
    },
  },
};

export function createWeightPolicy(
  profile: WeightPolicyProfile
): SuspicionWeightPolicy {
  return PROFILES[profile];
}

const DEFAULT_AI_RESOLVER_POLICY: RemoteAIResolverPolicy = {
  requestTimeoutMs: 10_000,
  consecutiveTimeoutThreshold: 3,
  circuitOpenDurationMs: 60_000,
  halfOpenProbeLimit: 2,
  priorityOrder: ["agent-forced", "agent-candidate"],
};

export function createAIResolverPolicy(
  overrides?: Partial<RemoteAIResolverPolicy>
): RemoteAIResolverPolicy {
  if (!overrides) return DEFAULT_AI_RESOLVER_POLICY;
  return { ...DEFAULT_AI_RESOLVER_POLICY, ...overrides };
}
