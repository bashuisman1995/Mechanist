#!/usr/bin/env python3
"""Bundel index.html, css/style.css en js/app.js tot één HTML-bestand.

  dist/mechanismeschets.html   zelfstandig bestand: dubbelklikken en het werkt
  --fragment PAD               zelfde inhoud zonder <html>/<head>/<body>-omhulsel,
                               voor platforms die zelf een omhulsel toevoegen
"""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "css/style.css").read_text(encoding="utf-8")
js = (root / "js/app.js").read_text(encoding="utf-8")
assert "</script" not in js.lower() and "</style" not in css.lower()

one = html.replace('<link rel="stylesheet" href="css/style.css">', "<style>\n" + css + "</style>")
one = one.replace('<script src="js/app.js"></script>', "<script>\n" + js + "</script>")
assert "css/style.css" not in one and "js/app.js" not in one, "verwijzing niet vervangen"

out = root / "dist" / "mechanismeschets.html"
out.parent.mkdir(exist_ok=True)
out.write_text(one, encoding="utf-8")
print("geschreven:", out.relative_to(root), f"({len(one) // 1024} kB)")

if "--fragment" in sys.argv:
    frag = re.sub(r"(?is)<!doctype html>|</?html[^>]*>|</?head>|</?body>", "", one)
    frag = re.sub(r'<meta charset="utf-8">\s*|<meta name="viewport"[^>]*>\s*', "", frag)
    dest = pathlib.Path(sys.argv[sys.argv.index("--fragment") + 1])
    dest.write_text(frag.strip() + "\n", encoding="utf-8")
    print("fragment:", dest)
