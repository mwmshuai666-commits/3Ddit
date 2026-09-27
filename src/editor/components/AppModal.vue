<script setup>
/**
 * 可复用模态框。应用里第一个真正的 modal。
 *
 *   <AppModal :open="x" title="登录" @close="x = false">
 *     <template #footer>…</template>
 *   </AppModal>
 *
 * 只做三件窗口管理器该做的事：Teleport 到 body（不被父级 transform/overflow 裁剪）、
 * Esc 关闭、点遮罩关闭。剩下一律交给调用方——所以没有 header/footer 的强制插槽约束，
 * 想放什么放什么。
 */
import { watch, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  /** 宽度，默认登录框用 */
  width: { type: String, default: '340px' },
  /** 点遮罩 / Esc 是否可关。有未保存草稿之类的确认框设 false */
  dismissable: { type: Boolean, default: true },
})
const emit = defineEmits(['close'])

watch(
  () => props.open,
  (v) => {
    document.body.classList.toggle('has-modal', v)
  },
)

function onKeydown(e) {
  if (e.key === 'Escape' && props.open && props.dismissable) emit('close')
}
document.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('has-modal')
})

function onMaskClick(e) {
  if (props.dismissable && e.target === e.currentTarget) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-mask" @click="onMaskClick">
      <div
        class="modal"
        :style="{ width }"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <header v-if="title" class="modal-head">
          <Icon name="lock" :size="14" />
          <h2>{{ title }}</h2>
          <button v-if="dismissable" class="modal-x" title="关闭" @click="emit('close')">
            <Icon name="close" :size="14" />
          </button>
        </header>
        <div class="modal-body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="modal-foot">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-mask);
  background: rgb(5 7 13 / 62%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--s-5);
}

.modal {
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  max-width: 100%;
  background: var(--c-pop);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
}

.modal-head {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  height: var(--h-btn);
  padding: 0 var(--s-2) 0 var(--s-4);
  color: var(--t-strong);
  border-bottom: 1px solid var(--c-line);
}
.modal-head h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 600;
}
.modal-head .icon {
  color: var(--t-muted);
}
.modal-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--h-ctrl);
  height: var(--h-ctrl);
  color: var(--t-muted);
  background: transparent;
  border: 0;
  border-radius: var(--r-sm);
  cursor: pointer;
}
.modal-x:hover {
  color: var(--t-strong);
  background: var(--c-active);
}

.modal-body {
  padding: var(--s-4);
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-4);
  border-top: 1px solid var(--c-line);
}

/* 弹窗打开时锁滚动，遮罩后面不许跟着晃 */
:global(body.has-modal) {
  overflow: hidden;
}
</style>

