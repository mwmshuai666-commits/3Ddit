import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  Color3,
  Color4,
  Texture,
  CubeTexture,
  ImageProcessingConfiguration,
  HDRCubeTexture,
  CubicEase,
  EasingFunction,
  Animation
} from "@babylonjs/core";
import "@babylonjs/inspector";
import "@babylonjs/core/Debug/debugLayer";
export default class {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    // 是否允许相机自动旋转（默认开启）
    this.autoRotate = options.autoRotate ?? true;
    this.engine = new Engine(this.canvas, true, {
      antialias: true, // 开启抗锯齿
      alpha: false,
    }, true);
    this.scene = new Scene(this.engine);
    this._disposed = false;
    this._onResize = this.handleResize.bind(this);

    this.scene.environmentIntensity = 1;
    this.scene.useLogarithmicDepth = true;
    this.engine.runRenderLoop(() => {
      if (!this._disposed && this.scene.activeCamera) {
        this.scene.render();
      }
    });

    const light = new HemisphericLight(
      "light",
      new Vector3(0, 1, 0),
      this.scene,
    );
    light.intensity = 1.2;

    this.enableDefaultCamera();

    window.addEventListener("resize", this._onResize);
  }

  createDefaultCamera(options = {}) {
    const {
      target = new Vector3(0, 2, 0),
      alpha = Math.PI / 2,
      beta = Math.PI / 3,
      radius = 60,
      lowerRadiusLimit = 2,
      upperRadiusLimit = 600,
      lowerBetaLimit = 0.007,
      upperBetaLimit = Math.PI / 2.05,
      wheelDeltaPercentage = 0.01,
      panningSensibility = 50,
    } = options;

    if (this.defaultCamera) {
      if (options.target) {
        this.defaultCamera.setTarget(target);
      }

      return this.defaultCamera;
    }

    this.defaultCamera = new ArcRotateCamera(
      "defaultOrbitCamera",
      alpha,
      beta,
      radius,
      target.clone(),
      this.scene,
    );

    this.defaultCamera.minZ = 10;
    this.defaultCamera.maxZ = 1200;
    this.defaultCamera.lowerRadiusLimit = lowerRadiusLimit;
    this.defaultCamera.upperRadiusLimit = upperRadiusLimit;
    this.defaultCamera.lowerBetaLimit = lowerBetaLimit;
    this.defaultCamera.upperBetaLimit = upperBetaLimit;
    this.defaultCamera.wheelDeltaPercentage = wheelDeltaPercentage;
    this.defaultCamera.panningSensibility = 50;
    this.defaultCamera.useAutoRotationBehavior = true;
    // 停止操作 3 秒后自动旋转
    this.defaultCamera.autoRotationBehavior.idleRotationWaitTime = 3000;
    // 自动旋转速度
    this.defaultCamera.autoRotationBehavior.idleRotationSpeed = 0.008;
    // 缓慢进入自动旋转
    this.defaultCamera.autoRotationBehavior.idleRotationSpinupTime = 1500;
    // 根据配置项决定是否真正启用自动旋转
    this.setAutoRotate(this.autoRotate);

    return this.defaultCamera;
  }

  /**
   * 运行时开关：是否允许相机自动旋转
   * @param {boolean} enabled
   */
  setAutoRotate(enabled) {
    this.autoRotate = enabled;
    if (this.defaultCamera) {
      this.defaultCamera.useAutoRotationBehavior = enabled;
    }
  }

  openDebug() {
    this.scene.debugLayer.show();
  }

  enableDefaultCamera(options = {}) {
    const camera = this.createDefaultCamera(options);
    this.scene.activeCamera = camera;
    camera.attachControl(this.canvas, true);
    // 或者一次性设置
    camera.position = new Vector3(-9.08, 99.48, 320);
    // 设置观察目标
    camera.setTarget(new Vector3(0, 2, 0));
    return camera;
  }

  destroyDefaultCamera() {
    if (!this.defaultCamera) return;

    if (this.scene.activeCamera === this.defaultCamera) {
      this.scene.activeCamera = null;
    }

    this.defaultCamera.detachControl(this.canvas);
    this.defaultCamera.dispose();
    this.defaultCamera = null;
  }

  /**
   * 相机平滑飞到指定 position 和 target
   */
  flyCameraTo(options = {}) {
    const {
      position = new Vector3(-9.08, 99.48, 320),
      target = new Vector3(0, 2, 0),
      duration = 1200,
      frameRate = 60,
    } = options;

    if (!this.defaultCamera) return;

    const totalFrames = Math.round((duration / 1000) * frameRate);
    const easing = new CubicEase();
    easing.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

    // 动画 position
    const positionAnim = Animation.CreateAndStartAnimation(
      "camera_position_fly",
      this.defaultCamera,
      "position",
      frameRate,
      totalFrames,
      this.defaultCamera.position.clone(),
      position.clone(),
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      easing,
    );

    // 动画 target
    const targetAnim = Animation.CreateAndStartAnimation(
      "camera_target_fly",
      this.defaultCamera,
      "target",
      frameRate,
      totalFrames,
      this.defaultCamera.target.clone(),
      target.clone(),
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      easing,
    );

    // 动画结束后，重新计算 ArcRotateCamera 的 alpha / beta / radius
    targetAnim.onAnimationEnd = () => {
      this.defaultCamera.setTarget(target);
      this.defaultCamera.setPosition(position);
      this.defaultCamera.rebuildAnglesAndRadius();
    };
    setTimeout(() => {
      // 仅当配置允许时才恢复自动旋转
      this.defaultCamera.useAutoRotationBehavior = this.autoRotate;
    }, duration + 9000);
    return {
      positionAnim,
      targetAnim,
    };
  }

  //窗口自适应
  handleResize() {
    this.engine.resize();
  }
  //设置纯色背景色
  setRgbBg(color = "#141414", transparent = 1) {
    // 4. 设置背景颜色
    const c = Color3.FromHexString(color);
    this.scene.clearColor = new Color4(c.r, c.g, c.b, transparent);
  }
  //加载png的环境贴图以及背景
  setPngSceneBg() {
    //生成立体环境贴图
    const envTexture = CubeTexture.CreateFromImages(
      [
        "/static/img/px.png",
        "/static/img/py.png",
        "/static/img/pz.png",
        "/static/img/nx.png",
        "/static/img/ny.png",
        "/static/img/nz.png",
      ],
      this.scene,
    );
    //使用天空盒 无限远的方式加载贴图
    envTexture.coordinatesMode = Texture.SKYBOX_MODE;
    envTexture.onLoadObservable.add(() => {
      //设置全局环境光
      this.scene.environmentTexture = envTexture;
      this.scene.createDefaultSkybox(envTexture, true, 6000);
    });
  }

  setHdrSceneBg(url = "/static/img/german_town_street_2k.hdr", size = 512) {
    // 加载 HDR 环境贴图
    const hdrTexture = new HDRCubeTexture(
      url,
      this.scene,
      size,
      false,
      true,
      false,
      true,
    );

    hdrTexture.onLoadObservable.add(() => {
      // 设置为全局环境贴图，影响 PBR 材质反射、环境光
      this.scene.environmentTexture = hdrTexture;

      // 创建天空盒背景
      const skybox = this.scene.createDefaultSkybox(
        hdrTexture,
        true,
        6000,
        0.3,
      );
      // 可选：避免天空盒参与拾取
      if (skybox) {
        skybox.isPickable = false;
      }
    });
    return hdrTexture;
  }

  //设置效果
  setSceneEffect() {
    const ipc = this.scene.imageProcessingConfiguration;
    // 整个“画面美化 / 后期处理”开着
    ipc.isEnabled = true;
    // 开启 Tone Mapping（色调映射）
    // 把 HDR 颜色压缩到屏幕能显示的范围
    ipc.toneMappingEnabled = true;
    //使用ACES色调映射
    ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    //最终画面曝光度
    ipc.exposure = 1.6;
    // 提升亮度对比度 暗部稍微更暗 高光稍微更亮
    ipc.contrast = 1;
    // // sRGB 输出
    this.scene.getEngine().outputColorSpace = Engine.COLORSPACE_SRGB;
    ipc.vignetteEnabled = false;
  }

  dispose() {
    if (this._disposed) return;

    this._disposed = true;
    window.removeEventListener("resize", this._onResize);
    this.engine.stopRenderLoop();
    this.destroyDefaultCamera();
    this.scene.dispose();
    this.engine.dispose();
  }
}
