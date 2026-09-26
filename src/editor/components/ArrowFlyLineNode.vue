<template>
  <!-- 纯命令式组件，无 DOM 渲染 -->
</template>

<script setup>
/**
 * 贝塞尔飞线 —— babylon-datav/components/ArrowFlyLine 的本地修正版
 *
 * 为什么要 fork：原版改不了颜色。链路是这样的：
 *
 *   1) 原版把 `material.emissiveTexture = texture` 设成了一张几乎纯白的彗尾贴图。
 *      标准材质的片元着色器里 emissiveColor 是「相加」：
 *          emissiveColor = vEmissiveColor + 贴图.rgb * level
 *      贴图 rgb 恒为 1，于是不管你选什么颜色都会被这条白加饱和掉，base 恒等于白色。
 *   2) 原版又用 GreasedLinePluginMaterial 的 colorMode = COLOR_MODE_MULTIPLY，
 *      并把首次创建时的颜色烤进了 uniform `grl_singleColor`：
 *          grlFinalColor.rgb *= grl_singleColor
 *   3) 原版的 color watch 只改 material.emissiveColor / diffuseColor —— 而这两个值
 *      在第 1 步就已经被白色贴图淹掉了，真正被乘上去的 grl_singleColor 没人更新。
 *
 * 三者叠起来的净效果：最终颜色 ≈ 白 × 首次创建时的颜色，改颜色完全没反应。
 * （FlexiblePipe / StreamLine 不设 emissiveTexture，所以没这个问题，只有飞线中招。）
 *
 * 本版本的改法：
 *   - emissiveTexture 整个去掉，只用 opacityTexture 承担彗尾的形状 / 流动 / 透明度，
 *     不再往颜色里加白色，选的颜色就是最终颜色；
 *   - colorMode 用 COLOR_MODE_SET（用 grl_singleColor 覆盖，而不是相乘），
 *     颜色只由一处决定，不会因为两处颜色相乘而变暗；
 *   - 改颜色时同步更新 GreasedLine 插件烤进去的 grl_singleColor
 *     （`line.greasedLineMaterial.color`）—— 这才是真正决定最终颜色的那个值。
 */
import { onMounted, onBeforeUnmount, watch } from "vue";
import { Vector3, Color3, Curve3, Texture, Engine, CreateGreasedLine, GreasedLineMeshMaterialType, GreasedLineMeshColorMode } from "@babylonjs/core";

const props = defineProps({
  scene: { type: Object, required: true },
  linePoints: { type: Array, default: () => [[500, 0, 500], [0, 0, 0]] },
  speed: { type: Number, default: 0.01 },
  color: { type: String, default: "#ffffff" },
  opacity: { type: Number, default: 1 },
  height: { type: Number, default: 330 },
  lineWidth: { type: Number, default: 40 },
  textureUrl: { type: String, default: "/static/textures/flyLine5.png" },
  tubularSegments: { type: Number, default: 100 },
  repeat: { type: Number, default: 1 },
});

let line = null;
let material = null;
let texture = null;
let renderObserver = null;
let uOffset = 0;

function toColor3(c) {
  if (typeof c === "string" && c.startsWith("0x")) return Color3.FromHexString("#" + c.slice(2));
  if (typeof c === "string" && c.startsWith("#")) return Color3.FromHexString(c);
  return Color3.FromHexString("#ffffff");
}

function resolvePath() {
  const p0 = props.linePoints[0];
  const p1 = props.linePoints[1];
  const vX = (p1[0] + p0[0]) / 2;
  const vZ = (p1[2] + p0[2]) / 2;
  const curve = Curve3.CreateCubicBezier(
    new Vector3(p0[0], p0[1], p0[2]),
    new Vector3(vX, props.height, vZ),
    new Vector3(vX, props.height, vZ),
    new Vector3(p1[0], p1[1], p1[2]),
    props.tubularSegments,
  );
  return curve.getPoints();
}

function ensureTexture() {
  if (texture) return;
  texture = new Texture(props.textureUrl, props.scene);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = props.repeat;
  texture.vScale = 1;
  texture.hasAlpha = true;
}

/** 三处颜色一起改；缺了 grl_singleColor 那一处，面板上改颜色就是不生效 */
function applyColor(color) {
  if (!material) return;
  const col = toColor3(color);
  material.emissiveColor = col;
  material.diffuseColor = col;
  // GreasedLine 插件把颜色烤进 uniform 了，必须显式同步过去
  if (line?.greasedLineMaterial) line.greasedLineMaterial.color = col;
}

function buildLine() {
  const points = resolvePath();
  ensureTexture();
  if (line) { line.dispose(); line = null; }

  line = CreateGreasedLine("arrowFlyLine", { points, widths: undefined }, {
    width: props.lineWidth,
    sizeAttenuation: false,
    materialType: GreasedLineMeshMaterialType.MATERIAL_TYPE_STANDARD,
    color: toColor3(props.color),
    // SET 而不是 MULTIPLY：用 grl_singleColor 覆盖最终颜色，两处颜色相乘会互相压暗
    colorMode: GreasedLineMeshColorMode.COLOR_MODE_SET,
  }, props.scene);

  material = line.material;
  // 彗尾贴图只当透明度/形状用。设成 emissiveTexture 会往颜色里加一片白，
  // 把选的颜色直接饱和掉（见文件头注释），所以这里不设。
  material.opacityTexture = texture;
  material.disableLighting = true;
  material.useAlphaFromDiffuseTexture = false;
  material.alpha = props.opacity;
  material.alphaMode = Engine.ALPHA_ADD;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  applyColor(props.color);

  line.renderingGroupId = 3;
  line.isPickable = false;
}

onMounted(() => {
  buildLine();
  renderObserver = props.scene.onBeforeRenderObservable.add(() => {
    if (!texture) return;
    uOffset -= props.speed;
    texture.uOffset = uOffset;
  });
});

watch(() => [props.linePoints, props.height, props.lineWidth, props.tubularSegments],
  () => { buildLine(); }, { deep: true });
watch(() => props.color, (c) => applyColor(c));
watch(() => props.opacity, (v) => { if (material) material.alpha = v; });
watch(() => props.repeat, (v) => { if (texture) texture.uScale = v; });

onBeforeUnmount(() => {
  if (renderObserver) { props.scene.onBeforeRenderObservable.remove(renderObserver); renderObserver = null; }
  texture?.dispose();
  material?.dispose();
  line?.dispose();
  texture = material = line = null;
});
</script>
