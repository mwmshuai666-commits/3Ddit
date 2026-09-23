// 场景天气效果控制器
// 用法：
//   const w = new WeatherEffect(scene);
//   w.apply("rain")        // 手动切换
//   w.startAuto({ city: "510100" })              // 用高德 adcode
//   w.startAuto({ lat: 30.67, lon: 104.07 })     // 用经纬度（内部先反查 adcode）
//   w.dispose()

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Scene } from "@babylonjs/core/scene";
import { fetchWeather } from "./weather";

// 一张 16x16 的圆点 base64，就不额外放资源了；雪用圆点
const DOT_URL =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><circle cx='8' cy='8' r='7' fill='white'/></svg>`,
  );

// 水滴形贴图（上尖下圆），中间加一点高光更立体
const DROP_URL =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 48' width='32' height='48'>
      <defs>
        <radialGradient id='g' cx='40%' cy='65%' r='55%'>
          <stop offset='0%' stop-color='#ffffff' stop-opacity='1'/>
          <stop offset='55%' stop-color='#ffffff' stop-opacity='0.85'/>
          <stop offset='100%' stop-color='#ffffff' stop-opacity='0.4'/>
        </radialGradient>
      </defs>
      <path d='M16 2 C22 18, 30 28, 30 34 A14 14 0 0 1 2 34 C2 28, 10 18, 16 2 Z' fill='url(#g)'/>
    </svg>`,
  );

const RAIN_URL =
  "data:image/svg+xml;base64," +
  btoa(
    `<svg xmlns='http://www.w3.org/2000/svg' width='4' height='16'><rect width='4' height='16' fill='white'/></svg>`,
  );

export default class WeatherEffect {
  /**
   * @param {Scene} scene
   * @param {object} [opts]
   * @param {Vector3} [opts.center]  发射器围绕的中心；默认场景中心正上方
   * @param {number}  [opts.range]   发射区域大小（水平）
   * @param {number}  [opts.height]  发射高度
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.range = opts.range ?? 400;
    this.height = opts.height ?? 200;
    this.center = opts.center ?? new Vector3(0, 0, 0);

    this._particle = null;
    this._timer = null;
    this._current = null;

    // 记录原始场景参数，切换时能恢复
    this._origin = {
      fogMode: scene.fogMode,
      fogColor: scene.fogColor?.clone(),
      fogDensity: scene.fogDensity,
      clearColor: scene.clearColor?.clone(),
      ambientColor: scene.ambientColor?.clone(),
    };
  }

  /** 手动切换到某种天气：sunny | cloudy | fog | rain | snow | thunder */
  apply(type) {
    if (this._current === type) return;
    this._current = type;
    this._clearParticle();
    this._resetScene();

    switch (type) {
      case "sunny":
        this._applySunny();
        break;
      case "cloudy":
        this._applyCloudy();
        break;
      case "fog":
        this._applyFog();
        break;
      case "rain":
        this._applyRain();
        break;
      case "snow":
        this._applySnow();
        break;
      case "thunder":
        this._applyRain();
        this._applyThunder();
        break;
      default:
        break;
    }
  }

  /** 拉真实天气并定时刷新
   *  高德默认 30 分钟才更新一次实况，intervalMs 建议 >= 30min
   */
  async startAuto({ city, lat, lon, intervalMs = 30 * 60 * 1000, onUpdate } = {}) {
    const run = async () => {
      try {
        const w = await fetchWeather({ city, lat, lon });
        this.apply(w.type);
        onUpdate?.(w);
      } catch (e) {
        console.warn("[weather] fetch failed", e);
      }
    };
    await run();
    this._timer = setInterval(run, intervalMs);
  }

  dispose() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this._clearParticle();
    this._resetScene();
    if (this._thunderObs) {
      this.scene.onBeforeRenderObservable.remove(this._thunderObs);
      this._thunderObs = null;
    }
  }

  // ---------------- 内部实现 ----------------

  _clearParticle() {
    if (this._particle) {
      this._particle.stop();
      this._particle.dispose();
      this._particle = null;
    }
  }

  _resetScene() {
    const s = this.scene;
    s.fogMode = this._origin.fogMode ?? Scene.FOGMODE_NONE;
    if (this._origin.fogColor) s.fogColor = this._origin.fogColor.clone();
    s.fogDensity = this._origin.fogDensity ?? 0;
    if (this._origin.clearColor) s.clearColor = this._origin.clearColor.clone();
    if (this._origin.ambientColor) s.ambientColor = this._origin.ambientColor.clone();
    if (this._thunderObs) {
      s.onBeforeRenderObservable.remove(this._thunderObs);
      this._thunderObs = null;
    }
  }

  _applySunny() {
    const s = this.scene;
    s.fogMode = Scene.FOGMODE_NONE;
    s.ambientColor = new Color3(1, 1, 1);
  }

  _applyCloudy() {
    const s = this.scene;
    s.fogMode = Scene.FOGMODE_EXP2;
    s.fogColor = new Color3(0.78, 0.82, 0.88);
    s.fogDensity = 0.0004;
    s.ambientColor = new Color3(0.92, 0.94, 0.96);
  }

  _applyFog() {
    const s = this.scene;
    s.fogMode = Scene.FOGMODE_EXP2;
    s.fogColor = new Color3(0.85, 0.87, 0.9);
    s.fogDensity = 0.002;
    s.ambientColor = new Color3(0.9, 0.9, 0.92);
  }

  _applyRain() {
    const s = this.scene;
    s.fogMode = Scene.FOGMODE_EXP2;
    s.fogColor = new Color3(0.35, 0.45, 0.6);
    s.fogDensity = 0.001;
    s.ambientColor = new Color3(0.55, 0.62, 0.75);

    const ps = new ParticleSystem("rain", 8000, s);
    ps.particleTexture = new Texture(DROP_URL, s);
    ps.emitter = this.center.clone();
    ps.emitter.y += this.height;

    const r = this.range;
    ps.minEmitBox = new Vector3(-r, 0, -r);
    ps.maxEmitBox = new Vector3(r, 0, r);

    // 深蓝色雨滴
    ps.color1 = new Color4(0.2, 0.45, 1, 1);
    ps.color2 = new Color4(0.1, 0.3, 0.9, 1);
    ps.colorDead = new Color4(0.1, 0.25, 0.8, 0.6);

    ps.minSize = 0.4;
    ps.maxSize = 0.8;
    ps.minScaleY = 1.4;   // 水滴稍微竖长一点更像"往下掉"的水珠
    ps.maxScaleY = 1.8;
    ps.minLifeTime = 0.8;
    ps.maxLifeTime = 1.4;
    ps.emitRate = 6000;
    ps.gravity = new Vector3(0, -500, 0);
    ps.direction1 = new Vector3(-2, -500, 2);
    ps.direction2 = new Vector3(2, -520, -2);
    ps.updateSpeed = 0.02;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;

    ps.start();
    this._particle = ps;
  }

  _applySnow() {
    const s = this.scene;
    s.fogMode = Scene.FOGMODE_EXP2;
    s.fogColor = new Color3(0.88, 0.9, 0.94);
    s.fogDensity = 0.0008;
    s.ambientColor = new Color3(0.94, 0.95, 0.97);

    const ps = new ParticleSystem("snow", 6000, s);
    ps.particleTexture = new Texture(DOT_URL, s);
    ps.emitter = this.center.clone();
    ps.emitter.y += this.height;

    const r = this.range;
    ps.minEmitBox = new Vector3(-r, 0, -r);
    ps.maxEmitBox = new Vector3(r, 0, r);

    ps.color1 = new Color4(1, 1, 1, 1);
    ps.color2 = new Color4(0.95, 0.98, 1, 1);
    ps.colorDead = new Color4(1, 1, 1, 0.3);

    ps.minSize = 1.2;
    ps.maxSize = 2.4;
    ps.minLifeTime = 4;
    ps.maxLifeTime = 8;
    ps.emitRate = 2500;
    ps.gravity = new Vector3(0, -25, 0);
    ps.direction1 = new Vector3(-8, -18, -8);
    ps.direction2 = new Vector3(8, -30, 8);
    ps.minAngularSpeed = 0;
    ps.maxAngularSpeed = Math.PI;
    ps.updateSpeed = 0.02;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;

    ps.start();
    this._particle = ps;
  }

  _applyThunder() {
    // 用 clearColor 快速抖一下模拟闪电
    const s = this.scene;
    const base = s.clearColor.clone();
    let next = performance.now() + 4000 + Math.random() * 6000;
    this._thunderObs = s.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      if (now >= next) {
        s.clearColor = new Color4(1, 1, 1, 1);
        setTimeout(() => (s.clearColor = base.clone()), 80);
        setTimeout(() => {
          s.clearColor = new Color4(1, 1, 1, 1);
          setTimeout(() => (s.clearColor = base.clone()), 60);
        }, 200);
        next = now + 5000 + Math.random() * 8000;
      }
    });
  }
}