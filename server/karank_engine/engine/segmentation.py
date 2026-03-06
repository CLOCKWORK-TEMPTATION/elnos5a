"""الطبقة 2: تقسيم النص إلى أسطر مرشحة."""

from typing import List

from .constants import (
    CHARACTER_PATTERN,
    PARENTHETICAL_PATTERN,
    RECONSTRUCTION_CHARACTER,
    RECONSTRUCTION_SCENE,
    RECONSTRUCTION_TIME,
    RECONSTRUCTION_TRANSITION,
    SCENE_NUM_PATTERN,
    TIME_LOCATION_PATTERN,
)
from .predicates import is_transition_text


def _split_inline_markers(line: str) -> List[str]:
    updated = line
    before_only = [
        RECONSTRUCTION_SCENE,
        RECONSTRUCTION_TRANSITION,
    ]
    before_and_after = [
        RECONSTRUCTION_TIME,
        RECONSTRUCTION_CHARACTER,
    ]

    for pat in before_only:
        updated = pat.sub(lambda m: ("\n" if m.start() > 0 else "") + m.group(0), updated)

    for pat in before_and_after:
        updated = pat.sub(lambda m: ("\n" if m.start() > 0 else "") + m.group(0) + "\n", updated)

    return [part for part in updated.split("\n") if part.strip()]


def _is_structural_line(text: str) -> bool:
    stripped = text.strip()
    return (
        bool(CHARACTER_PATTERN.match(stripped))
        or bool(PARENTHETICAL_PATTERN.fullmatch(stripped))
        or bool(SCENE_NUM_PATTERN.search(stripped))
        or bool(TIME_LOCATION_PATTERN.search(stripped))
        or is_transition_text(stripped)
    )


def _should_merge_continuation(previous: str, current_raw: str) -> bool:
    if not current_raw[:1].isspace():
        return False

    stripped = current_raw.strip()
    prev_stripped = previous.strip()
    if not stripped or not prev_stripped:
        return False
    if _is_structural_line(stripped) or _is_structural_line(prev_stripped):
        return False
    return True


def segment_lines(text: str) -> List[str]:
    """تقسيم النص المُعاد بناؤه إلى قائمة أسطر نظيفة.

    Args:
        text: النص بعد مرحلة إعادة البناء.

    Returns:
        قائمة أسطر غير فارغة.
    """
    lines = []
    for raw_line in text.split("\n"):
        candidates = _split_inline_markers(raw_line)
        for line in candidates:
            stripped = line.strip()
            if not stripped:
                continue
            if lines and _should_merge_continuation(lines[-1], line):
                lines[-1] = f"{lines[-1].rstrip()} {stripped}"
                continue
            lines.append(stripped)
    return lines
