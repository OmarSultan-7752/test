#!/usr/bin/env python3
"""يفحص بنك الأسئلة ويجمع الصفحة للنشر كـ artifact.

الإخراج: ملف HTML واحد (بدون doctype/html/head/body) فيه البنك والكود.
الاستخدام: python3 tools/build_artifact.py <ملف HTML الناتج>
"""
import json, pathlib, re, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from letter_rule import first_letter

root = pathlib.Path(__file__).resolve().parent.parent
LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي"
def load_one(name, var):
    src = (root / name).read_text(encoding="utf-8")
    body = src[src.index("{", src.index(var)): src.rindex("}") + 1]
    return json.loads(body)


def load_bank():
    bank = load_one("questions.js", "QUESTION_BANK")
    for fname, var in (("questions_more.js", "QUESTION_BANK_MORE"), ("questions_nice.js", "QUESTION_BANK_NICE")):
        for L, items in load_one(fname, var).items():
            bank.setdefault(L, []).extend(items)
    return bank


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
hard = load_one("questions_hard.js", "QUESTION_BANK_HARD")
problems = check(bank)
known = {q for items in bank.values() for q, _ in items}
for L, items in hard.items():
    for q, a in items:
        if first_letter(a) != L:
            problems.append(f"[صعب {L}] الإجابة لا تبدأ بالحرف: {q} ← {a}")
        if q in known:
            problems.append(f"[صعب {L}] مكرر مع البنك العادي: {q}")
        known.add(q)
total = sum(len(v) for v in bank.values())
print(f"بنك الأسئلة: {total} عادي + {sum(len(v) for v in hard.values())} صعب")
print("  " + "  ".join(f"{L}:{len(bank.get(L, []))}" for L in LETTERS))
if problems:
    print("\n".join(problems))
    sys.exit(1)

sj_src = (root / "questions_sj.js").read_text(encoding="utf-8")
m = re.search(r"window\.SJ_CATEGORIES\s*=\s*(\[.*\])\s*;", sj_src, re.S)
sj_cats = json.loads(m.group(1))
sj_seen = set()
for c in sj_cats:
    for lv in ("200", "400", "600"):
        items = c["q"].get(lv, [])
        if len(items) != 5:
            problems.append(f"[سين جيم {c['id']} {lv}] لازم 5 أسئلة وفيه {len(items)}")
        for item in items:
            q, a = item[0], item[1]
            im = item[2] if len(item) > 2 else ""
            if not q or not a:
                problems.append(f"[سين جيم {c['id']} {lv}] سؤال أو إجابة فاضية")
            if im and not (root / "flags" / f"{im}.svg").exists():
                problems.append(f"[سين جيم {c['id']} {lv}] صورة ناقصة: {im}")
            if (q, im) in sj_seen:
                problems.append(f"[سين جيم] مكرر: {q} {im}")
            sj_seen.add((q, im))
print(f"سين جيم: {len(sj_cats)} فئة، {len(sj_seen)} سؤال")
if problems:
    print("\n".join(problems))
    sys.exit(1)

html = (root / "index.html").read_text(encoding="utf-8")
head = re.search(r"<!-- HEAD START -->(.*?)<!-- HEAD END -->", html, re.S).group(1).strip()
app = re.search(r"<!-- APP START -->(.*?)<!-- APP END -->", html, re.S).group(1).strip()
css = (root / "style.css").read_text(encoding="utf-8")
bell = (root / "bell.js").read_text(encoding="utf-8")
sjjs = (root / "sj.js").read_text(encoding="utf-8")
js = (root / "app.js").read_text(encoding="utf-8")

qs = ("window.QUESTION_BANK = " + json.dumps(bank, ensure_ascii=False, separators=(",", ":")) + ";\n"
      "window.QUESTION_BANK_HARD = " + json.dumps(hard, ensure_ascii=False, separators=(",", ":")) + ";\n"
      "window.SJ_CATEGORIES = " + json.dumps(sj_cats, ensure_ascii=False, separators=(",", ":")) + ";")
out = f"{head}\n<style>\n{css}\n</style>\n{app}\n<script>\n{qs}\n</script>\n<script>\n{bell}\n</script>\n<script>\n{sjjs}\n</script>\n<script>\n{js}\n</script>\n"
dest = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / "dist" / "index.html")
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out, encoding="utf-8")
print(f"wrote {dest} ({len(out.encode('utf-8')):,} bytes)")
