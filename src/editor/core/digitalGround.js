/**
 * 数字科技地板 —— 由 three 版（digital-twin/src/components/digitalGround.vue）1:1 移植
 *
 * 三张贴图 + 一圈圈向外跑的同心波：原版把「三层贴图用不同波长/速度的正弦波调制透明度、
 * 再按到圆心的距离做边缘衰减」全写在一块 GLSL 里（three 的 ShaderMaterial）。
 * 这里原样保留那段片元着色器，只是换成 Babylon 的写法：
 *
 *   - three 的 position / uv / projectionMatrix·modelViewMatrix 与 Babylon 同名同义，
 *     顶点着色器只需把 worldViewProjection 登记进 uniforms，Babylon 自动填。
 *   - three 的 LinearSRGBColorSpace 贴图 → Babylon 侧 tex.gammaSpace = false（都不做解码）。
 *   - three 的 WebGLRenderer 默认有 linear→sRGB 输出编码，Babylon 默认没有，
 *     不加补偿会整体偏暗，所以片元末尾补一个 encodeSRGB，观感与 three 完全一致。
 *
 * 【踩过的坑 · 遮挡】这个圆盘以前「永远盖在所有物体前面」，根因不在着色器，在渲染组：
 * 圆盘自己占了渲染组 1，而 Babylon 的 RenderingManager 给每个组的默认配置就是
 * autoClear:true —— 第 1 组渲染前会把整块深度缓冲清空，于是组 0 里已经画好的
 * 深度答案被扔掉，圆盘怎么画都通不过深度测试，只能糊在最前面。
 * 解决办法就是把第 1 组的自动清深度显式关掉，让前面物体的深度留下来做测试。
 *
 * 顺带一个误会：EditorEngine 里的 scene.useLogarithmicDepth = true 在 Babylon 9 是无效属性
 * （Scene 上根本没有这个字段，赋值只会挂一个没人读的自定义属性；对数深度从 5.x 起改成
 * 逐材质开关 material.useLogarithmicDepth）。所以这里不要给 ShaderMaterial 单独开
 * useLogarithmicDepth —— 全场景只有它写对数深度，反而会和其它材质对不上，圆盘直接消失。
 * 保持普通 NDC z，和所有材质同一个空间，就是对的。
 */

import { ShaderMaterial, Texture, MeshBuilder, Color3 } from '@babylonjs/core'

/** 贴图顺序与 three 版一致：底图 / 电子元件 / 点 / 网格 */
export const GROUND_TEXTURE_FILES = [
  'digitalGround1.png',
  'digitalGround2.png',
  'digitalGround3.png',
  'digitalGround4.png',
]

/** 挂载路径：public/utils（导出场景时这四个文件要跟着包一起走，见 export/sceneExport.js） */
const TEX_URLS = GROUND_TEXTURE_FILES.map((f) => `/utils/${f}`)

const VERTEX_SOURCE = `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 worldViewProjection;

varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vPosition = position;
  vUv = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

const FRAGMENT_SOURCE = `
precision highp float;

varying vec2 vUv;
varying vec3 vPosition;

uniform float time;
uniform float radius;      // 地板半径（世界单位）
uniform vec3 uColor;
uniform float uIntensity;
uniform sampler2D texture0; // 底图
uniform sampler2D texture1; // 电子元件
uniform sampler2D texture2; // 点
uniform sampler2D texture3; // 网格

// 同心扩散波：a 振幅，l 波长，s 角速度，second 相位偏移，val 到圆心的距离
float wave(float a, float l, float s, float second, float val) {
  float PI = 3.141592653;
  float w = a * sin(-val * 2.0 * PI / l + second * s * 2.0 * PI / l);
  return (w + 1.0) / 2.0;
}

// 补偿：three 的渲染器会做 linear→sRGB 输出编码，Babylon 默认不做，这里补回来
vec3 encodeSRGB(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0031308)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  vec4 basceColor = vec4(uColor, 1.0);

  vec4 back = texture2D(texture0, vUv * 16.0);
  vec4 ori1 = texture2D(texture1, vUv * 4.0);  // 电子元件
  vec4 ori2 = texture2D(texture2, vUv * 16.0); // 点
  vec4 ori3 = texture2D(texture3, vUv * 16.0); // 网格

  // 局部坐标里的半径（圆盘躺在 xy 平面，之后再绕 x 轴放平）
  float len = length(vec2(vPosition.x, vPosition.y));

  // 三层波各自调制一层贴图的透明度，波长/速度不同 → 波纹错落向外推
  float flag1 = wave(1.0, radius / 2.0, 45.0, time, len);
  if (flag1 < 0.5) flag1 = 0.0;
  ori1.a = ori1.a * (flag1 * 0.8 + 0.2);

  float flag2 = wave(1.0, radius / 3.0, 30.0, time, len);
  ori2.a = ori2.a * (flag2 * 0.8 + 0.2);

  float flag3 = wave(1.0, 60.0, 20.0, time, len);
  ori3.a = ori3.a * (flag3 * 2.0 - 1.5);

  float alpha = clamp(ori1.a + ori2.a + ori3.a + back.a * 0.01, 0.0, 1.0);
  basceColor.a = alpha * 2.0 * uIntensity;

  // 圆心最亮，边缘衰减到 0
  gl_FragColor = basceColor * clamp((2.0 - (len * 2.0 / radius)), 0.0, 1.0);
  gl_FragColor.rgb = encodeSRGB(gl_FragColor.rgb * uIntensity);
}
`

/** three 版 10 秒 elapsed 对应 time=1，沿用同一节奏 */
const THREE_CYCLE = 10

/**
 * 圆盘所在的渲染组：独立组，画在场景内容（组 0）之后、波纹墙/飞线（组 2/3）之前
 */
const GROUND_GROUP = 1

/**
 * 渲染组配置：关掉第 1 组的“画前自动清深度”，让圆盘参与正常的深度测试。
 *
 * RenderingManager 给每个渲染组的默认值是 autoClear:true —— 这就是圆盘以前
 * 永远糊在最前面的原因：第 1 组开画前先把深度缓冲整个清掉，组 0 里画好的深度全白写了。
 * 关掉之后，竖在圆盘前面的物体/模型会在圆盘上投出正确的遮挡。
 *
 * 这里只动渲染组，不动材质、不动着色器：圆盘写的就是普通 NDC z，和场景里其它材质
 * 同一个空间（Babylon 9 里对数深度是逐材质的，scene.useLogarithmicDepth 无效，别单开）。
 */
function setupDepth(scene) {
  scene.setRenderingAutoClearDepthStencil(GROUND_GROUP, false, false, false)
}

/**
 * 圆盘。disc 默认立在 xy 平面，绕 x 轴放倒当底板。
 * @param {import('@babylonjs/core').Scene} scene
 * @param {import('@babylonjs/core').Material} material
 * @param {number} radius
 */
function buildDisc(scene, material, radius) {
  const mesh = MeshBuilder.CreateDisc(
    'editorGround',
    { radius, tessellation: 128 },
    scene,
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.02 // 稍微离地，避免和地面物体共面
  mesh.isPickable = true // 点空白处仍能选中“地面”，打开底板面板
  mesh.metadata = { isGround: true }
  mesh.material = material
  mesh.renderingGroupId = GROUND_GROUP
  return mesh
}

/**
 * @typedef {{scene: import('@babylonjs/core').Scene, mesh: import('@babylonjs/core').Mesh,
 *            material: ShaderMaterial, textures: Texture[], radius:number, speed:number,
 *            setTime:(seconds:number)=>void}} DigitalGround
 */

/**
 * 建地板
 * @param {import('@babylonjs/core').Scene} scene
 * @param {{size:number, speed:number, color:string, intensity:number}} props 面板参数
 * @returns {DigitalGround}
 */
export function createDigitalGround(scene, props = {}) {
  const radius = Math.max(0.5, (Number(props.size) || 200) / 2)

  const material = new ShaderMaterial('digitalGroundMat', scene, {
    vertexSource: VERTEX_SOURCE,
    fragmentSource: FRAGMENT_SOURCE,
  }, {
    attributes: ['position', 'uv'],
    // worldViewProjection 由 Babylon 自动填，其余是着色器里声明的 uniform
    uniforms: [
      'worldViewProjection',
      'time',
      'radius',
      'uColor',
      'uIntensity',
      'texture0',
      'texture1',
      'texture2',
      'texture3',
    ],
    // three 版的 transparent:true —— 波纹是贴片，必须走混合
    needAlphaBlending: true,
  })
  material.backFaceCulling = false // 对应 three 的 side: DoubleSide
  setupDepth(scene)

  const textures = TEX_URLS.map((url, i) => {
    const tex = new Texture(url, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE)
    tex.wrapU = Texture.WRAP_ADDRESSMODE
    tex.wrapV = Texture.WRAP_ADDRESSMODE
    tex.gammaSpace = false // 对应 three 的 LinearSRGBColorSpace，采样不做 sRGB→线性
    material.setTexture(`texture${i}`, tex)
    return tex
  })

  const ground = {
    scene,
    mesh: buildDisc(scene, material, radius),
    material,
    textures,
    radius,
    speed: 1,
    // 引擎每帧推进这个时钟；three 里是 (elapsed/10) * speed
    setTime: (seconds) => material.setFloat('time', (seconds / THREE_CYCLE) * ground.speed),
  }

  material.setFloat('radius', radius)
  updateDigitalGroundProps(ground, props)
  return ground
}

/**
 * 面板参数变化：只改 uniform。直径变了才换圆盘 —— 四张贴图始终复用，
 * 免得拖动数值时反复上传纹理。
 */
export function updateDigitalGroundProps(ground, props = {}) {
  if (!ground?.material) return
  ground.material.setColor3('uColor', Color3.FromHexString(props.color || '#ffffff'))
  ground.material.setFloat('uIntensity', Number(props.intensity) || 1)
  ground.speed = Math.max(0, Number(props.speed) || 0)

  const radius = Math.max(0.5, (Number(props.size) || 200) / 2)
  if (Math.abs(radius - ground.radius) > 1e-4) {
    const old = ground.mesh
    ground.mesh = buildDisc(ground.scene, ground.material, radius)
    old?.dispose()
    ground.radius = radius
    ground.material.setFloat('radius', radius)
  }
}

export function disposeDigitalGround(ground) {
  if (!ground) return
  ground.mesh?.dispose()
  ground.material?.dispose()
  for (const t of ground.textures || []) t?.dispose()
  ground.textures = []
  // 还原成 RenderingManager 的组默认值。注意这里不能填 false：
  // 能量管道的内管也在第 1 组，关掉自动清深度会让它一直糊在最前面。
  // 数字地板的圆盘跟着 mesh 一起销毁，不会残留。
  ground.scene?.setRenderingAutoClearDepthStencil(GROUND_GROUP, true, true, true)
}
