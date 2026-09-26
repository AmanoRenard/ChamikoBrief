"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  animate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";

/** 缩放下限：适应大小的一半 —— 再小就只剩黑底、看不出细节（用户："别缩成一个点"） */
export const MIN_ZOOM_SCALE = 0.5;
/** 缩放上限的绝对兜底（相对"适应大小"的倍率）：再大只是把像素摊开，没有信息量 */
export const MAX_ZOOM_SCALE = 16;
/**
 * 缩放上限 = **真实像素的 3 倍**（药丸读数即 300%）。用户 2026-09 先要 200%、试过之后又要 300%
 *（"干脆夸张一点吧"）；更早口径是"放到 1:1 为止"（= 100%），但窗口较大时 1:1 只有 1.0~1.1×，
 * 反被 `MIN_MAX_ZOOM_SCALE` 的 2× 兜底顶到 102%~194%，看起来就是"为什么能超过 100%"。
 * 注意 percent（药丸读数）= 倍率 ÷ naturalScale × 100，所以这个 3 就是 300% 的封顶。
 */
const ZOOM_MAX_PERCENT = 3;
/**
 * 上限的兜底下限：本身就比容器小的图（naturalScale ≤ 1）"2 × 真实像素"可能都不到适应大小，
 * 那样等于不能放大，所以至少给到 2×（相对适应大小）。
 */
const MIN_MAX_ZOOM_SCALE = 2;
/**
 * 同一次滚轮手势内复用锚点的前提：光标自手势起点移动不超过这个像素数（见 handleWheel）。
 * 光标一旦明显移动，就必须按当前光标重新取锚点，否则会拿旧锚点配新光标、图片整块滑走。
 */
const ANCHOR_MOVE_TOLERANCE_PX = 8;
/** 翻页条（左右竖条）的标记属性：命中它的区域不缩放、不拖动，完全留给翻页 */
const PAGING_BAND_ATTR = "data-paging-band";
/** 滚轮 deltaY → 倍率的指数系数（越小越"绵"） */
const WHEEL_SENSITIVITY = 0.0015;
/** deltaMode = 1（按行）时，一行约等于多少像素 */
const LINE_HEIGHT_PX = 16;
/** 位移超过这个像素数才算"拖动过"，用于吞掉拖动结束那一下 click */
const DRAG_THRESHOLD_PX = 4;
/**
 * 滚轮缩放的时间常数（毫秒）：值越小越跟手、越大越"黏"。
 * 滚轮事件本身是"一跳一跳"的（一格 deltaY≈120），直接赋值就是一段一段的；
 * 这里改为逐帧向目标倍率插值逼近（Windows 照片的手感）。
 */
const ZOOM_SMOOTH_TAU_MS = 90;
/**
 * 「跟随光标」的接管范围：某条轴超出窗口的比例从 0 涨到这个值的过程中，
 * 该轴的跟随强度从 0 平滑升到 1（见 followWeight）。
 * 必须**很短**（8% ≈ 一次滚轮的三分之一）：一超出就尽快完全钉住光标，缩放才是"围绕光标"、
 * 边缘也才会停在光标那侧；早先取 0.5（超出 50% 才升满）时，光标靠边的放大只有不到 10% 的锚点位移，
 * 图片几乎居中长大，右边缘会被顶出窗口（用户 2026-09 报的"鼠标放最右放大后图片右边缘超出窗口"）。
 * 平滑性由"起点→终点直线飞行"保证，不靠这条缓坡，所以取小值不会带回"两段动画"。
 */
const FOLLOW_RAMP = 0.08;
/**
 * 同一次"滚轮手势"的间隔阈值（毫秒）：间隔更短就沿用同一个锚点。
 * 锚点若每次事件都重取，会把"跟随强度还没升满"造成的偏斜一次次累积起来，
 * 最后放开手时那个点落不到光标上（实测会偏几十像素）。
 */
const WHEEL_BURST_GAP_MS = 300;
/** 双击 / 复位用的弹簧：临界阻尼，不回弹（约定 21） */
const SPRING = { type: "spring", stiffness: 300, damping: 34 } as const;
/** 药丸停手多久后淡出（毫秒）；缩放过程中每次读数变化都会重新计时 */
const PILL_VISIBLE_MS = 1200;
/** 刚"单击放大"之后忽略 dblclick 的时间窗（毫秒）：否则在适应大小双击会"放大一下又缩回"，看着闪 */
const DBLCLICK_GUARD_MS = 350;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface ImageZoom {
  /** 挂在图像区（裁切容器）上：滚轮、拖动、坐标基准都在它身上 */
  viewportRef: React.MutableRefObject<HTMLDivElement | null>;
  /** 挂在主图上：只用于量尺寸（transform 不会改变 offsetWidth，量的始终是"适应大小"） */
  imageRef: React.MutableRefObject<HTMLImageElement | null>;
  /** 直接交给 motion.img 的 style */
  style: { x: MotionValue<number>; y: MotionValue<number>; scale: MotionValue<number> };
  /** 非 100% → 显示倍率药丸 */
  zoomed: boolean;
  /** 药丸文案：**真实像素口径**（100 = 1 个图片像素对应 1 个屏幕像素） */
  percent: number;
  /** 药丸是否可见（偏离适应大小后出现，停手 PILL_VISIBLE_MS 自动淡出） */
  pillVisible: boolean;
  /** 正在拖动 → 光标切 grabbing */
  dragging: boolean;
  /** 单击放大：仅在"适应大小"时生效（居中放大到 2×，不看光标位置） */
  zoomIn: () => void;
  /** 双击缩回：仅在放大时生效；刚单击放大过的瞬间会忽略（防"放大又缩回"闪一下） */
  zoomOut: () => void;
  /** 回到适应大小；animated = 平滑过渡（药丸点击用），否则瞬时 */
  reset: (animated?: boolean) => void;
  /** 拖动结束后的那一次 click 要吞掉，否则会被当成"点空白"关掉灯箱 */
  consumeClickIfDragged: () => boolean;
}

/**
 * 图片灯箱的缩放与平移内核（Windows 照片查看器的手感）。
 *
 * 为什么用 MotionValue 而不是直接写 `element.style.transform`：约定 14 —— 在事件处理器里
 * 手改 DOM 样式，React 不会帮你重置，快速"关闭 → 立刻重开"复用同一节点时会永久生效。
 * MotionValue 由 framer 托管样式，复位只需把值设回去。
 *
 * 为什么只认鼠标指针：触屏的拖动要继续用于左右滑动切图（`image-preview.tsx` 里既有的
 * touch 处理器），两者不能抢事件；手机端本期不做双指捏合。
 *
 * 滚轮缩放的动画模型（2026-09 按微软照片重做）：**事件里一次算好终点，再按同一个进度直线插值过去**
 *（见 zoomFlightRef / runSmoothing）。逐帧按倍率重算位移会得到曲线，边缘靠近窗口时还会被钳制咬出折线，
 * 观感就是"被吸一下"；直线 + 进度缓动才是丝滑的。代价：一次滚动里若跨过"铺满窗口"，图片会**提前**
 * 开始朝终点移动（提前量）—— 但终点仍按跟随强度算，所以没跨过时整段完全不动。
 * touch 处理器），两者不能抢事件；手机端本期不做双指捏合。
 *
 * 缩放锚点（用户 2026-09 定的规则）：**图片没超出可视区时就只从中心放大，不跟随光标；
 * 超出之后才跟随**。直接"跨界切换"会看到两段动画 —— 老实现用 `max(0, …)` 把位移硬钳成 0，
 * 到跨界那一两帧突然放开，几百像素的横向位移在几帧内跳完，第二段像"甩"过去。现在的做法：
 * 每条轴按"超出可视区的比例"算一个 0~1 的跟随强度（followWeight，smoothstep 平滑接管），
 * 位移 = 强度 × 光标锚点位移 —— 没超出时强度为 0（＝纯居中放大，与用户要求一致），
 * 超出 8% 后强度为 1（＝完全钉住光标），中间连续过渡、速度也连续。
 *
 * 边界规则（按 Windows 照片）：图片比**窗口**大才给拖，且拖到"图片边缘贴住窗口边缘"就停住 ——
 * 能盖住窗口就不留空隙；没超出窗口的那条轴范围为 0（锁在正中：不能拖、缩放时也不会漂）。
 * 另外滚轮锚点会被**钳进图片范围**：光标落在图片外面的空白上时，等价于"光标贴着最近的那条边"。
 *
 * @param open 灯箱是否已打开（重新打开要复位，否则同一张图会残留上次的缩放）
 * @param href 当前图片地址（换图要复位）
 */
export function useImageZoom({ open, href }: { open: boolean; href: string | null }): ImageZoom {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const reduced = useReducedMotion();

  const [zoomed, setZoomed] = useState(false);
  const [percent, setPercent] = useState(100);
  const [dragging, setDragging] = useState(false);
  /** 药丸显隐（停手一会儿自动淡出，不再一直挡着图） */
  const [pillVisible, setPillVisible] = useState(false);
  /** 本次按下是否真的拖动过 */
  const draggedRef = useRef(false);
  /** 图片自然宽 ÷ 适应宽：真实像素口径的换算系数（100% = 1:1 像素） */
  const naturalScaleRef = useRef(1);
  /** 上一次"单击放大"的时刻：用于忽略紧随其后的 dblclick */
  const lastClickZoomAtRef = useRef(0);
  /** 滚轮缩放的目标倍率（平滑插值用）；null = 当前没有滚轮缩放在进行 */
  const zoomTargetRef = useRef<number | null>(null);
  /** 插值期间的锚点：光标位置 + 光标下的图像点（未缩放坐标系）+ 元素原始中心 */
  const zoomFocusRef = useRef<{
    originX: number;
    originY: number;
    cursorX: number;
    cursorY: number;
    u: number;
    v: number;
  } | null>(null);
  const smoothRafRef = useRef<number | null>(null);
  /**
   * 本次滚轮「飞行」：起点 → 终点（终点在滚轮事件里一次性算好，含跟随强度与边界钳制）。
   * 三个量共用**同一个进度** → 位置走直线、只有速度带缓动（微软照片的手感）。
   * 逐帧按倍率重算位移会得到曲线，边缘靠近窗口时还会被钳制"咬"出折线（2026-09 用户报的"被吸一下"）。
   */
  const zoomFlightRef = useRef<{
    s0: number;
    x0: number;
    y0: number;
    s1: number;
    x1: number;
    y1: number;
    progress: number;
  } | null>(null);
  /**
   * 本次"滚轮手势"的锚点：手势起点光标所指的那个**图像点**（未缩放坐标系）。
   * 一次手势内固定不变（`at` 判断手势是否已断开、`cx/cy` 判断光标是否已经挪窝），
   * 否则按当前光标重取 —— 见 WHEEL_BURST_GAP_MS 与 ANCHOR_MOVE_TOLERANCE_PX。
   */
  const anchorRef = useRef<{ u: number; v: number; at: number; cx: number; cy: number } | null>(null);

  /**
   * 刷新读数。百分比按**真实像素**算：`倍率 ÷ (自然宽 ÷ 适应宽) × 100` ——
   * 100% 就是"1 个图片像素 = 1 个屏幕像素"（此前按"相对适应大小"算，一张大图在 1:1 时会显示成 400%+，
   * 与实际观感不符）。显隐判据与数字解耦：只看是否偏离适应大小。
   */
  const syncReadouts = useCallback((value: number) => {
    const naturalScale = naturalScaleRef.current || 1;
    const nextPercent = Math.round((value / naturalScale) * 100);
    setPercent((prev) => (prev === nextPercent ? prev : nextPercent));
    const nextZoomed = Math.abs(value - 1) > 0.005;
    setZoomed((prev) => (prev === nextZoomed ? prev : nextZoomed));
  }, []);

  // 倍率变化 → 更新药丸读数（取整后相同就复用原值，滚轮连续缩放不会每帧重渲染）
  useMotionValueEvent(scale, "change", syncReadouts);

  /**
   * 当前几何：窗口区（图像区整个盒子，含内边距）、缩放后的图片尺寸、可移动范围 [min, max]、各轴是否已超出。
   * 按窗口算，移到极限时图片边缘正好贴住窗口边缘（不留空隙 —— 微软照片口径）。
   *
   * 可移动范围**按轴各算**：已超出的那条轴允许"图片边缘贴住窗口边缘"；没超出的那条轴锁死在正中（0）。
   * 范围**可能不对称**：图片是在**内容盒**里居中的，它的中心与"整个盒子中心"未必重合。
   * ⚠️ 所以图像区的内边距必须做成**对称**的（`image-preview.tsx` 里是 `py-3`）—— 不对称时
   * "居中位置"与"刚好盖住窗口的位置"差半个差值，放大到刚好超出那一刻会瞬移那点距离
   * （2026-09 用户报"底部瞬移到页面底部"＝上 0/下 24 造成的 12px 跳变）。这里仍按图片真实中心算，
   * 将来内边距真不对称时也能自动适配、贴边不留空隙。
   * ⚠️ 2026-09 这里曾改成绝对值（"没超出也允许在框内移动"），用户当场报出
   * "**只有上下超出时还能左右拖**"；缩放时的"没超出就不跟随"由 followWeight 负责，
   * 与这里的钳制是两件事，不要用钳制去实现跟随。
   * 注意 `image.offsetWidth` 量的是**适应大小**（transform 不影响 offsetWidth），乘当前倍率即实际尺寸。
   */
  const metrics = useCallback((at: number = scale.get()) => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    if (!viewport || !image) {
      return {
        viewWidth: 0,
        viewHeight: 0,
        scaledWidth: 0,
        scaledHeight: 0,
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
        overflowX: false,
        overflowY: false,
      };
    }
    // 用**整个窗口区**（含内边距）而不是内容盒：某条轴一旦超出，图片就要能贴住窗口边缘。
    // 微软照片就是这样（"能盖住窗口就不留空隙"）；早先按内容盒算，于是左右各差 56px、下边差 24px，
    // 看着像没贴稳，光标落在那点内边距里滚轮还会挤出怪动画（2026-09 用户报的）。
    // 箭头/药丸绘制在图片上层，所以贴到窗口边缘也不会盖住按钮。
    const styles = getComputedStyle(viewport);
    const viewWidth = viewport.clientWidth;
    const viewHeight = viewport.clientHeight;
    // 图片的缩放中心 = 它在内容盒里的中心（flex 居中），不是整个盒子的中心
    const centerX = (viewWidth + parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight)) / 2;
    const centerY = (viewHeight + parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom)) / 2;
    const scaledWidth = image.offsetWidth * at;
    const scaledHeight = image.offsetHeight * at;
    const overflowX = scaledWidth > viewWidth + 0.5;
    const overflowY = scaledHeight > viewHeight + 0.5;
    // 两端："图片左/上边贴住窗口左/上边" 与 "图片右/下边贴住窗口右/下边"
    const edgeX = scaledWidth / 2 - centerX;
    const edgeX2 = viewWidth - scaledWidth / 2 - centerX;
    const edgeY = scaledHeight / 2 - centerY;
    const edgeY2 = viewHeight - scaledHeight / 2 - centerY;
    return {
      viewWidth,
      viewHeight,
      scaledWidth,
      scaledHeight,
      minX: overflowX ? Math.min(edgeX, edgeX2) : 0,
      maxX: overflowX ? Math.max(edgeX, edgeX2) : 0,
      minY: overflowY ? Math.min(edgeY, edgeY2) : 0,
      maxY: overflowY ? Math.max(edgeY, edgeY2) : 0,
      overflowX,
      overflowY,
    };
  }, [scale]);

  /**
   * 某条轴上「跟随光标」的强度（0~1），按该轴**超出可视区的比例**取：
   *   · 没超出（含比可视区小）→ 0：这条轴只从中心放大，不往光标跑 —— 用户 2026-09 明确要求，
   *     否则小图会被整体推向光标（上一版就踩了这个副作用）；
   *   · 超出窗口 FOLLOW_RAMP（8%）→ 1：完全钉住光标下的那一点；
   *   · 中间用 smoothstep 平滑接管：位移连续、速度也连续，不会"先居中放大、再突然甩向光标"。
   * 分轴的好处：宽图横向超出时，竖向若仍没超出，就还保持竖向居中（不会莫名上下漂）。
   */
  const followWeight = useCallback((scaled: number, view: number) => {
    if (view <= 0) return 1;
    const t = clamp((scaled - view) / (view * FOLLOW_RAMP), 0, 1);
    return t * t * (3 - 2 * t);
  }, []);

  /** 把位移钳回边界（缩放、拖动、窗口变化、图片加载完成后都要来一次） */
  const clampPan = useCallback(() => {
    const limit = metrics();
    x.set(clamp(x.get(), limit.minX, limit.maxX));
    y.set(clamp(y.get(), limit.minY, limit.maxY));
  }, [metrics, x, y]);

  const scaleRange = useCallback(() => {
    const image = imageRef.current;
    const natural = image?.naturalWidth ?? 0;
    const fitted = image?.offsetWidth ?? 0;
    const naturalScale = natural > 0 && fitted > 0 ? natural / fitted : 1;
    return {
      min: MIN_ZOOM_SCALE,
      // 上限 = 真实像素 2 倍（200%），兜底下限 2×，绝对上限 MAX_ZOOM_SCALE
      max: Math.min(MAX_ZOOM_SCALE, Math.max(MIN_MAX_ZOOM_SCALE, ZOOM_MAX_PERCENT * naturalScale)),
    };
  }, []);

  /** 量一次图片尺寸并刷新读数：解码前后 offsetWidth / naturalWidth 会变，真实百分比与缩放上限都依赖它 */
  const measure = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;
    const natural = image.naturalWidth;
    const fitted = image.offsetWidth;
    if (natural > 0 && fitted > 0) {
      naturalScaleRef.current = natural / fitted;
    }
    syncReadouts(scale.get());
    clampPan();
  }, [clampPan, scale, syncReadouts]);

  const stopSmoothing = useCallback(() => {
    if (smoothRafRef.current !== null) {
      cancelAnimationFrame(smoothRafRef.current);
      smoothRafRef.current = null;
    }
    zoomTargetRef.current = null;
    zoomFocusRef.current = null;
    zoomFlightRef.current = null;
  }, []);

  /**
   * 滚轮缩放的平滑播放：进度用指数逼近（负责"速度曲线"），倍率与位移都按**同一个进度**
   * 在「起点 → 终点」之间直线插值。终点在滚轮事件里一次性算好（含跟随强度与边界钳制），
   * 所以整段不会出现"中途被边界吸一下"的折线 —— 微软照片就是这个手感（直线缩放 + 速度缓动）。
   * 这里**不再逐帧钳制**：终点已合法，可行域对进度是凸的，直线路径必然合法；窗口尺寸突变由 resize 兜底。
   */
  const runSmoothing = useCallback(() => {
    if (smoothRafRef.current !== null) return; // 已经在跑
    let last = performance.now();

    const step = (now: number) => {
      const flight = zoomFlightRef.current;
      if (!flight) {
        smoothRafRef.current = null;
        return;
      }

      const dt = Math.min(64, Math.max(1, now - last));
      last = now;
      // 指数逼近：与帧率无关（1 - e^{-dt/τ}）
      flight.progress += (1 - flight.progress) * (1 - Math.exp(-dt / ZOOM_SMOOTH_TAU_MS));
      const done = 1 - flight.progress < 0.0015;
      const progress = done ? 1 : flight.progress;

      scale.set(flight.s0 + (flight.s1 - flight.s0) * progress);
      x.set(flight.x0 + (flight.x1 - flight.x0) * progress);
      y.set(flight.y0 + (flight.y1 - flight.y0) * progress);

      if (done) {
        smoothRafRef.current = null;
        zoomFlightRef.current = null;
        zoomFocusRef.current = null;
        return;
      }
      smoothRafRef.current = requestAnimationFrame(step);
    };

    smoothRafRef.current = requestAnimationFrame(step);
  }, [scale, x, y]);

  const reset = useCallback(
    (animated = false) => {
      draggedRef.current = false;
      anchorRef.current = null; // 换图 / 重开灯箱：下一个手势重新取锚点
      stopSmoothing();
      if (!animated || reduced) {
        x.set(0);
        y.set(0);
        scale.set(1);
        return;
      }
      animate(x, 0, SPRING);
      animate(y, 0, SPRING);
      animate(scale, 1, SPRING);
    },
    [reduced, scale, stopSmoothing, x, y]
  );

  // 卸载时停掉平滑循环
  useEffect(() => stopSmoothing, [stopSmoothing]);

  // 换图时回到适应大小。注意 href 变 null 代表"正在关闭"——这时**不能**复位：
  // 关闭后弹层还要播 240ms 退场动画（约定 22），中途把缩放归零会看到"图片先跳回原大小再淡出"
  useEffect(() => {
    if (!href) return;
    reset(false);
  }, [href, reset]);

  // 每次重新打开也回到适应大小（同一张图重开时 href 没变，靠这条兜住）
  useEffect(() => {
    if (!open) return;
    reset(false);
  }, [open, reset]);

  // 药丸：偏离适应大小时出现，停手 PILL_VISIBLE_MS 后自动淡出
  //（percent 每变一次都重新计时，所以缩放/拖动过程中它一直可见，停下来才淡出）
  useEffect(() => {
    if (!zoomed) {
      setPillVisible(false);
      return;
    }
    setPillVisible(true);
    const timer = setTimeout(() => setPillVisible(false), PILL_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [zoomed, percent]);

  // 滚轮缩放：必须以光标为锚点，且要 preventDefault（React 的 onWheel 是被动监听，拦不住默认行为）
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      // 左右翻页条内不缩放（用户 2026-09 要求，照微软照片查看器的做法）：
      // 命中竖条就直接放行，连 preventDefault 都不做，那一整条完全留给翻页
      if ((event.target as Element | null)?.closest(`[${PAGING_BAND_ATTR}]`)) return;
      const image = imageRef.current;
      if (!image) return;
      event.preventDefault();

      const delta = event.deltaMode === 1 ? event.deltaY * LINE_HEIGHT_PX : event.deltaY;
      const { min, max } = scaleRange();
      const current = scale.get();
      // 连续滚动时接着上次的目标继续推（而不是从当前值重算），快速滚动才跟得上
      const from = zoomTargetRef.current ?? current;
      const target = clamp(from * Math.exp(-delta * WHEEL_SENSITIVITY), min, max);
      if (Math.abs(target - current) < 0.0005 && zoomTargetRef.current === null) return;

      // 锚点：元素原始中心 = 当前矩形中心 − 当前位移；把光标下的图像点记在未缩放坐标系里（u / v）
      const rect = image.getBoundingClientRect();
      const originX = rect.left + rect.width / 2 - x.get();
      const originY = rect.top + rect.height / 2 - y.get();
      // 同一次手势沿用起始时所指的那个图像点（只更新光标位置）：若每次事件都重取，
      // "跟随强度还没升满"造成的偏斜会一次次累积，最后落不到光标上（实测偏几十像素）
      const now = performance.now();
      let anchor = anchorRef.current;
      // 光标一旦挪窝就重取锚点：否则会拿"旧光标下的图像点"配"新光标位置"，
      // 目标位移会变成一整段滑动（用户 2026-09 报"鼠标移到另一边再滚一下，图片整块往反方向弹"）
      const cursorMoved =
        !!anchor &&
        (Math.abs(event.clientX - anchor.cx) > ANCHOR_MOVE_TOLERANCE_PX ||
          Math.abs(event.clientY - anchor.cy) > ANCHOR_MOVE_TOLERANCE_PX);
      if (!anchor || now - anchor.at > WHEEL_BURST_GAP_MS || cursorMoved) {
        // 光标可能落在图片**外面**（小图两侧的空白、只有一条轴超出时的留白）：
        // 把锚点钳进图片范围，等价于"光标贴着最近的那条边" —— 越界那一瞬间的位移更小、
        // 不会因为"虚空锚点"的杠杆把图一把推远（用户在空白处滚轮时就是这种感觉）。
        const halfWidth = image.offsetWidth / 2;
        const halfHeight = image.offsetHeight / 2;
        anchor = {
          u: clamp((event.clientX - originX - x.get()) / current, -halfWidth, halfWidth),
          v: clamp((event.clientY - originY - y.get()) / current, -halfHeight, halfHeight),
          at: now,
          cx: event.clientX,
          cy: event.clientY,
        };
        anchorRef.current = anchor;
      } else {
        anchor.at = now; // 续上同一个手势
      }
      const { u, v } = anchor;

      // 终点一次性算好：跟随强度与边界钳制都按**终点倍率**算，动画过程只走直线、不再中途纠偏
      //（逐帧纠偏就是"边缘靠近窗口时被吸一下"的来源）
      const end = metrics(target);
      const targetX = clamp(
        followWeight(end.scaledWidth, end.viewWidth) * (event.clientX - originX - u * target),
        end.minX,
        end.maxX
      );
      const targetY = clamp(
        followWeight(end.scaledHeight, end.viewHeight) * (event.clientY - originY - v * target),
        end.minY,
        end.maxY
      );

      zoomFocusRef.current = {
        originX,
        originY,
        cursorX: event.clientX,
        cursorY: event.clientY,
        u,
        v,
      };
      zoomTargetRef.current = target;
      zoomFlightRef.current = {
        s0: current,
        x0: x.get(),
        y0: y.get(),
        s1: target,
        x1: targetX,
        y1: targetY,
        progress: 0,
      };

      // 与双击 / 复位用的弹簧互斥：先停掉那边的动画再接管
      scale.stop();
      x.stop();
      y.stop();

      if (reduced) {
        // 用户要求减少动效：直接落到终点（终点已含跟随强度与钳制）
        scale.set(target);
        x.set(targetX);
        y.set(targetY);
        zoomTargetRef.current = null;
        zoomFocusRef.current = null;
        zoomFlightRef.current = null;
        return;
      }

      runSmoothing();
    };

    // 依赖 open / href：灯箱未打开时组件返回 null、图像区还没进 DOM（ref 为空），
    // 必须等它真正挂上之后再注册一次，否则监听永远挂不上（实测踩过）
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [open, href, followWeight, metrics, reduced, runSmoothing, scaleRange, scale, x, y]);

  // 按住拖动平移（只认鼠标；拖动过就标记一下，让随后的 click 不关灯箱）
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let origin: { clientX: number; clientY: number; x: number; y: number } | null = null;
    /** 真正开始拖动后才捕获的指针 id */
    let capturedId: number | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      // 每次按下先清标记：这样"拖动结束没跟上 click"也不会吞掉之后无关的点击
      draggedRef.current = false;
      // 左右翻页条内不拖动：那一整条完全留给翻页（它本身也是 button，下面那条是兜底）
      if ((event.target as Element | null)?.closest(`[${PAGING_BAND_ATTR}]`)) return;
      // 点在按钮（左右翻页条 / 倍率药丸）上时不接管
      if ((event.target as Element | null)?.closest("button")) return;
      const limit = metrics();
      // 只有至少一条轴已超出窗口才允许拖动（各轴仍分别受钳制：没超出的那条轴范围是 0，动不了）
      if (!limit.overflowX && !limit.overflowY) return;
      stopSmoothing(); // 滚轮还在滑行时按住鼠标：先停下，别和拖动抢同一个位移
      origin = { clientX: event.clientX, clientY: event.clientY, x: x.get(), y: y.get() };
      setDragging(true);
      event.preventDefault();
      // 这里**不能**立刻 setPointerCapture：捕获后紧接着的 click 会被重定向到图像区，
      // 图片自己的"阻止冒泡"就失效了 —— 表现为"放大后点一下图片就把灯箱关掉"（用户报过）。
      // 等拖动真的超过阈值再捕获，既能拖出容器，又不影响普通点击。
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!origin) return;
      const dx = event.clientX - origin.clientX;
      const dy = event.clientY - origin.clientY;
      if (!draggedRef.current && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
        draggedRef.current = true;
        try {
          viewport.setPointerCapture(event.pointerId);
          capturedId = event.pointerId;
        } catch {
          // 合成的 pointer 事件没有真实指针可捕获，忽略即可
        }
      }
      const limit = metrics();
      x.set(clamp(origin.x + dx, limit.minX, limit.maxX));
      y.set(clamp(origin.y + dy, limit.minY, limit.maxY));
    };

    const endDrag = () => {
      if (capturedId !== null) {
        try {
          if (viewport.hasPointerCapture(capturedId)) viewport.releasePointerCapture(capturedId);
        } catch {
          // 同上
        }
        capturedId = null;
      }
      if (!origin) return;
      origin = null;
      setDragging(false);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      endDrag();
    };

    viewport.addEventListener("pointerdown", handlePointerDown);
    viewport.addEventListener("pointermove", handlePointerMove);
    viewport.addEventListener("pointerup", handlePointerUp);
    viewport.addEventListener("pointercancel", endDrag);
    return () => {
      viewport.removeEventListener("pointerdown", handlePointerDown);
      viewport.removeEventListener("pointermove", handlePointerMove);
      viewport.removeEventListener("pointerup", handlePointerUp);
      viewport.removeEventListener("pointercancel", endDrag);
    };
    // 同上：图像区进 DOM 之后才挂得上
  }, [open, href, metrics, stopSmoothing, x, y]);

  /**
   * 单击放大：**只在"适应大小"时**响应（居中放大到 2×，不看光标位置 —— 与原双击的那一档一致，
   * 因为光标显示的是放大镜）。已放大时单击不做任何事，"缩小"始终留给双击。
   */
  const zoomIn = useCallback(() => {
    if (Math.abs(scale.get() - 1) > 0.01) return;
    draggedRef.current = false;
    stopSmoothing();
    const { max } = scaleRange();
    const target = Math.min(2, max);
    lastClickZoomAtRef.current = performance.now();
    if (reduced) {
      scale.set(target);
      x.set(0);
      y.set(0);
      return;
    }
    animate(scale, target, SPRING);
    animate(x, 0, SPRING);
    animate(y, 0, SPRING);
  }, [reduced, scaleRange, scale, stopSmoothing, x, y]);

  /**
   * 双击缩回：**只在放大时**生效；刚"单击放大"过的 350ms 内忽略 ——
   * 否则在适应大小时双击会变成"单击放大 → 双击又缩回"，看起来闪一下。
   */
  const zoomOut = useCallback(() => {
    if (Math.abs(scale.get() - 1) <= 0.01) return;
    if (performance.now() - lastClickZoomAtRef.current < DBLCLICK_GUARD_MS) return;
    draggedRef.current = false;
    reset(true);
  }, [reset, scale]);

  // 窗口变化：可视区尺寸变了，位移要重新钳一次
  useEffect(() => {
    if (!open) return;
    const handleResize = () => measure();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open, measure]);

  // 图片解码完成后 offsetWidth / naturalWidth 才有效：重新钳一次，顺带刷新真实百分比与缩放上限
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const handleLoad = () => measure();
    image.addEventListener("load", handleLoad);
    // 命中缓存的图片可能不再触发 load：再量一帧兜底
    const raf = requestAnimationFrame(() => measure());
    return () => {
      image.removeEventListener("load", handleLoad);
      cancelAnimationFrame(raf);
    };
    // 依赖 open：灯箱打开那一帧组件还返回 null、图片节点尚未存在（ref 为空），
    // 必须等它真正挂上再挂监听，否则真实像素换算系数永远是 1（实测踩过）
  }, [open, href, measure]);

  const consumeClickIfDragged = useCallback(() => {
    if (!draggedRef.current) return false;
    draggedRef.current = false;
    return true;
  }, []);

  return {
    viewportRef,
    imageRef,
    style: { x, y, scale },
    zoomed,
    percent,
    pillVisible,
    dragging,
    zoomIn,
    zoomOut,
    reset,
    consumeClickIfDragged,
  };
}
