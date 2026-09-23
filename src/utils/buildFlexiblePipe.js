import { Vector3 } from "@babylonjs/core";

/**
 * 构建带圆角的路径采样点（Babylon 版）
 *
 * 思路与 three 版一致：遍历每个中间拐点，按圆角半径在两条边上退回切点，
 * 在拐点处插入一段圆弧（按 arcSegments 采样为若干点），其余用直线连接。
 * 最终返回一串 Vector3，可直接交给 MeshBuilder.CreateTube 的 path。
 *
 * @param {Vector3[]} points     顶点数组（至少 2 个）
 * @param {number}    radius     目标圆角半径
 * @param {number}    arcSegments 每段圆弧的采样分段数（越大越圆滑）
 * @returns {Vector3[]} 采样后的路径点
 */
export function buildRoundedPath(points, radius, arcSegments = 16) {
  const EPS = 1e-6;
  if (!points || points.length < 2) return points ? points.slice() : [];

  const result = [points[0].clone()];

  const pushPoint = (p) => {
    const last = result[result.length - 1];
    // 避免重复点
    if (!last || Vector3.DistanceSquared(last, p) > 1e-10) {
      result.push(p.clone());
    }
  };

  for (let i = 1; i < points.length - 1; i++) {
    const pPrev = points[i - 1];
    const pCurr = points[i];
    const pNext = points[i + 1];

    const v1 = pPrev.subtract(pCurr); // 拐点 -> 前点
    const v2 = pNext.subtract(pCurr); // 拐点 -> 后点
    const l1 = v1.length();
    const l2 = v2.length();

    if (l1 < EPS || l2 < EPS) {
      pushPoint(pCurr);
      continue;
    }

    const u1 = v1.normalizeToNew();
    const u2 = v2.normalizeToNew();

    const cosPhi = Math.max(-1, Math.min(1, Vector3.Dot(u1, u2)));
    const phi = Math.acos(cosPhi);

    // 几乎共线，无需圆角
    if (phi < 1e-4) {
      pushPoint(pCurr);
      continue;
    }

    // 沿两条边退回的长度
    const tDesired = radius / Math.tan(phi / 2);
    const tMax = Math.min(l1, l2) - 1e-6;
    const t = Math.min(tDesired, Math.max(0, tMax));

    if (t <= 1e-6) {
      pushPoint(pCurr);
      continue;
    }

    const actualR = t * Math.tan(phi / 2);

    // 角平分线方向，定位圆心
    const bis = u1.add(u2);
    if (bis.length() < 1e-6) {
      pushPoint(pCurr);
      continue;
    }
    const bisNorm = bis.normalizeToNew();
    const centerDist = actualR / Math.sin(phi / 2);
    const center = pCurr.add(bisNorm.scale(centerDist));

    // 两个切点
    const pA = pCurr.add(u1.scale(t)); // 前段切点
    const pB = pCurr.add(u2.scale(t)); // 后段切点

    // 局部坐标系：xAxis 指向 pA - center
    const vStart = pA.subtract(center);
    const xAxis = vStart.normalizeToNew();

    // 平面法向量
    const planeNormal = Vector3.Cross(v1, v2);
    if (planeNormal.length() < 1e-7) {
      pushPoint(pCurr);
      continue;
    }
    const yAxis = Vector3.Cross(planeNormal.normalizeToNew(), xAxis).normalize();

    // 起止角度
    const startAngle = Math.atan2(Vector3.Dot(vStart, yAxis), Vector3.Dot(vStart, xAxis));
    const vEnd = pB.subtract(center);
    const endAngle = Math.atan2(Vector3.Dot(vEnd, yAxis), Vector3.Dot(vEnd, xAxis));

    // 取短弧，把 delta 收敛到 (-PI, PI]
    let delta = endAngle - startAngle;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;

    // 先把上一段直线连到 pA
    pushPoint(pA);

    // 圆弧采样
    const segs = Math.max(2, arcSegments);
    for (let s = 1; s <= segs; s++) {
      const a = startAngle + delta * (s / segs);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const p = center
        .add(xAxis.scale(cos * actualR))
        .add(yAxis.scale(sin * actualR));
      pushPoint(p);
    }
  }

  // 连接到末点
  pushPoint(points[points.length - 1]);

  return result;
}

/**
 * 沿折线弧长均匀重采样
 *
 * 适用于已经倒好圆角的折线（直线 + 圆弧）：直接按弧长线性插值，
 * 既能保证 Tube 有足够分段、又不会像 CatmullRom 那样在拐角过冲/鼓包。
 *
 * @param {Vector3[]} points  输入折线点（至少 2 个）
 * @param {number}    count   目标采样点数（>=2）
 * @returns {Vector3[]} 均匀分布的采样点
 */
export function resampleByLength(points, count) {
  if (!points || points.length < 2) return points ? points.slice() : [];
  const n = Math.max(2, Math.floor(count));

  // 累积弧长
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Vector3.Distance(points[i - 1], points[i]));
  }
  const total = cum[cum.length - 1];
  if (total < 1e-9) return [points[0].clone(), points[points.length - 1].clone()];

  const out = [];
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const target = (total * i) / (n - 1);
    while (seg < points.length - 2 && cum[seg + 1] < target) seg++;
    const segLen = cum[seg + 1] - cum[seg];
    const f = segLen > 1e-9 ? (target - cum[seg]) / segLen : 0;
    out.push(Vector3.Lerp(points[seg], points[seg + 1], f));
  }
  return out;
}