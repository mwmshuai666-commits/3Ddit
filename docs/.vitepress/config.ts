import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '3Dbabyloncode',
  description: '数字孪生场景编辑器 · 文档站',
  // 部署到 GitHub Pages 项目站点 https://mwmshuai666-commits.github.io/3Ddit/
  base: '/3Ddit/',
  cleanUrls: true,
  lastUpdated: true,

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/quickstart' },
      { text: '指南', link: '/architecture' },
      { text: 'FAQ', link: '/faq' },
      {
        text: 'GitHub',
        link: 'https://github.com/mwmshuai666-commits/3Ddit'
      }
    ],

    sidebar: [
      {
        text: '指南',
        items: [
          { text: '文档总览', link: '/' },
          { text: '快速开始', link: '/quickstart' },
          { text: '架构总览', link: '/architecture' },
          { text: '场景文档协议', link: '/protocol' },
          { text: 'FAQ', link: '/faq' }
        ]
      },
      {
        text: '编辑器',
        items: [
          { text: '编辑器总览', link: '/editor/' },
          { text: '功能详解', link: '/editor/features' },
          { text: '节点交互', link: '/editor/interactions' }
        ]
      },
      {
        text: '播放包',
        items: [
          { text: '播放包总览', link: '/player/' },
          { text: '接入详解', link: '/player/integration' },
          { text: 'API 参考', link: '/player/api' }
        ]
      },
      {
        text: '数据接入',
        items: [
          { text: '数据绑定手册', link: '/binding-manual' }
        ]
      }
    ],

    // 明暗主题切换（VitePress 内置，默认开启）
    darkModeSwitchLabel: '主题',
    returnToTopLabel: '返回顶部',
    lastUpdated: {
      text: '最后更新于'
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    },
    outline: {
      level: [2, 3],
      label: '本页目录'
    },

    // 本地全文搜索
    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            noResultsText: '未找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换',
              closeText: '关闭'
            }
          }
        }
      }
    }
  }
})
