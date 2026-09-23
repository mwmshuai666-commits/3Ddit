import {
  Vector3,
  MeshBuilder,
  Color4,
} from "@babylonjs/core";

import GUI from "lil-gui";

export default class CameraBoxLimit {
  constructor(camera, scene, points) {
    this.camera = camera;
    this.scene = scene;

    this.points = points.map((p) => p.clone());

    this.min = new Vector3();
    this.max = new Vector3();

    this.observer = null;
    this.debugBox = null;
    this.gui = null;

    this.updateBounds(this.points);

    // 允许 ArcRotateCamera 的 target 在 x / y / z 方向平移
    this.camera.panningAxis = new Vector3(1, 1, 1);
    this.camera.panningSensibility = 50;

    if (this.camera.inputs?.attached?.pointers) {
      this.camera.inputs.attached.pointers.useCtrlForPanning = false;
    }
  }

  updateBounds(points) {
    this.points = points.map((p) => p.clone());

    let minX = this.points[0].x;
    let minY = this.points[0].y;
    let minZ = this.points[0].z;

    let maxX = this.points[0].x;
    let maxY = this.points[0].y;
    let maxZ = this.points[0].z;

    this.points.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      minZ = Math.min(minZ, p.z);

      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      maxZ = Math.max(maxZ, p.z);
    });

    this.min.set(minX, minY, minZ);
    this.max.set(maxX, maxY, maxZ);

    // 如果调试盒子已经显示，更新点位后自动重建
    if (this.debugBox) {
      this.hideDebugBox();
      this.showDebugBox();
    }
  }

  enable() {
    if (this.observer) return;

    this.observer = this.scene.onBeforeRenderObservable.add(() => {
      this.limitTarget();
      this.limitPosition();
    });
  }

  disable() {
    if (!this.observer) return;

    this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
  }

  limitTarget() {
    const target = this.camera.target;

    const x = this.clamp(target.x, this.min.x, this.max.x);
    const y = this.clamp(target.y, this.min.y, this.max.y);
    const z = this.clamp(target.z, this.min.z, this.max.z);

    if (target.x !== x || target.y !== y || target.z !== z) {
      target.set(x, y, z);
    }
  }

  limitPosition() {
    const pos = this.camera.position;

    const x = this.clamp(pos.x, this.min.x, this.max.x);
    const y = this.clamp(pos.y, this.min.y, this.max.y);
    const z = this.clamp(pos.z, this.min.z, this.max.z);

    if (pos.x === x && pos.y === y && pos.z === z) return;

    this.camera.setPosition(new Vector3(x, y, z));
  }

  showDebugBox(options = {}) {
    if (this.debugBox) return this.debugBox;

    const color = options.color || new Color4(0, 1, 1, 1);

    const p = this.points;

    const lines = [
      // 底面 4 条边
      [p[0], p[1]],
      [p[1], p[2]],
      [p[2], p[3]],
      [p[3], p[0]],

      // 顶面 4 条边
      [p[4], p[5]],
      [p[5], p[6]],
      [p[6], p[7]],
      [p[7], p[4]],

      // 竖向 4 条边
      [p[0], p[4]],
      [p[1], p[5]],
      [p[2], p[6]],
      [p[3], p[7]],
    ];

    const colors = lines.map(() => [color, color]);

    this.debugBox = MeshBuilder.CreateLineSystem(
      options.name || "camera_box_limit_debug",
      {
        lines,
        colors,
        updatable: false,
      },
      this.scene
    );

    this.debugBox.isPickable = false;

    return this.debugBox;
  }

  hideDebugBox() {
    if (!this.debugBox) return;

    this.debugBox.dispose();
    this.debugBox = null;
  }

  toggleDebugBox() {
    if (this.debugBox) {
      this.hideDebugBox();
    } else {
      this.showDebugBox();
    }
  }

  showGui(options = {}) {
    if (this.gui) return this.gui;

    const range = options.range ?? 5000;
    const step = options.step ?? 1;

    const params = {};

    this.points.forEach((p, index) => {
      params[`p${index}_x`] = p.x;
      params[`p${index}_y`] = p.y;
      params[`p${index}_z`] = p.z;
    });

    params.panningSensibility = this.camera.panningSensibility ?? 50;
    params.wheelDeltaPercentage = this.camera.wheelDeltaPercentage ?? 0.01;
    params.lowerRadiusLimit = this.camera.lowerRadiusLimit ?? 0;
    params.upperRadiusLimit = this.camera.upperRadiusLimit ?? 5000;
    params.showDebugBox = !!this.debugBox;

    this.gui = new GUI({
      title: "Camera Box Limit",
    });

    const rebuildPointsFromGui = () => {
      const newPoints = [];

      for (let i = 0; i < 8; i++) {
        newPoints.push(
          new Vector3(
            params[`p${i}_x`],
            params[`p${i}_y`],
            params[`p${i}_z`]
          )
        );
      }

      this.updateBounds(newPoints);
    };

    const pointFolder = this.gui.addFolder("8个角点");

    for (let i = 0; i < 8; i++) {
      const folder = pointFolder.addFolder(`点 ${i}`);

      folder
        .add(params, `p${i}_x`, -range, range, step)
        .name("x")
        .onChange(rebuildPointsFromGui);

      folder
        .add(params, `p${i}_y`, -range, range, step)
        .name("y")
        .onChange(rebuildPointsFromGui);

      folder
        .add(params, `p${i}_z`, -range, range, step)
        .name("z")
        .onChange(rebuildPointsFromGui);
    }

    const cameraFolder = this.gui.addFolder("相机参数");

    cameraFolder
      .add(params, "panningSensibility", 1, 5000, 1)
      .name("平移灵敏度")
      .onChange((value) => {
        this.camera.panningSensibility = value;
      });

    cameraFolder
      .add(params, "wheelDeltaPercentage", 0.001, 0.2, 0.001)
      .name("滚轮速度")
      .onChange((value) => {
        this.camera.wheelDeltaPercentage = value;
      });

    cameraFolder
      .add(params, "lowerRadiusLimit", 0, 10000, 1)
      .name("最近距离")
      .onChange((value) => {
        this.camera.lowerRadiusLimit = value;
      });

    cameraFolder
      .add(params, "upperRadiusLimit", 0, 30000, 1)
      .name("最远距离")
      .onChange((value) => {
        this.camera.upperRadiusLimit = value;
      });

    const debugFolder = this.gui.addFolder("调试");

    debugFolder
      .add(params, "showDebugBox")
      .name("显示范围盒")
      .onChange((value) => {
        if (value) {
          this.showDebugBox();
        } else {
          this.hideDebugBox();
        }
      });

    this.gui
      .add(
        {
          print: () => {
            console.log("当前 8 个角点：");
            console.log(this.getPointsCode());

            console.log("min:", this.min.clone());
            console.log("max:", this.max.clone());
            console.log("camera.position:", this.camera.position.clone());
            console.log("camera.target:", this.camera.target.clone());
          },
        },
        "print"
      )
      .name("打印当前参数");

    return this.gui;
  }

  hideGui() {
    if (!this.gui) return;

    this.gui.destroy();
    this.gui = null;
  }

  toggleGui() {
    if (this.gui) {
      this.hideGui();
    } else {
      this.showGui();
    }
  }

  getPoints() {
    return this.points.map((p) => p.clone());
  }

  getPointsCode() {
    const lines = this.points.map((p) => {
      return `  new Vector3(${p.x}, ${p.y}, ${p.z}),`;
    });

    return `const points = [\n${lines.join("\n")}\n];`;
  }

  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  dispose() {
    this.disable();
    this.hideDebugBox();
    this.hideGui();
  }
}