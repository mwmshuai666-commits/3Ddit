import {
  Texture,
  VertexBuffer,
  PBRMaterial,
  StandardMaterial,
} from "@babylonjs/core";
export function rawUV2Lightmap(mesh, scene, url) {
  if (!mesh || !mesh.material) return;

  const hasUV2 = mesh.isVerticesDataPresent(VertexBuffer.UV2Kind);

  const tex = new Texture(url, scene, false, false);

  tex.coordinatesIndex = 1;
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;

  // 先试 false
  tex.gammaSpace = false;

  const mat = mesh.material;

  mat.lightmapTexture = tex;
  mat.useLightmapAsShadowmap = true;

  mat.markAsDirty?.();
}