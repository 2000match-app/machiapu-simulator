# NPC写真の顔の位置を調べる（2026-11-25。全身写真のアイコンで顔が見切れる対策）。
# OpenCV の顔検出モデル YuNet（opencv_zoo の face_detection_yunet_2023mar.onnx）を使う。モデルはリポジトリに入れない。
# 使い方: python scripts/photos/detect-faces.py <モデルのパス>  → scripts/photos/faces.json
#   ファイル名 → [x0, y0, x1, y1, 信頼度]（0〜1。いちばん大きい顔）または null
import cv2, json, os, re, sys, shutil, tempfile
import numpy as np

root = os.path.join(os.path.dirname(__file__), '..', '..')
files = set()
for ts in ['npcPhotos.ts', 'npcPhotosAdded.ts', 'npcPhotosBlurred.ts']:
    files |= set(re.findall(r"file: '([^']+)'", open(os.path.join(root, 'src/engine/data', ts), encoding='utf-8').read()))

# cv2 は日本語を含むパスを読めないので、モデルを一時フォルダへ写す
tmp = tempfile.mkdtemp()
model = shutil.copy(sys.argv[1], os.path.join(tmp, 'yunet.onnx'))
det = cv2.FaceDetectorYN.create(model, '', (600, 750), score_threshold=0.6, nms_threshold=0.3, top_k=50)

out = {}
for f in sorted(files):
    p = os.path.join(root, 'public/npc', f)
    if not os.path.exists(p):
        continue
    img = cv2.imdecode(np.fromfile(p, np.uint8), cv2.IMREAD_COLOR)
    H, W = img.shape[:2]
    det.setInputSize((W, H))
    _, faces = det.detect(img)
    if faces is None or len(faces) == 0:
        out[f] = None
        continue
    x, y, w, h, *_, score = max(faces, key=lambda r: r[2] * r[3])
    out[f] = [round(float(x) / W, 3), round(float(y) / H, 3), round(float(x + w) / W, 3), round(float(y + h) / H, 3), round(float(score), 2)]
json.dump(out, open(os.path.join(os.path.dirname(__file__), 'faces.json'), 'w'), indent=0)
print(len(out), 'no face:', sum(v is None for v in out.values()))
