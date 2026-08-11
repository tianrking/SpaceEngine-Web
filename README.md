# Astral Surveyor

受 SpaceEngine 啟發的 clean-room WebGPU 宇宙引擎垂直雛形。工程以 React 19、TypeScript 6、Three.js WebGPURenderer/TSL 與 Vite 8 建構，不使用 SpaceEngine 的專有程式碼、shader 或資產。

這不是「完整 SpaceEngine 的網頁移植」。它先把最值得驗證的技術骨架做成可運行產品切片：程序化恆星系、確定性軌道、WebGPU GPU-compute 星場、WebGL 2 自動降級、floating origin、行星與大氣視覺、時間控制、飛行與專業 HUD。

## 快速啟動

需求：Node.js 22+，以及支援 WebGPU 的新版 Chrome / Edge。`localhost` 可作為 secure context；正式部署需 HTTPS。

```powershell
cd E:\SpaceEngine-Web
npm install
npm run dev
```

打開 Vite 顯示的本機網址。完整驗證：

```powershell
npm run check
```

要明確驗證降級路徑，可打開 `http://localhost:5173/?renderer=webgl2`；HUD 應顯示 `WebGL fallback`，星場 budget 會自動降低。

## 已完成的 P0 能力

- WebGPU 優先的 Three.js `WebGPURenderer`，不支援時明確降級至 WebGL 2。
- 96,000 顆 GPU compute 程序化星場；降級模式使用 24,000 顆 CPU 生成星點。
- Asteria 確定性恆星系：6 顆行星、2 套行星環、7 顆衛星的 domain model。
- f64 Kepler solver、正向/暫停/加速模擬時間、SI 單位與確定性 seed。
- 相機相對 / floating-origin 基礎與 float high-low 拆分工具。
- 程序化星球地表紋理、雲層、大氣邊緣、行星環與橢圓軌道。
- 物件點選、雙擊飛往、`G` 聚焦、WASD + Q/E 自由飛行。
- React HUD 與渲染循環解耦；React 只接收低頻 telemetry snapshot。
- 響應式系統瀏覽器、天體資料面板、畫質、電影模式與導覽。

## 操作

| 操作 | 功能 |
| --- | --- |
| 滑鼠拖曳 | 繞目前焦點旋轉 |
| 滾輪 | 拉近 / 拉遠 |
| 單擊天體 | 選取 |
| 雙擊天體 | 飛往目標 |
| `G` | 聚焦目前選取目標 |
| `W A S D` | 前後左右飛行 |
| `Q / E` | 垂直飛行 |
| `Shift` | 四倍飛行速度 |
| `Space` | 暫停 / 恢復時間 |

## 架構

```text
React HUD (low-frequency snapshots)
        │
CosmosEngine facade
 ├─ WebGPURenderer + WebGL2 fallback
 ├─ Camera flight / raycast / floating origin
 ├─ GPU compute galaxy + procedural textures
 ├─ Domain simulation
 │   ├─ seeded generator
 │   ├─ Kepler orbital state
 │   └─ precision + unit helpers
 └─ telemetry / capability reporting
```

主要目錄：

- `src/engine/`：Three.js 渲染、GPU compute、相機與視覺資源。
- `src/domain/`：不依賴 DOM 的確定性宇宙資料、軌道、精度與單位。
- `src/ui/`：可重用的 React HUD。
- `src/components/`：產品層互動元件。
- `docs/`：調研、架構與後續工程路線。

詳見 [架構說明](docs/ARCHITECTURE.md) 與 [調研摘要](docs/RESEARCH.md)。

## 能力邊界

目前 planet rendering 是視覺尺度，不是天文物理尺度；尚未包含 cube-sphere quadtree 地形、地表碰撞、多重散射 LUT、真實 Gaia 全量星表、N-body、體積星雲、黑洞 GR ray tracing 或飛船空氣動力學。WASM 也刻意未成為 P0 前置條件：先驗證 TypeScript f64 數值正確性，再把 profiling 證實的 CPU 熱點移到 Rust/WASM SIMD/threads。

## 下一階段

1. 六面 cube-sphere quadtree、screen-space error、geomorph、tile scheduler 與 LRU budget。
2. WebGPU compute 產生 height/normal/albedo，WebGL2 + Worker 低階 provider。
3. Bruneton 類 atmosphere LUT、eclipse/ring shadow 與曝光控制。
4. Worker/WASM 批次軌道、可版本化 `seed + generatorVersion` 存檔。
5. Gaia/HYG 分塊串流、catalog/procedural merge 與來源標示。

## 名稱與授權邊界

Astral Surveyor 是原創工程名稱。SpaceEngine 是其權利人的產品與商標；本專案只研究公開功能與通用圖形學方法，未得到 SpaceEngine 官方背書。
