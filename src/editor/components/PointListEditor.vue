<script setup>
/**
 * 折点配置编辑器：能量管道 / babylon-datav 特效（柔性管道、流光线、飞线、波纹墙）共用。
 * 具体节点能配几个坐标、最多几个点、有哪些预置，都由 schema 里的 pointConfig 决定。
 */
import Icon from './Icon.vue'

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
        <button title="上移" :disabled="i === 0" @click="emit('move', i, -1)">
          <Icon name="chevron" :size="12" class="up" />
        </button>
        <button
          title="下移"
          :disabled="i === pointCount() - 1"
          @click="emit('move', i, 1)"
        >
          <Icon name="chevron" :size="12" />
        </button>
        <button title="删除折点" :disabled="canRemove()" @click="emit('remove', i)">
          <Icon name="trash" :size="12" />
        </button>
      </span>
    </div>

    <button class="add-point" :disabled="!canAdd()" @click="emit('add')">
      <Icon name="plus" :size="13" />
      {{ maxPoints > 0 && pointCount() >= maxPoints ? `最多 ${maxPoints} 个折点` : '添加折点' }}
    </button>
  </section>
</template>

<style scoped>
.h4-hint {
  margin-left: var(--s-2);
  font-weight: 400;
  color: var(--t-faint);
  text-transform: none;
  letter-spacing: 0;
}
.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-bottom: var(--s-2);
}
/* 预置胶囊：全站唯一的强调色用法（选中级操作），不再有第二种蓝 */
.preset-btn {
  height: var(--h-ctrl);
  padding: 0 var(--s-2);
  font-size: var(--fs-xs);
  color: var(--accent-hover);
  background: var(--accent-soft);
  border: 1px solid var(--accent-line);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.preset-btn:hover {
  color: var(--on-accent);
  background: var(--accent);
  border-color: var(--accent);
}
.pt-head,
.pt-row {
  display: flex;
  align-items: center;
  gap: var(--s-1);
}
.pt-head {
  margin-bottom: var(--s-1);
  font-size: var(--fs-2xs);
  font-weight: 700;
}
.pt-idx {
  width: 16px;
  flex-shrink: 0;
  font-size: var(--fs-2xs);
  color: var(--t-faint);
  text-align: center;
}
/* 轴标靠 X/Y/Z 字母区分，收回 RGB 糖果色：颜色只表达状态 */
.pt-axis {
  flex: 1;
  text-align: center;
  color: var(--t-muted);
}
.pt-ops {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
/* 上 / 下移共用一个 chevron，靠旋转区分方向（不引入第二种字形） */
.pt-ops .up {
  transform: rotate(180deg);
}
.pt-ops button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 22px;
  padding: 0;
  color: var(--t-muted);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.pt-ops button:hover:not(:disabled) {
  color: var(--t-strong);
  border-color: var(--accent);
}
.pt-ops button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.pt-ops button:last-child:hover:not(:disabled) {
  color: var(--danger);
  border-color: var(--danger-line);
}
.pt-row {
  margin-bottom: var(--s-1);
}
.pt-row input {
  flex: 1;
  min-width: 0;
  height: var(--h-ctrl);
  padding: 0 3px;
  font-size: var(--fs-xs);
  color: var(--t-strong);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  box-sizing: border-box;
}
.pt-row input:focus {
  outline: none;
  border-color: var(--accent);
}
.add-point:disabled {
  color: var(--t-faint);
  border-color: var(--c-line);
  background: var(--c-app);
  cursor: not-allowed;
}
.add-point {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  width: 100%;
  height: var(--h-btn);
  margin-top: var(--s-1);
  font-size: var(--fs-xs);
  color: var(--accent-hover);
  background: var(--accent-soft);
  border: 1px dashed var(--accent-line);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.add-point:hover {
  color: var(--on-accent);
  background: var(--accent);
  border-color: var(--accent);
}
</style>
