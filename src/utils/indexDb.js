import Dexie from 'dexie';
import axios from 'axios';
 
const db = new Dexie('ModelCacheDB');
db.version(1).stores({ models: 'url, blob, ts, version' });
 
const APP_VERSION = '1.0.0';   // 只需改这一处即可触发清库
 
const ModelCache = {
  async load(url, onDownloadProgress = null,signal = null) {
    /* 1) 先检查版本号 */
    const meta = await db.models.get('_APP_VERSION_');
    if (!meta || meta.version !== APP_VERSION) {
      await db.models.clear();
      await db.models.put({
        url: '_APP_VERSION_',
        blob: null,
        ts: Date.now(),
        version: APP_VERSION
      });
    }
 
    /* 2) 正常缓存逻辑 */
    const cached = await db.models.get(url);
    if (cached){
      onDownloadProgress && onDownloadProgress({ //如果是从缓存拿的，那直接随便赋值一个加载成功就行
        total: 1000,
        loaded: 1000
      })
      return cached.blob;
    } 
 
    const { data: wrongBlob } = await axios.get(url, {
      responseType: 'blob',
      onDownloadProgress,
      signal,
      withCredentials:false
    });
    const contentType = {
      glb:"model/gltf-binary",
      jpg:"image/jpeg",
    }
    const newBlob = new Blob([wrongBlob], { type: url.includes('.jpg') ? contentType.jpg : contentType.glb });
    await db.models.put({ url, blob:newBlob, ts: Date.now(), version: APP_VERSION });
    return newBlob;
  },
 
  /* 其余 purge / clear 按需保留或删掉 */
  async clear() {
    return db.models.clear();
  }
};
 
export default ModelCache;