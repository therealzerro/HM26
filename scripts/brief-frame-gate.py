# MKT-82 2.3 SCREEN DETECTION GATE (measuring tool of record for lib/social/briefFrames.ts screenRects).
# Usage: python3 -I scripts/brief-frame-gate.py assets/marketing/brief_frame_*.png  (needs Pillow + numpy)
# Reports the glow-border rect, axis alignment (≤2 px/edge), interior uniformity, intrusions, 4:5 crop survival.
import sys, json
import numpy as np
from PIL import Image

def analyze(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    H, W, _ = a.shape
    R, G, B = a[...,0], a[...,1], a[...,2]
    lum = 0.2126*R + 0.7152*G + 0.0722*B
    # purple glow border: bright-ish, blue+red dominant over green
    purple = (B > 110) & (R > 70) & (G < 0.85*B) & (lum > 60)
    rows = purple.sum(axis=1); cols = purple.sum(axis=0)
    # border lines: rows/cols where purple count is large (>40% of width/height)
    rthr, cthr = 0.35*W, 0.35*H
    rlines = np.where(rows > rthr)[0]; clines = np.where(cols > cthr)[0]
    def groups(idx):
        g=[]; 
        for i in idx:
            if g and i-g[-1][-1] <= 3: g[-1].append(i)
            else: g.append([i])
        return [(int(x[0]), int(x[-1])) for x in g]
    rg, cg = groups(rlines), groups(clines)
    out = {'file': path, 'size': [W, H], 'row_lines': rg, 'col_lines': cg}
    if len(rg) < 2 or len(cg) < 2:
        out['status'] = 'FAIL: border not detected'; return out
    top, bot = rg[0], rg[-1]; left, right = cg[0], cg[-1]
    # use outermost line group extents
    y0, y1 = top[0], bot[1]; x0, x1 = left[0], right[1]
    out['screenRect_outer'] = {'x': int(x0), 'y': int(y0), 'w': int(x1-x0+1), 'h': int(y1-y0+1)}
    out['screenRect_pct'] = {'x': round(x0/W*100,1), 'y': round(y0/H*100,1), 'x2': round(x1/W*100,1), 'y2': round(y1/H*100,1)}
    # axis alignment: for each edge, find the line position at several positions along it
    def edge_y(xs, band):   # horizontal edge: y of max purple in band for each x
        ys=[]
        for x in xs:
            col = purple[band[0]:band[1]+1, max(0,x-2):x+3].sum(axis=1)
            if col.max()==0: continue
            ys.append(band[0]+int(np.argmax(col)))
        return ys
    def edge_x(ys, band):
        xs=[]
        for y in ys:
            row = purple[max(0,y-2):y+3, band[0]:band[1]+1].sum(axis=0)
            if row.max()==0: continue
            xs.append(band[0]+int(np.argmax(row)))
        return xs
    sx = np.linspace(x0+40, x1-40, 9).astype(int); sy = np.linspace(y0+40, y1-40, 9).astype(int)
    tb=(max(0,top[0]-6), top[1]+6); bb=(bot[0]-6, min(H-1,bot[1]+6)); lb=(max(0,left[0]-6), left[1]+6); rb=(right[0]-6, min(W-1,right[1]+6))
    tilt = {'top': edge_y(sx, tb), 'bottom': edge_y(sx, bb), 'left': edge_x(sy, lb), 'right': edge_x(sy, rb)}
    out['edge_samples'] = tilt
    dev = {k: (max(v)-min(v)) if v else None for k,v in tilt.items()}
    out['edge_deviation_px'] = dev
    out['axis_aligned_2px'] = all(d is not None and d <= 2 for d in dev.values())
    # interior: inset 12px inside the inner-most line
    ix0, ix1 = left[1]+12, right[0]-12; iy0, iy1 = top[1]+12, bot[0]-12
    inner = lum[iy0:iy1, ix0:ix1]
    out['interior_inset'] = {'x': int(ix0), 'y': int(iy0), 'w': int(ix1-ix0), 'h': int(iy1-iy0)}
    out['interior_lum'] = {'mean': round(float(inner.mean()),1), 'std': round(float(inner.std()),1), 'p99': round(float(np.percentile(inner,99)),1), 'max': round(float(inner.max()),1)}
    # intrusion: pixels brighter than mean+6*std or > 90 luminance, located
    thr = max(90.0, inner.mean()+6*inner.std())
    mask = inner > thr
    out['intrusion_threshold'] = round(float(thr),1); out['intrusion_px'] = int(mask.sum())
    if mask.any():
        ys, xs = np.where(mask)
        out['intrusion_bbox'] = {'x': int(ix0+xs.min()), 'y': int(iy0+ys.min()), 'x2': int(ix0+xs.max()), 'y2': int(iy0+ys.max())}
    out['interior_uniform_dark'] = bool(inner.std() < 8 and inner.mean() < 40 and not mask.any())
    # 4:5 crop: target W:H = 0.8. Source 928x1152 = 0.8056 -> crop width to round(H*0.8)
    tw = int(round(H*0.8)); th = H
    if tw > W: th = int(round(W/0.8)); tw = W
    cx0 = (W-tw)//2; cy0 = (H-th)//2
    out['crop_4_5'] = {'x': cx0, 'y': cy0, 'w': tw, 'h': th, 'scale_to_1080x1350': round(1080/tw,4)}
    out['rect_survives_crop'] = bool(x0 >= cx0 and x1 < cx0+tw and y0 >= cy0 and y1 < cy0+th)
    out['rect_margin_to_crop_px'] = {'left': int(x0-cx0), 'right': int(cx0+tw-1-x1), 'top': int(y0-cy0), 'bottom': int(cy0+th-1-y1)}
    out['status'] = 'PASS' if (out['axis_aligned_2px'] and out['interior_uniform_dark'] and out['rect_survives_crop']) else 'FAIL'
    return out

for p in sys.argv[1:]:
    print(json.dumps(analyze(p), indent=1))
