#!/usr/bin/env python3
"""يجمع index.html و style.css و questions.js و app.js في صفحة وحدة (بدون doctype/html/head/body)
للنشر كـ artifact.  الاستخدام: python3 tools/build_artifact.py <ملف الإخراج>"""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
head = re.search(r"<!-- HEAD START -->(.*?)<!-- HEAD END -->", html, re.S).group(1).strip()
app = re.search(r"<!-- APP START -->(.*?)<!-- APP END -->", html, re.S).group(1).strip()
css = (root / "style.css").read_text(encoding="utf-8")
qs = (root / "questions.js").read_text(encoding="utf-8")
js = (root / "app.js").read_text(encoding="utf-8")

out = f"{head}\n<style>\n{css}\n</style>\n{app}\n<script>\n{qs}\n</script>\n<script>\n{js}\n</script>\n"
dest = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else root / "dist" / "haroof.html")
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out, encoding="utf-8")
print(f"wrote {dest} ({len(out):,} bytes)")
