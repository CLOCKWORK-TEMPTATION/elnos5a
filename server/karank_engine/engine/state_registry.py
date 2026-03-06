from typing import Dict, Optional, Set, Tuple

from .states import State

STATE_TO_SCHEMA_ELEMENT: Dict[State, str] = {
    State.BASMALA: "BASMALA",
    State.SCENE_HEADER_1: "cene_header_1",
    State.SCENE_HEADER_2: "cene_header_2",
    State.scene_header_3: "scene_header_3",
    State.ACTION: "ACTION",
    State.CHARACTER: "CHARACTER",
    State.PARENTHETICAL: "PARENTHETICAL",
    State.DIALOGUE: "DIALOGUE",
    State.TRANSITION: "TRANSITION",
}

STATE_TO_KEBAB: Dict[State, str] = {
    State.BASMALA: "basmala",
    State.SCENE_HEADER_1: "cene_header_1",
    State.SCENE_HEADER_2: "cene_header_2",
    State.scene_header_3: "scene_header_3",
    State.ACTION: "action",
    State.CHARACTER: "character",
    State.PARENTHETICAL: "parenthetical",
    State.DIALOGUE: "dialogue",
    State.TRANSITION: "transition",
}

SCHEMA_ELEMENTS: Tuple[str, ...] = tuple(STATE_TO_SCHEMA_ELEMENT[state] for state in State)
ALLOWED_TYPES: Set[str] = set(STATE_TO_KEBAB.values())

_LABEL_TO_STATE: Dict[str, State] = {
    "scene_header_top_line": State.SCENE_HEADER_1,
}

for _state in State:
    _LABEL_TO_STATE[_state.value] = _state
    _LABEL_TO_STATE[_state.name] = _state
    _LABEL_TO_STATE[STATE_TO_SCHEMA_ELEMENT[_state]] = _state
    _LABEL_TO_STATE[STATE_TO_KEBAB[_state]] = _state
    _LABEL_TO_STATE[_state.name.lower()] = _state
    _LABEL_TO_STATE[_state.name.lower().replace("_", "-")] = _state


def state_to_schema_element(state: State) -> str:
    return STATE_TO_SCHEMA_ELEMENT[state]


def state_to_kebab(state: State) -> str:
    return STATE_TO_KEBAB[state]


def label_to_state(label: str) -> Optional[State]:
    cleaned = label.strip()
    if not cleaned:
        return None
    direct = _LABEL_TO_STATE.get(cleaned)
    if direct is not None:
        return direct
    normalized = cleaned.lower().replace("_", "-")
    return _LABEL_TO_STATE.get(normalized)


def normalize_type_label(label: str) -> str:
    state = label_to_state(label)
    if state is not None:
        return STATE_TO_KEBAB[state]
    return label.strip().lower().replace("_", "-")
