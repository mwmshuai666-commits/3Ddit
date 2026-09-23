// 让一个 mesh / TransformNode 沿路径移动（可循环、可自动朝向、可淡入淡出）
// 用法：
//   const car = scene.getTransformNodeByName("AI_Tir_High_Tir_0.001_primitive0")
//              || scene.getMeshByName("AI_Tir_High_Tir_0.001_primitive0");
//   const mover = new MeshMover(scene, car, {
//     path: [ [0,0,-200], [0,0,-100], [100,0,-100], [100,0,100] ],
//     speed: 30,           // 单位/秒
//     loop: true,
//     faceForward: true,   // 自动朝向下一段
//     fadeInOut: true,     // 起点淡入、终点淡出
//   });
//   mover.start();
//   // 结束时：mover.dispose();

import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Scalar } from "@babylonjs/core/Maths/math.scalar";

export default class MeshMover {
  /**
   * @param {import("@babylonjs/core").Scene} scene
   * @param {import("@babylonjs/core").TransformNode | import("@babylonjs/core").AbstractMesh} target
   * @param {object} opts
   * @param {Array<[number,number,number] | Vector3>} opts.path  路径点，至少 2 个
   * @param {number}  [opts.speed=20]            单位/秒
   * @param {boolean} [opts.loop=true]           走到终点后回到起点重来
   * @param {boolean} [opts.faceForward=true]    自动朝向前进方向
   * @param {number}  [opts.yawOffset=0]         模型正方向不是 +Z 时用来纠偏（弧度）
   * @param {boolean} [opts.fadeInOut=false]     起点淡入、终点淡出
   * @param {number}  [opts.fadeRatio=0.1]       淡入淡出各占总路程的比例 (0~0.5)
   * @param {number}  [opts.pauseAtEnd=0]        单次跑完在终点停留时间（毫秒），只在 loop=true 时有意义
   * @param {number}  [opts.startDelay=0]        启动前等待时间（毫秒），可用于让多辆车错峰出发
   * @param {number}  [opts.startOffset=0]       起始位置在路径上的偏移比例 (0~1)。传 "random" 表示随机
   */
  constructor(scene, target, opts = {}) {
    if (!scene) throw new Error("[MeshMover] scene 必填");
    if (!target) throw new Error("[MeshMover] target 必填");

    this.scene = scene;
    this.target = target;

    // 归一化 path
    const raw = opts.path || [];
    if (raw.length < 2) throw new Error("[MeshMover] path 至少要 2 个点");
    this.path = raw.map((p) => (p instanceof Vector3 ? p.clone() : new Vector3(p[0], p[1], p[2])));

    this.speed = opts.speed ?? 20;
    this.loop = opts.loop ?? true;
    this.faceForward = opts.faceForward ?? true;
    this.yawOffset = opts.yawOffset ?? 0;
    this.fadeInOut = opts.fadeInOut ?? false;
    this.fadeRatio = Math.min(0.5, Math.max(0, opts.fadeRatio ?? 0.1));
    this.pauseAtEnd = opts.pauseAtEnd ?? 0;
    this.startDelay = opts.startDelay ?? 0;
    // 起始偏移：0~1 比例，或 "random"
    const so = opts.startOffset ?? 0;
    this._startOffset = so === "random" ? Math.random() : Math.min(1, Math.max(0, so));

    // 预计算每段长度 & 总长
    this._segments = [];
    this._totalLength = 0;
    for (let i = 0; i < this.path.length - 1; i++) {
      const a = this.path[i];
      const b = this.path[i + 1];
      const len = Vector3.Distance(a, b);
      this._segments.push({ a, b, len });
      this._totalLength += len;
    }

    this._traveled = 0; // 已走过的距离
    this._paused = false;
    this._observer = null;
    this._pauseUntil = 0;

    // 用四元数控制朝向，避免和 mesh 原来的欧拉旋转打架
    if (this.faceForward && !this.target.rotationQuaternion) {
      this.target.rotationQuaternion = Quaternion.FromEulerVector(
        this.target.rotation || Vector3.Zero(),
      );
    }
    // 记下初始朝向（模型的"立正"姿态），后续 yaw 旋转会叠在它上面
    this._baseQuat = this.target.rotationQuaternion
      ? this.target.rotationQuaternion.clone()
      : Quaternion.Identity();

    // 记录淡入淡出会影响到的所有子 mesh；InstancedMesh 不支持 visibility，走 setEnabled 通道
    const all = this._collectMeshes(this.target);
    this._fadeMeshes = all.filter((m) => m.getClassName?.() !== "InstancedMesh");
    this._instMeshes = all.filter((m) => m.getClassName?.() === "InstancedMesh");
    this._originalVis = this._fadeMeshes.map((m) => (m.visibility ?? 1));
    this._originalEnabled = this._instMeshes.map((m) => m.isEnabled());
  }

  start() {
    if (this._observer) return; // 已经在跑
    // 初始位置：按 startOffset 摆到路径上的某处
    this._traveled = this._startOffset * this._totalLength;
    this._applyAt(this._traveled);
    // 延迟启动：先冻结在起始位置，等 startDelay 后再开始前进
    if (this.startDelay > 0) this._pauseUntil = performance.now() + this.startDelay;
    this._observer = this.scene.onBeforeRenderObservable.add(() => this._tick());
  }

  stop() {
    if (this._observer) {
      this.scene.onBeforeRenderObservable.remove(this._observer);
      this._observer = null;
    }
  }

  pause() {
    this._paused = true;
  }

  resume() {
    this._paused = false;
  }

  /** 重置到路径起点 */
  reset() {
    this._traveled = 0;
    this._applyAt(0);
  }

  dispose() {
    this.stop();
    // 恢复可见度 / 启用状态
    this._fadeMeshes.forEach((m, i) => (m.visibility = this._originalVis[i] ?? 1));
    this._instMeshes.forEach((m, i) => m.setEnabled(this._originalEnabled[i] ?? true));
  }

  // -------- internals --------

  _tick() {
    if (this._paused) return;

    const now = performance.now();
    if (this._pauseUntil && now < this._pauseUntil) return;
    this._pauseUntil = 0;

    const dt = this.scene.getEngine().getDeltaTime() / 1000; // 秒
    this._traveled += this.speed * dt;

    if (this._traveled >= this._totalLength) {
      if (this.loop) {
        this._traveled = 0;
        if (this.pauseAtEnd > 0) this._pauseUntil = now + this.pauseAtEnd;
      } else {
        this._traveled = this._totalLength;
        this._applyAt(this._traveled);
        this.stop();
        return;
      }
    }

    this._applyAt(this._traveled);
  }

  _applyAt(distance) {
    // 找到 distance 在哪段
    let acc = 0;
    for (let i = 0; i < this._segments.length; i++) {
      const seg = this._segments[i];
      if (distance <= acc + seg.len || i === this._segments.length - 1) {
        const t = seg.len === 0 ? 0 : (distance - acc) / seg.len;
        const pos = Vector3.Lerp(seg.a, seg.b, Scalar.Clamp(t, 0, 1));
        this.target.position.copyFrom(pos);

        if (this.faceForward) {
          const dir = seg.b.subtract(seg.a);
          if (dir.lengthSquared() > 1e-6) this._lookTo(dir);
        }
        break;
      }
      acc += seg.len;
    }

    // 淡入淡出
    if (this.fadeInOut) {
      const p = distance / this._totalLength; // 0~1
      let vis = 1;
      if (p < this.fadeRatio) vis = p / this.fadeRatio;
      else if (p > 1 - this.fadeRatio) vis = (1 - p) / this.fadeRatio;
      vis = Scalar.Clamp(vis, 0, 1);
      this._fadeMeshes.forEach((m, i) => (m.visibility = (this._originalVis[i] ?? 1) * vis));
      // InstancedMesh 不支持 visibility，只能开/关：低于阈值就整体隐藏
      if (this._instMeshes.length) {
        const on = vis > 0.05;
        this._instMeshes.forEach((m, i) => {
          const want = on && (this._originalEnabled[i] ?? true);
          if (m.isEnabled() !== want) m.setEnabled(want);
        });
      }
    }
  }

  _lookTo(dir) {
    // 只绕世界 Y 加一个 yaw 旋转，保留模型自带的初始姿态（立正）
    const yaw = Math.atan2(dir.x, dir.z) + this.yawOffset;
    const yawQ = Quaternion.RotationAxis(Vector3.Up(), yaw);
    // 世界坐标下：新方向 = yawQ * baseQuat
    const q = yawQ.multiply(this._baseQuat);
    if (!this.target.rotationQuaternion) this.target.rotationQuaternion = q;
    else this.target.rotationQuaternion.copyFrom(q);
  }

  _collectMeshes(node) {
    const list = [];
    if (node.getChildMeshes) list.push(...node.getChildMeshes(false));
    // 自身如果是 Mesh 也算
    if (node.material !== undefined && node.visibility !== undefined) list.push(node);
    // 去重
    return Array.from(new Set(list));
  }
}