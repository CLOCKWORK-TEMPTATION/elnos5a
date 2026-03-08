"""ثوابت وأنماط Regex لمحرك تحليل السيناريو العربي."""

import re

ARABIC_WORD_PATTERN = r"[\u0621-\u064A\u0671-\u06D3]{2,20}"
INLINE_SPACE_OPT = r"[^\S\r\n]*"
INLINE_SPACE_PLUS = r"[^\S\r\n]+"
TIME_WORDS = r"(?:ليل|نهار|صباح|مساء|فجر)"
LOCATION_TYPE_WORDS = r"(?:داخلي|خارجي)"
TRANSITION_WORDS = {"قطع", "قطع إلى"}
SHORT_LINE_MAX = 40
LONG_LINE_MIN = 80
CHARACTER_MAX_WORDS = 4

# مؤشرات مشتركة بين طبقات reconstruction / boundaries / doubt / validation.
ROLE_TITLE_WORDS = {
    "وكيل",
    "رئيس",
    "مدير",
    "دكتور",
    "شيخ",
    "أمين",
    "ضابط",
    "قاضي",
    "مأمور",
}

NARRATIVE_VERB_HINTS = {
    "نرى",
    "يرى",
    "يدخل",
    "تدخل",
    "يخرج",
    "تخرج",
    "يجلس",
    "تجلس",
    "يقف",
    "تقف",
    "ينظر",
    "تنظر",
    "يرفع",
    "ترفع",
    "يمشي",
    "تمشي",
    "يفتح",
    "تفتح",
    "يغلق",
    "تغلق",
    "يبدو",
    "تستمع",
    "يهمس",
    "تهمس",
    "يصرخ",
    "تصرخ",
    "يقول",
    "تقول",
    "قال",
    "يضحك",
    "تضحك",
    "يبكي",
    "تبكي",
    "يجري",
    "تجري",
    "يتجه",
    "تتجه",
    "يظهر",
    "تظهر",
    "يستدير",
    "تستدير",
    "تعود",
    "تحبس",
    "يكتب",
    "تكتب",
    "يتحدث",
    "تتحدث",
    "تحدث",
    "يرد",
    "ترد",
    "ينهض",
    "تنهض",
    "يتنهد",
    "تتنهد",
    "يسكت",
    "تسكت",
    "بدأت",
    "دخل",
    "تقوم",
    "تقبله",
    "تبدو",
    "يبتسم",
    "يتحرك",
    "يقترب",
    "تقترب",
    "يتركها",
    "يتركهما",
    "تتركها",
    "تتركه",
    "نظر",
    "يرن",
    "تسرح",
    "تتحركا",
    "تهز",
    "فينظر",
    "فتنظر",
    "فيرن",
    "مازال",
    "مازالت",
    "لايزال",
    "لاتزال",
}

LOCATION_HINTS = {
    "شقة",
    "بيت",
    "منزل",
    "غرفة",
    "صالة",
    "مطبخ",
    "حمام",
    "شارع",
    "مكتب",
    "مقهى",
    "مطعم",
    "مطار",
    "مستشفى",
    "مدرسة",
    "جامعة",
    "مزرعة",
    "سجن",
    "قسم",
    "سيارة",
    "مباحث",
    "مبنى",
    "حديقة",
    "قاعة",
    "ممر",
    "فندق",
    "فيلا",
    "محل",
    "مخزن",
    "استوديو",
    "سطح",
    "مديرية",
}

DIALOGUE_MARKERS = {
    "أنا",
    "انا",
    "أنت",
    "انت",
    "إنت",
    "هو",
    "هي",
    "احنا",
    "إحنا",
    "نحن",
    "فين",
    "ليه",
    "لماذا",
    "كيف",
    "ازاي",
    "إزاي",
    "متى",
    "ماذا",
    "هل",
    "يا",
    "مش",
    "لو",
    "بس",
    "عن",
    "خير",
    "ممكن",
    "والعمل",
    "لازم",
    "طب",
    "تصبحوا",
    "فاكرة",
}

DIALOGUE_ACTION_STARTERS = {
    "ثم",
    "بينما",
    "وهو",
    "وهي",
    "وقد",
    "تعود",
    "وتعود",
    "وينظر",
    "وتنظر",
    "ويبتسم",
    "وتبتسم",
    "ويغلق",
    "وتغلق",
    "ويفتح",
    "وتفتح",
    "وينهض",
    "وتنهض",
    "ويتجه",
    "وتتجه",
    "ويستدير",
    "وتستدير",
    "يتنهد",
    "تتنهد",
    "ينهض",
    "تنهض",
    "ينظر",
    "تنظر",
    "يجلس",
    "تجلس",
    "يقف",
    "تقف",
    "يفتح",
    "تفتح",
    "يغلق",
    "تغلق",
    "يتركها",
    "يتركهما",
    "تتركها",
    "تتركه",
    "وتتركه",
    "تستمع",
    "يبدو",
    "تبدو",
    "يبتسم",
    "تقبله",
    "تستدير",
    "يقترب",
    "ينزل",
    "يتحرك",
    "تسرح",
    "تتحركا",
    "تهز",
}

ACTION_LINE_STARTERS = (
    "يكتب على الشاشة",
    "يجلس",
    "يأخذ",
    "تمشي",
    "تتوقف",
    "تقف",
    "يدفع",
)

ACTION_PREFIX_HINTS = {
    "ثم",
    "بينما",
    "وهو",
    "وهي",
    "وقد",
    "على",
    "الى",
    "إلى",
    "في",
    "له",
    "لها",
    "من",
    "عن",
    "مع",
    "خلف",
    "امام",
    "أمام",
    "تجاه",
    "وقد",
}

BASMALA_PATTERN = re.compile(r"بسم\s+الله\s+الرحمن\s+الرحيم")
SCENE_NUM_PATTERN = re.compile(rf"مشهد{INLINE_SPACE_OPT}(\d+)")
TIME_LOCATION_PATTERN = re.compile(
    rf"{TIME_WORDS}{INLINE_SPACE_OPT}[-–—]?{INLINE_SPACE_OPT}{LOCATION_TYPE_WORDS}"
)
SCENE_NUMBER_TAIL_PATTERN = re.compile(
    rf"^(?P<scene>مشهد{INLINE_SPACE_OPT}\d+){INLINE_SPACE_PLUS}(?P<tail>{TIME_WORDS}{INLINE_SPACE_OPT}[-–—]?{INLINE_SPACE_OPT}{LOCATION_TYPE_WORDS})$"
)

_NARRATIVE_VERB_PATTERN = r"(?:%s)" % "|".join(sorted(NARRATIVE_VERB_HINTS, key=len, reverse=True))
_CHARACTER_TOKEN = (
    rf"(?!{_NARRATIVE_VERB_PATTERN}\b)"
    rf"(?!{TIME_WORDS}\b)"
    rf"(?!{LOCATION_TYPE_WORDS}\b)"
    rf"{ARABIC_WORD_PATTERN}"
)

# أنماط إعادة البناء (Reconstruction)
RECONSTRUCTION_SCENE = re.compile(rf"(مشهد{INLINE_SPACE_OPT}\d+)")
RECONSTRUCTION_TIME = re.compile(
    rf"({TIME_WORDS}{INLINE_SPACE_OPT}[-–—]?{INLINE_SPACE_OPT}{LOCATION_TYPE_WORDS})"
)
RECONSTRUCTION_TRANSITION = re.compile(
    r"(?<![\u0621-\u064A\u0671-\u06D3])(قطع(?:\s+إلى)?)(?![\u0621-\u064A\u0671-\u06D3])"
)
RECONSTRUCTION_CHARACTER = re.compile(
    rf"({_CHARACTER_TOKEN}(?:{INLINE_SPACE_PLUS}{_CHARACTER_TOKEN}){{0,{CHARACTER_MAX_WORDS - 1}}}{INLINE_SPACE_OPT}:)"
)

# أنماط استخراج الخصائص
CHARACTER_PATTERN = re.compile(
    rf"^{_CHARACTER_TOKEN}(?:{INLINE_SPACE_PLUS}{_CHARACTER_TOKEN}){{0,{CHARACTER_MAX_WORDS - 1}}}{INLINE_SPACE_OPT}:$"
)
PARENTHETICAL_PATTERN = re.compile(r"\(.*?\)")
