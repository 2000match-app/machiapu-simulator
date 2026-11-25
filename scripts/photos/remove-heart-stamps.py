# 加工写真のハートのスタンプを消す（2026-11-25 指示「ハートスタンプは全部消して」）。
# 箱（x0,y0,x1,y1）の中で、周りより明るい／ピンク紫のスタンプの画素を見つけ、
# clone：近くの似た背景を写して境目の色を合わせる、smooth：周りの色でなめらかに埋める（肌の上）。
# 使い方: python scripts/photos/remove-heart-stamps.py <入力フォルダ> <出力フォルダ>
import sys, numpy as np
from PIL import Image, ImageFilter

BOXES = {
 'p0547': [(125,0,200,60,'clone'),(90,60,145,110,'clone'),(470,40,535,100,'clone'),(462,115,515,165,'clone'),(140,45,185,85,'clone')],
 'p0553': [(95,25,165,85,'clone'),(470,5,520,50,'clone'),(495,40,585,125,'clone'),(90,250,140,295,'clone'),(30,280,105,350,'clone'),(485,300,525,335,'clone'),(148,332,168,352,'clone')],
 'p0559': [(125,30,170,70,'clone'),(135,250,180,280,'clone'),(225,232,292,292,'smooth'),(383,212,434,270,'smooth'),(412,48,468,102,'clone')],
 'p0562': [(45,70,120,140,'clone'),(50,150,75,175,'clone'),(65,175,110,225,'clone'),(355,0,415,55,'clone'),(350,195,390,230,'smooth'),(195,245,230,280,'smooth')],
 'p0568': [(45,25,115,100,'clone'),(365,5,445,80,'clone'),(435,90,480,130,'clone'),(450,225,485,260,'clone'),(55,305,90,340,'clone'),(75,335,125,385,'clone')],
 'q0526': [(178,168,242,234,'smooth'),(240,160,333,206,'smooth'),(330,150,402,214,'smooth')],  # 目（y≈127〜155）にかからないように
}

def dilate(m, r):
    return np.asarray(Image.fromarray((m*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2*r+1))) > 127

def laplace_fill(val, hole, iters=600):
    # hole の周りだけ切り出して計算する（速さのため）
    ys, xs = np.nonzero(hole)
    y0, y1 = max(ys.min()-2, 0), min(ys.max()+3, hole.shape[0])
    x0, x1 = max(xs.min()-2, 0), min(xs.max()+3, hole.shape[1])
    out = val.copy()
    out[y0:y1, x0:x1] = _laplace(val[y0:y1, x0:x1], hole[y0:y1, x0:x1], iters)
    return out

def _laplace(val, hole, iters):
    # hole 内を周りの値からなめらかに埋める（Jacobi 反復）
    v = val.copy()
    known = ~hole
    mean = v[known].mean(axis=0) if v.ndim == 3 else v[known].mean()
    v[hole] = mean
    for _ in range(iters):
        p = np.pad(v, ((1,1),(1,1),(0,0)) if v.ndim == 3 else 1, mode='edge')
        avg = (p[:-2,1:-1] + p[2:,1:-1] + p[1:-1,:-2] + p[1:-1,2:]) / 4
        v[hole] = avg[hole]
    return v

def detect(img, box):
    x0,y0,x1,y1 = box[:4]
    pil = Image.fromarray(img.astype(np.uint8))
    hsv = np.asarray(pil.convert('HSV')).astype(float)
    h = hsv[...,0]*360/255; s = hsv[...,1]/255; v = hsv[...,2]/255
    lum = img.mean(axis=2)
    med = np.asarray(pil.convert('L').filter(ImageFilter.MedianFilter(21))).astype(float)
    magenta = (h > 280) & (h < 345) & (s > 0.12) & (v > 0.55)
    glow = (lum - med) > 14
    m = (magenta | glow)
    inbox = np.zeros_like(m); inbox[y0:y1, x0:x1] = True
    m &= inbox
    m = dilate(m, 3) & inbox
    return m

def process(img, boxes):
    allmask = np.zeros(img.shape[:2], bool)
    masks = []
    for b in boxes:
        m = detect(img, b); masks.append(m); allmask |= m
    out = img.copy()
    H, W = img.shape[:2]
    for b, m in zip(boxes, masks):
        if not m.any(): continue
        ring = dilate(m, 5) & ~m
        if b[4] == 'smooth':
            # 髪など暗い画素を境目の色に使わない（肌に黒いにじみが出るのを防ぐ）
            m = m & (out.mean(axis=2) >= 150)  # 髪の上は塗らない
            if not m.any(): continue
            near = dilate(m, 8) & ~m
            dark = near & (out.mean(axis=2) < 150)
            filled = laplace_fill(out, m | dark)
            out[m] = filled[m]
            # 肌の細かな粒感を少し戻す
            noise = np.random.default_rng(1).normal(0, 1.2, out.shape)
            out[m] += noise[m]
            continue
        ys, xs = np.nonzero(m); ry, rx = np.nonzero(ring)
        best = None
        for dy in range(-100, 101, 4):
            for dx in range(-100, 101, 4):
                if abs(dx) < 12 and abs(dy) < 12: continue
                sy, sx = ys+dy, xs+dx
                if sy.min() < 0 or sx.min() < 0 or sy.max() >= H or sx.max() >= W: continue
                if allmask[sy, sx].any(): continue
                ty, tx = ry+dy, rx+dx
                if ty.min() < 0 or tx.min() < 0 or ty.max() >= H or tx.max() >= W: continue
                score = ((out[ry, rx] - out[ty, tx])**2).mean() + 0.02*(dx*dx+dy*dy)
                if best is None or score < best[0]: best = (score, dx, dy)
        _, dx, dy = best
        # 写す元をずらした画像
        src = np.roll(np.roll(out, -dy, axis=0), -dx, axis=1)
        # 境目の色の差をなめらかに広げて足す（簡易のポアソン合成）
        region = dilate(m, 1)
        diff = out - src
        corr = laplace_fill(np.where(region[..., None], 0, diff), region, iters=300)
        out[m] = (src + corr)[m]
    return out

if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    for n, boxes in BOXES.items():
        a = np.asarray(Image.open(f'{src}/{n}.jpg').convert('RGB')).astype(np.float64)
        b = process(a, boxes)
        Image.fromarray(np.clip(b+0.5, 0, 255).astype(np.uint8)).save(f'{dst}/{n}.jpg', quality=90)
        print(n, 'ok')
