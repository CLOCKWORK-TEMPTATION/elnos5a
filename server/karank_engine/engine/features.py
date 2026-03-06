"""الطبقة 3: استخراج خصائص كل سطر."""

from typing import List, TypedDict

from .constants import (
    BASMALA_PATTERN,
    CHARACTER_PATTERN,
    PARENTHETICAL_PATTERN,
    SCENE_NUM_PATTERN,
    TIME_LOCATION_PATTERN,
    TRANSITION_WORDS,
    SHORT_LINE_MAX,
    LONG_LINE_MIN,
)
from .predicates import (
    colon_count,
    contains_parenthetical,
    has_narrative_verb_hint,
    header_signal_strength,
    looks_like_parenthetical_line,
    looks_like_scene_location,
    looks_like_short_name,
    word_count,
)


class FeatureVector(TypedDict):
    basmala: bool
    scene_num: bool
    time_location: bool
    transition: bool
    character: bool
    has_colon: bool
    has_parenthetical: bool
    contains_parenthetical: bool
    is_parenthetical_line: bool
    is_short: bool
    is_long: bool
    length: int
    word_count: int
    colon_count: int
    narrative_hint: bool
    looks_like_short_name: bool
    looks_like_scene_location: bool
    header_signal_strength: int


def extract_features(line: str) -> FeatureVector:
    """تحويل سطر واحد إلى متجه خصائص.

    Args:
        line: سطر نصي واحد.

    Returns:
        قاموس بالخصائص المُستخرجة.
    """
    stripped = line.strip()
    line_word_count = word_count(stripped)
    line_colon_count = colon_count(stripped)
    is_transition = stripped in TRANSITION_WORDS
    has_parenthetical = bool(PARENTHETICAL_PATTERN.search(stripped))

    return {
        "basmala": bool(BASMALA_PATTERN.search(stripped)),
        "scene_num": bool(SCENE_NUM_PATTERN.search(stripped)),
        "time_location": bool(TIME_LOCATION_PATTERN.search(stripped)),
        "transition": is_transition,
        "character": bool(CHARACTER_PATTERN.match(stripped)),
        "has_colon": ":" in stripped,
        "has_parenthetical": has_parenthetical,
        "contains_parenthetical": contains_parenthetical(stripped),
        "is_parenthetical_line": looks_like_parenthetical_line(stripped),
        "is_short": len(stripped) <= SHORT_LINE_MAX,
        "is_long": len(stripped) >= LONG_LINE_MIN,
        "length": len(stripped),
        "word_count": line_word_count,
        "colon_count": line_colon_count,
        "narrative_hint": has_narrative_verb_hint(stripped),
        "looks_like_short_name": looks_like_short_name(stripped),
        "looks_like_scene_location": looks_like_scene_location(stripped),
        "header_signal_strength": header_signal_strength(stripped),
    }


def extract_all_features(lines: List[str]) -> List[FeatureVector]:
    """استخراج خصائص لكل الأسطر.

    Args:
        lines: قائمة أسطر.

    Returns:
        قائمة قواميس خصائص بنفس ترتيب الأسطر.
    """
    return [extract_features(line) for line in lines]
