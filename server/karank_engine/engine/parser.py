"""الملف الرئيسي: Pipeline كامل لتحليل السيناريو العربي."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

from .boundaries import AppliedBoundary, BoundaryProposal, apply_boundary_proposals, propose_boundaries
from .corrections import correct_sequence
from .features import extract_all_features
from .flat_recovery import is_flattened_screenplay_text, recover_flattened_screenplay_text
from .formatter import to_schema_elements
from .normalization import normalize_elements
from .reconstruction import reconstruct_text
from .segmentation import segment_lines
from .states import State
from .validator import count_critical_issues, validate_elements
from .viterbi import viterbi

logger = logging.getLogger("parser")

AUTO_BOUNDARY_MIN_CONFIDENCE = 0.85


def _run_base_pipeline(text: str) -> List[Tuple[State, str]]:
    reconstructed_text = reconstruct_text(text)
    lines = segment_lines(reconstructed_text)
    if not lines:
        return []

    features = extract_all_features(lines)
    states = correct_sequence(viterbi(lines, features), lines)
    return list(zip(states, lines))


def _finalize_elements(elements: List[Tuple[State, str]]) -> Tuple[List[Tuple[State, str]], List[Dict[str, Any]], bool]:
    normalized = normalize_elements(elements)
    issues = validate_elements(normalized)
    auto_approved = count_critical_issues(issues) == 0
    return normalized, issues, auto_approved


def _serialize_boundary_proposals(proposals: List[BoundaryProposal]) -> List[Dict[str, Any]]:
    serialized: List[Dict[str, Any]] = []
    for proposal in proposals:
        item: Dict[str, Any] = {
            "lineIndex": proposal.line_index,
            "operation": proposal.operation,
            "confidence": proposal.confidence,
            "reason": proposal.reason,
            "issueKind": proposal.issue_kind,
        }
        if proposal.pieces:
            item["pieces"] = list(proposal.pieces)
        serialized.append(item)
    return serialized


def _apply_heuristic_boundaries(
    elements: List[Tuple[State, str]],
    proposals: List[BoundaryProposal],
) -> Tuple[List[Tuple[State, str]], List[AppliedBoundary]]:
    if not proposals:
        return list(elements), []
    return apply_boundary_proposals(
        elements,
        proposals,
        min_confidence=AUTO_BOUNDARY_MIN_CONFIDENCE,
    )


def _evaluate_candidate(name: str, text: str) -> Dict[str, Any]:
    elements = _run_base_pipeline(text)
    if not elements:
        return {
            "name": name,
            "elements": [],
            "validation_issues": [],
            "auto_approved": True,
            "critical_issue_count": 0,
            "issue_count": 0,
            "remaining_boundary_count": 0,
            "element_count": 0,
            "boundary_proposals": [],
            "applied_operations": [],
        }

    proposals = propose_boundaries(elements)
    processed_elements, applied = _apply_heuristic_boundaries(elements, proposals)
    normalized, validation_issues, auto_approved = _finalize_elements(processed_elements)
    remaining_boundary_count = len(propose_boundaries(normalized))
    critical_issue_count = count_critical_issues(validation_issues)

    return {
        "name": name,
        "elements": normalized,
        "validation_issues": validation_issues,
        "auto_approved": auto_approved,
        "critical_issue_count": critical_issue_count,
        "issue_count": len(validation_issues),
        "remaining_boundary_count": remaining_boundary_count,
        "element_count": len(normalized),
        "boundary_proposals": _serialize_boundary_proposals(proposals),
        "applied_operations": [dict(item) for item in applied],
    }


def _select_best_pipeline(candidates: List[Dict[str, Any]], *, prefer_more_elements: bool) -> Dict[str, Any]:
    return min(
        candidates,
        key=lambda candidate: (
            candidate["critical_issue_count"],
            candidate["issue_count"],
            candidate["remaining_boundary_count"],
            -candidate["element_count"] if prefer_more_elements else 0,
            0 if candidate["name"] == "heuristic" else 1,
        ),
    )


def _empty_parse_result(selected_pipeline: str = "heuristic") -> Dict[str, Any]:
    return {
        "elements": [],
        "issues": [],
        "validation_issues": [],
        "auto_approved": True,
        "boundary_proposals": [],
        "applied_operations": [],
        "selected_pipeline": selected_pipeline,
    }


def parse_screenplay(text: str) -> List[Tuple[State, str]]:
    """تحليل نص سيناريو عربي وإرجاع العناصر النهائية."""
    return parse_screenplay_detailed(text)["elements"]


def parse_screenplay_detailed(text: str) -> Dict[str, Any]:
    """تحليل هيوريستي مفصل مع إرجاع قرارات الحدود والتحقق النهائي."""
    if not text.strip():
        return _empty_parse_result()

    flattened_input = is_flattened_screenplay_text(text)
    candidates = [_evaluate_candidate("heuristic", text)]

    if flattened_input:
        recovered_text = recover_flattened_screenplay_text(text)
        if recovered_text.strip() and recovered_text.strip() != text.strip():
            candidates.append(_evaluate_candidate("flattened-recovery", recovered_text))

    selected = _select_best_pipeline(candidates, prefer_more_elements=flattened_input)
    return {
        "elements": selected["elements"],
        "issues": selected["validation_issues"],
        "validation_issues": selected["validation_issues"],
        "auto_approved": selected["auto_approved"],
        "boundary_proposals": selected["boundary_proposals"],
        "applied_operations": selected["applied_operations"],
        "selected_pipeline": selected["name"],
    }


def parse_screenplay_schema(text: str) -> List[Dict[str, str]]:
    return to_schema_elements(parse_screenplay(text))
