<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'
import {
  editor,
  ui,
  toggleInspector,
  findNode,
  GROUND_SELECTION,
  GROUND_CATALOG,
  updateNodeProps,
  updateNodeName,
  updateNodeTransform,
  updateGroundProp,
  updateBackground,
  setGroundType,
  removeNode,
  updatePathPoint,
  addPathPoint,
  removePathPoint,
  movePathPoint,
  applyPathPreset,
  updateEnvironmentProp,
  setNodeBinding,
  testInject,
} from '../store/editor'
import { auth } from '../../store/auth'
import { findCatalog, findGroundCatalog, ENV_FORM } from '../schema/sceneSchema'
import PointListEditor from './PointListEditor.vue'
import LoginDialog from './LoginDialog.vue'
import BindingDialog from './BindingDialog.vue'
import Icon from './Icon.vue'

const isGround = computed(
  () => !editor.selectedId || editor.selectedId === GROUND_SELECTION,
)
const node = computed(() =>
  editor.selectedId && editor.selectedId !== GROUND_SELECTION
    ? findNode(editor.selectedId)
    : null,
)
const nodeForm = computed(() =>
  node.value ? findCatalog(node.value.kind, node.value.type)?.form || [] : [],
)
/** 折点编辑器配置：能量管道 / 特效节点才有 */
const pointConfig = computed(() =>
  node.value ? findCatalog(node.value.kind, node.value.type)?.pointConfig || null : null,
)
const groundForm = computed(() => findGroundCatalog(editor.doc.scene.ground.type).form)
const ground = computed(() => editor.doc.scene.ground)

/** 场景级环境（scene.environment）；没配就当成「无环境」 */
const envDoc = computed(() => {
  const env = editor.doc.scene?.environment
  return env && env.type === 'hdr' ? env : null
})
const envActive = computed(() => !!envDoc.value?.assetId)

const transformParts = [
  { key: 'position', label: '位置', step: 0.1 },
  { key: 'rotation', label: '旋转(°)', step: 1 },
  { key: 'scaling', label: '缩放', step: 0.1 },
]
const axes = ['X', 'Y', 'Z']
const panelWidth = ref(292)
const resizing = ref(false)

/* ---- 拖动调宽 ---- */
function resizePanel(event) {
  if (!resizing.value) return
  panelWidth.value = Math.max(230, Math.min(460, window.innerWidth - event.clientX - 12))
}
function stopResize() {
  resizing.value = false
  document.removeEventListener('pointermove', resizePanel)
  document.removeEventListener('pointerup', stopResize)
}
function startResize(event) {
  if (!ui.inspectorOpen) return
  resizing.value = true
  document.addEventListener('pointermove', resizePanel)
  document.addEventListener('pointerup', stopResize)
  event.preventDefault()
}
onBeforeUnmount(stopResize)

/* ---- 登录弹窗 ---- */
const loginOpen = ref(false)

const KIND_TAGS = {
  light: '灯光',
  model: '模型',
  pipe: '管道',
  effect: '特效',
  html: 'HTML',
  web: '网页',
}

function kindTag(kind) {
  return KIND_TAGS[kind] || '几何体'
}

function numInput(fn, evt, field) {
  const v = parseFloat(evt.target.value)
  if (!Number.isNaN(v)) fn(v)
}

/* ---- 数据绑定（行内小按钮 → BindingDialog） ---- */

/** 这些类型的表单字段可以绑数据；长文本没意义，不给入口 */
const BINDABLE_TYPES = ['color', 'number', 'switch', 'select']
const bindable = (f) => BINDABLE_TYPES.includes(f.type)

/** 表单字段 → 绑定 key：流向的手动字段叫 dir，绑定的 key 用 direction（引擎口径） */
function bindKeyOf(f) {
  return f.key === 'dir' ? 'direction' : f.key
}

/** null = 弹窗关着；否则带着目标字段和已有绑定 */
const bindState = ref(null)

function hasBinding(key) {
  return !!node.value?.bindings?.some((b) => b && b.key === key)
}

function openBinding(key, label, type) {
  bindState.value = {
    key,
    label,
    type,
    binding: node.value?.bindings?.find((b) => b && b.key === key) || null,
  }
}

function saveBinding(binding) {
  const id = node.value?.id
  if (id && bindState.value) setNodeBinding(id, bindState.value.key, binding)
  bindState.value = null
}

/** 弹窗「试一下」：绕过数据源直接灌值，验证引擎通路（联调） */
function testBinding(payload) {
  const id = node.value?.id
  if (id) testInject(id, payload.key, payload.value)
}
</script>

<template>
  <aside
    class="panel inspector"
    :class="{ collapsed: !ui.inspectorOpen, resizing }"
    :style="{ width: `${ui.inspectorOpen ? panelWidth : 52}px` }"
  >
    <div class="panel-head">
      <button
        class="head-btn"
        :aria-label="ui.inspectorOpen ? '收起属性栏' : '展开属性栏'"
        :aria-expanded="ui.inspectorOpen"
        :title="ui.inspectorOpen ? '收起属性栏' : '展开属性栏'"
        @click="toggleInspector()"
      >
        <span class="caret" :class="{ shut: !ui.inspectorOpen }">›</span>
      </button>
      <span v-if="ui.inspectorOpen" class="panel-title">属性</span>
      <span v-if="ui.inspectorOpen && node" class="head-tag">{{ kindTag(node.kind) }}</span>
      <span v-else-if="ui.inspectorOpen" class="head-tag">场景</span>
    </div>

    <div v-if="ui.inspectorOpen" class="insp-body">
      <!-- 导出门禁的常驻提示：跟 Tripo 那条「升级横幅」一个位置，但说的是真事 -->
      <div v-if="auth.status !== 'authed'" class="insp-banner">
        <div class="banner-text">
          登录后可导出单文件 HTML / 完整包 ZIP
        </div>
        <button class="banner-btn" @click="loginOpen = true">登录</button>
      </div>

      <!-- ===== 场景设置（未选中或选中地面） ===== -->
      <template v-if="isGround">
        <section id="insp-scene" class="insp-section">
          <h4>底板类型</h4>
          <div class="ground-types">
            <button
              v-for="g in GROUND_CATALOG"
              :key="g.type"
              class="ground-type"
              :class="{ active: ground.type === g.type }"
              @click="setGroundType(g.type)"
            >
              <span class="gt-swatch" :class="`sw-${g.type}`"></span>
              {{ g.name }}
            </button>
          </div>
        </section>

        <section class="insp-section">
          <h4>底板参数</h4>
          <div v-for="f in groundForm" :key="f.key" class="form-row">
            <label>{{ f.label }}</label>
            <input
              v-if="f.type === 'color'"
              type="color"
              :value="ground.props[f.key]"
              @input="updateGroundProp(f.key, $event.target.value)"
            />
            <input
              v-else
              type="number"
              :value="ground.props[f.key]"
              :min="f.min"
              :step="f.step"
              @input="numInput((v) => updateGroundProp(f.key, v), $event)"
            />
          </div>
        </section>

        <section class="insp-section">
          <h4>环境</h4>
          <div class="form-row">
            <label>背景色</label>
            <input
              type="color"
              :value="editor.doc.scene.background"
              @input="updateBackground($event.target.value)"
            />
          </div>
        </section>

        <section id="insp-env" class="insp-section">
          <h4>环境天空盒</h4>
          <template v-if="envActive">
            <div class="form-row">
              <label>当前环境</label>
              <span class="readonly env-name" :title="envDoc.assetName">{{ envDoc.assetName }}</span>
            </div>
            <div v-for="f in ENV_FORM" :key="f.key" class="form-row">
              <label>{{ f.label }}</label>
              <input
                v-if="f.type === 'switch'"
                type="checkbox"
                :checked="envDoc.props?.[f.key] !== false"
                @change="updateEnvironmentProp(f.key, $event.target.checked)"
              />
              <input
                v-else
                type="number"
                :min="f.min"
                :max="f.max"
                :step="f.step"
                :value="envDoc.props?.[f.key]"
                @input="numInput((v) => updateEnvironmentProp(f.key, v), $event)"
              />
            </div>
          </template>
          <p v-else class="insp-hint">未使用环境贴图（左侧「环境」栏上传 .hdr）</p>
        </section>
      </template>

      <!-- ===== 节点属性 ===== -->
      <template v-else-if="node">
        <section class="insp-section">
          <h4>基础</h4>
          <div class="form-row">
            <label>名称</label>
            <input
              class="text-input"
              type="text"
              :value="node.name"
              @input="updateNodeName(node.id, $event.target.value)"
            />
          </div>
          <div class="form-row">
            <label>类型</label>
            <span class="readonly">{{ node.type }}</span>
          </div>
        </section>

        <section class="insp-section">
          <h4>变换</h4>
          <div v-for="part in transformParts" :key="part.key" class="transform-block">
            <div class="transform-label">{{ part.label }}</div>
            <div class="transform-row">
              <div v-for="(axis, i) in axes" :key="axis" class="transform-cell">
                <span :class="['axis', axis.toLowerCase()]">{{ axis }}</span>
                <input
                  type="number"
                  step="0.1"
                  :value="node.transform[part.key][i]"
                  @input="numInput((v) => updateNodeTransform(node.id, part.key, i, v), $event)"
                />
              </div>
            </div>
          </div>
        </section>

        <PointListEditor
          v-if="node && pointConfig"
          :node="node"
          v-bind="pointConfig"
          @point="(i, a, v) => updatePathPoint(node.id, i, a, v)"
          @add="addPathPoint(node.id)"
          @remove="(i) => removePathPoint(node.id, i)"
          @move="(i, dir) => movePathPoint(node.id, i, dir)"
          @preset="(key) => applyPathPreset(node.id, key)"
        />

        <section v-if="nodeForm.length" class="insp-section">
          <h4>参数</h4>
          <div v-for="f in nodeForm" :key="f.key" class="form-row" :title="f.hint || ''">
            <label>{{ f.label }}</label>
            <input
              v-if="f.type === 'text'"
              type="text"
              class="text-input"
              :placeholder="f.placeholder"
              :value="node.props[f.key]"
              spellcheck="false"
              @input="updateNodeProps(node.id, f.key, $event.target.value)"
            />
            <input
              v-else-if="f.type === 'color'"
              type="color"
              :value="node.props[f.key]"
              @input="updateNodeProps(node.id, f.key, $event.target.value)"
            />
            <input
              v-else-if="f.type === 'switch'"
              type="checkbox"
              :checked="!!node.props[f.key]"
              @change="updateNodeProps(node.id, f.key, $event.target.checked)"
            />
            <em v-if="f.hint" class="field-hint">{{ f.hint }}</em>
            <select
              v-else-if="f.type === 'select'"
              class="select-input"
              :value="node.props[f.key]"
              @change="updateNodeProps(node.id, f.key, $event.target.value)"
            >
              <option v-for="o in f.options" :key="o.value" :value="o.value">
                {{ o.label }}
              </option>
            </select>
            <textarea
              v-else-if="f.type === 'textarea'"
              class="text-area"
              :rows="f.rows || 6"
              :placeholder="f.placeholder"
              :value="node.props[f.key]"
              spellcheck="false"
              @input="updateNodeProps(node.id, f.key, $event.target.value)"
            ></textarea>
            <input
              v-else
              type="number"
              :value="node.props[f.key]"
              :min="f.min"
              :max="f.max"
              :step="f.step"
              @input="numInput((v) => updateNodeProps(node.id, f.key, v), $event)"
            />
            <!-- 绑定入口：跟在输入控件后面（输入链只渲染一个，按钮永远在行尾） -->
            <button
              v-if="bindable(f)"
              class="bind-btn"
              :class="{ bound: hasBinding(bindKeyOf(f)) }"
              :title="hasBinding(bindKeyOf(f)) ? '已绑定数据，点击查看 / 修改' : '把这一项绑定到数据源'"
              @click="openBinding(bindKeyOf(f), f.label, f.type)"
            >
              <Icon name="sliders" :size="12" />
            </button>
          </div>
        </section>

        <!-- 数据接入：显隐 / 流向是运行时效果（显隐不在 form 里），单独给入口 -->
        <section class="insp-section">
          <h4>数据接入</h4>
          <div class="form-row">
            <label>显示</label>
            <span class="readonly">{{ node.hidden ? '已隐藏（数据可临时覆盖）' : '显示中' }}</span>
            <button
              class="bind-btn"
              :class="{ bound: hasBinding('visible') }"
              title="绑定数据控制显隐（输出 0 / 1 或布尔）"
              @click="openBinding('visible', '显示 / 隐藏', 'switch')"
            >
              <Icon name="sliders" :size="12" />
            </button>
          </div>
          <p class="insp-hint">绑定只改显示效果（颜色 / 显隐 / 流向 / 光带参数），不动几何；未接数据的字段保持面板里的静态值。</p>
        </section>

        <button class="delete-btn" @click="removeNode(node.id)">删除节点（Delete）</button>
      </template>

      <template v-else>
        <div class="insp-empty">节点不存在或已被删除</div>
      </template>
    </div>

    <div v-if="ui.inspectorOpen" class="insp-resize-handle" title="拖动调整宽度" @pointerdown="startResize"></div>

    <LoginDialog :open="loginOpen" @logged-in="loginOpen = false" @close="loginOpen = false" />

    <BindingDialog
      v-if="bindState"
      :key="bindState.key"
      :open="true"
      :node-id="node?.id || ''"
      :field-key="bindState.key"
      :field-label="bindState.label"
      :field-type="bindState.type"
      :binding="bindState.binding"
      @close="bindState = null"
      @save="saveBinding"
      @test="testBinding"
    />  </aside>
</template>

<style scoped>
.inspector {
  position: relative; /* 拖拽手柄的定位基准 */
  width: 292px;
  min-width: 52px;
  flex-shrink: 0;
  transition: width 180ms ease;
}
.inspector.resizing {
  transition: none;
}
.panel-head {
  flex: 0 0 44px;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 0 var(--s-3);
}
/* 折叠钮：左右两个面板同一个长相，但各自的 scoped 里各写一份（不共享样式） */
.inspector .head-btn {
  margin-left: 0;
  width: 26px;
  height: 26px;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid var(--c-glass);
  border-radius: var(--r-sm);
  background: var(--grad-glass);
  color: var(--t-muted);
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    border-color var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.inspector .head-btn:hover {
  color: var(--t-strong);
  border-color: var(--c-glass-strong);
  background: rgb(255 255 255 / 11%);
}
.inspector .head-btn:active {
  transform: scale(0.96);
}
.panel-title {
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--t-strong);
  white-space: nowrap;
}
.head-tag {
  margin-left: auto;
  font-size: var(--fs-2xs);
  padding: 2px var(--s-2);
  border-radius: var(--r-pill);
  color: var(--t-muted);
  background: rgb(255 255 255 / 6%);
  border: 1px solid var(--c-glass);
}
/* 折叠后整栏竖排，只留一个展开钮 */
.inspector.collapsed .panel-head {
  justify-content: center;
  padding: 0;
}
.caret {
  display: inline-block;
  font-size: 20px;
  line-height: 1;
  color: var(--t-muted);
  transition: transform var(--dur) var(--ease);
}
.caret.shut {
  transform: rotate(180deg);
}
.head-btn:hover .caret {
  color: var(--t-strong);
}

.insp-body {
  min-height: 0;
  overflow-y: auto;
  padding: 0 var(--s-3) var(--s-4);
  flex: 1;
}
/* 登录提示横幅：位置和 Tripo 的升级横幅一样，说的是真事 */
.insp-banner {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-bottom: var(--s-3);
  padding: var(--s-2) var(--s-2) var(--s-2) var(--s-3);
  border-radius: var(--r-md);
  background: linear-gradient(135deg, rgb(255 212 41 / 14%), rgb(255 212 41 / 4%));
  border: 1px solid var(--accent-line);
}
.banner-text {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-2xs);
  line-height: 1.6;
  color: var(--t-body);
}
.banner-btn {
  flex-shrink: 0;
  height: 26px;
  padding: 0 var(--s-3);
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--on-accent);
  background: var(--grad-accent);
  border: 0;
  border-radius: var(--r-pill);
  box-shadow: var(--glow-accent);
  cursor: pointer;
}
.banner-btn:hover {
  filter: brightness(1.06);
}

/* 分区卡片：属性面板里的一级容器 */
.insp-section {
  margin-bottom: var(--s-2);
  padding: var(--s-3);
  border-radius: var(--r-md);
  background: rgb(255 255 255 / 3%);
  border: 1px solid var(--c-glass);
}
.insp-section h4 {
  margin: 0 0 var(--s-2);
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--t-muted);
  letter-spacing: 0.04em;
}
.kind-tag {
  font-size: var(--fs-2xs);
  font-weight: 400;
  padding: 1px var(--s-2);
  border-radius: var(--r-pill);
  color: var(--t-muted);
  background: rgb(255 255 255 / 6%);
  border: 1px solid var(--c-glass);
}
.text-input {
  flex: 1;
  min-width: 0;
  height: var(--h-btn);
  padding: 0 var(--s-2);
  font-size: var(--fs-xs);
  font-family: var(--font-mono);
  color: var(--t-strong);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
}
.text-area {
  width: 100%;
  box-sizing: border-box;
  padding: var(--s-2);
  font-size: var(--fs-xs);
  line-height: 1.5;
  font-family: var(--font-mono);
  color: var(--t-strong);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  resize: vertical;
}
.text-area:focus {
  outline: none;
  border-color: var(--accent);
}
.env-name {
  max-width: 150px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.insp-hint {
  margin: 0;
  font-size: var(--fs-xs);
  line-height: 1.6;
  color: var(--t-faint);
}
/* 行内绑定按钮：贴在输入框右侧；已绑定时用强调色描边 */
.bind-btn {
  flex-shrink: 0;
  width: 24px;
  height: var(--h-btn);
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--c-glass);
  border-radius: var(--r-sm);
  background: var(--c-raised);
  color: var(--t-faint);
  cursor: pointer;
  transition:
    color var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.bind-btn:hover {
  color: var(--t-strong);
  border-color: var(--c-glass-strong);
}
.bind-btn.bound {
  color: var(--accent);
  border-color: var(--accent-line);
}
.form-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
  margin-bottom: var(--s-2);
}
.form-row label {
  font-size: var(--fs-sm);
  color: var(--t-muted);
  flex-shrink: 0;
}
/* 字段备注（可选）：换到第二行显示，别把 label 挤成两行 */
.form-row {
  flex-wrap: wrap;
}
.field-hint {
  flex: 1 0 100%;
  font-size: var(--fs-2xs);
  line-height: 1.5;
  color: var(--t-faint);
  font-style: normal;
  margin-top: 2px;
}
/* 输入框不再写死 130px：占满标签剩下的宽度，长数值 / 长名称都不会被裁掉 */
.form-row input[type='number'],
.text-input {
  flex: 1;
  min-width: 0;
  height: var(--h-btn);
  padding: 0 var(--s-2);
  font-size: var(--fs-sm);
  color: var(--t-strong);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  box-sizing: border-box;
}
.form-row .select-input {
  flex: 1;
  min-width: 0;
  height: var(--h-btn);
  padding: 0 var(--s-2);
  font-size: var(--fs-sm);
  color: var(--t-strong);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  box-sizing: border-box;
  cursor: pointer;
}
.form-row input[type='color'] {
  width: 44px;
  height: var(--h-btn);
  padding: 0;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  background: var(--c-raised);
  cursor: pointer;
}
.form-row input:focus {
  outline: none;
  border-color: var(--accent);
}
.readonly {
  font-size: var(--fs-sm);
  color: var(--t-muted);
  font-family: var(--font-mono);
}
.transform-block {
  margin-bottom: var(--s-2);
}
.transform-label {
  font-size: var(--fs-xs);
  color: var(--t-muted);
  margin-bottom: 3px;
}
.transform-row {
  display: flex;
  gap: var(--s-2);
}
.transform-cell {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 3px;
}
.transform-cell .axis {
  font-size: var(--fs-2xs);
  font-weight: 700;
  width: 10px;
  /* X/Y/Z 靠字母本身区分，收回 RGB 糖果色：颜色只表达状态 */
  color: var(--t-muted);
}
.transform-cell input {
  width: 100%;
  min-width: 0;
  height: var(--h-btn);
  padding: 0 var(--s-1);
  font-size: var(--fs-xs);
  /* 等宽数字：一边改一边看数值时，位数变化不会让格子抖 */
  font-variant-numeric: tabular-nums;
  color: var(--t-strong);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  box-sizing: border-box;
}
.transform-cell input:focus {
  outline: none;
  border-color: var(--accent);
}
.ground-types {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}
.ground-type {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  height: var(--h-row);
  padding: 0 var(--s-2);
  font-size: var(--fs-sm);
  color: var(--t-body);
  background: var(--c-raised);
  border: 1px solid var(--c-line);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition:
    border-color var(--dur) var(--ease),
    background var(--dur) var(--ease);
}
.ground-type:hover {
  border-color: var(--accent-line);
  color: var(--t-strong);
}
.ground-type.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent-hover);
}
/* 四种地面的预览漆已移到 styles/swatches.css 全站共享，这里只留盒子尺寸 */
.gt-swatch {
  width: 20px;
  height: 20px;
  border-radius: var(--r-xs);
  border: 1px solid var(--c-line-strong);
}
.delete-btn {
  width: 100%;
  height: var(--h-row);
  margin-top: var(--s-1);
  font-size: var(--fs-sm);
  color: var(--danger);
  background: var(--danger-soft);
  border: 1px solid var(--danger-line);
  border-radius: var(--r-pill);
  cursor: pointer;
  transition:
    background var(--dur) var(--ease),
    border-color var(--dur) var(--ease);
}
.delete-btn:hover {
  border-color: var(--danger);
  background: rgb(212 101 95 / 22%);
}
.insp-empty {
  font-size: var(--fs-sm);
  color: var(--t-faint);
  text-align: center;
  padding: var(--s-5) 0;
}
.insp-resize-handle {
  position: absolute;
  z-index: 2;
  left: -3px;
  top: 48px;
  bottom: 0;
  width: 7px;
  cursor: col-resize;
  touch-action: none;
}
.insp-resize-handle:hover,
.inspector.resizing .insp-resize-handle {
  background: var(--accent);
  opacity: 0.72;
}
</style>
