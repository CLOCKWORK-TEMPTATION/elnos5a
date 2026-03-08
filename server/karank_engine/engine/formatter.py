"""الطبقة 6: تحويل العناصر المُصنفة إلى صيغ الإخراج."""

import json
from typing import Dict, List, Tuple

from .normalization import normalize_elements
from .state_registry import state_to_schema_element
from .states import State


def _merge_character_names(
    elements: List[Tuple[State, str]],
) -> List[Tuple[State, str]]:
    """دمج أسطر CHARACTER المتتالية في اسم واحد."""
    return normalize_elements(elements)


def _schema_element_name(state: State) -> str:
    if isinstance(state, State):
        return state_to_schema_element(state)
    text = str(state).strip()
    if text.startswith("State."):
        text = text.split(".", 1)[1]
    return text.replace("_", "-")


def to_schema_elements(elements: List[Tuple[State, str]]) -> List[Dict[str, str]]:
    data = []
    for state, value in _merge_character_names(elements):
        data.append({
            "element": _schema_element_name(state),
            "value": value.strip(),
        })
    return data


def to_schema_json(elements: List[Tuple[State, str]]) -> str:
    return json.dumps(to_schema_elements(elements), ensure_ascii=False, indent=2)


def to_schema_text(elements: List[Tuple[State, str]]) -> str:
    return "\n".join(
        f"{item['element']} = {item['value']}"
        for item in to_schema_elements(elements)
    )


def to_fountain(elements: List[Tuple[State, str]]) -> str:
    """تحويل العناصر إلى صيغة Fountain.

    Args:
        elements: قائمة أزواج (حالة، نص).

    Returns:
        نص بصيغة Fountain.
    """
    elements = _merge_character_names(elements)
    output = []

    for state, value in elements:
        value = value.strip()

        if state == State.BASMALA:
            output.append("/* " + value + " */")

        elif state == State.SCENE_HEADER_1:
            output.append("\n." + value)

        elif state == State.SCENE_HEADER_2:
            output.append(value)

        elif state == State.SCENE_HEADER_3:
            output.append(value)

        elif state == State.CHARACTER:
            name = value.replace(":", "").strip()
            output.append("\n@" + name)

        elif state == State.PARENTHETICAL:
            output.append(value)

        elif state == State.DIALOGUE:
            output.append(value)

        elif state == State.ACTION:
            output.append("\n" + value)

        elif state == State.TRANSITION:
            output.append("\n> " + value + " <")

    return "\n".join(output).strip()


def to_json(elements: List[Tuple[State, str]]) -> str:
    """تحويل العناصر إلى صيغة JSON.

    Args:
        elements: قائمة أزواج (حالة، نص).

    Returns:
        نص JSON.
    """
    data = []
    for state, value in _merge_character_names(elements):
        data.append({
            "type": state.value if isinstance(state, State) else str(state),
            "content": value.strip(),
        })
    return json.dumps(data, ensure_ascii=False, indent=2)
