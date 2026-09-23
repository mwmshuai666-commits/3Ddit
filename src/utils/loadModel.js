import {LoadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import {registerBuiltInLoaders} from "@babylonjs/loaders/dynamic";
import ModelCache from "./indexDb";

registerBuiltInLoaders();

export default class GlbBatchLoader {
    constructor(scene) {
        this.scene = scene;
    }

    async load(urls = [], options = {}) {
        const {
            concurrency = 3,
            signal,
            onProgress,
            onItemProgress,
            autoDispose = false,
        } = options;

        const total = urls.length;
        const progressMap = new Map(urls.map((url) => [url, 0]));
        const results = [];
        let cursor = 0;

        const updateProgress = (url, value) => {
            const safeValue = Math.max(0, Math.min(1, value));
            progressMap.set(url, safeValue);

            const loadedSum = Array.from(progressMap.values()).reduce(
                (sum, item) => sum + item,
                0,
            );

            const percent = total === 0 ? 100 : Math.round((loadedSum / total) * 100);

            onProgress?.({
                percent,
                loaded: loadedSum,
                total,
            });

            onItemProgress?.({
                url,
                progress: Math.round(safeValue * 100),
            });
        };

        const getFileName = (url) => {
            const cleanUrl = url.split("?")[0].split("#")[0];
            const name = cleanUrl.split("/").pop() || "model.glb";
            return name.toLowerCase().endsWith(".glb") ? name : `${name}.glb`;
        };

        const checkGlbHeader = async (blob, url) => {
            const buffer = await blob.slice(0, 4).arrayBuffer();
            const header = String.fromCharCode(...new Uint8Array(buffer));

            console.log("[GLB检查]", {
                url,
                size: blob.size,
                type: blob.type,
                header,
            });

            if (header !== "glTF") {
                throw new Error(
                    `当前文件不是合法 GLB：${url}，文件头是 ${header}，正常应该是 glTF`,
                );
            }
        };

        const loadOne = async (url) => {
            updateProgress(url, 0);

            const blob = await ModelCache.load(
                url,
                (event) => {
                    const loaded = event.loaded || 0;
                    const totalBytes = event.total || 0;

                    if (totalBytes > 0) {
                        updateProgress(url, (loaded / totalBytes) * 0.9);
                    }
                },
                signal,
            );

            await checkGlbHeader(blob, url);

            const file = new File([blob], getFileName(url), {
                type: "model/gltf-binary",
            });

            const container = await LoadAssetContainerAsync(file, this.scene);

            container.addAllToScene();

            updateProgress(url, 1);

            if (autoDispose) {
                container.removeAllFromScene();
                container.dispose();
            }

            return {
                url,
                container,
                transformNodes: container.transformNodes, // ← GLB 里的"组/空节点"
                rootNodes: container.rootNodes,           // ← 顶层根节点（一般就是一层
                meshes: container.meshes,
                materials: container.materials,
                textures: container.textures,
                animationGroups: container.animationGroups,
                skeletons: container.skeletons,
            };
        };

        const worker = async () => {
            while (cursor < total) {
                const index = cursor++;
                const url = urls[index];

                results[index] = await loadOne(url);
            }
        };

        const workerCount = Math.min(concurrency, total);

        await Promise.all(
            Array.from({length: workerCount}, () => worker()),
        );

        return results;
    }
}