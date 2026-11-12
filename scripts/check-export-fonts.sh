#!/bin/sh
# D13 / P2-62: run INSIDE the export-tools image (CI pipes it in on stdin).
# Fails when a font the PDF export names is missing, or when Typst cannot
# render a page holding every offered non-Latin script.
set -eu

FAMILIES="Noto Serif CJK SC
Noto Serif CJK JP
Noto Serif CJK KR
Noto Naskh Arabic
Noto Sans Arabic
Noto Serif Devanagari"

typst fonts > /tmp/fonts.txt
missing=0
echo "$FAMILIES" | while IFS= read -r family; do
  if ! grep -qx "$family" /tmp/fonts.txt; then
    echo "missing font family: $family"
    exit 1
  fi
done || missing=1
[ "$missing" -eq 0 ] || exit 1

cat > /tmp/scripts.typ <<'EOF'
#set text(font: ("Libertinus Serif", "Noto Serif CJK SC", "Noto Naskh Arabic", "Noto Serif Devanagari"))
Ovo je proba. 她把信放进抽屉里。これは日本語の文章です。안녕하세요 세계.

#text(dir: rtl)[مرحبا بالعالم]

नमस्ते दुनिया
EOF
typst compile /tmp/scripts.typ /tmp/scripts.pdf 2> /tmp/typst.log || { cat /tmp/typst.log; exit 1; }
if grep -qi "unknown font family" /tmp/typst.log; then
  cat /tmp/typst.log
  exit 1
fi
head -c 4 /tmp/scripts.pdf | grep -q "%PDF" || { echo "typst produced no PDF"; exit 1; }
pandoc --version | head -1
typst --version
echo "export fonts OK"
