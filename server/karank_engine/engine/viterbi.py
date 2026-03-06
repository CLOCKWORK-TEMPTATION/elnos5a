"""الطبقة 5: Viterbi Decoder — إيجاد أفضل تسلسل حالات."""

from typing import Dict, Any, List

from .states import State, STATE_LIST
from .hmm_model import initial_prob, transition_prob, emission_prob


def viterbi(
    lines: List[str],
    features: List[Dict[str, Any]],
) -> List[State]:
    """تنفيذ خوارزمية Viterbi لإيجاد أفضل تسلسل حالات.

    Args:
        lines: قائمة الأسطر.
        features: قائمة خصائص كل سطر.

    Returns:
        قائمة حالات بنفس طول الأسطر.
    """
    if not lines:
        return []

    n = len(lines)
    states = STATE_LIST

    # V[t][s] = أعلى log-probability للوصول للحالة s في الخطوة t
    V: List[Dict[State, float]] = [{}]
    # backpointer[t][s] = الحالة السابقة الأفضل
    backpointer: List[Dict[State, State]] = [{}]

    # ─── التهيئة (t=0) ───────────────────────────────────────────
    for s in states:
        V[0][s] = initial_prob(s) + emission_prob(s, features[0])
        backpointer[0][s] = s  # لا يوجد سابق

    # ─── التكرار (t=1..n-1) ──────────────────────────────────────
    for t in range(1, n):
        V.append({})
        backpointer.append({})

        for s in states:
            best_prob = float("-inf")
            best_prev = states[0]

            for s0 in states:
                prob = (
                    V[t - 1][s0]
                    + transition_prob(s0, s)
                    + emission_prob(s, features[t])
                )
                if prob > best_prob:
                    best_prob = prob
                    best_prev = s0

            V[t][s] = best_prob
            backpointer[t][s] = best_prev

    # ─── الإنهاء: إيجاد أفضل حالة أخيرة ─────────────────────────
    best_final_prob = float("-inf")
    best_final_state = states[0]
    for s in states:
        if V[n - 1][s] > best_final_prob:
            best_final_prob = V[n - 1][s]
            best_final_state = s

    # ─── Backtracking ────────────────────────────────────────────
    path = [best_final_state]
    current = best_final_state
    for t in range(n - 1, 0, -1):
        current = backpointer[t][current]
        path.append(current)

    path.reverse()
    return path
