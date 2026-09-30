/**
 * 相机飞行 —— 点击元素后「视角移动」的执行体。
 *
 * 语义对齐 babylon-datav 的 SceneManager.flyCameraTo（src/core/SceneManager.js）：
 * CubicEase + EASEINOUT、默认 1200ms / 60fps、结束即终值。包里的实现动画的是
 * camera.position + camera.target，但 ArcRotateCamera 每帧都会用
 * alpha/beta/radius/target 重算 position，position 动画会被当场覆盖（所以它结尾
 * 还要 setPosition + rebuildAnglesAndRadius 兜底）。这里换成动画相机真正消费的
 * 两个量：
 *   target —— TargetCamera 的访问器，setter 走 setTarget，动画 Vector3 是标准用法；
 *   radius —— ArcRotateCamera 的普通字段，相机每帧由它推导 position。
 * 两者动画完就是终值，不需要回写，也不会被覆盖。
 */

import { Animation, CubicEase, EasingFunction, Vector3 } from '@babylonjs/core'

/** 默认帧率：和 SceneManager.flyCameraTo 的 frameRate 默认值一致 */
const DEFAULT_FRAME_RATE = 60
/** 四条动画的固定名字：scene.stopAnimation 按名字停，见 stopCameraFly */
const ANIM_TARGET = 'sceneCamera_fly_target'
const ANIM_ALPHA = 'sceneCamera_fly_alpha'
const ANIM_BETA = 'sceneCamera_fly_beta'
const ANIM_RADIUS = 'sceneCamera_fly_radius'

/**
 * 相机缓动飞到目标点。
 * @param {import('@babylonjs/core').ArcRotateCamera} camera
 * @param {{target:Vector3, alpha?:number, beta?:number, radius?:number,
 *          duration?:number, frameRate?:number}} options
 *        target 必填；alpha / beta / radius 省略 = 只转视角，不拉距离、不转角度；
 *        duration 毫秒（默认 1200）。alpha 走最短旋转路径（±π 内），不会绕远。
 */
export function flyCameraTo(camera, {
  target,
  alpha,
  beta,
  radius,
  duration = 1200,
  frameRate = DEFAULT_FRAME_RATE,
}) {
  if (!camera || !target) return false

  // 已经在目标上：别为一次点击白起 1200ms 动画
  const sameTarget = Vector3.Distance(camera.target, target) < 1e-3
  const sameRadius = radius === undefined || Math.abs(camera.radius - radius) < 1e-3
  const sameAlpha = alpha === undefined || Math.abs(shortestDelta(camera.alpha, alpha)) < 1e-3
  const sameBeta = beta === undefined || Math.abs(camera.beta - beta) < 1e-3
  if (sameTarget && sameRadius && sameAlpha && sameBeta) return false

  const totalFrames = Math.max(1, Math.round((duration / 1000) * frameRate))
  const easing = new CubicEase()
  easing.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT)

  // 先清掉上一轮飞行动画：scope 名字固定，重复 click 时旧的必须让位
  stopCameraFly(camera)

  Animation.CreateAndStartAnimation(
    ANIM_TARGET,
    camera,
    'target',
    frameRate,
    totalFrames,
    camera.target.clone(),
    target.clone(),
    Animation.ANIMATIONLOOPMODE_CONSTANT,
    easing,
  )
  if (alpha !== undefined) {
    Animation.CreateAndStartAnimation(
      ANIM_ALPHA,
      camera,
      'alpha',
      frameRate,
      totalFrames,
      camera.alpha,
      camera.alpha + shortestDelta(camera.alpha, alpha),
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      easing,
    )
  }
  if (beta !== undefined) {
    Animation.CreateAndStartAnimation(
      ANIM_BETA,
      camera,
      'beta',
      frameRate,
      totalFrames,
      camera.beta,
      beta,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      easing,
    )
  }
  if (radius !== undefined) {
    Animation.CreateAndStartAnimation(
      ANIM_RADIUS,
      camera,
      'radius',
      frameRate,
      totalFrames,
      camera.radius,
      radius,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      easing,
    )
  }
  return true
}

/**
 * from → to 的最短旋转差（结果落在 [-π, π]）。alpha 在 ArcRotateCamera 上是
 * 无界字段，直接插值会绕远路甚至反向转一整圈；绕短边飞才符合「转过去」的直觉。
 */
function shortestDelta(from, to) {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * 停掉飞行动画（用户输入打断 / 起飞新飞行前调用）。
 *
 * 注意不能写 camera.animations = []：CreateAndStartAnimation 走的是
 * scene.beginDirectAnimation，Animatable 挂在 scene._activeAnimatables 上，
 * 不挂 target.animations——清字段停不掉。正确姿势是按动画名 scene.stopAnimation。
 */
export function stopCameraFly(camera) {
  if (!camera) return
  const scene = camera.getScene?.()
  if (!scene) return
  scene.stopAnimation(camera, ANIM_TARGET)
  scene.stopAnimation(camera, ANIM_ALPHA)
  scene.stopAnimation(camera, ANIM_BETA)
  scene.stopAnimation(camera, ANIM_RADIUS)
}

/**
 * 给相机挂「用户一输入就停飞」的监听（pointerdown / wheel）。
 * 编辑器里相机由 ArcRotateCamera 自己的输入系统接管，飞行与用户抢镜头没有意义。
 * @param {import('@babylonjs/core').ArcRotateCamera} camera
 * @param {HTMLCanvasElement} canvas
 * @returns {() => void} 解挂函数
 */
export function bindCameraFlyInterrupt(camera, canvas) {
  if (!camera || !canvas) return () => {}
  const stop = () => stopCameraFly(camera)
  canvas.addEventListener('pointerdown', stop)
  canvas.addEventListener('wheel', stop, { passive: true })
  return () => {
    canvas.removeEventListener('pointerdown', stop)
    canvas.removeEventListener('wheel', stop)
  }
}
