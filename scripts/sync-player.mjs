/**
 * 把播放器库（../babylon-scene-player）构建出的「单文件播放器包」拷进编辑器。
 *
 * 编辑器的「导出单文件 HTML」会把这份产物原样内联进 HTML，所以它必须存在。
 * 拷贝到 public/player/ 而不是 src/，是为了让导出时代码能用 fetch 直接取到文本
 * （放到 src 里会被打包器当模块处理，8MB 的字符串 import 会让 dev 启动变慢）。
 *
 * 用法：
 *   npm run sync:player      # 手动同步
 *   npm run dev / build      # 会自动先跑一次（predev / prebuild）
 *
 * 改了 ../babylon-scene-player 的源码后，先在那边 npm run build，再跑本脚本。
 */
import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

const SRC = resolve(here('.'), '../../babylon-scene-player/dist/standalone.iife.js')
const DEST = resolve(here('.'), '../public/player/standalone.iife.js')

if (!existsSync(SRC)) {
  console.warn(
    `[sync-player] 没找到 ${SRC}\n` +
      '  先到 ../babylon-scene-player 里执行：npm install && npm run build\n' +
      '  （编辑器仍可正常编辑场景，只是「导出单文件 HTML」暂时不可用）',
  )
  process.exit(0) // 不阻断 dev / build：编辑功能和这个包没关系
}

mkdirSync(dirname(DEST), { recursive: true })
copyFileSync(SRC, DEST)
const mb = (statSync(DEST).size / 1024 / 1024).toFixed(2)
console.log(`[sync-player] 已同步播放器包 → public/player/standalone.iife.js（${mb} MB）`)
