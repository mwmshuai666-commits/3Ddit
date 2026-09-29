/**
 * 数据绑定求值器（纯函数；播放器侧为同文件副本，两边语义必须逐行一致）
 *
 * 绑定模型（doc.nodes[].bindings[]，见 sceneSchema.js）：
 *   { key, source, field, map, ...map 专属字段 }
 *     key    —— 目标字段：'color' | 'casingOpacity' | 'repeat' | 'particles' |
 *               'direction' | 'visible' | 'transform.*' 等「look 级」字段
 *     source —— doc.sources[].id
 *     field  —— payload 取值路径（'data.value' 形式，见 pickPath）
 *     map    —— 'direct' 透传 | 'linear' 区间线性映射 | 'threshold' 阈值阶梯
 *
 * 三条红线（往后再加字段也先读这儿）：
 *   1. 求值结果只注入引擎做运行时热更，永不写回 node.props；
 *   2. 永不驱动几何字段（管道 points / radius / radialSegments / tubeSegments …）——
 *      数据一跳就重建几何等于卡死，这类字段只能人工配置；
 *   3. 同源同绑定连续求值结果相同应短路，别把引擎刷成每帧重绘。
 */

/** payload 取嵌套字段：pickPath({data:{list:[1]}}, 'data.list') → [1] */
export function pickPath(payload, path) {
  if (!path) return payload
  let cur = payload
  for (const seg of String(path).split('.')) {
    if (cur == null) return undefined
    cur = cur[seg]
  }
  return cur
}

const num = (v) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : NaN)

/**
 * threshold：stops 按 at 升序，取最后一个「值 >= at」的 out。
 * 低于首档时用 below（binding.below）——显隐场景「值 < 5 就隐藏」靠它；
 * below 没给就返回 undefined（调用方保持上一次的注入，不改场景）。
 */
export function thresholdOut(stops, value, below) {
  if (!Array.isArray(stops) || !stops.length) return undefined
  const sorted = [...stops].sort((a, b) => num(a.at) - num(b.at))
  const v = num(value)
  if (!Number.isFinite(v)) return below
  let hit = false
  let out = below
  for (const s of sorted) {
    if (v >= num(s.at)) {
      out = s.out
      hit = true
    } else break
  }
  return hit ? out : below
}

/** linear：in:[a,b] → out:[c,d]，区间外钳位 */
export function linearMap(value, inRange, outRange) {
  const v = num(value)
  const [a, b] = (inRange || []).map(num)
  const [c, d] = (outRange || []).map(num)
  if (!Number.isFinite(v) || !Number.isFinite(a) || !Number.isFinite(b)) return undefined
  if (a === b) return c
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return c + (d - c) * t
}

/**
 * 目标字段的规整：数据五花八门，引擎入口只吃固定形状。
 *   direction → -1 / 1（0 视作正流；管道方向 = 光带滚动方向取反）
 *   visible   → 0 / 1
 *   particles → 布尔
 *   color     → 必须是 #rgb/#rrggbb/#rrggbbaa，否则当无效（返回 null，保持上一次注入）
 *   其余数字 → 保持数字
 */
const COLOR_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function normalizeKeyValue(key, value) {
  if (value == null) return null
  switch (key) {
    case 'direction': {
      const v = num(value)
      if (!Number.isFinite(v)) return null
      return v < 0 ? -1 : 1
    }
    case 'visible':
      return Number(value) ? 1 : 0
    case 'particles':
      return !!value
    case 'color': {
      // 数据里直接给色值的场景；路径填错拿到整个对象时这里拦掉，
      // 否则 FromHexString 会在引擎里抛异常，把整轮 applyBindings 带崩
      const s = typeof value === 'string' ? value.trim() : ''
      return COLOR_RE.test(s) ? s : null
    }
    default: {
      const v = num(value)
      return Number.isFinite(v) && typeof value !== 'string' ? v : value
    }
  }
}

/**
 * 求值单条绑定。
 * @returns {{key:string, value:*}|null} 源没数据 / 值无效时返回 null（调用方保持上一次的注入）
 */
export function evaluateBinding(binding, sourceValues = {}) {
  if (!binding?.key || !binding.source) return null
  const payload = sourceValues[binding.source]
  if (payload == null) return null
  const raw = pickPath(payload, binding.field)
  if (raw == null || Number.isNaN(raw)) return null

  let mapped
  if (binding.map === 'linear') mapped = linearMap(raw, binding.in, binding.out)
  else if (binding.map === 'threshold') mapped = thresholdOut(binding.stops, raw, binding.below)
  else mapped = raw // direct

  const value = normalizeKeyValue(binding.key, mapped)
  return value == null ? null : { key: binding.key, value }
}

/**
 * 求值一个节点的全部绑定，合并成一份 patch（同 key 绑多条时后者胜）。
 * @returns {{key:*}} patch；没有绑定或源都没数据时返回 {}
 */
export function evaluateNode(node, sourceValues = {}) {
  const patch = {}
  for (const b of node?.bindings || []) {
    const hit = evaluateBinding(b, sourceValues)
    if (hit) patch[hit.key] = hit.value
  }
  return patch
}
