# SpaceEngine / WebGPU 調研摘要

## 公開產品基準

SpaceEngine 官方把產品描述為可從行星地表無縫前往遙遠星系、包含真實 catalog 與未探索區域程序生成、可改變時間並觀察軌道、具有行星地形與大氣的原生宇宙模擬器。這是一個多年演進的桌面產品基準，不是快速網頁 P0 的合理驗收線。

- [SpaceEngine 官方能力](https://spaceengine.org/)
- [Real celestial objects](https://spaceengine.org/universe/real-celestial-object)
- [Landscapes](https://spaceengine.org/universe/landscapes)

官方歷史技術文章說明過 cube-sphere quadtree 類地形思路；現行手冊也明確指出 landscape LOD、每幀生成數量、解析度與 texture-array 容量的取捨。這可作通用架構參考，但不能假設閉源現行版本內部完全相同。

- [Terrain engine upgrade #3](https://spaceengine.org/news/blog171120/)
- [Landscape LOD manual](https://spaceengine.org/manual/user-manual/)
- [Planet biome presets](https://spaceengine.org/manual/making-addons/planet-biome-presets/)

## Three.js / WebGPU 現況

Three.js `WebGPURenderer` 會優先選 WebGPU，並可退至 WebGL2；它提供 logarithmic/reversed depth 選項。TSL 可把 node graph 編譯到 WGSL/WebGPU 與 GLSL/WebGL2，並提供 compute primitives。

- [WebGPURenderer 官方文件](https://threejs.org/docs/pages/WebGPURenderer.html)
- [TSL 官方規格](https://threejs.org/docs/TSL.html)
- [Three.js WebGPU compute particles 範例](https://threejs.org/examples/webgpu_compute_particles.html)

WebGPU 提供現代 GPU pipeline 與 general-purpose compute，但仍非所有瀏覽器的 Baseline，並且只在 secure context 使用。工程必須保留 capability detection、device loss 重建與 WebGL2 fallback。

- [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
- [MDN GPUDevice lost](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost)

## 已校正的常見誤解

- JavaScript `Number` 已是 f64；BigInt 是整數，不適合直接求解橢圓軌道。
- WASM f64 不增加精度，主要改善可預測效能、SIMD/threads 與程式碼重用。
- WGSL 常規 runtime 浮點仍以 f32/f16 為主；巨大座標需要分層 reference frame、camera-relative 或 high/low。
- logarithmic depth 只改善 depth buffer，不會修好巨大 world matrix 的 jitter。
- WebGPU 不會自動消除 draw calls，也不能用局部粒子 demo 推導任意裝置可流暢渲染完整星系。

## P0 結論

可交付範圍應是：一個 deterministic system、一條可見的跨尺度導航路徑、正確的二體軌道時間、單星行星視覺、WebGPU compute workload、可測量 fallback 與清楚 HUD。完整 Gaia、N-body、體積星雲、地表全球 quadtree、大氣多重散射與飛船物理應在精度、記憶體和真機 profiling 通過後分階段加入。
