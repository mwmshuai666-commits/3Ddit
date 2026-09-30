<script setup>
/**
 * 字段绑定数据弹窗（Inspector 行内那个小按钮拉起来）。
 *
 * 一条绑定 = 数据源 + 取值路径 + 映射方式：
 *   direct     透传（方向：正/负 → ±1；显隐：0/1）
 *   linear     in:[a,b] → out:[c,d] 区间线性映射
 *   threshold  stops:[{at, out}] 阈值阶梯（颜色 / 显隐都归它）
 *
 * 预览用 dataHub 里缓存的最近一次数据实时跑 evaluateBinding，
 * 所以配好立刻能看到「现在这个值会变出什么」，不用先保存。
 */
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import AppModal from './AppModal.vue'
import Icon from './Icon.vue'
import { dataHub } from '../core/dataHub'
import { evaluateBinding, pickPath } from '../core/binding'
import { editor, addDataSource, removeDataSource } from '../store/editor'
import { findCatalog } from '../schema/sceneSchema'

const props = defineProps({
  open: { type: Boolean, default: false },
  nodeId: { type: String, default: '' },
  fieldKey: { type: String, default: '' },
  fieldLabel: { type: String, default: '' },
  /** 目标字段的原生类型：决定 stops 里 out 用什么编辑器 */
  fieldType: { type: String, default: 'number' }, // color | number | switch
  /** 已有的绑定（node.bindings 里 key 相同的那条）；null = 尚未绑定 */
  binding: { type: Object, default: null },
})
const emit = defineEmits(['close', 'save', 'test'])

const sources = computed(() => editor.doc.sources || [])

const sourceId = ref('')
const field = ref('value')
const map = ref('direct')
const inRange = ref([0, 100])
const outRange = ref([0, 1])
const stops = ref([])
/** 低于首档阈值时的值；空 = 保持上一次的注入不改场景 */
const below = ref(undefined)
/** dataHub 的 status 不是响应式的，弹窗开着每秒推一次让在线点/错误信息保持新鲜 */
const now = ref(0)
/** 本次弹窗通过「＋」新建的源 id：关闭时没人引用的要回收（见 onClose） */
const createdSourceIds = ref([])
let statusTimer = null
onMounted(() => {
  statusTimer = setInterval(() => {
    now.value += 1
  }, 1000)
})
onBeforeUnmount(() => clearInterval(statusTimer))

function defaultStop() {
  if (fieldType.value === 'color') return { at: 0, out: '#00e5ff' }
  if (fieldType.value === 'switch') return { at: 1, out: 1 } // ≥1 显示
  return { at: 0, out: 0 }
}

// 每次打开用已有绑定回填草稿。
// 注意：弹窗是 v-if 每次全新挂载、open 又是常量 true，watch 不会因「变化」触发，
// 所以必须 immediate —— 否则草稿永远是空值（sourceId 为空 → 存出永远不生效的绑定）。

/** 目标字段由打开弹窗的入口决定（哪个字段行尾的按钮点进来的）；本地镜像一份供内部用 */
const fieldKey = ref(props.fieldKey)
const fieldType = ref(props.fieldType)

/** 可绑字段的类型（与 Inspector 的 BINDABLE_TYPES 一致） */
const BINDABLE_TYPES = ['color', 'number', 'switch', 'select']

/**
 * 这个节点上所有能绑的字段：表单里的 color/number/switch/select + 固定的「显示」。
 * 柔性管道有 6 个可绑字段（颜色/管径/折角/分段/速度/段数），以前得点 6 个行尾
 * 小按钮；现在一个弹窗里换着绑。
 */
const bindableFields = computed(() => {
  const node = editor.doc.nodes.find((n) => n.id === props.nodeId)
  const form = (node && findCatalog(node.kind, node.type)?.form) || []
  const fields = form
    .filter((f) => BINDABLE_TYPES.includes(f.type))
    .map((f) => ({
      // 面板叫「流向」，绑定的 key 是 direction（和 Inspector 的 bindKeyOf 同规则）
      key: f.key === 'dir' ? 'direction' : f.key,
      label: f.label,
      type: f.type,
    }))
  fields.unshift({ key: 'visible', label: '显示 / 隐藏', type: 'switch' })
  return fields
})

const currentFieldLabel = computed(
  () => bindableFields.value.find((f) => f.key === fieldKey.value)?.label || fieldKey.value,
)

/** 按当前目标字段载入草稿：该字段已有绑定 → 没有就按字段类型给默认值 */
function loadDraft() {
  fieldType.value = bindableFields.value.find((f) => f.key === fieldKey.value)?.type || 'number'
  const node = editor.doc.nodes.find((n) => n.id === props.nodeId)
  const b = (node?.bindings || []).find((x) => x && x.key === fieldKey.value) || props.binding
  sourceId.value = b?.source || sources.value[0]?.id || ''
  field.value = b?.field || 'value'
  // 默认映射按目标字段类型给：颜色/开关天然是「阈值查表」，
  // 透传只适合数值字段——早期默认 direct，用户给颜色绑 direct 得到死绑定
  map.value = b?.map || (fieldType.value === 'color' || fieldType.value === 'switch' ? 'threshold' : 'direct')
  inRange.value = b?.in ? [...b.in] : [0, 100]
  outRange.value = b?.out ? [...b.out] : [0, 1]
  // 载入旧绑定时按目标字段类型净化 stops：色值字段收字符串、其余强转数字，
  // 否则颜色字符串会灌进 type=number 的输入框（浏览器报 "cannot be parsed"）
  stops.value = (b?.stops?.length ? b.stops : [defaultStop()]).map((s) => ({
    at: Number(s.at) || 0,
    out: fieldType.value === 'color' ? String(s.out ?? '#ffffff') : Number(s.out) || 0,
  }))
  below.value = b?.below !== undefined
    ? (fieldType.value === 'color'
      ? (typeof b.below === 'string' && /^#[0-9a-f]/i.test(b.below) ? b.below : undefined)
      : Number(b.below) || 0)
    : (fieldType.value === 'switch' ? 0 : undefined)
}

// 打开时回填一次（弹窗 v-if 全新挂载，必须 immediate，见上方注释）
watch(() => props.open, (v) => { if (v) loadDraft() }, { immediate: true })
// 弹窗里换目标字段：换成那个字段自己的绑定 / 默认值，整份草稿跟着换
watch(fieldKey, () => loadDraft())

/** 实时预览：当前数据下这一绑定会注入什么值 */
const preview = computed(() => {
  if (!sourceId.value) return null
  const hit = evaluateBinding(
    { key: fieldKey.value, ...draft(), source: sourceId.value, field: field.value },
    dataHub.values,
  )
  return hit ? hit.value : null
})
/** 预览的说明文字：区分「没数据」和「算出来的值无效被忽略」 */
const previewHint = computed(() => {
  if (!sourceId.value) return '先选数据源'
  const raw = sourceId.value ? pickPath(dataHub.values[sourceId.value], field.value) : undefined
  if (raw === undefined) return '（还没有数据 / 路径不对）'
  if (preview.value === null) return `原始值 ${JSON.stringify(raw)} → 无效，已忽略`
  return `原始值 ${JSON.stringify(raw)} → 注入`
})
const draft = () => ({
  map: map.value,
  in: inRange.value,
  out: outRange.value,
  stops: stops.value,
  below: below.value === '' ? undefined : below.value,
})

const sourceOnline = computed(() => {
  now.value // 每秒重算：dataHub 的 status 不是响应式的
  return sourceId.value ? dataHub.online(sourceId.value) : false
})
/** 当前选中的源定义（http 源的 URL / 轮询间隔直接在弹窗里改，落进 doc.sources） */
const selectedSource = computed(() => sources.value.find((s) => s.id === sourceId.value) || null)
/** 源的错误信息（连不上 / 断了 / 路径不对），离线时展示出来，别让用户干猜 */
const sourceError = computed(() => {
  now.value
  if (!sourceId.value || sourceOnline.value) return ''
  const st = dataHub.status[sourceId.value]
  const running = selectedSource.value?.type
  if (!st?.at) return running === 'ws' ? '还未连上（服务器没启动？URL 不对？）' : '还没有拉到数据'
  return st.error || '数据超时（stale）'
})
const rawSample = computed(() => {
  if (!sourceId.value) return '（未选数据源）'
  const v = pickPath(dataHub.values[sourceId.value], field.value)
  return v === undefined ? '（还没有数据 / 路径不对）' : JSON.stringify(v)
})

function addStop() {
  stops.value.push({ at: 0, out: fieldType.value === 'color' ? '#ffffff' : 0 })
}
function removeStop(i) {
  stops.value.splice(i, 1)
}
function sortStops() {
  stops.value.sort((a, b) => Number(a.at) - Number(b.at))
}

/** 当前选中的源是否已被某个节点的绑定引用（引用了就不让删，避免切断在线绑定） */
const sourceInUse = computed(() => {
  const id = sourceId.value
  if (!id) return false
  return editor.doc.nodes.some((n) =>
    (n.bindings || []).some((b) => b && b.source === id),
  )
})

/** 删掉没人用的数据源（手滑「＋」建出来的历史垃圾源这样清） */
function deleteSource() {
  const id = sourceId.value
  if (!id || sourceInUse.value) return
  removeDataSource(id)
  sourceId.value = sources.value[0]?.id || ''
}

async function createSource() {
  const id = `src_${Date.now().toString(36)}`
  addDataSource({ id, type: 'http', url: '', intervalMs: 2000, params: {} })
  // 记账：本次弹窗新建的源。取消 / 直接关窗时没人引用的要回收——
  // 否则手滑点几下「＋」就在文档里堆几个空源（还会被自动保存进去）
  createdSourceIds.value.push(id)
  sourceId.value = id
}

/**
 * 关闭弹窗（取消 / X / Esc 都走这儿）。保存过的绑定会引用新建的源，
 * 那种不删；只收「建了但最终没有任何绑定引用」的。
 */
function onClose() {
  for (const id of createdSourceIds.value) {
    const used = editor.doc.nodes.some((n) =>
      (n.bindings || []).some((b) => b && b.source === id),
    )
    if (!used) removeDataSource(id)
  }
  createdSourceIds.value = []
  emit('close')
}

/**
 * 联调用「试一下」：不依赖数据源，直接把一个值灌进引擎。
 * 有实时数据就用预览值；没有就取阈值首档 / 线性输出下限当样例。
 * 场景没反应 → 引擎通路或节点 id 不对；有反应 → 数据源那侧断了。
 */
function testNow() {
  // 兜底顺序：实时预览值 → 阈值首档 → 线性输出下限 → 按字段类型给个安全样例，
  // 保证任何配置下点「试一下」都有东西进引擎（没反应就是引擎/节点的问题）
  let v = preview.value
  if (v === null && map.value === 'threshold') v = stops.value[0]?.out
  if (v === null && map.value === 'linear') v = outRange.value[0]
  if (v == null && fieldType.value === 'color') v = '#00e5ff'
  if (v == null) v = 1
  emit('test', { key: fieldKey.value, value: v })
}

function save() {
  // 净化后再存：色值字段收字符串、其余收数字，脏配置不落文档
  const stopsOut = (map.value === 'threshold' ? stops.value : []).map((s) => ({
    at: Number(s.at) || 0,
    out: fieldType.value === 'color' ? String(s.out ?? '#ffffff') : Number(s.out) || 0,
  }))
  emit('save', {
    source: sourceId.value,
    field: field.value,
    map: map.value,
    ...(map.value === 'linear' ? { in: inRange.value.map(Number), out: outRange.value.map(Number) } : {}),
    ...(map.value === 'threshold'
      ? { stops: stopsOut, below: below.value === '' || below.value == null ? undefined : below.value }
      : {}),
  })
}

function unbind() {
  emit('save', null)
}
</script>

<template>
  <AppModal :open="open" title="绑定数据" width="380px" @close="onClose">
    <div class="bind-form">
      <div class="row">
        <label>目标字段</label>
        <span class="target">{{ fieldLabel || fieldKey }}</span>
      </div>

      <div class="row">
        <label>数据源</label>
        <span class="src-line">
          <select v-model="sourceId">
            <option v-for="s in sources" :key="s.id" :value="s.id">{{ s.id }}</option>
          </select>
          <span class="dot" :class="sourceOnline ? 'on' : 'off'" :title="sourceOnline ? '在线' : '离线/无数据'" />
          <button class="mini-btn" title="新建数据源（默认 http，下面可改类型）" @click="createSource">＋</button>
          <button
            class="mini-btn"
            :class="{ disabled: sourceInUse }"
            :disabled="sourceInUse"
            :title="sourceInUse ? '这个源还有绑定在引用，不能删' : '删除这个数据源'"
            @click="deleteSource"
          >－</button>
        </span>
      </div>
      <p v-if="sourceError" class="warn">{{ sourceError }}</p>
      <p v-if="sources.length" class="tip">下面的源定义直接改文档（自动保存）；没数据先进来，绑定不会生效</p>

      <!-- 源定义：类型 + URL + 对应参数，直接改 doc.sources（deep watch 自动保存并重启 dataHub） -->
      <template v-if="selectedSource && selectedSource.type !== 'manual'">
        <div class="row">
          <label>类型</label>
          <select v-model="selectedSource.type">
            <option value="http">http 轮询</option>
            <option value="ws">WebSocket</option>
            <option value="manual">manual（宿主注入）</option>
          </select>
        </div>
        <div class="row">
          <label>URL</label>
          <input
            v-model="selectedSource.url"
            type="text"
            :placeholder="selectedSource.type === 'ws' ? 'wss://…/realtime' : 'https://…/api/realtime'"
            spellcheck="false"
          />
        </div>
        <div v-if="selectedSource.type === 'http'" class="row">
          <label>轮询(ms)</label>
          <input v-model.number="selectedSource.intervalMs" type="number" min="200" step="100" />
        </div>
        <div v-else-if="selectedSource.type === 'ws'" class="row">
          <label>离线(ms)</label>
          <input v-model.number="selectedSource.staleMs" type="number" min="1000" step="1000" placeholder="10000" />
        </div>
      </template>
      <p v-else-if="selectedSource && selectedSource.type === 'manual'" class="tip">
        manual 源：由宿主页面 JS 注入 —— dataHub.push('{{ selectedSource.id }}', payload)
      </p>

      <div class="row">
        <label>取值路径</label>
        <input v-model="field" type="text" placeholder="value 或 data.value" spellcheck="false" />
      </div>
      <p class="tip mono">当前值：{{ rawSample }}</p>

      <div class="row">
        <label>映射方式</label>
        <select v-model="map">
          <option value="direct">透传</option>
          <option value="linear">区间线性</option>
          <option value="threshold">阈值阶梯</option>
        </select>
      </div>

      <template v-if="map === 'linear'">
        <div class="row">
          <label>输入区间</label>
          <span class="pair">
            <input v-model.number="inRange[0]" type="number" />
            <em>→</em>
            <input v-model.number="inRange[1]" type="number" />
          </span>
        </div>
        <div class="row">
          <label>输出区间</label>
          <span class="pair">
            <input v-model.number="outRange[0]" type="number" />
            <em>→</em>
            <input v-model.number="outRange[1]" type="number" />
          </span>
        </div>
      </template>

      <template v-if="map === 'threshold'">
        <div class="row">
          <label>低于首档</label>
          <span class="pair">
            <input v-if="fieldType === 'color'" v-model="below" type="color" />
            <input v-else v-model.number="below" type="number" placeholder="空 = 保持原样" />
          </span>
        </div>
        <div class="stops">
          <div v-for="(s, i) in stops" :key="i" class="stop-row">
            <span class="ge">≥</span>
            <input v-model.number="s.at" type="number" />
            <em>→</em>
            <input v-if="fieldType === 'color'" v-model="s.out" type="color" />
            <input v-else v-model.number="s.out" type="number" />
            <button class="mini-btn" title="删除这一档" @click="removeStop(i)">−</button>
          </div>
        </div>
        <div class="stop-ops">
          <button class="mini-btn" @click="addStop">＋ 加一档</button>
          <button class="mini-btn" @click="sortStops">按阈值排序</button>
        </div>
      </template>

      <div class="preview" :class="{ bad: preview === null && previewHint.includes('→') }">
        实时预览：{{ previewHint }}<b v-if="preview !== null"> {{ preview }}</b>
      </div>
      <p v-if="map === 'direct' && fieldType === 'color'" class="warn">
        「透传」会把原始数据直接当色值，数字/文本都无效 —— 颜色请改用「阈值阶梯」
      </p>
    </div>

    <template #footer>
      <button v-if="binding" class="foot-btn danger" @click="emit('save', null)">解除绑定</button>
      <span class="foot-spacer" />
      <button class="foot-btn" title="不依赖数据源，直接往场景里灌一个值，验证引擎通路" @click="testNow">试一下</button>
      <button class="foot-btn" @click="onClose">取消</button>
      <button class="foot-btn primary" @click="save">保存</button>
    </template>
  </AppModal>
</template>

<style scoped>
.bind-form {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  font-size: var(--fs-sm);
}
.row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
.row label {
  flex: 0 0 64px;
  color: var(--t-muted);
}
.target {
  font-weight: 600;
  color: var(--t-strong);
}
.src-line {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--s-1);
}
select,
input[type='text'],
input[type='number'] {
  flex: 1;
  min-width: 0;
  height: var(--h-btn);
  padding: 0 var(--s-2);
  font-size: var(--fs-sm);
  color: var(--t-strong);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
}
input[type='color'] {
  width: 40px;
  height: var(--h-btn);
  padding: 0;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  background: var(--c-raised);
}
.tip {
  margin: 0 0 0 72px;
  font-size: var(--fs-2xs);
  color: var(--t-faint);
  line-height: 1.6;
}
.warn {
  margin: 0 0 0 72px;
  font-size: var(--fs-2xs);
  line-height: 1.6;
  color: var(--danger);
}
.mono {
  font-family: var(--font-mono);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot.on {
  background: var(--ok);
}
.dot.off {
  background: var(--t-faint);
}
.pair {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--s-1);
}
.pair em {
  color: var(--t-faint);
  font-style: normal;
}
.stops {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}
.stop-row {
  display: flex;
  align-items: center;
  gap: var(--s-1);
}
.stop-row .ge {
  color: var(--t-faint);
}
.stop-ops {
  display: flex;
  gap: var(--s-1);
}
.mini-btn {
  height: 24px;
  min-width: 24px;
  padding: 0 var(--s-1);
  font-size: var(--fs-xs);
  color: var(--t-body);
  background: var(--grad-glass);
  border: 1px solid var(--c-glass-strong);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.mini-btn:hover {
  color: var(--t-strong);
  border-color: rgb(255 255 255 / 26%);
}
.mini-btn.disabled,
.mini-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.preview {
  margin-top: var(--s-1);
  padding: var(--s-2);
  font-size: var(--fs-xs);
  color: var(--t-body);
  background: rgb(255 255 255 / 4%);
  border: 1px dashed var(--c-glass-strong);
  border-radius: var(--r-sm);
}
.preview b {
  color: var(--accent);
  font-family: var(--font-mono);
}
.preview.bad b {
  color: var(--t-faint);
}
.foot-btn {
  height: 28px;
  padding: 0 var(--s-3);
  font-size: var(--fs-sm);
  color: var(--t-body);
  background: var(--grad-glass);
  border: 1px solid var(--c-glass-strong);
  border-radius: var(--r-pill);
  cursor: pointer;
}
.foot-btn:hover {
  color: var(--t-strong);
}
.foot-btn.primary {
  color: var(--on-accent);
  background: var(--grad-accent);
  border-color: transparent;
}
.foot-btn.danger {
  color: var(--danger);
}
.foot-spacer {
  flex: 1;
}
</style>
