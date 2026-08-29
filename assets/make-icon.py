# -*- coding: utf-8 -*-
"""
生成项目结构分析器的图标。

构图：深色圆角底 + 三条递减的横杠（项目层级）+ 右下青绿圆环（正在分析）。
小尺寸（<=32）下圆环会糊，自动降级成实心圆点。

改配色直接改下面四个常量，然后重新运行本脚本即可。
输出：icon.png（256）与 icon.ico（16~256 多尺寸）。
"""
import os
import struct
from io import BytesIO
from PIL import Image, ImageDraw

BG     = (37, 41, 48)      # #252930  面板底
BORDER = (58, 64, 72)      # #3a4048  边框
BAR    = (170, 178, 188)   # #aab2bc  层级横杠
ACCENT = (93, 202, 165)    # #5DCAA5  分析环（工具主色）

OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def draw(size, scale=4):
    """按目标尺寸比例绘制，先放大画再缩回来，保证边缘干净。"""
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 背景圆角方块
    radius = s * 0.22
    d.rounded_rectangle(
        [0, 0, s - 1, s - 1],
        radius=radius,
        fill=BG + (255,),
        outline=BORDER + (255,),
        width=max(1, int(s * 0.014)),
    )

    # 三条递减横杠：上层宽、下层窄，像目录层级
    h = s * 0.085
    x0 = s * 0.20
    for cy, w in ((0.30, 0.34), (0.47, 0.26), (0.64, 0.18)):
        y0 = s * cy - h / 2
        d.rounded_rectangle(
            [x0, y0, x0 + s * w, y0 + h],
            radius=h / 2,
            fill=BAR + (255,),
        )

    # 右下角的"分析"标记
    cx, cy = s * 0.72, s * 0.58
    if size <= 32:
        r = s * 0.105
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT + (255,))
    else:
        r = s * 0.125
        d.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            outline=ACCENT + (255,),
            width=max(int(s * 0.048), scale),
        )

    return img.resize((size, size), Image.LANCZOS)


def build_ico(images, out_path):
    """
    Pillow 12 的 Image.save(..., format='ICO', sizes=...) 只会写入原始图像尺寸，
    导致 electron-builder 报错"must be at least 256x256"。
    这里手动把每个尺寸的 PNG 数据按 Windows ICO 格式拼起来。
    Windows Vista+ 支持 ICO 里直接嵌 PNG 数据。
    """
    entries = []
    data = b""
    count = len(images)
    for img in images:
        w, h = img.size
        bio = BytesIO()
        # PNG 支持 alpha，ICO 里嵌 PNG 最干净
        img.save(bio, format="PNG")
        png = bio.getvalue()
        # ICO 目录项里宽高是 1 字节，0 表示 256
        bw = 0 if w >= 256 else w
        bh = 0 if h >= 256 else h
        offset = 6 + 16 * count + len(data)
        entry = struct.pack("<BBBBHHII", bw, bh, 0, 0, 1, 32, len(png), offset)
        entries.append(entry)
        data += png
    header = struct.pack("<HHH", 0, 1, count)
    with open(out_path, "wb") as f:
        f.write(header + b"".join(entries) + data)


def main():
    sizes = [16, 24, 32, 48, 64, 128, 256]
    imgs = [draw(sz) for sz in sizes]

    png = os.path.join(OUT_DIR, "icon.png")
    draw(256, scale=3).save(png)

    ico = os.path.join(OUT_DIR, "icon.ico")
    build_ico(imgs, ico)

    print("icon.png  %d x %d" % (256, 256))
    print("icon.ico  尺寸: " + ", ".join(str(s) for s in sizes))
    print("输出目录: " + OUT_DIR)


if __name__ == "__main__":
    main()
