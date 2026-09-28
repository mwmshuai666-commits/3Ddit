/**
 * HTML 元素面板：用户写的 HTML 片段 → 场景里的一块「贴片」。
 *
 * 渲染路径：SVG foreignObject 把这段 HTML 栅格化成 canvas，再喂给 DynamicTexture。
 * 好处是能保留 HTML/CSS 的排版（颜色、圆角、表格、flex 布局都照原样）；
 * 代价是浏览器处于「画图沙箱」里：<script> 不执行、外链图片字体不加载、
 * canvas / video 画不出来。面板上写清了这条限制，谁写谁知道。
 *
 * 另一个坑：SVG 是 XML，HTML 里一堆「合法但 XML 不认」的写法整段都会解析失败——
 * 最典型的就是 <br>（XML 要求 <br/>）、&nbsp; 这类命名实体、裸 &、DOCTYPE。
 * 所以栅格化之前先 sanitizeMarkup()：把这些改成 XML 能吃的等价物，
 * 用户复制粘贴进来的常见 HTML 才能一次画出来，而不是莫名其妙退化成纯文本。
 *
 * 万一栅格化失败（或者渲染出来是张透明图），就退化成纯文本排布——
 * 内容还在，不会整个场景打不开。这也是防呆：用户把一段带脚本的 HTML 粘进来，
 * 至少能看到文字。
 *
 * 这份实现在编辑器和 babylon-scene-player 里各存一份（和 digitalGround.js 一样），
 * 改的话两边一起改。
 */

import {
  DynamicTexture,
  MeshBuilder,
  StandardMaterial,
  Color3,
  AbstractMesh,
  Matrix,
  Vector3,
} from '@babylonjs/core'

/** 每个「场景单位」栅格化成多少像素。192 是个折中：够看清 12px 字，又不至于纹理过大 */
const DPI = 192

/** 单边像素上限：HTML 面板可以把 20 个单位宽写成 3840px，浏览器扛不住 */
const MAX_PX = 2048
const MIN_PX = 16

function clampPx(v) {
  return Math.max(MIN_PX, Math.min(MAX_PX, Math.round(v)))
}

function rasterSize(props) {
  const width = Number(props?.width) || 4
  const height = Number(props?.height) || 2.4
  return { w: clampPx(width * DPI), h: clampPx(height * DPI) }
}

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}

/** 去标签取纯文本（栅格化失败时的兜底内容） */
function htmlToText(html) {
  const text = String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
  return text
}

/** HTML 里合法、XML 里不认识的命名实体 → 对应数字实体（XML 只认 5 个预定义实体） */
const HTML_ENTITIES = {
  nbsp: '&#160;', copy: '&#169;', reg: '&#174;', trade: '&#8482;',
  hellip: '&#8230;', mdash: '&#8212;', ndash: '&#8211;',
  lsquo: '&#8216;', rsquo: '&#8217;', ldquo: '&#8220;', rdquo: '&#8221;',
  bull: '&#8226;', middot: '&#183;', laquo: '&#171;', raquo: '&#187;',
  deg: '&#176;', plusmn: '&#177;', times: '&#215;', divide: '&#247;',
  euro: '&#8364;', pound: '&#163;', yen: '&#165;', sect: '&#167;',
  para: '&#182;', dagger: '&#8224;', permil: '&#8240;',
  larr: '&#8592;', rarr: '&#8594;', uarr: '&#8593;', darr: '&#8595;', harr: '&#8596;',
  ne: '&#8800;', le: '&#8804;', ge: '&#8805;', inf: '&#8734;',
  alpha: '&#945;', beta: '&#946;', gamma: '&#947;', delta: '&#948;', pi: '&#960;',
  Omega: '&#937;', omega: '&#969;', mu: '&#956;', Sigma: '&#931;', sigma: '&#963;',
}

/** HTML 的 void 元素：XML 里必须写成 <br/> 这种自闭和形式 */
const VOID_TAGS = 'area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr'

/**
 * HTML 片段 → XML 安全的等价物（SVG foreignObject 只吃 XML）
 *
 * 不做「过滤」只做「改写」：用户写的标签、样式一点不动，
 * 只把 XML 解析器会报错的地方换成等价写法。
 * @param {string} markup
 * @returns {string}
 */
export function sanitizeMarkup(markup) {
  return (
    String(markup || '')
      // 1) <script> 在 SVG 画布里本来就不会执行，留着还可能带出内联事件，直接删
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/?>/gi, '')
      // 2) <br> → <br/>。这一条最关键：不自闭合的话整张 SVG 图都解析失败，
      //    表现就是面板莫名其妙退化成纯文本（用户只会觉得「我的样式丢了」）
      .replace(
        new RegExp(`<(${VOID_TAGS})\\b([^>]*?)(/?)>`, 'gi'),
        (all, tag, attrs, slash) => (slash ? all : `<${tag}${attrs}/>`),
      )
      // 3) DOCTYPE / XML 声明 / 处理指令混在片段里会让解析器直接报错
      .replace(/<[!?][^>]*>/g, '')
      // 4) 命名实体 → 数字实体（&lt; &gt; &amp; &quot; &apos; 五个原样留着）
      .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (all, name) => {
        if (name === 'lt' || name === 'gt' || name === 'amp' || name === 'quot' || name === 'apos') {
          return all
        }
        return HTML_ENTITIES[name] || `&amp;${name};`
      })
      // 5) 剩下的裸 & 转义（&#160; 这种数字实体不动）
      .replace(/&(?![a-zA-Z#][a-zA-Z0-9]*;)/g, '&amp;')
  )
}

/**
 * HTML 片段 → canvas（走 SVG foreignObject 栅格化）
 * @param {string} html
 * @param {number} w 画布宽（像素）
 * @param {number} h 画布高（像素）
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function htmlToCanvas(html, w, h) {
  const markup = String(html || '')
  if (!markup.trim()) throw new Error('HTML 内容为空')

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px">${sanitizeMarkup(markup)}</div>` +
    `</foreignObject></svg>`

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  const image = await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('HTML 无法栅格化'))
    img.src = url
  })

  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(image, 0, 0, w, h)

  // 有的浏览器（或安全策略）会静悄悄地画出一张全透明的图，这时不能算成功
  const data = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < data.length; i += 4 * 97) {
    if (data[i] > 8) return canvas
  }
  throw new Error('HTML 渲染结果为空')
}

/** 纯文本兜底排版：底板 + 自动换行 */
export function textToCanvas(text, w, h) {
  const canvas = makeCanvas(w, h)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = 'rgba(8,16,32,0.78)'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(90,155,255,0.45)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, w - 2, h - 2)

  const fontSize = Math.max(11, Math.min(30, Math.round(h / 7)))
  const lineHeight = Math.round(fontSize * 1.6)
  const pad = Math.round(fontSize * 0.9)
  ctx.font = `${fontSize}px "Microsoft YaHei", sans-serif`
  ctx.fillStyle = '#dbe6ff'
  ctx.textBaseline = 'top'

  const maxWidth = w - pad * 2
  const lines = []
  for (const raw of String(text || '（没有内容）').split('\n')) {
    let line = ''
    for (const ch of raw) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        lines.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    lines.push(line)
  }

  let y = pad
  for (const line of lines) {
    if (y > h - lineHeight) break
    ctx.fillText(line, pad, y)
    y += lineHeight
  }
  return canvas
}

/**
 * 建 HTML 面板。几何体是 1×1 的平面，改宽高只缩放不重建。
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {{html:string, width:number, height:number, mode:'3d'|'billboard'}} props
 * @returns {{mesh:import('@babylonjs/core').Mesh, material:import('@babylonjs/core').StandardMaterial,
 *            texture:import('@babylonjs/core').DynamicTexture,
 *            update:(props:object)=>Promise<void>, dispose:()=>void, failed:boolean}}
 */
export function createHtmlPanel(scene, props = {}) {
  const size = rasterSize(props)
  const texture = new DynamicTexture(
    `htmlPanel_${Math.random().toString(36).slice(2, 8)}`,
    { width: size.w, height: size.h },
    scene,
    true,
  )
  texture.hasAlpha = true

  const material = new StandardMaterial('htmlPanelMat', scene)
  material.diffuseTexture = texture
  material.useAlphaFromDiffuseTexture = true
  material.transparencyMode = 2 // ALPHABLEND：HTML 自己画了透明背景就得能透出来
  // 面板要像屏幕一样「原样显示贴图」，不能吃场景灯光：
  //   disableLighting 会把 diffuseBase（光照贡献）清零，
  //   而 StandardMaterial 的最终色是 clamp(diffuseBase + emissive + ambient) * baseColor——
  //   所以必须同时把 emissive 拉成纯白，否则面板是一片死黑
  material.disableLighting = true
  material.emissiveColor = Color3.White()
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  material.backFaceCulling = false

  const mesh = MeshBuilder.CreatePlane('htmlPanel', { width: 1, height: 1 }, scene)
  mesh.material = material
  mesh.isPickable = true
  const panel = {
    mesh,
    material,
    texture,
    failed: false,
    /** 上一次真正画过的内容，避免重复栅格化 */
    _rendered: '',
    _size: size,
    _mode: '',
  }

  applyMode(panel, props.mode)
  applySize(panel, props)

  async function update(nextProps) {
    const p = { ...(nextProps || {}) }
    applyMode(panel, p.mode)

    const next = rasterSize(p)
    const sizeChanged = next.w !== panel._size.w || next.h !== panel._size.h
    if (sizeChanged) {
      panel._size = next
      texture.scaleTo(next.w, next.h)
      applySize(panel, p)
    }

    if (p.html === panel._rendered) return
    panel._rendered = p.html
    panel.failed = false

    let canvas = null
    try {
      canvas = await htmlToCanvas(p.html, next.w, next.h)
    } catch {
      // 栅格化失败：退化成纯文本，至少内容看得见
      canvas = textToCanvas(htmlToText(p.html), next.w, next.h)
      panel.failed = true
    }
    const ctx = texture.getContext()
    ctx.clearRect(0, 0, next.w, next.h)
    ctx.drawImage(canvas, 0, 0)
    texture.update(false)
  }

  // 首个渲染也走 update：内容一样就不重画（panel._rendered 初始为空串）
  update(props)

  panel.update = update
  panel.dispose = () => {
    mesh?.dispose()
    material?.dispose()
    texture?.dispose()
  }
  return panel
}

/** 宽高走缩放：平面是 1×1 的，所以 scaling 就是世界尺寸 */
function applySize(panel, props) {
  const width = Math.max(0.05, Number(props?.width) || 4)
  const height = Math.max(0.05, Number(props?.height) || 2.4)
  panel.mesh.scaling.set(width, height, 1)
}

/** mode: '3d' 是场景里的普通板子；'billboard' 就是「始终朝你」 */
function applyMode(panel, mode) {
  if (mode === panel._mode) return
  panel._mode = mode
  panel.mesh.billboardMode =
    mode === 'billboard' ? AbstractMesh.BILLBOARDMODE_ALL : AbstractMesh.BILLBOARDMODE_NONE
}

/* ============================================================
 * 网页面板：场景里放一块「真网页」
 *
 * HTML 面板走的是「栅格化成贴图」，所以 <iframe> 画不出来（浏览器把
 * data: 形式的 SVG 当静态图片解析：不建嵌套浏览上下文、不加载外链）。
 * 网页面板换成另一条路：真的 DOM <iframe> 盖在 canvas 上，每帧把自己投影
 * 到同一块平面上——页面是活的，能滚动、能点、能跑 echarts / 视频。
 *
 * 对齐用的是 4 点单应（homography）：平面四角 → 投影成屏幕像素 → 解 8 个
 * 未知量写成 CSS matrix3d。没有直接把 view-projection 矩阵塞进 CSS，
 * 是因为 CSS 的 matrix3d 只能做「投影之后」的变换，而 NDC→屏幕像素那一步
 * 恰好是投影后的仿射，单应矩阵把两步合成一步，数学上闭合。
 *
 * 两条绕不开的限制（DOM 浮层的通病，不是实现问题）：
 *   1. 永远贴在 canvas 之上，3D 物体挡不住它——没有深度遮挡；
 *   2. 目标站点可以用 X-Frame-Options / CSP frame-ancestors 拒绝被嵌入，
 *      这时 iframe 是一片空白，纯浏览器策略，谁也绕不过去。
 * ============================================================ */

/** 1 个场景单位折算成 iframe 内多少 CSS 像素。只影响远端页面的排版视口宽，
 *  不影响它在场景里占多大——场景大小由平面 scaling 决定 */
const WEB_PX_PER_UNIT = 128

/** 边框留白（CSS 像素）：让平面贴图的外框露出来，空白时也看得见边界 */
const WEB_BEZEL_PX = 3

/** 造一个只画外框的贴图：中间镂空，给 iframe */
function drawWebFrame(ctx, props, hasUrl) {
  const { width: w, height: h } = ctx.canvas
  ctx.clearRect(0, 0, w, h)
  const lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.008))
  ctx.strokeStyle = 'rgba(120,180,255,0.85)'
  ctx.lineWidth = lineWidth
  ctx.strokeRect(lineWidth / 2, lineWidth / 2, w - lineWidth, h - lineWidth)

  // 四角短刻度：像取景框，一眼看出这是块「屏」
  const t = Math.max(6, Math.min(w, h) * 0.06)
  ctx.strokeStyle = 'rgba(190,220,255,0.95)'
  ctx.lineWidth = lineWidth * 1.5
  const corner = (x, y, dx, dy) => {
    ctx.beginPath()
    ctx.moveTo(x + dx * t, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + dy * t)
    ctx.stroke()
  }
  corner(0, 0, 1, 1)
  corner(w, 0, -1, 1)
  corner(w, h, -1, -1)
  corner(0, h, 1, -1)

  if (!hasUrl) {
    // 没填网址时把提示写在框里，免得用户对着一块空面板发愣
    const fontSize = Math.max(11, Math.min(30, Math.round(h / 8)))
    ctx.font = `${fontSize}px "Microsoft YaHei", sans-serif`
    ctx.fillStyle = 'rgba(219,230,255,0.85)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('未设置网页地址', w / 2, h / 2)
    ctx.textAlign = 'start'
  }
}

/**
 * 解线性方程组 A·x = b（高斯消元 + 列主元）。8×8 规模，单应足够用。
 * 奇异时返回 null，调用方降级成「隐藏浮层」。
 * @param {number[][]} A
 * @param {number[]} b
 * @returns {number[]|null}
 */
function solveLinear(A, b) {
  const n = b.length
  const m = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null
    if (pivot !== col) { const t = m[pivot]; m[pivot] = m[col]; m[col] = t }
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col]
      if (!f) continue
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c]
    }
  }
  const x = new Array(n)
  for (let r = n - 1; r >= 0; r--) {
    let sum = m[r][n]
    for (let c = r + 1; c < n; c++) sum -= m[r][c] * x[c]
    x[r] = sum / m[r][r]
  }
  return x.every((v) => Number.isFinite(v)) ? x : null
}

/** 平面四角（1×1 平面）。按「左上、右上、右下、左下」排，和 CSS 盒子的角一一对应 */
const CORNER_LT = new Vector3(-0.5, 0.5, 0)
const CORNER_RT = new Vector3(0.5, 0.5, 0)
const CORNER_RB = new Vector3(0.5, -0.5, 0)
const CORNER_LB = new Vector3(-0.5, -0.5, 0)

/** 每帧投影用的临时量。放模块级是为了别在 60fps 里堆垃圾 */
const _worldPos = new Vector3()
const _camPos = new Vector3()
const _screen = new Vector3()

/**
 * 把元素盒子 (0,0)-(w,h) 贴到屏幕四边形，求 CSS matrix3d 的 16 个参数。
 * @param {number} w 元素宽（CSS 像素）
 * @param {number} h 元素高（CSS 像素）
 * @param {number[]} quad 四个角的屏幕坐标 [x0,y0,x1,y1,x2,y2,x3,y3]，顺序是
 *   左上、右上、右下、左下（和盒子的四个角一一对应）
 * @returns {number[]|null}
 */
function quadToMatrix3d(w, h, quad) {
  const src = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ]
  const A = []
  const b = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const X = quad[i * 2]
    const Y = quad[i * 2 + 1]
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X])
    b.push(X)
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y])
    b.push(Y)
  }
  const s = solveLinear(A, b)
  if (!s) return null
  // CSS matrix3d(...) 按「列优先」收参：前 4 个是矩阵第 1 列，即
  //   M11 M21 M31 M41 | M12 M22 M32 M42 | M13 M23 M33 M43 | M14 M24 M34 M44
  // 单应矩阵是 3×3，嵌进 4×4 的 z=0 平面上：
  //   第 1 列 (h11, h21, 0, h31) —— 透视行 h31/h32 必须放在第 1、2 列的第 4 位（m41/m42 的位置），
  //   第 4 列 (h13, h23, 0, 1)  —— 平移量放最后 4 个里的前两位
  // 这样 CSS 自己会拿 w' = h31·x + h32·y + 1 做一次透视除法，正好补上我们缺的那一步
  return [s[0], s[3], 0, s[6], s[1], s[4], 0, s[7], 0, 0, 1, 0, s[2], s[5], 0, 1]
}

/**
 * 建网页面板。几何体同样是 1×1 的平面（改宽高只缩放不重建），
 * 但内容不是贴图而是真的 <iframe>。
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @param {{url?:string, width?:number, height?:number, mode?:'3d'|'billboard', interactive?:boolean}} props
 *   interactive 省略时按 true 处理（可点）；显式 false 才把事件还给 canvas
 * @param {HTMLElement} [container] iframe 的挂载点，默认 canvas 的父元素
 * @returns {{mesh:import('@babylonjs/core').Mesh, material:import('@babylonjs/core').StandardMaterial,
 *            texture:import('@babylonjs/core').DynamicTexture,
 *            update:(props:object)=>void, dispose:()=>void, frame:HTMLIFrameElement}}
 */
export function createWebPanel(scene, props = {}, container = null) {
  const engine = scene.getEngine()
  const canvas = engine.getRenderingCanvas()
  const layer = container || (canvas && canvas.parentElement) || document.body

  const size = rasterSize(props)
  const texture = new DynamicTexture(
    `webPanel_${Math.random().toString(36).slice(2, 8)}`,
    { width: size.w, height: size.h },
    scene,
    true,
  )
  texture.hasAlpha = true

  const material = new StandardMaterial('webPanelMat', scene)
  material.diffuseTexture = texture
  material.useAlphaFromDiffuseTexture = true
  material.transparencyMode = 2 // ALPHABLEND
  material.disableLighting = true
  material.emissiveColor = Color3.White()
  material.diffuseColor = Color3.White()
  material.specularColor = Color3.Black()
  material.backFaceCulling = false

  const mesh = MeshBuilder.CreatePlane('webPanel', { width: 1, height: 1 }, scene)
  mesh.material = material
  mesh.isPickable = true

  // 浮层：iframe 默认吃事件（pointer-events:auto），这样导入一块网页就能直接点；
  // 想指着面板转相机时再把 props.interactive 关掉。宿主 host 自己是
  // pointer-events:none —— 它只负责定位和裁剪，不参与命中测试，所以 iframe
  // 抢不抢事件完全由 iframe 自己的 pointer-events 决定。
  // host 用 inset:0 铺满画布的父容器，正好就是画布那一块 —— 前提是父容器是
  // 「定位元素」（absolute/fixed/relative）。静态定位的话自己给它补个 relative，
  // 否则 host 会去找更外层的定位祖先，和画布错位。
  if (layer && getComputedStyle(layer).position === 'static') layer.style.position = 'relative'
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;overflow:hidden'
  const frame = document.createElement('iframe')
  frame.setAttribute('frameborder', '0')
  frame.setAttribute('allow', 'autoplay; fullscreen; clipboard-write; encrypted-media')
  frame.style.cssText =
    'position:absolute;left:0;top:0;border:0;padding:0;background:transparent;'
    + 'transform-origin:0 0;pointer-events:none;visibility:hidden'
  host.appendChild(frame)
  layer.appendChild(host)

  const panel = {
    mesh,
    material,
    texture,
    frame,
    failed: false,
    /** 上一次真正生效的 url / 尺寸 / 交互态，避免重复改 DOM。
     *  注意这里记的是「已经写进 DOM 的值」：初值要跟着把样式写一遍，
     *  不然 update() 首次比对时以为没变，iframe 会停在 cssText 里的
     *  pointer-events:none 上——导入一块网页却点不动，就是这么来的 */
    _url: '',
    _size: { w: Math.max(0.05, Number(props?.width) || 4), h: Math.max(0.05, Number(props?.height) || 2.4) },
    _mode: '',
    _interactive: false,
  }

  applyMode(panel, props?.mode)
  applySize(panel, props)
  drawWebFrame(texture.getContext(), props, !!String(props?.url || '').trim())
  texture.update(false)

  /** iframe 的 CSS 盒子：跟着场景尺寸走，只决定远端页面的排版视口 */
  const frameEl = { w: 0, h: 0 }
  function applyFrameSize() {
    frameEl.w = Math.round(panel._size.w * WEB_PX_PER_UNIT)
    frameEl.h = Math.round(panel._size.h * WEB_PX_PER_UNIT)
    frame.style.width = `${frameEl.w}px`
    frame.style.height = `${frameEl.h}px`
  }
  applyFrameSize()

  panel.update = (nextProps) => {
    const p = nextProps || {}
    applyMode(panel, p.mode)

    const w = Math.max(0.05, Number(p.width) || 4)
    const h = Math.max(0.05, Number(p.height) || 2.4)
    if (w !== panel._size.w || h !== panel._size.h) {
      panel._size = { w, h }
      const next = rasterSize(p)
      if (next.w !== size.w || next.h !== size.h) {
        size.w = next.w
        size.h = next.h
        texture.scaleTo(next.w, next.h)
      }
      applySize(panel, p)
      applyFrameSize()
    }

    const url = String(p.url || '').trim()
    if (url !== panel._url) {
      panel._url = url
      // 空网址比留一个 src="" 干净：浏览器不会再发一次无语义的请求
      if (url) frame.setAttribute('src', url)
      else frame.removeAttribute('src')
      drawWebFrame(texture.getContext(), p, !!url)
      texture.update(false)
    }

    const interactive = p.interactive !== false
    if (interactive !== panel._interactive) {
      panel._interactive = interactive
      frame.style.pointerEvents = interactive ? 'auto' : 'none'
    }
  }
  // 首屏也要把网址 / 交互态落地，不然 panel._url 还是空的，观测里会一直隐藏
  panel.update(props)

  // 每帧把 iframe 贴到平面上。放 onBeforeRenderObservable 而不是 attachTransform 之类的，
  // 是因为要读相机 + 投影矩阵，且必须在真正画这一帧之前对齐
  panel._observer = scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera
    // 没网址 / 平面被隐藏 / 没有相机 → 直接藏起来，别让一个空框挡在画布上
    if (!panel._url || !cam || !mesh.isEnabled()) {
      frame.style.visibility = 'hidden'
      return
    }

    const rw = engine.getRenderWidth()
    const rh = engine.getRenderHeight()
    if (!rw || !rh) return

    // Babylon 的投影返回的是后备缓冲（设备）像素，CSS 要的是 CSS 像素
    const cssW = canvas && canvas.clientWidth ? canvas.clientWidth : rw
    const cssH = canvas && canvas.clientHeight ? canvas.clientHeight : rh
    const kx = cssW / rw
    const ky = cssH / rh

    const viewport = cam.viewport.toGlobal(rw, rh)
    // 相机自己的矩阵：scene.getViewMatrix() / scene.getTransformMatrix() 返回的是
    // updateTransformMatrix() 写进 scene 的缓存，第一帧还没写过，拿到的是 undefined
    // （拿它去投影会直接抛 TypeError，把整个渲染循环打断）
    const view = cam.getViewMatrix()
    const viewProj = cam.getTransformationMatrix()
    // 这一帧的世界矩阵强制重算：onBeforeRender 早于 activeMeshes 求值，
    // 缓存的矩阵可能还是上一帧的，刚拖动完 gizmo 时会差一帧
    mesh.computeWorldMatrix(true)
    const world = mesh.getWorldMatrix()

    // 平面是 1×1 的，所以角点就是 ±0.5；y 取正是「上」，对应 CSS 元素的左上角。
    //
    // 顺序固定「左上、右上、右下、左下」，不拿相机在哪一侧来改：
    // Babylon 平面的 uv 是 局部(-0.5,+0.5)=(0,1)、(+0.5,+0.5)=(1,1)
    // （见 Builders/planeBuilder.pure），也就是贴图的左上角永远在局部 (-0.5, +0.5)，
    // 和从哪头看无关。背面看过去贴图是整体镜像的，iframe 跟着同一个角就行，
    // 自然也是同样的镜像——只有这样才能和旁边的贴图面板对上。
    const local = [CORNER_LT, CORNER_RT, CORNER_RB, CORNER_LB]

    const quad = new Array(8)
    let visible = true
    for (let i = 0; i < 4; i++) {
      Vector3.TransformCoordinatesToRef(local[i], world, _worldPos)
      // 相机空间里 z 要大于 minZ 才算在镜头前方。Babylon 默认是左手坐标系：
      // 相机朝自己的 +Z 看，所以「在前方」是 z > 0，不是 z < 0
      Vector3.TransformCoordinatesToRef(_worldPos, view, _camPos)
      if (_camPos.z <= cam.minZ) {
        visible = false
        break
      }
      Vector3.ProjectToRef(_worldPos, Matrix.Identity(), viewProj, viewport, _screen)
      if (!Number.isFinite(_screen.x) || !Number.isFinite(_screen.y)) {
        visible = false
        break
      }
      quad[i * 2] = _screen.x * kx
      quad[i * 2 + 1] = _screen.y * ky
    }
    if (!visible) {
      frame.style.visibility = 'hidden'
      return
    }

    // 留出外框：把四个角朝中心收一点，平面贴图的取景框不会被完全盖住
    const cx = (quad[0] + quad[2] + quad[4] + quad[6]) / 4
    const cy = (quad[1] + quad[3] + quad[5] + quad[7]) / 4
    for (let i = 0; i < quad.length; i += 2) {
      const d = Math.hypot(quad[i] - cx, quad[i + 1] - cy)
      const k = d > WEB_BEZEL_PX ? 1 - WEB_BEZEL_PX / d : 1
      quad[i] = cx + (quad[i] - cx) * k
      quad[i + 1] = cy + (quad[i + 1] - cy) * k
    }

    const m = quadToMatrix3d(frameEl.w, frameEl.h, quad)
    if (!m) {
      frame.style.visibility = 'hidden'
      return
    }
    frame.style.transform = `matrix3d(${m.map((v) => (Math.abs(v) < 1e-6 ? 0 : +v.toFixed(6))).join(',')})`
    frame.style.visibility = 'visible'
  })

  panel.dispose = () => {
    scene.onBeforeRenderObservable.remove(panel._observer)
    panel._observer = null
    host.remove()
    mesh.dispose()
    material.dispose()
    texture.dispose()
  }
  return panel
}
