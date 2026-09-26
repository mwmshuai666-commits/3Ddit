/**
 * babylon-datav 特效组件的流动贴图
 *
 * 组件默认指向 `/static/textures/line.png` / `line2.png` / `flyLine5.png`，
 * 本项目没有这些资源，直接用默认值会在控制台刷 404、贴图退化成纯色。
 * 这里用 canvas 画出同风格（光带 / 流线 / 彗尾）的贴图，转成 dataURL 传进组件 ——
 * Babylon 的 Texture 支持 data: 协议（AbstractEngine._createTextureBase 里单独处理）。
 *
 * 贴图方向约定：组件内部会调用 swapTubeUV（管类）或 GreasedLine 自身 UV，
 * 都是 u 沿管道方向、v 沿圆周/宽度方向，所以“光带”画在 u 的横向上。
 */

const cache = {}

function make(w, h, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d'), w, h)
  return canvas.toDataURL('image/png')
}

/** 竖向亮度剖面：中间最亮、上下透明（管类贴图的 v 方向） */
function profile(ctx, w, h, mid) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, 'rgba(255,255,255,0.06)')
  g.addColorStop(0.5, `rgba(255,255,255,${mid})`)
  g.addColorStop(1, 'rgba(255,255,255,0.06)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** 横向脉冲：一（两）段高亮光带 */
function pulse(ctx, w, h, cx, radius) {
  const g = ctx.createLinearGradient(cx - radius, 0, cx + radius, 0)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(0.42, 'rgba(255,255,255,0.8)')
  g.addColorStop(0.55, 'rgba(255,255,255,1)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

/** FlexiblePipe：整条微亮 + 两段脉冲 */
function flowUrl() {
  if (cache.flow) return cache.flow
  cache.flow = make(256, 16, (ctx, w, h) => {
    profile(ctx, w, h, 0.28)
    pulse(ctx, w, h, w * 0.25, 30)
    pulse(ctx, w, h, w * 0.75, 30)
  })
  return cache.flow
}

/** StreamLine：更细更亮的一条流线（叠加混合下会更炸） */
function streamUrl() {
  if (cache.stream) return cache.stream
  cache.stream = make(256, 16, (ctx, w, h) => {
    profile(ctx, w, h, 0.16)
    pulse(ctx, w, h, w * 0.5, 44)
  })
  return cache.stream
}

/** ArrowFlyLine：彗尾 —— 尾部淡出、头部一个亮团，宽度方向是发光剖面 */
function flyUrl() {
  if (cache.fly) return cache.fly
  cache.fly = make(128, 16, (ctx, w, h) => {
    // 1) 沿管道方向的亮度：左端渐隐 → 右端最亮
    const along = ctx.createLinearGradient(0, 0, w, 0)
    along.addColorStop(0, 'rgba(255,255,255,0)')
    along.addColorStop(0.45, 'rgba(255,255,255,0.28)')
    along.addColorStop(0.78, 'rgba(255,255,255,1)')
    along.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = along
    ctx.fillRect(0, 0, w, h)
    // 2) 只保留亮度剖面决定的部分（两个梯度相乘）
    ctx.globalCompositeOperation = 'destination-in'
    profile(ctx, w, h, 0.95)
    ctx.globalCompositeOperation = 'source-over'
  })
  return cache.fly
}

/** 按 schema 里 catalog 的 texture 字段取贴图 */
export function datavTextureUrl(key) {
  if (key === 'flow') return flowUrl()
  if (key === 'stream') return streamUrl()
  if (key === 'fly') return flyUrl()
  return null
}
