/**
 * 验证：手写 / 外部程序生成的 JSON 里的数据接入配置，播放器侧能原样跑起来。
 * 不经过编辑器 UI（模拟「编辑时没用过数据接入，JSON 里直接写」的场景）。
 */
import { evaluateBinding } from '../../babylon-scene-player/src/binding.js'

// 一份手写的 scene.json 片段：一个 manual 源 + 节点上两条绑定
const doc = {
  sources: [{ id: 'src_m', type: 'manual', path: 'data' }],
  nodes: [
    {
      id: 'n_m', name: '机床', kind: 'model', type: 'glb',
      bindings: [
        { key: 'color', source: 'src_m', field: 'temp', map: 'threshold',
          stops: [{ at: 60, out: '#2bd94a' }, { at: 85, out: '#e5484d' }], below: '#2bd94a' },
        { key: 'visible', source: 'src_m', field: 'run', map: 'direct' },
      ],
    },
  ],
}

const node = doc.nodes[0]

// 宿主注入（单文件 HTML 里是 window.twinData.push('src_m', …)；npm 用法是 pushData）
const sourceValues = { src_m: { temp: 92, run: 1 } }

const colorBinding = node.bindings.find((b) => b.key === 'color')
const visibleBinding = node.bindings.find((b) => b.key === 'visible')

const colorOut = evaluateBinding(colorBinding, sourceValues)
const visibleOut = evaluateBinding(visibleBinding, sourceValues)

console.log('温度 92 → 颜色绑定:', JSON.stringify(colorOut))
console.log('run=1 → 显隐绑定:', JSON.stringify(visibleOut))

let ok = true
const check = (name, cond) => { console.log(`  ${cond ? '✓' : '✗'} ${name}`); if (!cond) ok = false }

check('温度超第二档 → 阈值映射成红色', colorOut?.value === '#e5484d')
check('run=1 → visible 透传为 1', visibleOut?.value === 1)

// 换一包数据：映射随数据变（说明不是写死的）
const cold = evaluateBinding(colorBinding, { src_m: { temp: 30 } })
check('温度 30 → 低于首档给绿色', cold?.value === '#2bd94a')

// 老文档 / 没配绑定的节点：求值是空对象，不该报错
const empty = evaluateBinding({ key: 'color', source: 'nope', field: 'x' }, {})
check('没数据的绑定 → null（不报错）', empty === null)

console.log(ok ? '\nJSON 数据接入链路 OK' : '\nFAILED')
process.exitCode = ok ? 0 : 1
