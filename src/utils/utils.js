/**
 * 计算一组点的中心点，并返回每个点相对中心点的偏移坐标。
 *
 * 用途：围墙/波纹这类共面网格若直接用世界坐标建顶点，
 * 会因数值过大产生深度抖动闪烁。改为把 mesh 放到中心点、
 * 顶点使用相对偏移，可规避该问题。
 *
 * @param {Array<{x:number,y:number}>} positionSrc 原始点（平面 x/y）
 * @returns {{centerPoint:{x:number,y:number}, points:Array<{x:number,y:number}>}}
 */
export function getcenterPoint(positionSrc = []) {
  const n = positionSrc.length || 1;
  let sx = 0;
  let sy = 0;
  positionSrc.forEach((p) => {
    sx += p.x;
    sy += p.y;
  });
  const centerPoint = { x: sx / n, y: sy / n };
  const points = positionSrc.map((p) => ({
    x: p.x - centerPoint.x,
    y: p.y - centerPoint.y,
  }));
  return { centerPoint, points };
}