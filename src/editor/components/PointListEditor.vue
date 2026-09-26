<script setup>
/**
 * 折点配置编辑器：能量管道 / babylon-datav 特效（柔性管道、流光线、飞线、波纹墙）共用。
 * 具体节点能配几个坐标、最多几个点、有哪些预置，都由 schema 里的 pointConfig 决定。
 */
const props = defineProps({
  /** 当前选中的节点（读取 node.props.points） */
  node: { type: Object, required: true },
  /** 分区标题 */
  title: { type: String, default: '折点配置' },
  /** 可编辑的坐标轴，如 ['x','y','z'] / ['x','z']（波纹墙） */
  axes: { type: Array, default: () => ['x', 'y', 'z'] },
  /** 折点数量上限，0 = 不限（飞线固定 2 个） */
  maxPoints: { type: Number, default: 0 },
  /** 预置形状 [{ key, name, desc }] */
  presets: { type: Array, default: () => [] },
})

const emit = defineEmits(['point', 'add', 'remove', 'move', 'preset'])

const axisIndex = { x: 0, y: 1, z: 2 }

function onAxisInput(index, axis, evt) {
  const v = parseFloat(evt.target.value)
  if (!Number.isNaN(v)) emit('point', index, axis, v)
}

const pointCount = () => props.node.props.points.length
const canAdd = () => props.maxPoints <= 0 || pointCount() < props.maxPoints
const canRemove = () => pointCount() > 2
</script>

<template>
  <section class="insp-section">
    <h4>{{ title }} <span class="h4-hint">{{ pointCount() }} 个折点</span></h4>

    <div v-if="presets.length" class="preset-row">
      <button
        v-for="p in presets"
        :key="p.key"
        class="preset-btn"
        :title="p.desc"
        @click="emit('preset', p.key)"
      >
        {{ p.name }}
      </button>
    </div>

    <div class="pt-head">
      <span class="pt-idx">#</span>
      <span v-for="a in axes" :key="a" :class="['pt-axis', a]">{{ a.toUpperCase() }}</span>
      <span class="pt-ops" />
    </div>

    <div v-for="(p, i) in node.props.points" :key="i" class="pt-row">
      <span class="pt-idx">{{ i + 1 }}</span>
      <input
        v-for="a in axes"
        :key="a"
        type="number"
        step="0.1"
        :value="p[axisIndex[a]]"
        @input="onAxisInput(i, a, $event)"
      />
      <span class="pt-ops">
        <button title="上移" :disabled="i === 0" @click="emit('move', i, -1)">↑</button>
        <button
          title="下移"
          :disabled="i === pointCount() - 1"
          @click="emit('move', i, 1)"
        >
          ↓
        </button>
        <button title="删除折点" :disabled="canRemove()" @click="emit('remove', i)">×</button>
      </span>
    </div>

    <button class="add-point" :disabled="!canAdd()" @click="emit('add')">
      {{ maxPoints > 0 && pointCount() >= maxPoints ? `最多 ${maxPoints} 个折点` : '+ 添加折点' }}
    </button>
  </section>
</template>

<style scoped>
.h4-hint {
  margin-left: 6px;
  font-weight: 400;
  color: #55617a;
  text-transform: none;
  letter-spacing: 0;
}
.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 9px;
}
.preset-btn {
  height: 24px;
  padding: 0 9px;
  font-size: 11px;
  color: #9ecbff;
  background: #13274a;
  border: 1px solid #2d4a75;
  border-radius: 12px;
  cursor: pointer;
}
.preset-btn:hover {
  color: #fff;
  border-color: #5a9bff;
  background: #163156;
}
.pt-head,
.pt-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pt-head {
  margin-bottom: 4px;
  font-size: 10px;
  font-weight: 700;
}
.pt-idx {
  width: 16px;
  flex-shrink: 0;
  font-size: 10px;
  color: #55617a;
  text-align: center;
}
.pt-axis {
  flex: 1;
  text-align: center;
}
.pt-axis.x {
  color: #ff6b6b;
}
.pt-axis.y {
  color: #6bff9e;
}
.pt-axis.z {
  color: #6bb5ff;
}
.pt-ops {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.pt-ops button {
  width: 18px;
  height: 22px;
  padding: 0;
  font-size: 11px;
  line-height: 1;
  color: #8293ad;
  background: #151b28;
  border: 1px solid #2a3346;
  border-radius: 4px;
  cursor: pointer;
}
.pt-ops button:hover:not(:disabled) {
  color: #fff;
  border-color: #3d8bff;
}
.pt-ops button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.pt-ops button:last-child:hover:not(:disabled) {
  color: #ff8a8a;
  border-color: #55303a;
}
.pt-row {
  margin-bottom: 4px;
}
.pt-row input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 3px;
  font-size: 11px;
  color: #d4dceb;
  background: #151b28;
  border: 1px solid #2a3346;
  border-radius: 5px;
  box-sizing: border-box;
}
.pt-row input:focus {
  outline: none;
  border-color: #3d8bff;
}
.add-point:disabled {
  color: #55617a;
  border-color: #232a38;
  background: #10141d;
  cursor: not-allowed;
}
.add-point {
  width: 100%;
  height: 26px;
  margin-top: 4px;
  font-size: 11px;
  color: #9ecbff;
  background: #111927;
  border: 1px dashed #3d6fb5;
  border-radius: 6px;
  cursor: pointer;
}
.add-point:hover {
  color: #fff;
  background: #163156;
  border-color: #5a9bff;
}
</style>
