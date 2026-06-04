"""Emit JSON array of badge rows from Badges.xlsx."""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def main():
    path = Path(sys.argv[1])
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", ns):
                texts = [t.text or "" for t in si.findall(".//m:t", ns)]
                shared.append("".join(texts))

        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        badges = []
        for row in sheet.findall(".//m:sheetData/m:row", ns):
            cell_map = {}
            for c in row.findall("m:c", ns):
                ref = c.get("r", "")
                col = re.sub(r"[0-9]", "", ref)
                t = c.get("t")
                v = c.find("m:v", ns)
                val = v.text if v is not None else ""
                if t == "s" and val:
                    val = shared[int(val)]
                cell_map[col] = val

            slug = cell_map.get("I", "")
            if not slug or not re.match(r"^[a-z][a-z0-9_]*$", slug, re.I):
                continue

            tier_label = cell_map.get("D", "")
            tier_m = re.search(r"(\d+)", tier_label)
            tier = int(tier_m.group(1)) if tier_m else 0
            unlock = cell_map.get("G", "")
            filename = cell_map.get("L") or cell_map.get("K") or slug

            badges.append(
                {
                    "id": slug,
                    "name": cell_map.get("F") or slug,
                    "tier": tier,
                    "description": unlock,
                    "unlock": unlock,
                    "image": f"/img/badges/{slug}.png",
                    "filename": filename if filename.endswith(".png") else f"{filename}.png",
                    "category": tier_label,
                }
            )

    print(json.dumps(badges, ensure_ascii=False))


if __name__ == "__main__":
    main()
