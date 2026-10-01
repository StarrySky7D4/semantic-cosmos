# WebGPU embedding convergence fix

Release packaging: validation screenshots/videos are retained only in the original local development checkout and are intentionally not published. Historical comparison commands require that checkout and its original commit objects. The code-only release uses the existing Pages workflow under the user’s explicit authorization.

The local `3fe71bd` build produced very different CPU/WebGPU embeddings on a real NVIDIA RTX 4070 Ti. Re-embedding the same 73 records on WebGPU raised pairwise cosine similarity and compressed document positions. The model backend selector controls embedding inference; both backends use the same Rust/WASM graph construction and Canvas projection.

A controlled comparison changed only the browser inference runtime while keeping the pinned model, inputs, CLS pooling, normalization, truncation and hardware. The bundled Transformers.js web distribution contained ONNX Runtime `1.22.0-dev.20250409-89f8206ba4`. The new build bundles Transformers.js source with pinned ONNX Runtime Web/Common `1.30.0` and its matching asyncify JS/WASM assets. This resolves the large inference discrepancy. The precise defective low-level kernel was not isolated; no unsupported assertion about GPU buffer stride or a specific shader is made.

Dynamic Q8 inference also depends on batch composition. Inference now processes one unique input at a time, making row caches independent of append order. Cache keys include the runtime, inference schema and batch size, so old GPU rows are not reused. Existing exported GPU graphs retain their data and show a re-embedding advisory. The UI labels the actual embedding backend. The re-embedding button locks before asynchronous catalogue hydration; repeated clicks cannot start another model Worker. Inference has a 180-second deadline and browser regression has a separate 240-second watchdog.

## Actual hardware comparison

Run from the repository root after `npm run build`:

```powershell
$env:COSMOS_CHROMIUM='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm run test:backends
```

The test reconstructs the baseline worker from commit `3fe71bd`, serves its original bundled runtime only in the baseline browser context, and then tests the current built worker. It uses all 73 real corpus records and six theme definitions, identical graph parameters, and a fixed camera (yaw -0.38, pitch 0.24, zoom 1.44, focus origin). It refuses a missing/software WebGPU adapter. A test-only wrapper counts native `GPUQueue.submit` commands; it does not change coordinates or inference values.

Evidence: [full hardware, vector, coordinate and cache report](verification/gpu-backend-results.json).

| Metric | Baseline CPU | Baseline WebGPU | Fixed CPU | Fixed WebGPU |
| --- | ---: | ---: | ---: | ---: |
| Pairwise cosine median | 0.570060 | 0.759798 | 0.570771 | 0.570790 |
| Document radius median | 88.04 | 41.65 | 86.64 | 88.76 |
| Cold inference, ms | 4442 | 5715 | 3629 | 8593 |
| Warm inference, ms | — | — | 22.3 | 53.0 |
| Native GPU command submissions | 0 | 1379 | 0 | 4897 |

CPU/WebGPU aligned vector cosine median improved from **0.364495 to 0.998875**; the fixed minimum is **0.995642**. Mean absolute pairwise cosine difference is **0.003239**, maximum **0.020014**. All vectors are finite, 512-dimensional and normalized. The adapter is NVIDIA Lovelace, `isFallbackAdapter: false`; CDP identifies an RTX 4070 Ti with driver `32.0.15.8157`, Edge `154.0.4258.37`.

These are a single recorded reference run, not a universal timing promise. Fixed GPU cold inference is slower because of per-input Q8 execution. The new inference bundle is 470041 bytes; asyncify WASM is 26781914 bytes, versus the previous 21596019-byte WASM. These assets remain lazy: default catalogue display downloads neither the model nor inference runtime. The original model weights, 29-record vectors and 73-record precomputed vectors were not replaced.

Q8 CPU/GPU outputs are numerically close rather than bit-identical. Small similarity differences can still change assignments close to a clustering boundary (121 vs 125 total graph nodes in this fixture). The test checks vector agreement, pairwise similarities, finite coordinates and comparable spatial scale; it does not claim identical topology or pixels.

## Regression and demonstration

- `npm test`: 17 numeric/hierarchy cases pass.
- `npm run test:browser`: 15 browser groups pass, including immediate hydration lock, duplicate-click exclusion, Chinese search, nine vendor filters, sources, import/export, offline, mobile and 1k/10k synthetic stress.
- `npm run test:backends`: real GPU submissions, 73-record numerical/scale comparison, obsolete cache isolation, exact warm cache, append/duplicate stability and source navigation pass.
- `npm run check:pages`: original model hashes and matching runtime assets pass.

WebGPU before（本地验证媒体，未发布） and WebGPU after（本地验证媒体，未发布） use the same camera. Fixed CPU（本地验证媒体，未发布） is the matching CPU reference.
Real GPU overview（本地验证媒体，未发布）, event and source satellite（本地验证媒体，未发布）, and dates/evidence/source detail（本地验证媒体，未发布） show actual local UI interaction.
Hierarchical view（本地验证媒体，未发布） uses **1000 clearly labelled synthetic stress records**, not 1000 news items. The real 73-record corpus retains the exact topic layout; the hierarchical construction activates above 400 records.

The original measurements were obtained locally before publication. The code-only release now uses the user's explicit authorization for this project's existing Pages workflow.
