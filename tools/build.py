#!/usr/bin/env python3
"""Bouw index.html: de complete app in één bestand.

De bron staat in src/ (index.html, style.css, app.js). Dit script zet de
stijl en het script erin, zodat het resultaat overal werkt: dubbelklikken,
uit een ZIP openen, of als enige bestand op een website zetten.

  python3 tools/build.py                 schrijft index.html
  python3 tools/build.py --check         faalt als index.html niet bij src/ past
  python3 tools/build.py --fragment PAD  zelfde inhoud zonder <html>/<head>/<body>,
                                         voor platforms die zelf een omhulsel maken
"""
import pathlib, re, sys

root = pathlib.Path(__file__).resolve().parent.parent
src = root / "src"
html = (src / "index.html").read_text(encoding="utf-8")
css = (src / "style.css").read_text(encoding="utf-8")
js = (src / "app.js").read_text(encoding="utf-8")
assert "</script" not in js.lower() and "</style" not in css.lower()

one = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "</style>")
one = one.replace('<script src="app.js"></script>', "<script>\n" + js + "</script>")
assert 'href="style.css"' not in one and 'src="app.js"' not in one, "verwijzing niet vervangen"
one = one.replace("<html lang=\"nl\">", "<html lang=\"nl\">\n<!-- Gegenereerd uit src/ door tools/build.py; bewerk src/ en bouw opnieuw. -->", 1)

out = root / "index.html"
if "--check" in sys.argv:
    cur = out.read_text(encoding="utf-8") if out.exists() else ""
    if cur != one:
        sys.exit("index.html loopt achter op src/: draai python3 tools/build.py")
    print("index.html is actueel")
    sys.exit(0)
out.write_text(one, encoding="utf-8")
print("geschreven: index.html", f"({len(one) // 1024} kB)")

if "--fragment" in sys.argv:
    frag = re.sub(r"(?is)<!doctype html>|</?html[^>]*>|</?head>|</?body>", "", one)
    frag = re.sub(r'<meta charset="utf-8">\s*|<meta name="viewport"[^>]*>\s*', "", frag)
    dest = pathlib.Path(sys.argv[sys.argv.index("--fragment") + 1])
    dest.write_text(frag.strip() + "\n", encoding="utf-8")
    print("fragment:", dest)
