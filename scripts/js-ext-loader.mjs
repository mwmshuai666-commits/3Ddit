/**
 * Node ESM 测试钩子（只给 scripts/ 下的无头回归用，不碰源码）：
 *  1. resolve：给无后缀的相对 import 补 .js（源码是 Vite 风格）
 *  2. load：把 Vite 专属的 import.meta.env.BASE_URL 换成字面量 '/'
 */
const VITE_ENV_RE = /import\.meta\.env\.BASE_URL/g

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (err) {
    // 两种无后缀路径都补 .js：相对 import（源码 Vite 风格）和 Babylon 子路径
    // （@babylonjs/core/Maths/math.vector 这类，文件名自己带点，白名单判断）
    const KNOWN_EXT = /\.(js|mjs|json|css|html)$/i
    const needsExt = (specifier.startsWith('.') || specifier.startsWith('@babylonjs/'))
      && !KNOWN_EXT.test(specifier)
    if (needsExt) {
      return next(`${specifier}.js`, context)
    }
    throw err
  }
}

export async function load(url, context, next) {
  const result = await next(url, context)
  if (!url.includes('/src/editor/export/')) return result
  // Node 22 的 source 可能是 Buffer，先解码再替换
  let source = result.source
  if (source && typeof source !== 'string') source = Buffer.from(source).toString('utf8')
  if (typeof source === 'string') {
    return { ...result, source: source.replace(VITE_ENV_RE, "'/'") }
  }
  return result
}
