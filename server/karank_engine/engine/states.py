"""تعريف حالات محرك تحليل السيناريو العربي."""

from enum import Enum


class State(str, Enum):
    """حالات عناصر السيناريو."""

    BASMALA = "BASMALA"
    SCENE_HEADER_1 = "SCENE_HEADER_1"      # مشهد + الرقم
    SCENE_HEADER_2 = "SCENE_HEADER_2"      # الوقت + النوع (داخلي/خارجي)
    scene_header_3 = "scene_header_3"      # موقع التصوير
    ACTION = "ACTION"
    CHARACTER = "CHARACTER"
    PARENTHETICAL = "PARENTHETICAL"
    DIALOGUE = "DIALOGUE"
    TRANSITION = "TRANSITION"


STATE_LIST = list(State)
