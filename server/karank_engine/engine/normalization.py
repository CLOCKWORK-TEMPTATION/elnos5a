from typing import List, Tuple

from .predicates import (
    extract_action_character_rebalance,
    merge_action_fragments,
    has_narrative_verb_hint,
    looks_like_action_prefix,
    looks_like_character_fragment,
    looks_like_scene_location,
    split_character_prefix,
    strip_trailing_colon,
    word_count,
)
from .states import State


def normalize_elements(elements: List[Tuple[State, str]]) -> List[Tuple[State, str]]:
    if not elements:
        return []
    normalized = _rebalance_character_prefixes(elements)
    return _merge_character_names(normalized)


def _rebalance_character_prefixes(elements: List[Tuple[State, str]]) -> List[Tuple[State, str]]:
    normalized: List[Tuple[State, str]] = []

    for state, value in elements:
        if state != State.CHARACTER:
            normalized.append((state, value))
            continue

        split = split_character_prefix(value)
        if not split:
            normalized.append((state, value))
            continue

        prefix, character_text = split
        if normalized and normalized[-1][0] == State.ACTION:
            prev_state, prev_value = normalized[-1]
            normalized[-1] = (prev_state, merge_action_fragments(prev_value, prefix))
            normalized.append((State.CHARACTER, character_text))
            continue

        if normalized and normalized[-1][0] == State.DIALOGUE and not looks_like_action_prefix(prefix):
            prev_state, prev_value = normalized[-1]
            normalized[-1] = (prev_state, merge_action_fragments(prev_value, prefix))
            normalized.append((State.CHARACTER, character_text))
            continue

        normalized.append((State.ACTION, prefix))
        normalized.append((State.CHARACTER, character_text))

    return normalized


def _merge_character_names(elements: List[Tuple[State, str]]) -> List[Tuple[State, str]]:
    merged: List[Tuple[State, str]] = []
    i = 0
    while i < len(elements):
        state, value = elements[i]
        if state == State.CHARACTER:
            name_parts = [value.replace(":", "").strip()]
            j = i + 1
            while j < len(elements) and elements[j][0] == State.CHARACTER:
                candidate = elements[j][1].replace(":", "").strip()
                if looks_like_scene_location(candidate):
                    break
                name_parts.append(candidate)
                j += 1
            full_name = " ".join(part for part in name_parts if part)
            stripped_value = value.rstrip()
            if j > i + 1:
                suffix = " :"
            elif stripped_value.endswith(" :"):
                suffix = " :"
            elif stripped_value.endswith(":"):
                suffix = ":"
            else:
                suffix = ""
            merged.append((State.CHARACTER, (full_name + suffix).strip()))
            i = j
            continue

        if state == State.ACTION and i + 1 < len(elements) and elements[i + 1][0] == State.CHARACTER:
            next_text = elements[i + 1][1]
            rebalanced = extract_action_character_rebalance(value, next_text)
            if rebalanced:
                action_head, character_text = rebalanced
                if action_head:
                    merged.append((State.ACTION, action_head))
                merged.append((State.CHARACTER, character_text))
                i += 2
                continue

            fragment = strip_trailing_colon(value)
            if (
                looks_like_character_fragment(fragment)
                and not looks_like_scene_location(fragment)
                and not has_narrative_verb_hint(fragment)
                and word_count(fragment) <= 2
            ):
                combined = f"{fragment} {next_text.strip()}".strip()
                merged.append((State.CHARACTER, combined))
                i += 2
                continue

        merged.append((state, value))
        i += 1

    return merged
