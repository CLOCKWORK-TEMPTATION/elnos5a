"""جسر JSON عبر stdin/stdout لاستخدام المحرك من تطبيق TypeScript."""

from __future__ import annotations

import json
import sys
import traceback
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Tuple

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from engine.formatter import to_fountain, to_schema_elements, to_schema_text
    from engine.parser import parse_screenplay_detailed
    from engine.states import State
else:
    from .formatter import to_fountain, to_schema_elements, to_schema_text
    from .parser import parse_screenplay_detailed
    from .states import State


BRIDGE_PROTOCOL = "karank-engine-bridge"
BRIDGE_VERSION = "1.0.0"
DOCX_NAMESPACE = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def _configure_stdio() -> None:
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")


def _legacy_elements_payload(elements: List[Tuple[State, str]]) -> List[Dict[str, str]]:
    return [{"type": state.value, "content": value.strip()} for state, value in elements]


def _read_docx(path: Path) -> str:
    with zipfile.ZipFile(path) as archive:
        tree = ET.parse(archive.open("word/document.xml"))

    paragraphs = tree.findall(".//w:p", DOCX_NAMESPACE)
    lines: List[str] = []

    for paragraph in paragraphs:
        parts: List[str] = []
        for node in paragraph.iter():
            tag = node.tag.rsplit("}", 1)[-1]
            if tag == "t" and node.text:
                parts.append(node.text)
            elif tag == "tab":
                parts.append("\t")
            elif tag in {"br", "cr"}:
                parts.append("\n")
            elif tag == "lastRenderedPageBreak":
                parts.append("\f")

        paragraph_text = "".join(parts)
        for line in paragraph_text.split("\n"):
            if line.strip():
                lines.append(line)

    return "\n".join(lines)


def _bridge_result(text: str, *, input_kind: str, path: Path | None = None) -> Dict[str, Any]:
    parse_result = parse_screenplay_detailed(text)
    elements = parse_result["elements"]
    schema_elements = to_schema_elements(elements)
    schema_text = to_schema_text(elements)
    fountain = to_fountain(elements)
    raw_line_count = len([line for line in text.splitlines() if line.strip()])

    snake_case_result: Dict[str, Any] = {
        "elements": _legacy_elements_payload(elements),
        "schema_elements": schema_elements,
        "schema_text": schema_text,
        "fountain": fountain,
        "issues": parse_result["issues"],
        "validation_issues": parse_result["validation_issues"],
        "boundary_proposals": parse_result["boundary_proposals"],
        "applied_operations": parse_result["applied_operations"],
        "selected_pipeline": parse_result["selected_pipeline"],
        "auto_approved": parse_result["auto_approved"],
        "input": {
            "kind": input_kind,
            "path": str(path) if path else None,
            "filename": path.name if path else None,
            "text_length": len(text),
            "non_empty_line_count": raw_line_count,
        },
    }

    snake_case_result["schemaElements"] = snake_case_result["schema_elements"]
    snake_case_result["schemaText"] = snake_case_result["schema_text"]
    snake_case_result["validationIssues"] = snake_case_result["validation_issues"]
    snake_case_result["boundaryProposals"] = snake_case_result["boundary_proposals"]
    snake_case_result["appliedOperations"] = snake_case_result["applied_operations"]
    snake_case_result["selectedPipeline"] = snake_case_result["selected_pipeline"]
    snake_case_result["autoApproved"] = snake_case_result["auto_approved"]

    return snake_case_result


def _success_response(request_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "ok": True,
        "id": request_id,
        "protocol": BRIDGE_PROTOCOL,
        "version": BRIDGE_VERSION,
        "result": result,
    }


def _error_response(
    request_id: Any,
    *,
    code: str,
    message: str,
    details: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    return {
        "ok": False,
        "id": request_id,
        "protocol": BRIDGE_PROTOCOL,
        "version": BRIDGE_VERSION,
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
        },
    }


def _handle_parse_text(request_id: Any, payload: Dict[str, Any]) -> Dict[str, Any]:
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        return _error_response(
            request_id,
            code="INVALID_TEXT",
            message="الحقل text مطلوب ويجب أن يكون نصًا غير فارغ.",
        )
    return _success_response(request_id, _bridge_result(text, input_kind="text"))


def _handle_parse_docx(request_id: Any, payload: Dict[str, Any]) -> Dict[str, Any]:
    raw_path = payload.get("path")
    if not isinstance(raw_path, str) or not raw_path.strip():
        return _error_response(
            request_id,
            code="INVALID_PATH",
            message="الحقل path مطلوب ويجب أن يكون مسارًا غير فارغ.",
        )

    path = Path(raw_path).expanduser()
    if not path.exists():
        return _error_response(
            request_id,
            code="DOCX_NOT_FOUND",
            message="ملف DOCX غير موجود.",
            details={"path": str(path)},
        )

    if path.suffix.lower() != ".docx":
        return _error_response(
            request_id,
            code="INVALID_DOCX_EXTENSION",
            message="الملف يجب أن يكون بامتداد .docx.",
            details={"path": str(path)},
        )

    text = _read_docx(path)
    if not text.strip():
        return _error_response(
            request_id,
            code="EMPTY_DOCX_TEXT",
            message="تمت قراءة الملف لكن النص المستخرج فارغ.",
            details={"path": str(path)},
        )

    return _success_response(request_id, _bridge_result(text, input_kind="docx", path=path))


def _handle_ping(request_id: Any) -> Dict[str, Any]:
    return {
        "ok": True,
        "id": request_id,
        "protocol": BRIDGE_PROTOCOL,
        "version": BRIDGE_VERSION,
        "result": {
            "status": "ok",
            "bridge": BRIDGE_PROTOCOL,
            "version": BRIDGE_VERSION,
        },
    }


def _dispatch(payload: Dict[str, Any]) -> Dict[str, Any]:
    request_id = payload.get("id")
    action = payload.get("action")

    if action == "ping":
        return _handle_ping(request_id)
    if action == "parseText":
        return _handle_parse_text(request_id, payload)
    if action == "parseDocx":
        return _handle_parse_docx(request_id, payload)
    if action == "shutdown":
        return {
            "ok": True,
            "id": request_id,
            "protocol": BRIDGE_PROTOCOL,
            "version": BRIDGE_VERSION,
            "result": {"status": "shutting-down"},
        }

    return _error_response(
        request_id,
        code="UNKNOWN_ACTION",
        message="الأمر غير معروف.",
        details={"action": action},
    )


def main() -> int:
    _configure_stdio()

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            payload = json.loads(line)
            if not isinstance(payload, dict):
                response = _error_response(
                    None,
                    code="INVALID_REQUEST",
                    message="الطلب يجب أن يكون كائن JSON.",
                )
            else:
                response = _dispatch(payload)
        except json.JSONDecodeError as error:
            response = _error_response(
                None,
                code="INVALID_JSON",
                message="تعذر تحليل JSON القادم من stdin.",
                details={"error": str(error)},
            )
        except Exception as error:  # pragma: no cover - مسار طوارئ
            response = _error_response(
                None,
                code="UNHANDLED_EXCEPTION",
                message="حدث خطأ غير متوقع داخل الجسر.",
                details={
                    "error": str(error),
                    "traceback": traceback.format_exc(),
                },
            )

        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()

        if isinstance(response, dict) and response.get("result", {}).get("status") == "shutting-down":
            break

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
