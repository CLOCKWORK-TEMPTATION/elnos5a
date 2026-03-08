import re
from typing import Optional, Tuple

from .constants import (
    ACTION_LINE_STARTERS,
    ACTION_PREFIX_HINTS,
    ARABIC_WORD_PATTERN,
    BASMALA_PATTERN,
    CHARACTER_MAX_WORDS,
    DIALOGUE_ACTION_STARTERS,
    DIALOGUE_MARKERS,
    LOCATION_HINTS,
    NARRATIVE_VERB_HINTS,
    INLINE_SPACE_PLUS,
    PARENTHETICAL_PATTERN,
    ROLE_TITLE_WORDS,
    SCENE_NUM_PATTERN,
    SCENE_NUMBER_TAIL_PATTERN,
    TIME_LOCATION_PATTERN,
    TRANSITION_WORDS,
)

_WORD_RE = re.compile(ARABIC_WORD_PATTERN)
_CHARACTER_FRAGMENT_RE = re.compile(
    rf"^{ARABIC_WORD_PATTERN}(?:{INLINE_SPACE_PLUS}{ARABIC_WORD_PATTERN}){{0,{CHARACTER_MAX_WORDS - 1}}}[^\S\r\n]*:?$"
)
_NARRATIVE_VERB_RE = re.compile(
    r"(?:%s)" % "|".join(sorted(NARRATIVE_VERB_HINTS, key=len, reverse=True))
)
_DIALOGUE_ACTION_START_RE = re.compile(
    r"(?:%s)" % "|".join(sorted(DIALOGUE_ACTION_STARTERS, key=len, reverse=True))
)
_ACTION_LINE_START_RE = re.compile(
    r"(?:%s)" % "|".join(sorted(ACTION_LINE_STARTERS, key=len, reverse=True))
)
_DIALOGUE_CONNECTORS = {"ثم", "بينما", "وهو", "وهي"}
_DIALOGUE_CONTINUATION_TAILS = {"من", "في", "على", "عن", "مع", "الى", "إلى", "ولا", "او", "أو"}


def word_count(text: str) -> int:
    return len(_WORD_RE.findall(text))


def colon_count(text: str) -> int:
    return text.count(":")


def strip_trailing_colon(text: str) -> str:
    return text.strip().rstrip(":").strip()


def has_narrative_verb_hint(text: str) -> bool:
    return bool(_NARRATIVE_VERB_RE.search(text.strip()))


def contains_parenthetical(text: str) -> bool:
    return bool(PARENTHETICAL_PATTERN.search(text.strip()))


def looks_like_parenthetical_line(text: str) -> bool:
    stripped = text.strip()
    if bool(PARENTHETICAL_PATTERN.fullmatch(stripped)):
        return True
    return stripped.startswith("(") and stripped.endswith(")") and len(stripped) >= 4


def is_transition_text(text: str) -> bool:
    return text.strip() in TRANSITION_WORDS


def split_scene_number_tail(text: str) -> Optional[Tuple[str, str]]:
    stripped = text.strip()
    match = SCENE_NUMBER_TAIL_PATTERN.match(stripped)
    if not match:
        return None
    return match.group("scene").strip(), match.group("tail").strip()


def _looks_like_scene_location_candidate(text: str) -> bool:
    stripped = text.strip()
    if not stripped or ":" in stripped:
        return False
    if bool(BASMALA_PATTERN.search(stripped)):
        return False
    if bool(SCENE_NUM_PATTERN.search(stripped)) or bool(TIME_LOCATION_PATTERN.search(stripped)):
        return False
    if is_transition_text(stripped):
        return False
    if looks_like_parenthetical_line(stripped):
        return False

    words = _WORD_RE.findall(stripped)
    tokens = len(words)
    if tokens < 2:
        return False
    if has_narrative_verb_hint(stripped):
        return False
    if any(word in DIALOGUE_MARKERS for word in words):
        return False
    if any(ch in stripped for ch in "-–—"):
        return tokens <= 8
    if any(word in LOCATION_HINTS for word in words):
        return tokens <= 6
    return tokens <= 3


def _has_strong_scene_location_hint(text: str) -> bool:
    stripped = text.strip()
    words = _WORD_RE.findall(stripped)
    return any(ch in stripped for ch in "-–—") or any(word in LOCATION_HINTS for word in words)


def split_scene_header_action(text: str) -> Optional[Tuple[str, str]]:
    stripped = text.strip()
    if not stripped or ":" in stripped:
        return None

    for match in _NARRATIVE_VERB_RE.finditer(stripped):
        header = stripped[:match.start()].strip(" ،")
        action = stripped[match.start():].strip(" ،")
        if not header or not action:
            continue
        if not _looks_like_scene_location_candidate(header):
            continue
        if not _has_strong_scene_location_hint(header):
            continue
        if not has_narrative_verb_hint(action):
            continue
        return header, action

    return None


def looks_like_scene_location(text: str) -> bool:
    stripped = text.strip()
    if split_scene_header_action(stripped):
        return False
    return _looks_like_scene_location_candidate(stripped)


def looks_like_character_fragment(text: str) -> bool:
    stripped = strip_trailing_colon(text)
    if not stripped:
        return False
    if any(ch in stripped for ch in ".،!?[]{}()0123456789/-–—"):
        return False
    if bool(SCENE_NUM_PATTERN.search(stripped)) or bool(TIME_LOCATION_PATTERN.search(stripped)):
        return False
    if is_transition_text(stripped):
        return False
    if looks_like_parenthetical_line(stripped):
        return False
    if word_count(stripped) > CHARACTER_MAX_WORDS:
        return False
    if has_narrative_verb_hint(stripped):
        return False
    return bool(_CHARACTER_FRAGMENT_RE.match(stripped))


def looks_like_short_name(text: str) -> bool:
    stripped = strip_trailing_colon(text)
    if not stripped:
        return False
    if any(ch in stripped for ch in ".،!?[]{}0123456789/-–—"):
        return False
    if bool(SCENE_NUM_PATTERN.search(stripped)) or bool(TIME_LOCATION_PATTERN.search(stripped)):
        return False
    if is_transition_text(stripped):
        return False
    if looks_like_parenthetical_line(stripped):
        return False
    if word_count(stripped) > CHARACTER_MAX_WORDS:
        return False
    if has_narrative_verb_hint(stripped):
        return False
    return True


def looks_like_composite_character_tail(text: str) -> bool:
    stripped = strip_trailing_colon(text)
    words = _WORD_RE.findall(stripped)
    if not looks_like_character_fragment(stripped):
        return False
    if not words or len(words) > CHARACTER_MAX_WORDS - 1:
        return False
    return words[0] not in ROLE_TITLE_WORDS


def extract_action_character_rebalance(prev_text: str, current_text: str) -> Optional[Tuple[str, str]]:
    current_tail = strip_trailing_colon(current_text)
    if not looks_like_composite_character_tail(current_tail):
        return None

    prev_matches = list(_WORD_RE.finditer(prev_text.strip()))
    if not prev_matches:
        return None

    last_match = prev_matches[-1]
    role_word = last_match.group(0)
    if role_word not in ROLE_TITLE_WORDS:
        return None

    action_head = prev_text.strip()[:last_match.start()].strip()
    role_fragment = prev_text.strip()[last_match.start():].strip()
    if not looks_like_character_fragment(role_fragment):
        return None
    if action_head and not has_narrative_verb_hint(action_head):
        return None

    composite_label = f"{role_fragment} {current_tail}".strip()
    if not looks_like_character_fragment(composite_label):
        return None

    return action_head, f"{composite_label} :"


def split_character_prefix(text: str) -> Optional[Tuple[str, str]]:
    stripped = text.strip()
    if not stripped.endswith(":"):
        return None
    if looks_like_character_fragment(stripped) and word_count(stripped) <= 2:
        return None

    words = list(_WORD_RE.finditer(strip_trailing_colon(stripped)))
    if len(words) < 2:
        return None

    candidates: list[tuple[int, int, str, str]] = []
    min_start = max(0, len(words) - CHARACTER_MAX_WORDS)
    for start_index in range(min_start, len(words)):
        start = words[start_index].start()
        prefix = stripped[:start].strip()
        candidate = stripped[start:].strip()
        if not prefix or not looks_like_character_fragment(candidate):
            continue
        first_word = words[start_index].group(0)
        priority = 2 if first_word in ROLE_TITLE_WORDS else 1
        candidates.append((priority, len(words) - start_index, prefix, candidate))

    if not candidates:
        return None

    candidates.sort(key=lambda item: (-item[0], item[1]))
    for priority, _width, prefix, candidate in candidates:
        if looks_like_action_prefix(prefix):
            return prefix, candidate
        if priority == 2 and word_count(prefix) <= 2:
            return prefix, candidate
        if word_count(prefix) >= 2 and word_count(candidate) <= 2:
            return prefix, candidate

    for _priority, _width, prefix, candidate in candidates:
        if word_count(candidate) <= 2:
            return prefix, candidate

    return None


def looks_like_action_prefix(prefix: str) -> bool:
    stripped = prefix.strip()
    if not stripped:
        return False
    if has_narrative_verb_hint(stripped):
        return True

    words = _WORD_RE.findall(stripped)
    if not words:
        return False

    if words[0] in ACTION_PREFIX_HINTS:
        return True
    if len(words) == 1:
        return False
    if looks_like_short_name(stripped):
        return False
    return any(word in ACTION_PREFIX_HINTS for word in words[:2])


def _looks_like_dialogue_prefix(text: str) -> bool:
    stripped = text.strip()
    words = _WORD_RE.findall(stripped)
    if word_count(stripped) < 2 or not words:
        return False
    if any(marker in stripped for marker in ("..", "...", "؟", "!", ".")):
        return True
    return words[0] in DIALOGUE_MARKERS or any(word in DIALOGUE_MARKERS for word in words[:2])


def split_dialogue_action(text: str) -> Optional[Tuple[str, str]]:
    stripped = text.strip()
    if not stripped or ":" in stripped or looks_like_parenthetical_line(stripped):
        return None
    if word_count(stripped) < 4:
        return None

    for match in _DIALOGUE_ACTION_START_RE.finditer(stripped):
        dialogue = stripped[:match.start()].strip(" ،")
        action = stripped[match.start():].strip(" ،")
        if not dialogue or not action:
            continue
        if not _looks_like_dialogue_prefix(dialogue):
            continue
        if not _looks_like_dialogue_action_tail(action):
            continue
        if looks_like_scene_location(action):
            continue
        return dialogue, action

    return None


def find_action_split_index(text: str) -> Optional[int]:
    stripped = text.strip()
    if not stripped or word_count(stripped) < 6:
        return None

    if not _starts_like_action_line(stripped):
        return None

    for match in _ACTION_LINE_START_RE.finditer(stripped):
        if match.start() == 0:
            continue
        if _is_nested_action_match(stripped, match.start()):
            continue

        prefix = stripped[:match.start()].strip(" ،")
        suffix = stripped[match.start():].strip(" ،")
        if word_count(prefix) < 3 or word_count(suffix) < 2:
            continue
        if not _starts_like_action_line(suffix):
            continue
        return match.start()

    return None


def split_action_line(text: str) -> Optional[Tuple[str, str]]:
    split_index = find_action_split_index(text)
    if split_index is None:
        return None
    stripped = text.strip()
    return stripped[:split_index].strip(" ،"), stripped[split_index:].strip(" ،")


def count_action_split_candidates(text: str) -> int:
    stripped = text.strip()
    if not stripped or not _starts_like_action_line(stripped):
        return 0

    count = 0
    for match in _ACTION_LINE_START_RE.finditer(stripped):
        if match.start() == 0 or _is_nested_action_match(stripped, match.start()):
            continue
        prefix = stripped[:match.start()].strip(" ،")
        suffix = stripped[match.start():].strip(" ،")
        if word_count(prefix) >= 3 and word_count(suffix) >= 2 and _starts_like_action_line(suffix):
            count += 1
    return count


def merge_action_fragments(head: str, tail: str) -> str:
    left = head.rstrip()
    right = tail.lstrip()
    if not left:
        return right
    if not right:
        return left

    last_token = left.split()[-1] if left.split() else ""
    if last_token in {"ي", "ت", "يت", "ل", "و", "ف", "ب", "ك", "فت", "وت"}:
        return f"{left}{right}"
    return f"{left} {right}"


def looks_like_dialogue_continuation(previous_text: str, current_text: str) -> bool:
    previous = previous_text.strip()
    current = current_text.strip()
    if not previous or not current:
        return False
    if looks_like_parenthetical_line(current):
        return False
    if looks_like_scene_location(current):
        return False
    if is_transition_text(current):
        return False
    if has_narrative_verb_hint(current) or _starts_like_action_line(current):
        return False
    if word_count(current) < 3:
        return False

    previous_words = _WORD_RE.findall(previous)
    current_words = _WORD_RE.findall(current)
    if not previous_words or not current_words:
        return False

    return previous_words[-1] in _DIALOGUE_CONTINUATION_TAILS


def _starts_like_action_line(text: str) -> bool:
    stripped = text.strip()
    return bool(_ACTION_LINE_START_RE.match(stripped)) or has_narrative_verb_hint(stripped)


def _is_nested_action_match(text: str, index: int) -> bool:
    prefix = text[:index].rstrip()
    for connector in ("بينما", "وهو", "وهي"):
        if prefix.endswith(f" {connector}") or prefix.endswith(connector):
            return True
    previous_char = text[index - 1]
    if previous_char and previous_char not in {" ", "\t", "\n"}:
        return True
    return False


def _looks_like_dialogue_action_tail(action: str) -> bool:
    stripped = action.strip()
    if has_narrative_verb_hint(stripped):
        return True

    for connector in _DIALOGUE_CONNECTORS:
        if not stripped.startswith(connector):
            continue
        remainder = stripped[len(connector):].strip()
        if has_narrative_verb_hint(remainder):
            return True

    return False


def header_signal_strength(text: str) -> int:
    stripped = text.strip()
    score = 0
    if bool(SCENE_NUM_PATTERN.search(stripped)):
        score += 1
    if bool(TIME_LOCATION_PATTERN.search(stripped)):
        score += 1
    if any(ch in stripped for ch in "-–—"):
        score += 1
    if split_scene_number_tail(stripped):
        score += 1
    return score
