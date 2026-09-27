<script setup>
import { computed } from 'vue'
import {
  editor,
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
} from '../store/editor'
import { findCatalog, findGroundCatalog, ENV_FORM } from '../schema/sceneSchema'
import PointListEditor from './PointListEditor.vue'

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

const KIND_TAGS = {
  light: '灯光',
  model: '模型',
  pipe: '管道',
  effect: '特效',
  html: 'HTML',
}

function kindTag(kind) {
  return KIND_TAGS[kind] || '几何体'
}

function numInput(fn, evt, field) {
  const v = parseFloat(evt.target.value)
  if (!Number.isNaN(v)) fn(v)
}
</script>

<template>
  <aside class="inspector">
    <!-- ===== 场景设置（未选中或选中地面） ===== -->
    <template v-if="isGround">
      <div class="insp-title">场景设置</div>

      <section class="insp-section">
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

      <section class="insp-section">
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
        <p v-else class="insp-hint">未使用环境贴图（左侧「⑦ 环境天空盒」上传 .hdr）</p>
      </section>
    </template>

    <!-- ===== 节点属性 ===== -->
    <template v-else-if="node">
      <div class="insp-title">
        <span class="kind-tag">{{ kindTag(node.kind) }}</span>
        节点属性
      </div>

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
        <div v-for="f in nodeForm" :key="f.key" class="form-row">
          <label>{{ f.label }}</label>
          <input
            v-if="f.type === 'color'"
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
        </div>
      </section>

      <button class="delete-btn" @click="removeNode(node.id)">删除节点（Delete）</button>
    </template>

    <template v-else>
      <div class="insp-empty">节点不存在或已被删除</div>
    </template>
  </aside>
</template>

<style scoped>
.inspector {
  width: var(--w-panel);
  flex-shrink: 0;
  background: var(--c-panel);
  border-left: 1px solid var(--c-line);
  overflow-y: auto;
  padding: var(--s-3);
}
.insp-title {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-md);
  font-weight: 600;
  color: var(--t-strong);
  margin-bottom: var(--s-3);
}
/* 标签上不再按 light/model/pipe/effect/html 分糖果色：种类靠文字，颜色只表达状态 */
.kind-tag {
  font-size: var(--fs-2xs);
  font-weight: 400;
  padding: 1px var(--s-1);
  border-radius: var(--r-sm);
  color: var(--t-muted);
  background: var(--c-active);
  border: 1px solid var(--c-line);
}
.text-area {
  width: 100%;
  box-sizing: border-box;
  padding: var(--s-2);
  font-size: var(--fs-xs);
  line-height: 1.5;
  font-family: var(--font-mono);
  color: var(--t-strong);
  background: var(--c-viewport);
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
.form-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
.insp-section {
  margin-bottom: var(--s-4);
}
.insp-section h4 {
  margin: 0 0 var(--s-2);
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--t-faint);
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
  height: var(--h-ctrl);
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
  gap: var(--s-2);
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
}
.ground-type.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
/* 四种地面的预览漆已移到 styles/swatches.css 全站共享，这里只留盒子尺寸 */
.gt-swatch {
  width: 18px;
  height: 18px;
  border-radius: var(--r-sm);
  border: 1px solid var(--c-line-strong);
}
.delete-btn {
  width: 100%;
  height: var(--h-row);
  margin-top: var(--s-2);
  font-size: var(--fs-sm);
  color: var(--danger);
  background: var(--danger-soft);
  border: 1px solid var(--danger-line);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.delete-btn:hover {
  border-color: var(--danger);
}
.insp-empty {
  font-size: var(--fs-sm);
  color: var(--t-faint);
  text-align: center;
  padding: var(--s-5) 0;
}
</style>
