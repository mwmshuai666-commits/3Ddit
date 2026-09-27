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

import { DynamicTexture, MeshBuilder, StandardMaterial, Color3, AbstractMesh } from '@babylonjs/core'

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
