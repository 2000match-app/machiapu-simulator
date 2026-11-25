# プリクラ風の加工写真（目の極端な拡大）の目を縮めて自然寄りにする（2026-11-25 指示）。
# 元画像は production/npc-purikura-original に保存。使い方: python scripts/photos/shrink-purikura-eyes.py production/npc-purikura-original public/npc 0.30 [写真ID...]
# 最初の6枚はこのあと remove-heart-stamps.py でハートを消している（作り直すときはこの順に2つとも実行）
import sys, numpy as np
from PIL import Image
# 目の中心(x,y)と目の幅(px)。600x750 の画像座標
EYES = {
 'p0547': [(257,170,62),(355,150,58)],
 'p0553': [(250,242,66),(380,227,64)],
 'p0559': [(270,212,56),(372,200,54)],
 'p0562': [(210,210,62),(332,177,58)],
 'p0568': [(207,240,66),(330,202,62)],
 'q0526': [(232,147,52),(342,127,50)],
 # プリクラ機の写真（友達の顔をスタンプで隠した2人写り。2026-11-25 追加）
 'p0059': [(195,250,68),(315,280,64)],
 'p0089': [(115,222,70),(222,183,70)],
 'p0100': [(185,257,74),(290,310,74)],
 'p0158': [(225,182,56),(305,150,52)],
 'p0166': [(200,180,56),(278,155,56)],
 'p0174': [(365,195,64),(470,160,64)],
 'p0190': [(280,170,60),(366,151,60)],
 'p0199': [(312,187,56),(400,160,56)],
 'p0253': [(300,220,60),(382,178,60)],
 'p0265': [(225,165,56),(305,150,56)],
 'p0279': [(213,150,60),(300,185,56)],
 'p0290': [(345,222,60),(440,185,60)],
 'p0302': [(195,148,56),(268,138,52)],
 'p0466': [(165,230,64),(258,205,60)],
 'p0469': [(170,230,70),(265,205,66)],
}
# 写真ごとの強さ（省略時はコマンドの値）
STRENGTH = {n: 0.42 for n in ['p0059','p0089','p0100','p0158','p0166','p0174','p0190','p0199','p0253','p0265','p0279','p0290','p0302','p0466','p0469']}  # プリクラ機の写真は目の拡大が強いので強めに
def bilinear(a, xs, ys):
    h,w=a.shape[:2]
    xs=np.clip(xs,0,w-1.001); ys=np.clip(ys,0,h-1.001)
    x0=np.floor(xs).astype(int); y0=np.floor(ys).astype(int); fx=(xs-x0)[...,None]; fy=(ys-y0)[...,None]
    return (a[y0,x0]*(1-fx)*(1-fy)+a[y0,x0+1]*fx*(1-fy)+a[y0+1,x0]*(1-fx)*fy+a[y0+1,x0+1]*fx*fy)
def shrink(a, cx, cy, ew, k):
    h,w=a.shape[:2]; Rx=ew*1.15; Ry=ew*0.85
    yy,xx=np.mgrid[0:h,0:w].astype(np.float64)
    dx=(xx-cx)/Rx; dy=(yy-cy)/Ry; r2=dx*dx+dy*dy
    m=r2<1; wgt=np.where(m,(1-r2)**2,0)
    s=1+k*wgt   # 中心ほど外側から取る＝縮む
    sx=cx+(xx-cx)*s; sy=cy+(yy-cy)*s
    out=a.copy(); out[m]=bilinear(a,sx[m],sy[m]); return out
src, dst, k = sys.argv[1], sys.argv[2], float(sys.argv[3])
only = set(sys.argv[4:])
for n,eyes in EYES.items():
    if only and n not in only: continue
    a=np.asarray(Image.open(f'{src}/{n}.jpg').convert('RGB')).astype(np.float64)
    for cx,cy,ew in eyes: a=shrink(a,cx,cy,ew,STRENGTH.get(n,k))
    Image.fromarray(np.clip(a+0.5,0,255).astype(np.uint8)).save(f'{dst}/{n}.jpg',quality=90)
