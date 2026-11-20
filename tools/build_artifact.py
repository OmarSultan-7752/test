#!/usr/bin/env python3
"""يفحص بنك الأسئلة ويجمع الصفحة للنشر كـ artifact.

الإخراج: ملف HTML واحد (بدون doctype/html/head/body) فيه البنك والكود.
الاستخدام: python3 tools/build_artifact.py <ملف HTML الناتج>
"""
import json, pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي"
HAMZA = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا"})


def load_one(name, var):
    src = (root / name).read_text(encoding="utf-8")
    body = src[src.index("{", src.index(var)): src.rindex("}") + 1]
    return json.loads(body)


def load_bank():
    bank = load_one("questions.js", "QUESTION_BANK")
    for L, items in load_one("questions_more.js", "QUESTION_BANK_MORE").items():
        bank.setdefault(L, []).extend(items)
    return bank


def first_letter(answer):
    a = answer.strip()
    if a.startswith("ال") and len(a) > 3:
        a = a[2:]
    return a[0].translate(HAMZA)


def check(bank):
    problems, seen = [], {}
    for L in LETTERS:
        if L not in bank:
            problems.append(f"حرف ناقص: {L}")
    for L, items in bank.items():
        answers = set()
        for q, a in items:
            if first_letter(a) != L:
                problems.append(f"[{L}] الإجابة لا تبدأ بالحرف: {q} ← {a}")
            if q in seen:
                problems.append(f"[{L}] سؤال مكرر (موجود في {seen[q]}): {q}")
            seen[q] = L
            if (q, a) in answers:
                problems.append(f"[{L}] مكرر: {q}")
            answers.add((q, a))
    return problems


bank = load_bank()
problems = check(bank)
total = sum(len(v) for v in bank.values())
print(f"بنك الأسئلة: {total} سؤال في {len(bank)} حرف")
print("  " + "  ".join(f"{L}:{len(bank.get(L, []))}" for L in LETTERS))
if problems:
    print("\n".join(problems))
    sys.exit(1)

html = (root / "index.html").read_text(encoding="utf-8")
head = re.search(r"<!-- HEAD START -->(.*?)<!-- HEAD END -->", html, re.S).group(1).strip()
app = re.search(r"<!-- APP START -->(.*?)<!-- APP END -->", html, re.S).group(1).strip()
css = (root / "style.css").read_text(encoding="utf-8")
bell = (root / "bell.js").read_text(encoding="utf-8")
js = (root / "app.js").read_text(encoding="utf-8")

qs = "window.QUESTION_BANK = " + json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";"
out = f"{head}\n<style>\n{css}\n</style>\n{app}\n<script>\n{qs}\n</script>\n<script>\n{bell}\n</script>\n<script>\n{js}\n</script>\n"
dest = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / "dist" / "index.html")
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out, encoding="utf-8")
print(f"wrote {dest} ({len(out.encode('utf-8')):,} bytes)")
