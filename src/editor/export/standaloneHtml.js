/**
 * 单文件 HTML 导出
 *
 * 产物：一个 .html，双击就能看，也可以 <iframe> 进任何技术栈的项目。
 * 里面内嵌三样东西：
 *   1. 播放器全局包（babylon-scene-player 的 standalone 构建，Babylon 已打进去）
 *   2. 场景 JSON（模型 base64）
 *   3. 环境 HDR 等素材（base64，embedded 模式）
 * 数字地板四张贴图不用管 —— 库自己就内置了一份（src/groundTextures.js），
 * 只有从旧构建拷来的播放器包里没有，才会由调用方额外塞进 options.groundTextures。
 * 所以它不依赖网络、不依赖 node_modules、不依赖同目录的其它文件。
 *
 * 生成的页面只做「播放」：没有编辑器的 Gizmo / 场景树 / 属性面板。
 */

/** JSON 塞进 <script> 前必须转义 <，否则文档里出现 "</script>" 会提前结束脚本 */
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/**
 * @param {{doc:object, playerBundle:string, groundTextures:string[]}} parts
 * @returns {string} 完整 HTML
 */
export function buildStandaloneHtml({ doc, playerBundle, groundTextures }) {
  const nodeCount = (doc.nodes || []).length
  const assets = doc.assets || []
  const modelCount = assets.filter((a) => a.kind !== 'hdr').length
  const envCount = assets.filter((a) => a.kind === 'hdr').length
  const meta = `${nodeCount} 个节点 · ${modelCount} 个模型`
    + (envCount ? ` · ${envCount} 张环境贴图` : '')

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>数字孪生场景预览</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
        background: ${doc?.scene?.background || '#05070d'};
        overflow: hidden;
      }
      #app {
        position: fixed;
        inset: 0;
      }
      #app canvas {
        display: block;
        width: 100%;
        height: 100%;
        outline: none;
        touch-action: none;
      }
      .hud {
        position: fixed;
        left: 14px;
        bottom: 12px;
        font: 12px/1.7 system-ui, "Microsoft YaHei", sans-serif;
        color: #66748e;
        pointer-events: none;
        user-select: none;
      }
      .hud b {
        color: #9fc4ff;
        font-weight: 600;
      }
      #status {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font: 13px/1.6 system-ui, "Microsoft YaHei", sans-serif;
        color: #8fa2c0;
        background: ${doc?.scene?.background || '#05070d'};
        transition: opacity 0.4s ease;
      }
      #status.hide {
        opacity: 0;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <div id="status">正在建场景…</div>
    <div class="hud">
      <b>数字孪生场景预览</b> · ${meta}<br />
      左键旋转 · 右键平移 · 滚轮缩放
    </div>

    <!-- 播放器：babylon-scene-player 的 standalone 构建（Babylon 已内联，离线可用） -->
    <script>
${playerBundle}
    </script>

    <script>
      // 场景数据与资源（base64 内嵌，无需同目录文件）
      window.__SCENE_DOC__ = ${safeJson(doc)};
      window.__SCENE_OPTIONS__ = {${(groundTextures || []).length
        ? `\n        groundTextures: ${safeJson(groundTextures)},`
        : ''}
        onError(err) {
          console.error('[scene] 加载出错：', err);
          var s = document.getElementById('status');
          if (s) s.textContent = '部分资源加载失败，详情看控制台';
        },
      };

      (function () {
        var box = document.getElementById('status');
        var player = window.BabylonScenePlayer.mount(
          document.getElementById('app'),
          window.__SCENE_DOC__,
          window.__SCENE_OPTIONS__,
        );
        player.ready.then(
          function () {
            if (box) box.classList.add('hide');
          },
          function (err) {
            console.error('[scene] 场景初始化失败：', err);
            if (box) box.textContent = '场景初始化失败：' + (err && err.message ? err.message : err);
          },
        );
        window.__scenePlayer = player; // 控制台里可以 player.dispose() / player.scene
      })();
    </script>
  </body>
</html>
`
}

/** 完整包里 README 用：单文件 HTML 不需要任何配置（数字地板贴图已内置在播放器里） */
export const HTML_EXPORT_HINT = '数字地板贴图已由播放器内置，无需额外文件'
