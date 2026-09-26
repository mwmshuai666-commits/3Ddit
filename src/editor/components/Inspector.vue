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
} from '../store/editor'
import { findCatalog, findGroundCatalog } from '../schema/sceneSchema'
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

const transformParts = [
  { key: 'position', label: '位置', step: 0.1 },
  { key: 'rotation', label: '旋转(°)', step: 1 },
  { key: 'scaling', label: '缩放', step: 0.1 },
]
const axes = ['X', 'Y', 'Z']

const KIND_TAGS = { light: '灯光', model: '模型', pipe: '管道', effect: '特效' }

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
    </template>

    <!-- ===== 节点属性 ===== -->
    <template v-else-if="node">
      <div class="insp-title">
        <span class="kind-tag" :class="node.kind">{{ kindTag(node.kind) }}</span>
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
  width: 272px;
  flex-shrink: 0;
  background: #0e131d;
  border-left: 1px solid #232a38;
  overflow-y: auto;
  padding: 12px;
}
.insp-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #d4dceb;
  margin-bottom: 12px;
}
.kind-tag {
  font-size: 10px;
  font-weight: 400;
  padding: 1px 6px;
  border-radius: 4px;
  background: #1d2c47;
  color: #8fc0ff;
}
.kind-tag.light {
  background: #3a3220;
  color: #e8c46a;
}
.kind-tag.model {
  background: #16352a;
  color: #7bd4a6;
}
.kind-tag.pipe {
  background: #10314a;
  color: #4fd8ff;
}
.kind-tag.effect {
  background: #2a1f45;
  color: #b48cff;
}
.form-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: #3d8bff;
  cursor: pointer;
}
.insp-section {
  margin-bottom: 16px;
}
.insp-section h4 {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  color: #5d6b85;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.form-row label {
  font-size: 12px;
  color: #8b98b0;
  flex-shrink: 0;
}
.form-row input[type='number'],
.text-input {
  width: 130px;
  height: 26px;
  padding: 0 7px;
  font-size: 12px;
  color: #d4dceb;
  background: #151b28;
  border: 1px solid #2a3346;
  border-radius: 5px;
  box-sizing: border-box;
}
.form-row .select-input {
  width: 130px;
  height: 26px;
  padding: 0 6px;
  font-size: 12px;
  color: #d4dceb;
  background: #151b28;
  border: 1px solid #2a3346;
  border-radius: 5px;
  box-sizing: border-box;
  cursor: pointer;
}
.form-row input[type='color'] {
  width: 44px;
  height: 24px;
  padding: 0;
  border: 1px solid #2a3346;
  border-radius: 5px;
  background: #151b28;
  cursor: pointer;
}
.form-row input:focus {
  outline: none;
  border-color: #3d8bff;
}
.readonly {
  font-size: 12px;
  color: #66748e;
  font-family: ui-monospace, Consolas, monospace;
}
.transform-block {
  margin-bottom: 8px;
}
.transform-label {
  font-size: 11px;
  color: #66748e;
  margin-bottom: 3px;
}
.transform-row {
  display: flex;
  gap: 6px;
}
.transform-cell {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 3px;
}
.transform-cell .axis {
  font-size: 10px;
  font-weight: 700;
  width: 10px;
}
.axis.x { color: #ff6b6b; }
.axis.y { color: #6bff9e; }
.axis.z { color: #6bb5ff; }
.transform-cell input {
  width: 100%;
  min-width: 0;
  height: 26px;
  padding: 0 4px;
  font-size: 11px;
  color: #d4dceb;
  background: #151b28;
  border: 1px solid #2a3346;
  border-radius: 5px;
  box-sizing: border-box;
}
.transform-cell input:focus {
  outline: none;
  border-color: #3d8bff;
}
.ground-types {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ground-type {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  font-size: 12px;
  color: #c6d0e0;
  background: #151b28;
  border: 1px solid #262f42;
  border-radius: 6px;
  cursor: pointer;
}
.ground-type.active {
  border-color: #3d8bff;
  background: #13274a;
}
.gt-swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid #31405a;
}
.sw-grid {
  background-color: #0a1730;
  background-image:
    linear-gradient(#1e6bff 1px, transparent 1px),
    linear-gradient(90deg, #1e6bff 1px, transparent 1px);
  background-size: 7px 7px;
}
.sw-solid {
  background: #1c2635;
}
.sw-serverRoom {
  background-color: #20262f;
  background-image:
    linear-gradient(#4a5870 1.5px, transparent 1.5px),
    linear-gradient(90deg, #4a5870 1.5px, transparent 1.5px);
  background-size: 9px 9px;
}
.sw-digital {
  background-color: #041018;
  background-image:
    radial-gradient(circle at 50% 50%, rgba(0, 229, 255, 0.9) 0, rgba(0, 229, 255, 0.15) 45%, transparent 60%),
    repeating-radial-gradient(circle at 50% 50%, rgba(0, 229, 255, 0.55) 0 1px, transparent 1px 5px);
}
.delete-btn {
  width: 100%;
  height: 32px;
  margin-top: 8px;
  font-size: 12px;
  color: #ff8a8a;
  background: #2a1a1e;
  border: 1px solid #55303a;
  border-radius: 6px;
  cursor: pointer;
}
.delete-btn:hover {
  background: #3a2025;
}
.insp-empty {
  font-size: 12px;
  color: #55617a;
  text-align: center;
  padding: 30px 0;
}
</style>
