<script setup>
import { ref } from 'vue'
import {
  GROUND_CATALOG,
  PRIMITIVE_CATALOG,
  LIGHT_CATALOG,
  EFFECT_SECTION,
} from '../schema/sceneSchema'
import {
  editor,
  assetLib,
  addFromCatalog,
  setGroundType,
  uploadAsset,
  addModelInstance,
  deleteAsset,
} from '../store/editor'

const fileInput = ref(null)
const uploading = ref(false)

async function onFilePicked(evt) {
  const file = evt.target.files?.[0]
  evt.target.value = '' // 允许重复选同一个文件
  if (!file) return
  uploading.value = true
  try {
    await uploadAsset(file)
  } finally {
    uploading.value = false
  }
}

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <div class="library">
    <section class="lib-section">
      <h3>① 场景底板 <span>· 整场景唯一</span></h3>
      <div class="ground-list">
        <button
          v-for="g in GROUND_CATALOG"
          :key="g.type"
          class="ground-item"
          :class="{ active: editor.doc.scene.ground.type === g.type }"
          @click="setGroundType(g.type)"
        >
          <span class="ground-swatch" :class="`sw-${g.type}`"></span>
          <span class="ground-text">
            <strong>{{ g.name }}</strong>
            <em>{{ g.desc }}</em>
          </span>
        </button>
      </div>
    </section>

    <section class="lib-section">
      <h3>② 基础几何体 <span>· 点击添加到场景</span></h3>
      <div class="item-grid">
        <button
          v-for="p in PRIMITIVE_CATALOG"
          :key="p.type"
          class="lib-item"
          @click="addFromCatalog('primitive', p)"
        >
          <span class="lib-icon">{{ p.name.slice(0, 1) }}</span>
          {{ p.name }}
        </button>
      </div>
    </section>

    <section class="lib-section">
      <h3>③ 灯光 <span>· 点击添加，旋转控制照射方向</span></h3>
      <div class="item-grid">
        <button
          v-for="l in LIGHT_CATALOG"
          :key="l.type"
          class="lib-item"
          @click="addFromCatalog('light', l)"
        >
          <span class="lib-icon light">☀</span>
          {{ l.name }}
        </button>
      </div>
    </section>

    <section class="lib-section">
      <h3>④ 特效组件 <span>· 能量管道 / 飞线 / 波纹墙 / 天气效果</span></h3>
      <div class="item-grid">
        <button
          v-for="d in EFFECT_SECTION"
          :key="d.type"
          class="lib-item"
          :title="d.desc"
          @click="addFromCatalog(d.kind, d)"
        >
          <span class="lib-icon" :class="d.kind">{{ d.icon }}</span>
          {{ d.name }}
        </button>
      </div>
    </section>

    <section class="lib-section">
      <h3>⑤ 行业模型 <span>· glb 素材，点击复用</span></h3>
      <input
        ref="fileInput"
        type="file"
        accept=".glb,model/gltf-binary"
        hidden
        @change="onFilePicked"
      />
      <button class="upload-btn" :disabled="uploading" @click="fileInput.click()">
        {{ uploading ? '加载中…' : '⬆ 上传 GLB（自动放入场景）' }}
      </button>

      <div v-if="assetLib.length" class="asset-list">
        <button
          v-for="a in assetLib"
          :key="a.id"
          class="asset-item"
          title="点击添加到场景"
          @click="addModelInstance(a.id)"
        >
          <span class="asset-icon">⬢</span>
          <span class="asset-meta">
            <strong>{{ a.name }}</strong>
            <em>{{ fmtSize(a.size) }}</em>
          </span>
          <span
            class="asset-del"
            title="从素材库删除"
            @click.stop="deleteAsset(a.id)"
          >×</span>
        </button>
      </div>
      <div v-else class="asset-empty">
        还没有模型素材，上传一个 .glb 开始
      </div>
    </section>
  </div>
</template>

<style scoped>
.library {
  padding: 10px;
  overflow-y: auto;
}
.lib-section {
  margin-bottom: 16px;
}
.lib-section h3 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  color: #8b98b0;
}
.lib-section h3 span {
  font-weight: 400;
  color: #55617a;
}
.ground-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ground-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 9px;
  background: #151b28;
  border: 1px solid #262f42;
  border-radius: 7px;
  cursor: pointer;
  text-align: left;
}
.ground-item:hover {
  border-color: #3d8bff;
}
.ground-item.active {
  border-color: #3d8bff;
  background: #13274a;
}
.ground-swatch {
  width: 26px;
  height: 26px;
  border-radius: 5px;
  flex-shrink: 0;
  border: 1px solid #31405a;
}
.sw-grid {
  background-color: #0a1730;
  background-image:
    linear-gradient(#1e6bff 1px, transparent 1px),
    linear-gradient(90deg, #1e6bff 1px, transparent 1px);
  background-size: 9px 9px;
}
.sw-solid {
  background: #1c2635;
}
.sw-serverRoom {
  background-color: #20262f;
  background-image:
    linear-gradient(#4a5870 1.5px, transparent 1.5px),
    linear-gradient(90deg, #4a5870 1.5px, transparent 1.5px);
  background-size: 11px 11px;
}
.sw-digital {
  background-color: #041018;
  background-image:
    radial-gradient(circle at 50% 50%, rgba(0, 229, 255, 0.9) 0, rgba(0, 229, 255, 0.15) 45%, transparent 60%),
    repeating-radial-gradient(circle at 50% 50%, rgba(0, 229, 255, 0.55) 0 1px, transparent 1px 5px);
}
.ground-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ground-text strong {
  font-size: 12px;
  color: #d4dceb;
  font-weight: 600;
}
.ground-text em {
  font-size: 11px;
  color: #66748e;
  font-style: normal;
}
.item-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.lib-item {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 9px;
  font-size: 12px;
  color: #c6d0e0;
  background: #151b28;
  border: 1px solid #262f42;
  border-radius: 7px;
  cursor: pointer;
}
.lib-item:hover {
  border-color: #3d8bff;
  color: #fff;
}
.lib-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 11px;
  color: #8fc0ff;
  background: #1d2c47;
  border-radius: 4px;
}
.lib-icon.light {
  color: #e8c46a;
  background: #3a3220;
}
.lib-icon.pipe {
  color: #4fd8ff;
  background: #10314a;
}
.lib-icon.effect {
  color: #b48cff;
  background: #2a1f45;
}
.upload-btn {
  width: 100%;
  height: 34px;
  margin-bottom: 8px;
  font-size: 12px;
  color: #9ecbff;
  background: #13274a;
  border: 1px dashed #3d6fb5;
  border-radius: 7px;
  cursor: pointer;
}
.upload-btn:hover:not(:disabled) {
  border-color: #5a9bff;
  background: #163156;
}
.upload-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.asset-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.asset-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  background: #151b28;
  border: 1px solid #262f42;
  border-radius: 7px;
  cursor: pointer;
  text-align: left;
}
.asset-item:hover {
  border-color: #3d8bff;
}
.asset-icon {
  font-size: 16px;
  color: #7bd4a6;
  flex-shrink: 0;
}
.asset-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.asset-meta strong {
  font-size: 12px;
  font-weight: 500;
  color: #d4dceb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asset-meta em {
  font-size: 10px;
  color: #66748e;
  font-style: normal;
}
.asset-del {
  display: none;
  color: #8293ad;
  font-size: 14px;
  padding: 0 2px;
}
.asset-item:hover .asset-del {
  display: inline;
}
.asset-del:hover {
  color: #ff6b6b;
}
.asset-empty {
  font-size: 11px;
  color: #55617a;
  text-align: center;
  padding: 10px 0 4px;
}
</style>
