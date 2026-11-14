"""Bangun ZIP pengumpulan: seluruh repo + folder .git utuh, TANPA .env / .env.local / .vercel / node_modules.
Sesudah dibuat, isi ZIP dipindai: tidak boleh ada file .env* (kecuali .env.example) dan tidak boleh ada string secret
yang ada di .env/.env.local lokal (nilai dibaca dari file, tidak pernah dicetak).
Pemakaian: python tools/paket_zip.py <keluaran.zip>
"""
import os, re, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.abspath(sys.argv[1])
SKIP_DIRS = {"node_modules", ".vercel"}
def skip_file(rel):
    base = os.path.basename(rel)
    return (base.startswith(".env") and base != ".env.example")

# nilai secret lokal untuk dipindai (tidak dicetak)
secrets = []
for f in (".env", ".env.local"):
    p = os.path.join(ROOT, f)
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            m = re.match(r'\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?', line)
            if m and len(m.group(2)) >= 16 and ("TOKEN" in m.group(1) or "SECRET" in m.group(1)):
                secrets.append(m.group(2).encode())
secrets.append(("vcp" + "_").encode())   # awalan token Vercel (ditulis terpisah agar file ini tidak memicu dirinya sendiri)

n = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for f in files:
            full = os.path.join(d, f); rel = os.path.relpath(full, ROOT)
            if full == out or skip_file(rel):
                continue
            z.write(full, os.path.join("uas_indodax", rel)); n += 1

bad_names, bad_content = [], []
with zipfile.ZipFile(out) as z:
    for i in z.infolist():
        b = os.path.basename(i.filename)
        if b.startswith(".env") and b != ".env.example":
            bad_names.append(i.filename)
        if "/.git/objects/" in i.filename:
            continue  # objek git terkompresi; riwayat dipindai terpisah dengan git grep
        data = z.read(i)
        if any(s in data for s in secrets):
            bad_content.append(i.filename)
print(f"{n} file, {os.path.getsize(out)/1e6:.1f} MB -> {out}")
print("file .env terlarang:", bad_names or "tidak ada")
print("file berisi secret:", bad_content or "tidak ada")
mb = os.path.getsize(out) / 1e6
print("batas RISE 20 MB:", "OK" if mb < 20 else "MELEBIHI")
sys.exit(1 if bad_names or bad_content or mb >= 20 else 0)
