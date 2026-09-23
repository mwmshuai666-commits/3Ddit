/** ECharts 无数据时的居中占位文案 */
export const EMPTY_CHART_GRAPHIC = {
  type: 'text',
  left: 'center',
  top: 'middle',
  z: 100,
  style: {
    text: '暂无数据',
    fontSize: 16,
    fill: 'rgba(168, 184, 200, 0.7)',
    textAlign: 'center',
  },
  silent: true,
}

export function isChartDataEmpty(xData) {
  return !Array.isArray(xData) || xData.length === 0
}

/** 无数据时保留坐标轴骨架，避免整块空白 */
export function getPlaceholderAxis(count = 6) {
  return Array.from({ length: count }, () => '--')
}
