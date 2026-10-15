#!/usr/bin/env python3
"""Bouw index.html: de complete app in één bestand.

De bron staat in src/ (index.html, style.css en de ES-modules vanaf main.js).
Dit script bundelt de modules met esbuild (npm ci; build/app.js, leesbaar en
zonder minify, doel es2019) en zet stijl en bundel erin, zodat het resultaat
overal werkt: dubbelklikken, uit een ZIP openen, of als enige bestand op een website zetten.

  python3 tools/build.py                 schrijft index.html
  python3 tools/build.py --check         faalt als index.html niet bij src/ past (de git-hash-stempel telt niet mee)
  python3 tools/build.py --fragment PAD  zelfde inhoud zonder <html>/<head>/<body>,
                                         voor platforms die zelf een omhulsel maken
"""
import pathlib, re, subprocess, sys

root = pathlib.Path(__file__).resolve().parent.parent
src = root / "src"
html = (src / "index.html").read_text(encoding="utf-8")
css = (src / "style.css").read_text(encoding="utf-8")
esbuild = root / "node_modules" / ".bin" / "esbuild"
if not esbuild.exists():
    sys.exit("esbuild ontbreekt: draai eerst npm ci")
subprocess.run([str(esbuild), "src/main.js", "--bundle", "--format=iife", "--target=es2019",
                "--outfile=build/app.js", "--log-level=warning"], cwd=root, check=True)
js = (root / "build" / "app.js").read_text(encoding="utf-8")
assert "</script" not in js.lower() and "</style" not in css.lower()

one = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "</style>")
one = one.replace('<script type="module" src="main.js"></script>', "<script>\n" + js + "</script>")
assert 'href="style.css"' not in one and 'src="main.js"' not in one, "verwijzing niet vervangen"
one = one.replace("<html lang=\"nl\">", "<html lang=\"nl\">\n<!-- Gegenereerd uit src/ door tools/build.py; bewerk src/ en bouw opnieuw. -->", 1)

# versie-stempel: korte git-hash van HEAD als die er is (anders leeg). Hij staat in <meta name="mech-build"> en
# telt niet mee bij --check: de hash verandert bij elke commit, ook als src/ gelijk blijft.
try:
    githash = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
except Exception:
    githash = ""
STAMP = re.compile(r'<meta name="mech-build" content="[^"]*">')
assert STAMP.search(one), "mech-build-stempel ontbreekt in src/index.html"
out = root / "index.html"
if "--check" in sys.argv:
    cur = out.read_text(encoding="utf-8") if out.exists() else ""
    if STAMP.sub("", cur) != STAMP.sub("", one):
        sys.exit("index.html loopt achter op src/: draai python3 tools/build.py")
    print("index.html is actueel")
    sys.exit(0)
one = STAMP.sub('<meta name="mech-build" content="' + githash + '">', one)
out.write_text(one, encoding="utf-8")
print("geschreven: index.html", f"({len(one) // 1024} kB)")

if "--fragment" in sys.argv:
    frag = re.sub(r"(?is)<!doctype html>|</?html[^>]*>|</?head>|</?body>", "", one)
    frag = re.sub(r'<meta charset="utf-8">\s*|<meta name="viewport"[^>]*>\s*', "", frag)
    dest = pathlib.Path(sys.argv[sys.argv.index("--fragment") + 1])
    dest.write_text(frag.strip() + "\n", encoding="utf-8")
    print("fragment:", dest)
