/**
 * 场景 JSON Schema（编辑器与未来运行时共用的序列化协议）
 *
 * 文档结构：
 * {
 *   version: '0.1.0',
 *   scene: { background, ground: { type, props }, environment: { type, assetId, props } },
 *   nodes: [
 *     {
 *       id, name,
 *       kind: 'primitive' | 'light' | 'pipe' | 'effect' | 'model' | 'html',
 *       type: 'box' | 'sphere' | ... | 'hemispheric' ...,
 *       parentId: null,                      // 预留：层级父子关系
 *       transform: { position:[x,y,z], rotation:[x,y,z] 角度, scaling:[x,y,z] },
 *       props: {}                            // 类型相关参数，见目录 CATALOG
 *     }
 *   ],
 *   cameras: []                              // 预留：机位书签 / 巡航
 * }
 */

export const SCHEMA_VERSION = '0.1.0'

export const GROUND_SELECTION = '@ground' // 场景树中“地面”的特殊选中 id

/* ---------------- 场景底板 ---------------- */

export const GROUND_CATALOG = [
  {
    type: 'grid',
    name: '科技网格地面',
    desc: '深色发光网格，园区/通用',
    defaultProps: {
      size: 200,
      tile: 10,
      color: '#0a1730',
      lineColor: '#1e6bff',
    },
    form: [
      { key: 'size', label: '尺寸', type: 'number', min: 1, step: 1 },
      { key: 'tile', label: '网格间距', type: 'number', min: 0.1, step: 0.1 },
      { key: 'color', label: '底色', type: 'color' },
      { key: 'lineColor', label: '线色', type: 'color' },
    ],
  },
  {
    type: 'solid',
    name: '纯色平面',
    desc: '素色地面，工厂/占位',
    defaultProps: {
      size: 200,
      color: '#1c2635',
    },
    form: [
      { key: 'size', label: '尺寸', type: 'number', min: 1, step: 1 },
      { key: 'color', label: '颜色', type: 'color' },
    ],
  },
  {
    type: 'serverRoom',
    name: '机房防静电地板',
    desc: '600 格纹地板，机房场景',
    defaultProps: {
      size: 200,
      tile: 2,
      color: '#20262f',
      lineColor: '#4a5870',
    },
    form: [
      { key: 'size', label: '尺寸', type: 'number', min: 1, step: 1 },
      { key: 'tile', label: '板宽', type: 'number', min: 0.1, step: 0.1 },
      { key: 'color', label: '底色', type: 'color' },
      { key: 'lineColor', label: '线色', type: 'color' },
    ],
  },
  {
    type: 'digital',
    name: '数字科技地板',
    desc: '圆形扩散波纹，园区/大屏',
    // size 是圆的直径，与其它地板的方地边长对齐（波纹波长取半径，见 core/digitalGround.js）
    defaultProps: {
      size: 200,
      speed: 1,
      color: '#ffffff', // 与 three 原版默认色一致
      intensity: 1.6,
    },
    form: [
      { key: 'size', label: '直径', type: 'number', min: 1, step: 1 },
      { key: 'speed', label: '流动速度', type: 'number', min: 0, max: 20, step: 0.1 },
      { key: 'intensity', label: '亮度', type: 'number', min: 0, max: 10, step: 0.1 },
      { key: 'color', label: '波纹颜色', type: 'color' },
    ],
  },
]

/* ---------------- 基础几何体 ---------------- */

const COLOR_FORM = { key: 'color', label: '颜色', type: 'color' }

export const PRIMITIVE_CATALOG = [
  {
    type: 'box',
    name: '立方体',
    defaultProps: { width: 2, height: 2, depth: 2, color: '#5b8def' },
    form: [
      { key: 'width', label: '宽', type: 'number', min: 0.01, step: 0.1 },
      { key: 'height', label: '高', type: 'number', min: 0.01, step: 0.1 },
      { key: 'depth', label: '深', type: 'number', min: 0.01, step: 0.1 },
      COLOR_FORM,
    ],
  },
  {
    type: 'sphere',
    name: '球体',
    defaultProps: { diameter: 2, segments: 24, color: '#5b8def' },
    form: [
      { key: 'diameter', label: '直径', type: 'number', min: 0.01, step: 0.1 },
      { key: 'segments', label: '分段', type: 'number', min: 4, max: 64, step: 1 },
      COLOR_FORM,
    ],
  },
  {
    type: 'cylinder',
    name: '圆柱体',
    defaultProps: { height: 3, diameter: 1.6, tessellation: 32, color: '#5b8def' },
    form: [
      { key: 'height', label: '高', type: 'number', min: 0.01, step: 0.1 },
      { key: 'diameter', label: '直径', type: 'number', min: 0.01, step: 0.1 },
      { key: 'tessellation', label: '边数', type: 'number', min: 3, max: 64, step: 1 },
      COLOR_FORM,
    ],
  },
  {
    type: 'cone',
    name: '圆锥体',
    defaultProps: { height: 3, diameter: 2, tessellation: 32, color: '#5b8def' },
    form: [
      { key: 'height', label: '高', type: 'number', min: 0.01, step: 0.1 },
      { key: 'diameter', label: '直径', type: 'number', min: 0.01, step: 0.1 },
      { key: 'tessellation', label: '边数', type: 'number', min: 3, max: 64, step: 1 },
      COLOR_FORM,
    ],
  },
  {
    type: 'plane',
    name: '平面',
    defaultProps: { width: 4, height: 4, color: '#5b8def' },
    form: [
      { key: 'width', label: '宽', type: 'number', min: 0.01, step: 0.1 },
      { key: 'height', label: '高', type: 'number', min: 0.01, step: 0.1 },
      COLOR_FORM,
    ],
  },
  {
    type: 'torus',
    name: '圆环',
    defaultProps: { diameter: 3, thickness: 0.4, color: '#5b8def' },
    form: [
      { key: 'diameter', label: '直径', type: 'number', min: 0.01, step: 0.1 },
      { key: 'thickness', label: '管径', type: 'number', min: 0.01, step: 0.05 },
      COLOR_FORM,
    ],
  },
]

/* ---------------- 能量管道（折点管道） ---------------- */

const r1 = (v) => Math.round(v * 10) / 10

/** 螺旋折点：绕 y 轴边上升边旋转，turns 圈 */
function helixPoints(turns, radius, rise, baseY, phase = 0) {
  const pts = []
  const steps = 8
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const a = phase + t * turns * Math.PI * 2
    pts.push([
      r1(Math.cos(a) * radius),
      r1(baseY + t * rise),
      r1(Math.sin(a) * radius),
    ])
  }
  return pts
}

/**
 * 折点快速配置：一键换一套折点（“不同的折点配置”）
 * make() 只依赖半径，便于同一预设按当前管道管径/高度自适应。
 */
/**
 * 折点快速配置：一键换一套折点（“不同的折点配置”）
 * make() 只依赖半径，便于同一预设按当前管道管径/高度自适应。
 */
export const PIPE_SHAPE_PRESETS = [
  {
    key: 'straight',
    name: '直线',
    desc: '两点直管',
    make: () => [
      [0, 2, -8],
      [0, 2, 8],
    ],
  },
  {
    key: 'rise',
    name: '上扬',
    desc: '一段爬升',
    make: () => [
      [0, 2, 0],
      [0, 6, 10],
      [0, 10, 20],
    ],
  },
  {
    key: 'sCurve',
    name: 'S 弯',
    desc: '左右交替',
    make: () => [
      [-12, 3, 0],
      [0, 6, 8],
      [0, 9, 16],
      [12, 3, 24],
    ],
  },
  {
    key: 'stair',
    name: '阶梯',
    desc: '逐级抬升',
    make: () => [
      [0, 2, 0],
      [0, 6, 0],
      [0, 6, 6],
      [0, 10, 6],
      [0, 10, 12],
      [0, 14, 12],
    ],
  },
  {
    key: 'ring',
    name: '环形',
    desc: '水平闭环',
    make: () => {
      const r = 10
      const pts = []
      for (let i = 0; i <= 12; i += 1) {
        const a = (i / 12) * Math.PI * 2
        pts.push([r1(Math.cos(a) * r), 4, r1(Math.sin(a) * r)])
      }
      return pts
    },
  },
  {
    key: 'helix',
    name: '螺旋',
    desc: '盘旋上升',
    make: () => helixPoints(1.5, 9, 16, 2),
  },
]

/** 波纹墙轮廓预置：贴地闭合多边形（x / z 两个方向） */
export const WALL_SHAPE_PRESETS = [
  {
    key: 'rect',
    name: '矩形',
    desc: '四面围合',
    make: () => [
      [-20, -20, 0],
      [20, -20, 0],
      [20, 20, 0],
      [-20, 20, 0],
    ],
  },
  {
    key: 'lShape',
    name: 'L 形',
    desc: '两翼连接',
    make: () => [
      [-18, -18, 0],
      [18, -18, 0],
      [18, 0, 0],
      [-4, 0, 0],
      [-4, 14, 0],
      [-18, 14, 0],
    ],
  },
  {
    key: 'hexagon',
    name: '六边形',
    desc: '等边围栏',
    make: () => {
      const r = 22
      const pts = []
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6
        pts.push([r1(Math.cos(a) * r), 0, r1(Math.sin(a) * r)])
      }
      return pts
    },
  },
]

/** 折点配置选项：驱动 Inspector 里的折点编辑器（axes / 上限 / 可用预置） */
const PIPE_POINT_CONFIG = {
  axes: ['x', 'y', 'z'],
  maxPoints: 0, // 0 = 不限
  presets: PIPE_SHAPE_PRESETS,
}
/** 飞线只有两个端点（起点 / 终点），中间由贝塞尔拱线连接 */
const FLY_POINT_CONFIG = {
  axes: ['x', 'y', 'z'],
  maxPoints: 2,
  presets: PIPE_SHAPE_PRESETS,
}
/** 波纹墙是贴地轮廓线，用 X / Z 两个坐标描述（y 传给墙高） */
const WALL_POINT_CONFIG = {
  axes: ['x', 'z'],
  maxPoints: 0,
  presets: WALL_SHAPE_PRESETS,
}

export const PIPE_CATALOG = [
  {
    type: 'energy',
    name: '能量管道',
    desc: '折点可配置的流动管道：流动光带 + 管内粒子，折点在右侧“折点配置”里编辑',
    icon: '⚡',
    defaultProps: {
      color: '#00e5ff',
      radius: 0.4,
      filletRadius: 1.6,
      speed: 0.8,
      repeat: 5,
      radialSegments: 16,
      tubeSegments: 96,
      casingOpacity: 0.22,
      particles: true,
      particleSpeed: 9,
      particleSize: 1,
      points: [
        [0, 3, 0],
        [12, 9, 0],
        [24, 3, 0],
      ],
    },
    form: [
      { key: 'color', label: '能量色', type: 'color' },
      { key: 'radius', label: '管径', type: 'number', min: 0.05, step: 0.05 },
      { key: 'filletRadius', label: '折角圆角', type: 'number', min: 0, step: 0.1 },
      { key: 'speed', label: '光带速度', type: 'number', min: 0, step: 0.1 },
      { key: 'repeat', label: '光带段数', type: 'number', min: 1, max: 40, step: 1 },
      { key: 'radialSegments', label: '径向分段', type: 'number', min: 3, max: 48, step: 1 },
      { key: 'tubeSegments', label: '路径分段', type: 'number', min: 16, max: 400, step: 8 },
      { key: 'casingOpacity', label: '外壳浓度', type: 'number', min: 0, max: 0.9, step: 0.02 },
      { key: 'particles', label: '粒子流动', type: 'switch' },
      { key: 'particleSpeed', label: '粒子速度', type: 'number', min: 0, max: 80, step: 0.5 },
      { key: 'particleSize', label: '粒子大小', type: 'number', min: 0.1, max: 5, step: 0.1 },
    ],
    pointConfig: PIPE_POINT_CONFIG,
  },
]

/* ---------------- 特效组件（babylon-datav） ---------------- */

/** 天气效果可选类型（对应 WeatherEffect.apply 的入参） */
export const WEATHER_OPTIONS = [
  { value: 'sunny', label: '晴' },
  { value: 'cloudy', label: '阴' },
  { value: 'fog', label: '雾' },
  { value: 'rain', label: '雨' },
  { value: 'snow', label: '雪' },
  { value: 'thunder', label: '雷电' },
]

/**
 * 复用 babylon-datav 包里的 Vue 组件（`babylon-datav/components/*.vue`）：
 *   FlexiblePipe / StreamLine / ArrowFlyLine / WaveWall
 *
 * 约定：
 *   - 节点统一把折点存在 props.points（[[x,y,z],...]），由 DatavEffect.vue
 *     按 pointProp 映射成组件需要的入参形状（points / linesList / linePoints / positionSrc）
 *   - form 里的字段既是 Inspector 表单，也是传给组件实例的 props，两边不会脱节
 *   - texture 字段标识组件需要哪种流动贴图（本项目自绘 dataURL，见 core/datavTextures.js）
 *   - rebuildKeys 里登记的字段变化会整套重新挂载组件（管类组件用 CreateTube 的
 *     instance 更新，改点数/管径会留下旧顶点，不能靠它自己的 watch）
 */
export const DATAV_CATALOG = [
  {
    type: 'flexiblePipe',
    name: '柔性管道',
    desc: 'babylon-datav · FlexiblePipe：折点圆角倒角 + 流动纹理',
    icon: '≈',
    meshName: 'flexiblePipe',
    pointProp: 'points',
    texture: 'flow',
    rebuildKeys: ['radius', 'filletRadius', 'radialSegments'],
    defaultProps: {
      color: '#ff8a3d',
      radius: 0.3,
      filletRadius: 0.9,
      radialSegments: 16,
      speed: 0.35,
      repeat: 6,
      points: [
        [0, 3, 0],
        [12, 7, 0],
        [24, 3, 0],
      ],
    },
    form: [
      { key: 'color', label: '颜色', type: 'color' },
      { key: 'radius', label: '管径', type: 'number', min: 0.02, step: 0.02 },
      { key: 'filletRadius', label: '折角圆角', type: 'number', min: 0, step: 0.1 },
      { key: 'radialSegments', label: '径向分段', type: 'number', min: 3, max: 48, step: 1 },
      { key: 'speed', label: '流动速度', type: 'number', min: 0, step: 0.02 },
      { key: 'repeat', label: '光带段数', type: 'number', min: 1, max: 40, step: 1 },
    ],
    pointConfig: PIPE_POINT_CONFIG,
  },
  {
    type: 'streamLine',
    name: '流光线管道',
    desc: 'babylon-datav · StreamLine：CatmullRom / 圆角路径 + 光带流动（叠加混合）',
    icon: '≋',
    meshName: 'streamLine',
    pointProp: 'linesList',
    texture: 'stream',
    rebuildKeys: ['radius', 'radialSegments', 'tubularSegments', 'filletRadius', 'closed'],
    defaultProps: {
      color: '#2bc4dc',
      radius: 0.14,
      speed: 1.4,
      radialSegments: 8,
      tubularSegments: 160,
      filletRadius: 0,
      closed: false,
      clockwise: true,
      fewNum: 3,
      points: [
        [-14, 2, 10],
        [0, 2, 0],
        [14, 2, 10],
        [0, 2, 20],
      ],
    },
    form: [
      { key: 'color', label: '颜色', type: 'color' },
      { key: 'radius', label: '管径', type: 'number', min: 0.02, step: 0.02 },
      { key: 'speed', label: '流动速度', type: 'number', min: 0, step: 0.1 },
      { key: 'radialSegments', label: '径向分段', type: 'number', min: 3, max: 24, step: 1 },
      { key: 'tubularSegments', label: '路径分段', type: 'number', min: 8, max: 400, step: 8 },
      { key: 'filletRadius', label: '折角圆角', type: 'number', min: 0, step: 0.5 },
      { key: 'fewNum', label: '光带数量', type: 'number', min: 1, max: 20, step: 1 },
      { key: 'closed', label: '闭合路径', type: 'switch' },
      { key: 'clockwise', label: '顺时针流', type: 'switch' },
    ],
    pointConfig: PIPE_POINT_CONFIG,
  },
  {
    type: 'arrowFlyLine',
    name: '贝塞尔飞线',
    desc: 'babylon-datav · ArrowFlyLine：两端点 + 拱高，GreasedLine 渲染',
    icon: '➤',
    meshName: 'arrowFlyLine',
    pointProp: 'linePoints',
    texture: 'fly',
    // 组件自己就是 dispose 后重建（buildLine），不需要额外重挂
    rebuildKeys: [],
    defaultProps: {
      color: '#ffd166',
      opacity: 1,
      height: 24,
      lineWidth: 26,
      tubularSegments: 120,
      repeat: 3,
      speed: 0.02,
      points: [
        [-18, 2, -12],
        [18, 12, 12],
      ],
    },
    form: [
      { key: 'color', label: '颜色', type: 'color' },
      { key: 'opacity', label: '不透明度', type: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'height', label: '拱高', type: 'number', min: -50, step: 1 },
      { key: 'lineWidth', label: '线宽(px)', type: 'number', min: 1, max: 200, step: 1 },
      { key: 'tubularSegments', label: '曲线分段', type: 'number', min: 8, max: 300, step: 8 },
      { key: 'repeat', label: '纹理重复', type: 'number', min: 1, max: 20, step: 1 },
      { key: 'speed', label: '流动速度', type: 'number', min: 0, step: 0.005 },
    ],
    pointConfig: FLY_POINT_CONFIG,
  },
  {
    type: 'waveWall',
    name: '围墙波纹',
    desc: 'babylon-datav · WaveWall：自定义顶点/片元着色器的波纹围墙',
    icon: '▧',
    meshName: 'wave',
    pointProp: 'positionSrc',
    // 顶点数变化时 VertexData 重新写入，重挂最稳
    rebuildKeys: ['height'],
    defaultProps: {
      color: '#3d8bff',
      opacity: 0.7,
      height: 8,
      frequencyNum: 8,
      speed: 1.6,
      points: [
        [-20, -20, 0],
        [20, -20, 0],
        [20, 20, 0],
        [-20, 20, 0],
      ],
    },
    form: [
      { key: 'color', label: '颜色', type: 'color' },
      { key: 'opacity', label: '不透明度', type: 'number', min: 0, max: 1, step: 0.05 },
      { key: 'height', label: '墙高', type: 'number', min: 0.1, step: 0.5 },
      { key: 'frequencyNum', label: '波纹密度', type: 'number', min: 1, max: 60, step: 1 },
      { key: 'speed', label: '流动速度', type: 'number', min: 0, step: 0.2 },
    ],
    pointConfig: WALL_POINT_CONFIG,
  },
  {
    type: 'weatherEffect',
    name: '天气效果',
    desc: 'babylon-datav · WeatherEffect：雨/雪/晴/阴/雾/雷电 粒子与场景效果',
    icon: '☂',
    // 没有网格：WeatherEffect 是场景级效果（雾/环境光/粒子），由
    // WeatherEffectNode.vue 直接驱动，所以 meshName / pointProp 都为空，
    // 也不配折点（位置用节点的 transform）
    unique: true, // 全局只允许一个，重复添加时选中已有的那个
    meshName: null,
    pointProp: null,
    texture: null,
    rebuildKeys: [],
    defaultProps: {
      type: 'rain',
      range: 140,
      height: 70,
    },
    form: [
      { key: 'type', label: '天气', type: 'select', options: WEATHER_OPTIONS },
      { key: 'range', label: '影响范围', type: 'number', min: 10, max: 800, step: 10 },
      { key: 'height', label: '粒子高度', type: 'number', min: 10, max: 500, step: 10 },
    ],
    pointConfig: null,
  },
]

/**
 * 左侧「特效组件」一栏：babylon-datav 的四个特效 + 能量管道。
 * 能量管道的 kind 仍是 'pipe'（引擎里有专门的内芯/外壳/光带实现），
 * 只是入口放在这里。
 */
export const EFFECT_SECTION = [
  ...DATAV_CATALOG.map((c) => ({ kind: 'effect', ...c })),
  { kind: 'pipe', ...PIPE_CATALOG[0] },
]

/* ---------------- 灯光 ---------------- */

export const LIGHT_CATALOG = [
  {
    type: 'hemispheric',
    name: '半球环境光',
    defaultProps: { intensity: 1.0, color: '#ffffff', groundColor: '#3a4a6b' },
    form: [
      { key: 'intensity', label: '强度', type: 'number', min: 0, step: 0.1 },
      { key: 'color', label: '光色', type: 'color' },
      { key: 'groundColor', label: '环境下色', type: 'color' },
    ],
  },
  {
    type: 'directional',
    name: '平行光',
    defaultProps: { intensity: 1.2, color: '#ffffff' },
    form: [
      { key: 'intensity', label: '强度', type: 'number', min: 0, step: 0.1 },
      { key: 'color', label: '光色', type: 'color' },
    ],
  },
  {
    type: 'point',
    name: '点光源',
    defaultProps: { intensity: 1.5, range: 50, color: '#ffffff' },
    form: [
      { key: 'intensity', label: '强度', type: 'number', min: 0, step: 0.1 },
      { key: 'range', label: '范围', type: 'number', min: 0, step: 1 },
      { key: 'color', label: '光色', type: 'color' },
    ],
  },
  {
    type: 'spot',
    name: '聚光灯',
    defaultProps: { intensity: 3, range: 50, angle: 35, exponent: 2, color: '#ffffff' },
    form: [
      { key: 'intensity', label: '强度', type: 'number', min: 0, step: 0.1 },
      { key: 'range', label: '范围', type: 'number', min: 0, step: 1 },
      { key: 'angle', label: '锥角(°)', type: 'number', min: 1, max: 170, step: 1 },
      { key: 'exponent', label: '衰减指数', type: 'number', min: 0, max: 10, step: 0.1 },
      { key: 'color', label: '光色', type: 'color' },
    ],
  },
]

/* ---------------- 查询工具 ---------------- */

/**
 * HTML 元素：用户写一段 HTML，渲染成场景里的一块贴图面板。
 *
 * 走 SVG foreignObject 把 HTML 栅格化成 canvas，所以只吃「能画出来的东西」：
 * 行内样式 / 文字 / 表格 / 简单布局可以；<script>、外链图片字体、canvas、视频都不行
 * （栅格化时浏览器处于「画图沙箱」，不让执行脚本、不加载外部资源）。
 * 导入面板里会写清楚这条限制，渲染失败的片段会退化成纯文本，不会把场景搞崩。
 */
export const HTML_PANEL_FORM = [
  {
    key: 'html',
    label: 'HTML 内容',
    type: 'textarea',
    rows: 8,
    placeholder: '<div style="padding:16px;color:#fff">…</div>',
  },
  { key: 'width', label: '宽(场景单位)', type: 'number', min: 0.1, step: 0.1 },
  { key: 'height', label: '高(场景单位)', type: 'number', min: 0.1, step: 0.1 },
  {
    key: 'mode',
    label: '朝向',
    type: 'select',
    options: [
      { label: '3D 面板', value: '3d' },
      { label: '始终朝你', value: 'billboard' },
    ],
  },
]

export const HTML_DEFAULT_SOURCE =
  '<div style="width:100%;height:100%;box-sizing:border-box;padding:14px;'
  + "font:13px/1.6 'Microsoft YaHei',sans-serif;color:#dbe6ff;background:#0b1424cc;"
  + "border:1px solid #2b4470;border-radius:6px\">\n"
  + '  <strong style="color:#7fb2ff">标题</strong>\n'
  + '  <div style="color:#8fa2c0">这里是自定义 HTML 面板</div>\n'
  + '</div>'

export const HTML_CATALOG = [
  {
    kind: 'html',
    type: 'html',
    name: 'HTML 面板',
    icon: '⌘',
    defaultProps: {
      html: HTML_DEFAULT_SOURCE,
      width: 4,
      height: 2.4,
      mode: '3d',
    },
    form: HTML_PANEL_FORM,
  },
]

/* ---------------- 环境天空盒 ---------------- */

export const ENV_DEFAULT_PROPS = { skybox: true, intensity: 1, rotation: 0, blur: 0 }

/** 文档里 scene.environment 的默认值（无环境，只用纯色背景） */
export const ENV_DOC_DEFAULT = {
  type: 'none', // 'none' | 'hdr'
  assetId: null,
  assetName: '',
  props: { ...ENV_DEFAULT_PROPS },
}

export const ENV_FORM = [
  { key: 'intensity', label: '环境光强度', type: 'number', min: 0, step: 0.1 },
  { key: 'rotation', label: '水平旋转(°)', type: 'number', step: 5 },
  { key: 'blur', label: '天空盒模糊', type: 'number', min: 0, max: 1, step: 0.05 },
  { key: 'skybox', label: '显示天空盒', type: 'switch' },
]

const ALL_GROUPS = [
  ...GROUND_CATALOG.map((c) => ({ kind: 'ground', ...c })),
  ...PRIMITIVE_CATALOG.map((c) => ({ kind: 'primitive', ...c })),
  ...LIGHT_CATALOG.map((c) => ({ kind: 'light', ...c })),
  ...PIPE_CATALOG.map((c) => ({ kind: 'pipe', ...c })),
  ...DATAV_CATALOG.map((c) => ({ kind: 'effect', ...c })),
  ...HTML_CATALOG,
]

/** 新建 HTML 元素节点（HTML 内容来自左侧面板的输入框） */
export function createHtmlNode(source = HTML_DEFAULT_SOURCE, size = {}) {
  return {
    id: genId(),
    name: 'HTML 面板',
    kind: 'html',
    type: 'html',
    parentId: null,
    transform: IDENTITY_TRANSFORM(),
    props: {
      ...HTML_CATALOG[0].defaultProps,
      html: source,
      ...size,
    },
  }
}

export function findCatalog(kind, type) {
  return ALL_GROUPS.find((c) => c.kind === kind && c.type === type)
}

export function findGroundCatalog(type) {
  return GROUND_CATALOG.find((c) => c.type === type) || GROUND_CATALOG[0]
}

let _seq = 0
export function genId() {
  _seq += 1
  return `n_${Date.now().toString(36)}_${_seq}_${Math.random().toString(36).slice(2, 7)}`
}

/* ---------------- 工厂 ---------------- */

const IDENTITY_TRANSFORM = () => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0], // 角度
  scaling: [1, 1, 1],
})

/**
 * 模型节点：实体（glb blob）在素材库，节点只存引用，同一素材可多实例
 * @param {{id:string, name:string}} asset 素材库记录
 */
export function createModelNode(asset) {
  return {
    id: genId(),
    name: asset.name.replace(/\.glb$/i, ''),
    kind: 'model',
    type: 'glb',
    parentId: null,
    transform: IDENTITY_TRANSFORM(),
    props: {
      assetId: asset.id,
      assetName: asset.name,
    },
  }
}

/** 新建几何体 / 灯光 / 能量管道 / 特效节点 */
export function createNode(kind, catalog) {
  return {
    id: genId(),
    name: catalog.name,
    kind,
    type: catalog.type,
    parentId: null,
    transform: IDENTITY_TRANSFORM(),
    props: { ...catalog.defaultProps },
  }
}

/** 默认场景：科技网格地面 + 一盏半球环境光 */
export function createDefaultDocument() {
  const hemi = LIGHT_CATALOG.find((c) => c.type === 'hemispheric')
  const light = createNode('light', hemi)
  light.name = '主环境光'
  light.transform.position = [0, 10, 0]

  return {
    version: SCHEMA_VERSION,
    scene: {
      background: '#05070d',
      ground: {
        type: GROUND_CATALOG[0].type,
        props: { ...GROUND_CATALOG[0].defaultProps },
      },
      environment: { ...ENV_DOC_DEFAULT, props: { ...ENV_DOC_DEFAULT.props } },
    },
    nodes: [light],
    cameras: [],
  }
}

/** 读文档里的环境配置：老文档没有这个字段时按「无环境」处理 */
export function normalizeEnvironment(doc) {
  const env = doc?.scene?.environment
  if (!env || env.type !== 'hdr') {
    return { type: 'none', ...ENV_DOC_DEFAULT, props: { ...ENV_DOC_DEFAULT.props } }
  }
  return {
    type: 'hdr',
    assetId: env.assetId ?? null,
    assetName: env.assetName ?? '',
    props: { ...ENV_DEFAULT_PROPS, ...(env.props || {}) },
  }
}
