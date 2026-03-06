"""طبقة التحقق النهائي من سلامة البنية بعد المعالجة."""

from typing import Any, Dict, List, Tuple, TypedDict

from .features import extract_all_features
from .predicates import (
    count_action_split_candidates,
    extract_action_character_rebalance,
    split_character_prefix,
    split_dialogue_action,
    split_action_line,
    split_scene_header_action,
    split_scene_number_tail,
)
from .states import State


class ValidationIssue(TypedDict):
    lineIndex: int
    kind: str
    text: str


CRITICAL_ISSUE_KINDS = {
    "invalid-cene_header_2",
    "scene-number-tail-combined",
    "scene_header_3-contains-action",
    "scene-header-action-combined",
    "dialogue-without-speaker",
    "dialogue-contains-action",
    "fragmented-character-label",
    "invalid-character-prefix",
    "character-without-followup",
}


def validate_elements(elements: List[Tuple[State, str]]) -> List[ValidationIssue]:
    issues: List[ValidationIssue] = []
    lines = [text for _, text in elements]
    features = extract_all_features(lines)

    for i, (state, text) in enumerate(elements):
        feature_map = features[i]
        stripped = text.strip()

        if state == State.SCENE_HEADER_2 and feature_map["word_count"] <= 4 and not feature_map["time_location"]:
            issues.append({"lineIndex": i, "kind": "invalid-cene_header_2", "text": stripped})

        if split_scene_number_tail(stripped):
            issues.append({"lineIndex": i, "kind": "scene-number-tail-combined", "text": stripped})

        if split_scene_header_action(stripped):
            kind = "scene_header_3-contains-action" if state == State.scene_header_3 else "scene-header-action-combined"
            issues.append({"lineIndex": i, "kind": kind, "text": stripped})

        if split_dialogue_action(stripped):
            issues.append({"lineIndex": i, "kind": "dialogue-contains-action", "text": stripped})

        if state == State.ACTION and (split_action_line(stripped) or count_action_split_candidates(stripped) > 1):
            issues.append({"lineIndex": i, "kind": "overlong-action-multi-clause", "text": stripped})

        if state == State.DIALOGUE and (
            i == 0 or elements[i - 1][0] not in (State.CHARACTER, State.PARENTHETICAL, State.DIALOGUE)
        ):
            issues.append({"lineIndex": i, "kind": "dialogue-without-speaker", "text": stripped})

        if state == State.CHARACTER and i + 1 < len(elements):
            if elements[i + 1][0] not in (State.DIALOGUE, State.PARENTHETICAL, State.CHARACTER, State.ACTION):
                issues.append({"lineIndex": i, "kind": "character-without-followup", "text": stripped})

        if (
            state == State.CHARACTER
            and i > 0
            and elements[i - 1][0] == State.ACTION
            and extract_action_character_rebalance(elements[i - 1][1], stripped)
        ):
            issues.append({"lineIndex": i, "kind": "fragmented-character-label", "text": stripped})

        if state == State.CHARACTER and split_character_prefix(stripped):
            issues.append({"lineIndex": i, "kind": "invalid-character-prefix", "text": stripped})

    return issues


def has_critical_issues(issues: List[Dict[str, Any]]) -> bool:
    return count_critical_issues(issues) > 0


def count_critical_issues(issues: List[Dict[str, Any]]) -> int:
    return sum(1 for issue in issues if issue.get("kind") in CRITICAL_ISSUE_KINDS)
