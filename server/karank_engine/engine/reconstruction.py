"""الطبقة 1: إعادة بناء الأسطر من النص المسطح القادم من Word."""

import re

from .constants import (
    RECONSTRUCTION_CHARACTER,
    RECONSTRUCTION_SCENE,
    RECONSTRUCTION_TIME,
    RECONSTRUCTION_TRANSITION,
)


def _clean_artifacts(text: str) -> str:
    """إزالة رموز وأقواس معقوفة ومسافات زائدة."""
    text = text.replace("{", " ").replace("}", " ")
    text = text.replace("\f", "\n")
    text = re.sub(r"\r\n?", "\n", text)
    text = text.replace("\t", " ")
    text = re.sub(r" ?\n ?", "\n", text)
    return text


def _insert_breaks(text: str) -> str:
    """إدراج فواصل أسطر قبل وبعد العلامات الهيكلية المعروفة."""
    # ترتيب مهم: المشهد أولاً، ثم الوقت، ثم الانتقال، ثم الشخصية

    # أنماط تحتاج فاصل قبل فقط
    before_only = [
        RECONSTRUCTION_SCENE,
        RECONSTRUCTION_TRANSITION,
    ]
    for pat in before_only:
        text = pat.sub(lambda m: "\n" + m.group(0), text)

    # أنماط تحتاج فاصل قبل وبعد (عشان نفصل اللي بعدها)
    before_and_after = [
        RECONSTRUCTION_TIME,
        RECONSTRUCTION_CHARACTER,
    ]
    for pat in before_and_after:
        text = pat.sub(lambda m: "\n" + m.group(0) + "\n", text)

    return text


def _normalize_whitespace(text: str) -> str:
    """تنظيف المسافات والأسطر الفارغة المتكررة."""
    lines = []
    for line in text.split("\n"):
        stripped = line.rstrip()
        if stripped.strip():
            lines.append(stripped)
    return "\n".join(lines)


def reconstruct_text(text: str) -> str:
    """إعادة بناء النص المسطح إلى أسطر مفصولة بشكل صحيح.

    Args:
        text: النص المسطح القادم من Word.

    Returns:
        النص بعد إعادة البناء مع فواصل أسطر في الأماكن الصحيحة.
    """
    text = _clean_artifacts(text)
    text = _insert_breaks(text)
    text = _normalize_whitespace(text)
    return text
