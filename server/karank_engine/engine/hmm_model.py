"""الطبقة 4: نموذج Hidden Markov — احتمالات الانتقال والإنتاج."""

import math
from typing import Dict, Any

from .states import State

# ─── قيم log-probability ──────────────────────────────────────────
LOG_ZERO = -1e6      # تقريب لـ log(0)
LOG_SURE = 0.0       # log(1)
LOG_HIGH = -0.1      # log(~0.9)
LOG_MED = -1.0       # log(~0.37)
LOG_LOW = -3.0       # log(~0.05)
LOG_VERY_LOW = -5.0  # log(~0.007)

# ─── Initial Probabilities ────────────────────────────────────────
INITIAL_PROB: Dict[State, float] = {
    State.BASMALA: LOG_SURE,
    State.SCENE_HEADER_1: LOG_MED,
    State.SCENE_HEADER_2: LOG_ZERO,
    State.scene_header_3: LOG_ZERO,
    State.ACTION: LOG_ZERO,
    State.CHARACTER: LOG_ZERO,
    State.PARENTHETICAL: LOG_ZERO,
    State.DIALOGUE: LOG_ZERO,
    State.TRANSITION: LOG_ZERO,
}

# ─── Transition Probabilities ─────────────────────────────────────
# transition_prob[from_state][to_state] = log_probability
_T: Dict[State, Dict[State, float]] = {s: {} for s in State}


def _set_transitions(from_s: State, transitions: Dict[State, float]):
    """تعيين احتمالات الانتقال من حالة معينة."""
    for s in State:
        _T[from_s][s] = transitions.get(s, LOG_ZERO)


_set_transitions(State.BASMALA, {
    State.SCENE_HEADER_1: LOG_SURE,
})

_set_transitions(State.SCENE_HEADER_1, {
    State.SCENE_HEADER_2: LOG_SURE,
})

_set_transitions(State.SCENE_HEADER_2, {
    State.scene_header_3: LOG_HIGH,
    State.ACTION: LOG_MED,
    State.CHARACTER: LOG_LOW,
})

_set_transitions(State.scene_header_3, {
    State.ACTION: LOG_HIGH,
    State.CHARACTER: LOG_MED,
})

_set_transitions(State.ACTION, {
    State.ACTION: LOG_MED,
    State.CHARACTER: LOG_HIGH,
    State.TRANSITION: LOG_LOW,
})

_set_transitions(State.CHARACTER, {
    State.PARENTHETICAL: LOG_HIGH,
    State.DIALOGUE: LOG_MED,
})

_set_transitions(State.PARENTHETICAL, {
    State.DIALOGUE: LOG_SURE,
})

_set_transitions(State.DIALOGUE, {
    State.PARENTHETICAL: LOG_LOW,
    State.DIALOGUE: LOG_MED,
    State.ACTION: LOG_MED,
    State.CHARACTER: LOG_HIGH,
    State.TRANSITION: LOG_LOW,
})

_set_transitions(State.TRANSITION, {
    State.SCENE_HEADER_1: LOG_SURE,
})


def transition_prob(from_state: State, to_state: State) -> float:
    """إرجاع log-probability للانتقال بين حالتين."""
    return _T[from_state].get(to_state, LOG_ZERO)


# ─── Emission Probabilities ───────────────────────────────────────
def emission_prob(state: State, features: Dict[str, Any]) -> float:
    """إرجاع log-probability لإنتاج سطر بخصائص معينة من حالة معينة.

    Args:
        state: الحالة المُفترضة.
        features: خصائص السطر المُستخرجة.

    Returns:
        log-probability.
    """
    if state == State.BASMALA:
        return LOG_SURE if features["basmala"] else LOG_ZERO

    if state == State.SCENE_HEADER_1:
        if features["scene_num"]:
            return LOG_SURE
        if features["header_signal_strength"] >= 2 and not features["time_location"]:
            return LOG_LOW
        return LOG_ZERO
 
    if state == State.SCENE_HEADER_2:
        if features["time_location"]:
            return LOG_SURE
        if features["header_signal_strength"] >= 2 and features["is_short"]:
            return LOG_LOW
        return LOG_ZERO
 
    if state == State.scene_header_3:
        if features["looks_like_scene_location"]:
            if not features["character"] and not features["transition"]:
                return LOG_SURE if features["is_short"] else LOG_HIGH
        if not features["scene_num"] and not features["time_location"]:
            if not features["character"] and not features["transition"]:
                if not features["basmala"] and features["is_short"] and not features["looks_like_short_name"]:
                    return LOG_HIGH
        return LOG_ZERO
 
    if state == State.CHARACTER:
        if features["scene_num"] or features["time_location"] or features["transition"] or features["looks_like_scene_location"]:
            return LOG_ZERO
        if features["character"]:
            return LOG_SURE
        if features["looks_like_short_name"] and features["has_colon"]:
            return LOG_HIGH
        if features["looks_like_short_name"] and features["is_short"]:
            return LOG_LOW
        if features["has_colon"] and features["is_short"]:
            return LOG_MED
        return LOG_ZERO
 
    if state == State.PARENTHETICAL:
        if features["is_parenthetical_line"]:
            return LOG_SURE
        if features["contains_parenthetical"] and features["is_short"]:
            return LOG_HIGH
        if features["has_parenthetical"]:
            return LOG_LOW
        return LOG_ZERO
 
    if state == State.DIALOGUE:
        if features["is_parenthetical_line"]:
            return LOG_VERY_LOW
        if not features["scene_num"] and not features["transition"] and not features["looks_like_scene_location"]:
            if not features["character"] and not features["looks_like_short_name"]:
                return LOG_HIGH if features["is_long"] else LOG_MED
        return LOG_VERY_LOW
 
    if state == State.TRANSITION:
        return LOG_SURE if features["transition"] else LOG_ZERO
 
    if state == State.ACTION:
        if features["scene_num"] or features["transition"]:
            return LOG_ZERO
        if features["looks_like_scene_location"]:
            return LOG_LOW
        if features["character"]:
            return LOG_VERY_LOW
        if features["is_parenthetical_line"]:
            return LOG_LOW
        if features["has_parenthetical"]:
            return LOG_LOW
        if features["basmala"]:
            return LOG_ZERO
        if features["looks_like_short_name"]:
            return LOG_LOW
        if features["narrative_hint"]:
            return LOG_HIGH
        return LOG_HIGH if features["is_long"] else LOG_MED

    return LOG_ZERO


def initial_prob(state: State) -> float:
    """إرجاع log-probability الابتدائي لحالة."""
    return INITIAL_PROB.get(state, LOG_ZERO)
