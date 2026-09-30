/**
 * 验证：交互配置能从编辑器文档一路活着进导出产物。
 * 跑 buildExportDoc（导出链路的公共层），检查 interaction / scene.camera 不被剥掉。
 */
import { buildExportDoc } from '../src/editor/export/sceneExport.js'

const doc = {
  version: '0.1.0',
  scene: {
    background: '#05070d',
    ground: { type: 'grid', props: { size: 2000 } },
    environment: { type: 'none', assetId: null, assetName: '', props: {} },
    camera: { alpha: -1.4289, beta: 1.25, radius: 60, target: [0, 4, 0] },
  },
  nodes: [
    {
      id: 'n_1', name: '机床', kind: 'model', type: 'glb',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scaling: [1, 1, 1] },
      props: { assetId: 'a_missing', assetName: 'machine.glb' },
      hidden: false, bindings: [],
      interaction: {
        trigger: 'click',
        transparent: { enabled: true, opacity: 0.35, color: '#00e5ff' },
        outline: { enabled: true, color: '#ffd640' },
        camera: { enabled: true, duration: 1200, mode: 'custom', view: { alpha: -1, beta: 1.1, radius: 12, target: [-8, 1.5, 2] } },
      },
    },
  ],
  sources: [{ id: 'src_m', type: 'manual' }],
  cameras: [],
}

const { doc: out, missing } = await buildExportDoc(doc, { mode: 'files', assets: [] })

let ok = true
const check = (name, cond) => { console.log(`  ${cond ? '✓' : '✗'} ${name}`); if (!cond) ok = false }

check('nodes[0].interaction 完整保留', JSON.stringify(out.nodes[0].interaction) === JSON.stringify(doc.nodes[0].interaction))
check('scene.camera 保留', JSON.stringify(out.scene.camera) === JSON.stringify(doc.scene.camera))
check('sources / bindings 保留', out.sources[0].id === 'src_m')
check('素材缺失只告警不剥交互', missing.length === 1 && out.nodes[0].interaction !== undefined)

console.log(ok ? '\n导出保留 OK' : '\nFAILED')
process.exitCode = ok ? 0 : 1
