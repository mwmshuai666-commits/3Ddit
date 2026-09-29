/**
 * 内联 SVG 图标表。
 *
 * 为什么不用 unicode 字形（☀ ⬢ ⚡ ✦ ⌘ ▣ ▾ ▸ × ↑ ⬆ ＋ ✕ ◍ « »）：
 *   字形靠运气 —— 描边粗细、基线、是否渲染成 emoji 表情，全看系统字体栈。
 *   同一份代码在 Windows / Mac / Linux 上不是同一个东西，而且和文字混排时
 *   对不齐。SVG 用 currentColor 跟字色走，24×24 视框等比缩放，跨平台一致。
 *
 * 约定：24×24 viewBox、fill="none"、stroke="currentColor"、stroke-width=1.6、
 * 圆头圆角（见 Icon.vue）。新图标照这个写，别混 fill/stroke 两种风格。
 *
 * 命名按「节点类型」和「通用操作」分开：前 7 个对应 kind，其余是界面操作。
 */

export const ICONS = {
  /* ---- 节点类型（与 sceneSchema 的 kind 对齐，直接 :name="node.kind"） ---- */
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  box: '<path d="M21 8.5 12 13 3 8.5"/><path d="M3 8.5v7L12 20l9-4.5v-7L12 4 3 8.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
  pipe: '<path d="M3 8c4 0 4 8 8 8s4-8 8-8"/><path d="M3 16c4 0 4-8 8-8s4 8 8 8"/>',
  sparkles:
    '<path d="M11 3.5l1.6 4.6 4.6 1.6-4.6 1.6L11 15.9l-1.6-4.6L4.8 9.7l4.6-1.6L11 3.5Z"/><path d="M18 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
  cube: '<path d="M12 2.8 20.5 7.4v9.2L12 21.2 3.5 16.6V7.4L12 2.8Z"/><path d="M3.5 7.4 12 12l8.5-4.6M12 12v9.2"/>',
  code: '<path d="m9 8-5 4 5 4M15 8l5 4-5 4"/>',
  tree: '<rect x="3" y="3.5" width="7" height="6" rx="1.5"/><rect x="14" y="14.5" width="7" height="6" rx="1.5"/><path d="M6.5 9.5v4.5a2 2 0 0 0 2 2h5.5"/>',

  /* ---- 环境 ---- */
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/>',

  /* ---- 折叠 / 展开 ---- */
  chevron: '<path d="m6 9.5 6 6 6-6"/>',
  caretRight: '<path d="m9.5 6 6 6-6 6"/>',
  caretLeft: '<path d="m15 6-6 6 6 6"/>',
  panelLeft: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M9.5 4.5v15"/>',
  panelRight: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M14.5 4.5v15"/>',

  /* ---- 顶栏 / 侧栏 ---- */
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-8.5Z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  stack:
    '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5"/><path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5"/>',
  sliders: '<path d="M4 7.5h16M4 16.5h16"/><circle cx="9" cy="7.5" r="2.2"/><circle cx="15" cy="16.5" r="2.2"/>',
  camera:
    '<path d="M4 8.5h3.2L8.7 6.5h6.6l1.5 2H20a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.2" r="3.2"/>',
  tag: '<path d="M12.6 3.5H20v7.4l-8.6 8.6a1.5 1.5 0 0 1-2.1 0l-5.3-5.3a1.5 1.5 0 0 1 0-2.1L12.6 3.5Z"/><circle cx="16.4" cy="7.6" r="1.2"/>',
  bell: '<path d="M18 8.6a6 6 0 1 0-12 0c0 5-2 6.4-2 6.4h16s-2-1.4-2-6.4Z"/><path d="M10.2 19a2 2 0 0 0 3.6 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.4a2.6 2.6 0 1 1 3.9 2.5c-.85.5-1.4 1-1.4 2"/><path d="M12 17.2h.01"/>',

  /* ---- 文件 / 资源操作 ---- */
  upload:
    '<path d="M12 16V4"/><path d="m8 8 4-4 4 4"/><path d="M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
  download:
    '<path d="M12 4v12"/><path d="m8 12 4 4 4-4"/><path d="M4 16v3.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V16"/>',
  trash:
    '<path d="M4 7h16"/><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M10 11v6M14 11v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  file: '<path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V8l-4-4.5Z"/><path d="M14 3.5V8h4.5"/>',
  folder:
    '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h3.6l2 2h7.4A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-10Z"/>',
  image:
    '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.8" cy="9.6" r="1.6"/><path d="m4 17.5 4.6-4.6 3.4 3.4 3.2-3.2 4.8 4.8"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  alert: '<path d="M12 4 3 19.5h18L12 4Z"/><path d="M12 10v4.5M12 17.2h.01"/>',

  /* ---- 工具栏 ---- */
  save: '<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  move: '<path d="M12 3v18M3 12h18"/><path d="m12 3 2.5 2.5M12 3 9.5 5.5M12 21l2.5-2.5M12 21 9.5 18.5M3 12l2.5 2.5M3 12l2.5-2.5M21 12l-2.5 2.5M21 12l-2.5-2.5"/>',
  rotate: '<path d="M20.5 12a8.5 8.5 0 1 1-2.5-6"/><path d="M20.5 4v4h-4"/>',
  scale: '<path d="M4.5 19.5 19.5 4.5"/><path d="M14 4.5h5.5V10"/><path d="M10 13.5V19.5H4.5"/>',
  crosshair:
    '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v4.5M12 17.5V22M2 12h4.5M17.5 12H22"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',

  /* ---- 登录 / 用户 ---- */
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  logIn: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="m10 8 4 4-4 4M14 12H3"/>',
  logOut: '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13a1.5 1.5 0 0 0 1.5 1.5H9"/><path d="m14 8 4 4-4 4M18 12H10"/>',
}

/**
 * 场景目录的 icon 字段是 unicode 数据（会进导出的 scene.json，不能改旧值），
 * 渲染时映射到上表的 key。映射不到就退回 sparkles（特效类）。
 */
const UNICODE_TO_ICON = {
  '⚡': 'pipe',
  '≈': 'sparkles',
  '≋': 'sparkles',
  '➤': 'sparkles',
  '▧': 'sparkles',
  '☂': 'sparkles',
  '❋': 'sparkles',
  '☀': 'sun',
  '⬢': 'cube',
  '⌘': 'code',
  '▣': 'box',
}

/** 目录项 → 图标名。kind 命中直接用 kind，否则查 unicode 映射 */
export function iconOf(kindOrGlyph) {
  if (!kindOrGlyph) return 'box'
  if (ICONS[kindOrGlyph]) return kindOrGlyph
  return UNICODE_TO_ICON[kindOrGlyph] || 'box'
}
