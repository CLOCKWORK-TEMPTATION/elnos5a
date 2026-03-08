"""الطبقة 6: تصحيحات هيكلية بعد Viterbi."""

from typing import List

from .constants import (
    BASMALA_PATTERN,
    CHARACTER_PATTERN,
    PARENTHETICAL_PATTERN,
    SCENE_NUM_PATTERN,
    TIME_LOCATION_PATTERN,
    TRANSITION_WORDS,
)
from .predicates import looks_like_character_fragment, looks_like_scene_location
from .states import State


def correct_sequence(
    types: List[State],
    lines: List[str],
) -> List[State]:
    """تطبيق قواعد تصحيح على تسلسل الحالات.

    القواعد:
    - CHARACTER يجب أن يتبعه DIALOGUE (ليس ACTION)
    - DIALOGUE بدون CHARACTER قبله يصبح ACTION
    - SCENE_HEADER_1 بدون SCENE_HEADER_2 بعده يُصحح

    Args:
        types: قائمة حالات من Viterbi.
        lines: قائمة الأسطر الأصلية (للسياق).

    Returns:
        قائمة حالات مُصححة.
    """
    result = list(types)
    n = len(result)

    def _looks_like_parenthetical(line: str) -> bool:
        return bool(PARENTHETICAL_PATTERN.fullmatch(line.strip()))

    for i in range(1, n):
        prev = result[i - 1]
        curr = result[i]

        # قاعدة 1: CHARACTER → ACTION يجب أن يكون CHARACTER → DIALOGUE
        if prev == State.CHARACTER and curr == State.ACTION:
            result[i] = State.PARENTHETICAL if _looks_like_parenthetical(lines[i]) else State.DIALOGUE

        # قاعدة 2: CHARACTER → CHARACTER غير منطقي — الثاني DIALOGUE
        if prev == State.CHARACTER and curr == State.CHARACTER:
            result[i] = State.PARENTHETICAL if _looks_like_parenthetical(lines[i]) else State.DIALOGUE

    # قاعدة 3: DIALOGUE بدون CHARACTER قبله
    for i in range(n):
        if result[i] == State.DIALOGUE:
            if i == 0:
                result[i] = State.ACTION
            elif result[i - 1] not in (State.CHARACTER, State.PARENTHETICAL, State.DIALOGUE):
                result[i] = State.ACTION

    for i in range(n):
        if result[i] == State.PARENTHETICAL:
            if i == 0:
                result[i] = State.ACTION
            elif result[i - 1] not in (State.CHARACTER, State.DIALOGUE):
                result[i] = State.ACTION

    for i in range(1, n):
        if result[i] in (State.ACTION, State.CHARACTER):
            if result[i - 1] in (State.SCENE_HEADER_1, State.SCENE_HEADER_2, State.SCENE_HEADER_3):
                if looks_like_scene_location(lines[i]):
                    result[i] = State.SCENE_HEADER_3

    # قاعدة 4: ACTION قصير قبل CHARACTER → جزء من اسم الشخصية
    for i in range(1, n):
        if result[i] == State.CHARACTER and result[i - 1] == State.ACTION:
            if len(lines[i - 1].strip()) <= 15 and looks_like_character_fragment(lines[i - 1]) and not looks_like_scene_location(lines[i - 1]):
                result[i - 1] = State.CHARACTER

    # قاعدة 5: SCENE_HEADER_2 لازم يسبقه SCENE_HEADER_1
    for i in range(n):
        if result[i] == State.SCENE_HEADER_2:
            if i == 0 or result[i - 1] != State.SCENE_HEADER_1:
                result[i] = State.ACTION

    # قاعدة 5: scene_header_3 لازم يسبقه SCENE_HEADER_2
    for i in range(n):
        if result[i] == State.SCENE_HEADER_3:
            if i == 0 or result[i - 1] != State.SCENE_HEADER_2:
                result[i] = State.ACTION

    # قاعدة 6: الأسطر البنيوية الصريحة يجب أن تحتفظ بنوعها مهما كان السياق.
    for i in range(n):
        stripped = lines[i].strip()
        if not stripped:
            continue
        if BASMALA_PATTERN.fullmatch(stripped):
            result[i] = State.BASMALA
            continue
        if CHARACTER_PATTERN.fullmatch(stripped):
            result[i] = State.CHARACTER
            continue
        if stripped in TRANSITION_WORDS:
            result[i] = State.TRANSITION
            continue
        if SCENE_NUM_PATTERN.fullmatch(stripped):
            result[i] = State.SCENE_HEADER_1
            continue
        if TIME_LOCATION_PATTERN.fullmatch(stripped):
            result[i] = State.SCENE_HEADER_2
            continue

    # قاعدة 7: بعد تثبيت الرؤوس الصريحة، أي سطر موقع واضح يلي رأس مشهد
    # يجب أن يُرفع إلى scene_header_3 حتى لو كان Viterbi اعتبره حواراً.
    for i in range(1, n):
        if result[i - 1] not in (State.SCENE_HEADER_2, State.SCENE_HEADER_3):
            continue
        if result[i] not in (State.ACTION, State.CHARACTER, State.DIALOGUE):
            continue
        if looks_like_scene_location(lines[i]):
            result[i] = State.SCENE_HEADER_3

    # قاعدة 8: بعد تثبيت الرؤوس، أعِد إسقاط أي حوار/توجيه بلا متحدث إلى ACTION.
    for i in range(n):
        if result[i] == State.DIALOGUE:
            if i == 0 or result[i - 1] not in (State.CHARACTER, State.PARENTHETICAL, State.DIALOGUE):
                result[i] = State.ACTION
                continue
        if result[i] == State.PARENTHETICAL:
            if i == 0 or result[i - 1] not in (State.CHARACTER, State.DIALOGUE):
                result[i] = State.ACTION

    return result

