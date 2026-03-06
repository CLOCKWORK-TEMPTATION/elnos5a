"""استرجاع حتمي للنصوص الدرامية المسطحة قبل التصنيف."""

from __future__ import annotations

import re
from typing import List, Optional

from .constants import (
    BASMALA_PATTERN,
    RECONSTRUCTION_SCENE,
    RECONSTRUCTION_TIME,
    RECONSTRUCTION_TRANSITION,
    SCENE_NUM_PATTERN,
    TIME_LOCATION_PATTERN,
)
from .predicates import (
    is_transition_text,
    looks_like_character_fragment,
    split_action_line,
    split_character_prefix,
    split_dialogue_action,
    split_scene_header_action,
)


def is_flattened_screenplay_text(text: str) -> bool:
    cleaned = _clean_text(text)
    non_empty_lines = [line for line in cleaned.splitlines() if line.strip()]
    scene_count = len(SCENE_NUM_PATTERN.findall(cleaned))
    has_character = ":" in cleaned
    has_transition = "قطع" in cleaned
    return len(non_empty_lines) <= 2 and scene_count >= 1 and has_character and (has_transition or scene_count > 1)


def recover_flattened_screenplay_text(text: str) -> str:
    cleaned = _clean_text(text)
    anchor_lines = _extract_anchor_lines(cleaned)
    recovered = _expand_anchor_lines(anchor_lines)
    return "\n".join(line for line in recovered if line.strip())


def _clean_text(text: str) -> str:
    text = text.replace("{", " ").replace("}", " ")
    text = text.replace("\f", " ")
    text = text.replace("\r", "\n")
    text = text.replace("\t", " ")
    text = re.sub(r"[ ]+", " ", text)
    text = re.sub(r"\n+", "\n", text)
    return text.strip()


def _extract_anchor_lines(text: str) -> List[str]:
    updated = text
    updated = BASMALA_PATTERN.sub(lambda match: f"{match.group(0)}\n", updated, count=1)

    for pattern in (RECONSTRUCTION_SCENE, RECONSTRUCTION_TRANSITION):
        updated = pattern.sub(lambda match: ("\n" if match.start() > 0 else "") + match.group(0), updated)

    for pattern in (RECONSTRUCTION_TIME,):
        updated = pattern.sub(lambda match: ("\n" if match.start() > 0 else "") + match.group(0) + "\n", updated)

    return [line.strip() for line in updated.splitlines() if line.strip()]


def _expand_anchor_lines(lines: List[str]) -> List[str]:
    expanded: List[str] = []
    for raw_line in lines:
        expanded.extend(_expand_line(raw_line.strip(), expanded))
    return expanded


def _expand_line(line: str, emitted: List[str]) -> List[str]:
    if not line:
        return []

    scene_tail = _split_scene_with_trailing_tail(line)
    if scene_tail:
        return _expand_line(scene_tail[0], emitted) + _expand_line(scene_tail[1], emitted + [scene_tail[0]])

    scene_header_action = split_scene_header_action(line)
    if scene_header_action:
        return _expand_line(scene_header_action[0], emitted) + _expand_line(
            scene_header_action[1],
            emitted + [scene_header_action[0]],
        )

    inline_character = _split_inline_character_block(line)
    if inline_character:
        prefix, character, suffix = inline_character
        prefix_lines: List[str] = []
        previous_kind = _line_kind(emitted[-1]) if emitted else None
        if prefix:
            if previous_kind in {"CHARACTER", "DIALOGUE"}:
                prefix_lines = _expand_dialogue_prefix(prefix, emitted)
            else:
                prefix_lines = _expand_line(prefix, emitted)
        emitted_with_prefix = emitted + prefix_lines
        return prefix_lines + [character] + _expand_line(suffix, emitted_with_prefix + [character])

    previous_kind = _line_kind(emitted[-1]) if emitted else None
    if previous_kind in {"CHARACTER", "DIALOGUE"}:
        dialogue_action = split_dialogue_action(line)
        if dialogue_action:
            dialogue, action = dialogue_action
            return [dialogue] + _expand_line(action, emitted + [dialogue])
        return [line]

    action_split = split_action_line(line)
    if action_split:
        return _expand_line(action_split[0], emitted) + _expand_line(action_split[1], emitted + [action_split[0]])

    return [line]


def _expand_dialogue_prefix(prefix: str, emitted: List[str]) -> List[str]:
    dialogue_action = split_dialogue_action(prefix)
    if dialogue_action:
        dialogue, action = dialogue_action
        return [dialogue] + _expand_line(action, emitted + [dialogue])
    return [prefix]


def _split_scene_with_trailing_tail(text: str) -> Optional[tuple[str, str]]:
    stripped = text.strip()
    match = SCENE_NUM_PATTERN.match(stripped)
    if not match:
        return None
    if match.end() >= len(stripped):
        return None

    scene = stripped[:match.end()].strip()
    tail = stripped[match.end():].strip()
    if not tail:
        return None
    if TIME_LOCATION_PATTERN.fullmatch(tail):
        return scene, tail
    return scene, tail


def _split_inline_character_block(text: str) -> Optional[tuple[str, str, str]]:
    stripped = text.strip()
    colon_index = stripped.find(":")
    if colon_index <= 0 or colon_index >= len(stripped) - 1:
        return None

    before = stripped[: colon_index + 1].strip()
    after = stripped[colon_index + 1 :].strip()
    if not after:
        return None

    split = split_character_prefix(before)
    if split:
        prefix, character = split
        return prefix, character, after

    if looks_like_character_fragment(before):
        return "", before, after

    return None


def _line_kind(line: str) -> str:
    stripped = line.strip()
    if BASMALA_PATTERN.fullmatch(stripped):
        return "BASMALA"
    if SCENE_NUM_PATTERN.fullmatch(stripped):
        return "SCENE_HEADER_1"
    if TIME_LOCATION_PATTERN.fullmatch(stripped):
        return "SCENE_HEADER_2"
    if is_transition_text(stripped):
        return "TRANSITION"
    if looks_like_character_fragment(stripped):
        return "CHARACTER"
    return "ACTION"
