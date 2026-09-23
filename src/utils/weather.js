// 高德天气 API
// 官方文档: https://lbs.amap.com/api/webservice/guide/api/weatherinfo
// 使用前请到 https://console.amap.com 申请一个 "Web 服务" 类型的 Key，并按需要开通"天气查询"
//
// 用法：
//   import { fetchWeather } from "@/utils/weather";
//   const w = await fetchWeather({ city: "510100" });  // 成都
//   或者用经纬度 → 先逆地理拿到 adcode → 再查天气：
//   const w = await fetchWeather({ lat: 30.67, lon: 104.07 });

// TODO: 换成你自己的 Key
const AMAP_KEY = "f4f801604e52bd8df6d0d34f32e5c555";

const WEATHER_BASE = "https://restapi.amap.com/v3/weather/weatherInfo";
const GEO_BASE = "https://restapi.amap.com/v3/geocode/regeo";

// 中文天气 → 场景类型
function textToType(text = "") {
  if (/雷/.test(text)) return "thunder";
  if (/雪|冰雹/.test(text)) return "snow";
  if (/雨/.test(text)) return "rain";
  if (/雾|霾|沙|尘/.test(text)) return "fog";
  if (/云|阴/.test(text)) return "cloudy";
  if (/晴/.test(text)) return "sunny";
  return "cloudy";
}

/**
 * 通过经纬度反查 adcode（高德必须用 adcode 或城市名查天气）
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{ adcode:string, city:string, province:string }>}
 */
export async function fetchAdcode(lat, lon) {
  const url = `${GEO_BASE}?location=${lon},${lat}&key=${AMAP_KEY}&extensions=base`;
  const res = await fetch(url).then((r) => r.json());
  if (res.status !== "1") throw new Error(`[amap regeo] ${res.info || "unknown"}`);
  const c = res.regeocode?.addressComponent || {};
  return {
    adcode: c.adcode,
    city: Array.isArray(c.city) ? c.district : c.city,
    province: Array.isArray(c.province) ? "" : c.province,
  };
}

/**
 * 拉取当前天气
 * @param {object} params
 * @param {string} [params.city]       高德 adcode（六位数字），例如成都 510100、北京 110000
 * @param {number} [params.lat]        纬度（没有 city 时用）
 * @param {number} [params.lon]        经度
 * @returns {Promise<{ type:string, label:string, temp:number, wind:string, windPower:string, humidity:number, city:string, reportTime:string, isDay:boolean }>}
 */
export async function fetchWeather({ city, lat, lon } = {}) {
  if (!AMAP_KEY || AMAP_KEY.startsWith("在这里填")) {
    throw new Error("[amap] 请先在 src/utils/weather.js 里填入 AMAP_KEY");
  }

  let adcode = city;
  let cityName = "";
  if (!adcode) {
    if (lat == null || lon == null) throw new Error("[amap] 需要提供 city 或 lat/lon");
    const geo = await fetchAdcode(lat, lon);
    adcode = geo.adcode;
    cityName = geo.city || geo.province || "";
  }

  const url = `${WEATHER_BASE}?city=${adcode}&key=${AMAP_KEY}&extensions=base`;
  const res = await fetch(url).then((r) => r.json());
  if (res.status !== "1") throw new Error(`[amap weather] ${res.info || "unknown"}`);
  const live = res.lives?.[0];
  if (!live) throw new Error("[amap weather] 无返回数据");

  const type = textToType(live.weather);

  // 是否白天：高德不返回，用本地时间粗略判断（6~18 视为白天）
  const h = new Date().getHours();
  const isDay = h >= 6 && h < 19;

  return {
    type,
    label: live.weather,             // 保留原文，比如"多云"
    temp: Number(live.temperature),
    wind: live.winddirection + "风", // 例如 "西南风"
    windPower: live.windpower,       // 例如 "≤3"
    humidity: Number(live.humidity),
    city: live.city || cityName,
    reportTime: live.reporttime,
    isDay,
  };
}