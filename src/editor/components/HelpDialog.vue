<script setup>
/**
 * 快捷键 / 操作说明。顶栏「?」和右侧图标栏都能拉起。
 * 只有一屏静态内容，所以直接复用 AppModal，不自己造窗口。
 */
import AppModal from './AppModal.vue'

defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const CAMERA = [
  { key: '左键拖拽', desc: '旋转视角' },
  { key: '右键拖拽', desc: '平移视角' },
  { key: '滚轮', desc: '推拉镜头' },
  { key: '左键点击', desc: '选中物体 / 点空白取消选中' },
]
const KEYS = [
  { key: 'W', desc: '切换到移动' },
  { key: 'E', desc: '切换到旋转' },
  { key: 'R', desc: '切换到缩放' },
  { key: 'F', desc: '镜头飞到选中物' },
  { key: 'Delete', desc: '删除选中节点' },
]
</script>

<template>
  <AppModal :open="open" title="操作说明" width="360px" @close="emit('close')">
    <section class="help-block">
      <h3>视角</h3>
      <div v-for="r in CAMERA" :key="r.desc" class="help-row">
        <kbd>{{ r.key }}</kbd>
        <span>{{ r.desc }}</span>
      </div>
    </section>

    <section class="help-block">
      <h3>快捷键</h3>
      <div v-for="r in KEYS" :key="r.desc" class="help-row">
        <kbd>{{ r.key }}</kbd>
        <span>{{ r.desc }}</span>
      </div>
    </section>

    <p class="help-note">场景会在停止操作 0.8 秒后自动存进浏览器本地；导出前不需要手动保存。</p>
  </AppModal>
</template>

<style scoped>
.help-block {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}
.help-block h3 {
  margin: 0 0 var(--s-1);
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--t-faint);
  letter-spacing: 0.04em;
}
.help-row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-sm);
  color: var(--t-body);
}
.help-row kbd {
  flex: 0 0 74px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--fs-2xs);
  color: var(--t-strong);
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-xs);
  padding: 2px 0;
}
.help-note {
  margin: 0;
  font-size: var(--fs-xs);
  line-height: 1.7;
  color: var(--t-faint);
}
</style>
