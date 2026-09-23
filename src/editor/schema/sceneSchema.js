/**
 * 场景 JSON Schema（编辑器与未来运行时共用的序列化协议）
 *
 * 文档结构：
 * {
 *   version: '0.1.0',
 *   scene: { background, ground: { type, props } },
 *   nodes: [
 *     {
 *       id, name,
 *       kind: 'primitive' | 'light',        // 后续扩展 'model' | 'effect' | 'tag' ...
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

const ALL_GROUPS = [
  ...GROUND_CATALOG.map((c) => ({ kind: 'ground', ...c })),
  ...PRIMITIVE_CATALOG.map((c) => ({ kind: 'primitive', ...c })),
  ...LIGHT_CATALOG.map((c) => ({ kind: 'light', ...c })),
]

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

/** 新建几何体/灯光节点 */
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
    },
    nodes: [light],
    cameras: [],
  }
}
