# アイコンの切り抜き位置（src/engine/data/photoFocus.ts）を作る（2026-11-25）。
# faces.json（detect-faces.py の結果）と、下の MANUAL（目で見て決めた値）から作る。
# ・顔が小さい（全身・遠くからの写真）→ 顔を中心に拡大
# ・顔が上の端にあって、ふつうの切り抜き（上から22%）だと見切れる → 拡大せずに顔を中心に寄せる
# 使い方: python scripts/photos/build-photo-focus.py
import json, os

here = os.path.dirname(__file__)
faces = json.load(open(os.path.join(here, 'faces.json')))

# 目で見て直した値：ファイル名 → (顔の中心x, 顔の中心y, 拡大率)（x・y は画像の幅・高さに対する0〜1）。None は切り抜きを変えない
MANUAL: dict = {}
# 使わない検出：顔以外を拾った（飲み物・ぬいぐるみ）、景色の中の小さな人物、顔をスタンプで隠した写真（後ろの別人を拾う）
IGNORE: set = {'p0927.jpg', 'q0253.jpg', 'p0962.jpg', 'q0564.jpg', 'p2001.jpg', 'p2002.jpg', 'p2003.jpg', 'p2004.jpg', 'p2005.jpg', 'p2006.jpg', 'p2007.jpg', 'p2008.jpg', 'p2009.jpg', 'p2010.jpg', 'p2011.jpg', 'p2012.jpg', 'p2013.jpg'}

def focus(box):
    x0, y0, x1, y1 = box[:4]
    fh = y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    if fh < 0.15:
        z = min(2.4, max(1.3, 0.22 / fh))
        return (cx, cy, z)
    if y0 < 0.08:
        return (cx, cy, 1.0)
    return None

out = {}
for f, box in sorted(faces.items()):
    if f in IGNORE or box is None:
        continue
    v = focus(box)
    if v: out[f] = v
for f, v in MANUAL.items():
    if v is None: out.pop(f, None)
    else: out[f] = v

lines = [
    '// 自動生成（scripts/photos/build-photo-focus.py）。手で直さず、スクリプトの MANUAL を直して作り直す。',
    '// アイコン（丸・正方形）での写真の切り抜き：ファイル名 → [顔の中心x, 顔の中心y, 拡大率]（x・y は0〜1）。',
    '// 全身写真は顔が上の端にあって見切れるので、顔を中心に拡大する（2026-11-25 指示）。載っていない写真はふつうの切り抜き。',
    'export const PHOTO_FOCUS: Record<string, readonly [number, number, number]> = {',
]
for f, (cx, cy, z) in out.items():
    lines.append(f"  '{f}': [{cx:.3f}, {cy:.3f}, {z:.2f}],")
lines.append('};')
open(os.path.join(here, '..', '..', 'src', 'engine', 'data', 'photoFocus.ts'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
print(len(out), 'zoom', sum(1 for v in out.values() if v[2] > 1))
