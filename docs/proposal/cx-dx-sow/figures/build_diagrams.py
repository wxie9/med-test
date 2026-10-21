"""Build print-friendly CX and DX concept diagrams for the SOW documents."""

from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


OUT = Path(__file__).resolve().parent
FONT = Path('/System/Library/Fonts/Hiragino Sans GB.ttc')
W, H = 1600, 820

INK = '#203C55'
MUTED = '#557085'
LINE = '#9AAEBD'
WHITE = '#FFFFFF'
PALE = '#F7FAFC'


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT), size, index=1 if bold else 0)


F_MAIN = font(40, True)
F_SUB = font(27)
F_LANE = font(25, True)


def start(title: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new('RGB', (W, H), WHITE)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((24, 20, W - 24, H - 20), radius=22, outline='#D9E3EA', width=3, fill=WHITE)
    d.text((72, 48), title, font=font(29, True), fill=INK)
    d.line((72, 100, W - 72, 100), fill='#D6E3EB', width=3)
    return im, d


def card(d: ImageDraw.ImageDraw, box: tuple[int, int, int, int], title: str,
         sub: str, fill: str, stroke: str) -> None:
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius=18, fill=fill, outline=stroke, width=3)
    cx = (x0 + x1) / 2
    main_bbox = d.textbbox((0, 0), title, font=F_MAIN)
    sub_bbox = d.textbbox((0, 0), sub, font=F_SUB)
    main_w = main_bbox[2] - main_bbox[0]
    sub_w = sub_bbox[2] - sub_bbox[0]
    d.text((cx - main_w / 2, y0 + 20), title, font=F_MAIN, fill=INK)
    d.text((cx - sub_w / 2, y0 + 75), sub, font=F_SUB, fill=MUTED)


def arrow(d: ImageDraw.ImageDraw, pts: list[tuple[int, int]], color: str = LINE,
          width: int = 5, dashed: bool = False) -> None:
    for a, b in zip(pts[:-1], pts[1:]):
        if not dashed:
            d.line((a, b), fill=color, width=width, joint='curve')
        else:
            dx, dy = b[0] - a[0], b[1] - a[1]
            length = (dx * dx + dy * dy) ** .5
            if length == 0:
                continue
            unit_x, unit_y = dx / length, dy / length
            s = 0
            while s < length:
                e = min(s + 17, length)
                d.line((a[0] + unit_x * s, a[1] + unit_y * s,
                        a[0] + unit_x * e, a[1] + unit_y * e), fill=color, width=width)
                s += 29
    a, b = pts[-2], pts[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = (dx * dx + dy * dy) ** .5
    ux, uy = dx / length, dy / length
    bx, by = b[0] - ux * 19, b[1] - uy * 19
    wing = 11
    d.polygon([b, (bx - uy * wing, by + ux * wing),
               (bx + uy * wing, by - ux * wing)], fill=color)


def lane(d: ImageDraw.ImageDraw, y: int, label: str) -> None:
    d.rounded_rectangle((55, y, 260, y + 46), radius=16, fill=PALE)
    d.text((78, y + 7), label, font=F_LANE, fill=MUTED)


def cx() -> None:
    im, d = start('CX  首期数字孪生概念架构')
    lane(d, 135, '交互与接入')
    lane(d, 345, '长期表示')
    lane(d, 555, '证据与更新')
    top = [(80, 195, 380, 320), (460, 195, 760, 320),
           (840, 195, 1140, 320), (1220, 195, 1520, 320)]
    mid = [(460, 405, 760, 530), (840, 405, 1140, 530), (1220, 405, 1520, 530)]
    low = [(460, 605, 760, 745), (840, 605, 1140, 745)]
    components = [
        (top[0], 'CX 前后端', '患者交互 / 系统回执', '#EAF4FA', '#5AA5CB'),
        (top[1], '接入与授权', '主体 / 权限 / 路由', '#FCEFF1', '#C97787'),
        (top[2], '助理运行时', '会话 / 工具 / LLM', '#EAF7F1', '#66AA87'),
        (top[3], '受控输出', '工具执行 / 结果核验', '#EAF4FA', '#5AA5CB'),
        (mid[0], '长期记忆', '经历 / 来源 / 时效', '#F2EFFB', '#9379C0'),
        (mid[1], '上下文组装', '任务相关 / 按权读取', '#EAF7F1', '#66AA87'),
        (mid[2], '患者模型', '当前表示 / 未知 / 版本', '#EAF7F1', '#66AA87'),
        (low[0], '证据与事件', '输入 / 更正 / 回执', '#F2EFFB', '#9379C0'),
        (low[1], '受控更新', '校验 / 冲突 / 失效', '#FFF5E8', '#CF9A53'),
    ]
    for a, b in [(380, 460), (760, 840), (1140, 1220)]:
        arrow(d, [(a, 258), (b - 8, 258)], INK)
    arrow(d, [(760, 468), (832, 468)], '#648AA0')
    arrow(d, [(1220, 468), (1148, 468)], '#648AA0')
    arrow(d, [(990, 405), (990, 328)], '#648AA0')
    arrow(d, [(380, 320), (410, 320), (410, 675), (452, 675)], '#977FB7', dashed=True)
    arrow(d, [(760, 675), (832, 675)], '#977FB7', dashed=True)
    arrow(d, [(900, 605), (900, 570), (610, 570), (610, 538)], '#C2894E', dashed=True)
    arrow(d, [(1140, 675), (1370, 675), (1370, 538)], '#C2894E', dashed=True)
    for component in components:
        card(d, *component)
    im.save(OUT / 'cx-phase1-architecture.png', dpi=(220, 220))


def dx() -> None:
    im, d = start('DX  首期共用持续改进概念架构')
    lane(d, 135, '两类任务入口')
    lane(d, 345, '共用改进底座')
    lane(d, 555, '策略与证据')
    source1 = (80, 190, 380, 315)
    source2 = (80, 390, 380, 515)
    core = [(460, 285, 760, 410), (840, 285, 1140, 410),
            (1220, 285, 1520, 410)]
    bottom = [(460, 565, 760, 690), (840, 565, 1140, 690),
              (1220, 565, 1520, 690)]
    components = [
        (source1, '临床工作流', 'Agent / 流程适配', '#EAF4FA', '#5AA5CB'),
        (source2, '软件开发', '需求 / 缺陷适配', '#EAF4FA', '#5AA5CB'),
        (core[0], '任务与基线', '范围 / 预算 / 契约', '#EAF7F1', '#66AA87'),
        (core[1], '候选隔离执行', '快照 / 权限 / 轨迹', '#EAF7F1', '#66AA87'),
        (core[2], '评估与比较', '有效性 / 回归 / 阻断', '#EAF7F1', '#66AA87'),
        (bottom[0], '固定探索策略', '受限生成 / 停止条件', '#FFF5E8', '#CF9A53'),
        (bottom[1], '实验轨迹版本', '过程 / 结果 / 决策', '#F2EFFB', '#9379C0'),
        (bottom[2], '人工评审回退', '采纳 / 保留 / 发布', '#FCEFF1', '#C97787'),
    ]
    arrow(d, [(380, 252), (420, 252), (420, 325), (452, 325)], INK)
    arrow(d, [(380, 452), (420, 452), (420, 370), (452, 370)], INK)
    arrow(d, [(760, 348), (832, 348)], INK)
    arrow(d, [(1140, 348), (1212, 348)], INK)
    arrow(d, [(610, 565), (610, 480), (900, 480), (900, 418)], '#C2894E', dashed=True)
    arrow(d, [(1060, 410), (1060, 557)], '#977FB7', dashed=True)
    arrow(d, [(1140, 628), (1212, 628)], '#977FB7', dashed=True)
    arrow(d, [(1370, 410), (1370, 557)], '#C97787')
    for component in components:
        card(d, *component)
    im.save(OUT / 'dx-phase1-architecture.png', dpi=(220, 220))


if __name__ == '__main__':
    cx()
    dx()
    print('Wrote CX and DX architecture PNGs to', OUT)
