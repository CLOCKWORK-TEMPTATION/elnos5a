"""طبقة كشف الحدود البنيوية وتقسيم السطور المختلطة."""

from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Tuple, TypedDict

from .predicates import (
    extract_action_character_rebalance,
    looks_like_dialogue_continuation,
    split_dialogue_action,
    split_scene_header_action,
    split_scene_number_tail,
)
from .state_registry import label_to_state, state_to_kebab
from .states import State


class BoundaryPiece(TypedDict):
    type: str
    text: str


class AppliedBoundary(TypedDict, total=False):
    lineIndex: int
    operation: str
    confidence: float
    reason: str
    source: str


@dataclass(frozen=True)
class BoundaryProposal:
    line_index: int
    operation: Literal["split", "merge_with_prev", "merge_with_next"]
    confidence: float
    reason: str
    pieces: Optional[List[BoundaryPiece]] = None
    issue_kind: str = "mixed-line"


def propose_boundaries(elements: List[Tuple[State, str]]) -> List[BoundaryProposal]:
    proposals: List[BoundaryProposal] = []

    for idx, (state, text) in enumerate(elements):
        stripped = text.strip()

        scene_number_tail = split_scene_number_tail(stripped)
        if scene_number_tail and state in {
            State.SCENE_HEADER_1,
            State.SCENE_HEADER_2,
            State.ACTION,
            State.BASMALA,
        }:
            proposals.append(
                BoundaryProposal(
                    line_index=idx,
                    operation="split",
                    confidence=0.93,
                    reason="scene-header-1 + scene-header-2",
                    pieces=[
                        {"type": "scene-header-1", "text": scene_number_tail[0]},
                        {"type": "scene-header-2", "text": scene_number_tail[1]},
                    ],
                    issue_kind="scene-number-tail-combined",
                )
            )

        scene_header_action = split_scene_header_action(stripped)
        if scene_header_action and state in {State.SCENE_HEADER_3, State.ACTION, State.BASMALA}:
            proposals.append(
                BoundaryProposal(
                    line_index=idx,
                    operation="split",
                    confidence=0.9,
                    reason="scene-header-3 + action",
                    pieces=[
                        {"type": "scene-header-3", "text": scene_header_action[0]},
                        {"type": "action", "text": scene_header_action[1]},
                    ],
                    issue_kind="scene-header-action-combined",
                )
            )

        dialogue_action = split_dialogue_action(stripped)
        if dialogue_action and state in {State.DIALOGUE, State.ACTION, State.BASMALA}:
            proposals.append(
                BoundaryProposal(
                    line_index=idx,
                    operation="split",
                    confidence=0.87,
                    reason="dialogue + action",
                    pieces=[
                        {"type": "dialogue", "text": dialogue_action[0]},
                        {"type": "action", "text": dialogue_action[1]},
                    ],
                    issue_kind="dialogue-action-combined",
                )
            )

        if idx > 0:
            prev_state, prev_text = elements[idx - 1]
            if (
                state == State.CHARACTER
                and prev_state == State.ACTION
                and extract_action_character_rebalance(prev_text, stripped)
            ):
                proposals.append(
                    BoundaryProposal(
                        line_index=idx,
                        operation="merge_with_prev",
                        confidence=0.88,
                        reason="fragmented composite character label",
                        issue_kind="fragmented-character-label",
                    )
                )

        if idx > 0 and idx + 1 < len(elements):
            prev_state, prev_text = elements[idx - 1]
            next_state, _next_text = elements[idx + 1]
            if (
                state == State.ACTION
                and prev_state == State.DIALOGUE
                and next_state == State.CHARACTER
                and looks_like_dialogue_continuation(prev_text, stripped)
            ):
                proposals.append(
                    BoundaryProposal(
                        line_index=idx,
                        operation="merge_with_prev",
                        confidence=0.9,
                        reason="broken dialogue continuation",
                        issue_kind="dialogue-continuation-fragment",
                    )
                )

    return proposals


def _infer_merged_state(prev_state: State, current_state: State, next_state: Optional[State] = None) -> State:
    if prev_state == State.DIALOGUE or current_state == State.DIALOGUE:
        return State.DIALOGUE
    if current_state == State.CHARACTER or prev_state == State.CHARACTER:
        return State.CHARACTER
    if next_state == State.CHARACTER:
        return State.CHARACTER
    return current_state


def _apply_split(
    result: List[Tuple[State, str]],
    proposal: BoundaryProposal,
) -> bool:
    if not proposal.pieces or not (0 <= proposal.line_index < len(result)):
        return False

    replacement: List[Tuple[State, str]] = []
    for piece in proposal.pieces:
        state = label_to_state(piece["type"])
        if state is None:
            return False
        replacement.append((state, piece["text"].strip()))

    result[proposal.line_index:proposal.line_index + 1] = replacement
    return True


def _apply_merge_with_prev(
    result: List[Tuple[State, str]],
    proposal: BoundaryProposal,
) -> bool:
    if not (0 < proposal.line_index < len(result)):
        return False

    prev_state, prev_text = result[proposal.line_index - 1]
    current_state, current_text = result[proposal.line_index]

    if prev_state == State.ACTION and current_state == State.CHARACTER:
        rebalanced = extract_action_character_rebalance(prev_text, current_text)
        if rebalanced:
            action_head, composite_character = rebalanced
            if action_head:
                result[proposal.line_index - 1] = (State.ACTION, action_head)
                result[proposal.line_index] = (State.CHARACTER, composite_character)
                return True

            result[proposal.line_index - 1] = (State.CHARACTER, composite_character)
            del result[proposal.line_index]
            return True

    merged_text = f"{prev_text.strip()} {current_text.strip()}".strip()
    merged_state = _infer_merged_state(prev_state, current_state)
    result[proposal.line_index - 1] = (merged_state, merged_text)
    del result[proposal.line_index]
    return True


def _apply_merge_with_next(
    result: List[Tuple[State, str]],
    proposal: BoundaryProposal,
) -> bool:
    if not (0 <= proposal.line_index < len(result) - 1):
        return False

    current_state, current_text = result[proposal.line_index]
    next_state, next_text = result[proposal.line_index + 1]
    merged_text = f"{current_text.strip()} {next_text.strip()}".strip()
    merged_state = _infer_merged_state(current_state, next_state, next_state)
    result[proposal.line_index] = (merged_state, merged_text)
    del result[proposal.line_index + 1]
    return True


def apply_boundary_proposals(
    elements: List[Tuple[State, str]],
    proposals: List[BoundaryProposal],
    *,
    min_confidence: float = 0.0,
    source: str = "heuristic-boundary",
) -> Tuple[List[Tuple[State, str]], List[AppliedBoundary]]:
    result = list(elements)
    applied: List[AppliedBoundary] = []

    ordered = sorted(
        proposals,
        key=lambda proposal: (proposal.line_index, proposal.operation),
        reverse=True,
    )

    for proposal in ordered:
        if proposal.confidence < min_confidence:
            continue

        applied_ok = False
        if proposal.operation == "split":
            applied_ok = _apply_split(result, proposal)
        elif proposal.operation == "merge_with_prev":
            applied_ok = _apply_merge_with_prev(result, proposal)
        elif proposal.operation == "merge_with_next":
            applied_ok = _apply_merge_with_next(result, proposal)

        if not applied_ok:
            continue

        applied.append(
            {
                "lineIndex": proposal.line_index,
                "operation": proposal.operation,
                "confidence": proposal.confidence,
                "reason": proposal.reason,
                "source": source,
            }
        )

    applied.reverse()
    return result, applied


def proposal_candidate_types(proposal: BoundaryProposal) -> List[str]:
    if proposal.pieces:
        ordered_types: Dict[str, None] = {}
        for piece in proposal.pieces:
            state = label_to_state(piece["type"])
            if state is not None:
                ordered_types[state_to_kebab(state)] = None
        return list(ordered_types)

    if proposal.operation.startswith("merge"):
        return ["character"]

    return []

