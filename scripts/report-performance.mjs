import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync('verification/'+p+'.json')),before=read('baseline-browser'),after=read('after-29-browser'),b=read('baseline-compute'),a=read('after-compute'),render=read('render-comparison'),qa=read('after-results'),cache=read('embedding-cache');
const median=x=>x.slice().sort((a,b)=>a-b)[Math.floor(x.length/2)],fmt=x=>x.toFixed(2),r0=render.results[0].runs,r1=render.results[1].runs;
const rows=[100,200,400].map(n=>{const old=b.rows.find(r=>r.n===n),next=a.rows.find(r=>r.n===n);return `| ${n} / 64 维合成 | ${fmt(old.medianMs)} | ${fmt(next.medianMs)} |`;}).join('\n');
const large=qa.stress.map(r=>`| ${r.n} / 64 维合成 | ${r.cpuThrottle}× | ${r.importMs} | ${r.visible} | ${fmt(r.drawMedianMs)} / ${fmt(r.drawP95Ms)} |`).join('\n');
fs.writeFileSync('PERFORMANCE.md',`# 本地验证与性能证据

2026-09-30，Windows、Node ${a.node}、Edge ${qa.browser}。所有新闻资料均与合成压力数据分开；未运行十万条。浏览器、机器负载与 GPU 会影响结果。首屏为单次测量，只作同机观察；构建与渲染对照各运行三次。

## 同一原始 29 条资料的首屏

| 指标 | v0.4.0 / 90fe59c | 新版同数据 |
|---|---:|---:|
| 页面打开至 graph 就绪 / ms | ${before.readyMs} | ${after.readyMs} |
| index.html / bytes | ${before.htmlBytes} | ${after.htmlBytes} |
| app.js / bytes | ${before.appBytes} | ${after.appBytes} |

旧首屏内嵌完整向量、WASM 和计算 Worker，并重新构图。新版首屏内嵌预计算目录和检索摘要，不读取向量或启动构图 Worker；完整原文、来源、文本位置与关系通过最多 32 条的分片读取。目录与 ID 索引仍是 O(N)，不是无限规模或恒定内存方案。73 条版本的首屏另见 verification/after-73-browser.json，不与 29 条混作同数据加速比。

## 构图与布局：精确路径与分层路径

同一固定 seed=42 数据、每规模三次、中位毫秒。这里比较两种算法，**不是相同近邻召回质量的加速**。

| 输入 | 旧精确路径 / ms | 分层路径 / ms |
|---|---:|---:|
${rows}

10000 条 / 64 维分层构建中位 ${fmt(a.rows.find(r=>r.n===10000).medianMs)} ms，266577 次向量比较；最大单元 32 条、最多 496 个无向局部对。未分配全库 N×N 矩阵。2–400 条默认保留精确路径，大库自动分层；基准对小库显式设置 scalable。分层使用固定语义平面或固定主题定义，退化内容用 ID 分片；只保留局部近邻，可能漏掉跨分区关系，没有大库 ANN 或虫洞召回。追加时根归属和语义路径前缀稳定；跨容量边界的叶分片及聚合中心可以变化。

## 同一图谱的渲染

以同一 1000 条合成图谱（1273 节点）导入原版与新版，视口 1500×1000、zoom=2、depth=8、显示局部球；各取 3 轮、每轮 120 帧。原版仅添加性能计时器，源码来自 git 90fe59c。

| 指标：三轮中位值 | 原版 | 新版 |
|---|---:|---:|
| 可见节点 | ${r0[0].visible} | ${r1[0].visible} |
| 绘制耗时中位 / ms | ${fmt(median(r0.map(r=>r.drawMedianMs)))} | ${fmt(median(r1.map(r=>r.drawMedianMs)))} |
| 帧间隔 P95 / ms | ${fmt(median(r0.map(r=>r.frameP95Ms)))} | ${fmt(median(r1.map(r=>r.frameP95Ms)))} |

收益来自缩放/深度前沿、可见节点预算、邻接索引、过滤结果缓存和较低的球线细节。隐藏内容仍能搜索、导航和导出。桌面最多 600、窄屏最多 240（预留最多 6 颗来源卫星）；不是把全部节点绘得更快。帧间隔受本机刷新率影响，不宣称其他设备固定帧率。

## 实际浏览器压力

| 输入 | CPU 节流 | 导入并构建 / ms | 绘制节点 | 绘制中位 / P95 ms |
|---|---:|---:|---:|---:|
${large}

4× 节流是浏览器模拟，不等同真实低端手机。另在 390×844 视口检查无横向溢出、240 节点预算、缩放和 pointer cancel。1000 条目录测试验证只读取部分资料分片、不读取全库向量，搜索可加载未展开记录。

## 嵌入缓存：独立于上述渲染与布局

73 条资料加 6 个主题定义共 79 个输入，真实本地 ONNX/WASM 冷运行 ${fmt(cache.cold.durationMs)} ms。第二次 ${fmt(cache.warm.durationMs)} ms，复用全部输入、计算 0 条；追加 1 个新文本及 1 个重复文本后，只计算 1 条。这里没有旧缓存实现的同机时间对照，不把冷/热差异称为渲染加速。

逐文本检查点由输入及模型 revision、后端、池化、dtype、截断配置标识。每个新向量写一次，避免随批次反复重写整个增长数组。重新嵌入与已保存 73 条参考的最大余弦偏差为 ${qa.maxReferenceBrowserCosineDeviation}。

## 测试及复现

17 项数值、结构、原文保留、日期不确定性、ID/向量一致性、退化向量、稳定根归属、预算/搜索路径与分片测试通过。每项 10 秒超时，另用独立父进程 30 秒看门狗处理同步阻塞；200 毫秒同步阻塞探针已验证只终止自己的测试子进程。先前叶 ID 覆盖父 ID 导致自循环的故障与修复记录见 verification/test-stall.json。浏览器检查结果为 ${qa.status}，错误 ${qa.errors.length}、外部请求 ${qa.externalRequests}；在 /semantic-cosmos/ 项目路径实际验证模型、WASM、Worker、分片及离线缓存。导出前补齐全部原文、来源和向量；单文件查看与 WASM 重建也通过。

~~~sh
npm ci --ignore-scripts
npm run build
npm test
npm run check:pages
# COSMOS_CHROMIUM 可指定已安装 Edge/Chromium
npm run test:browser
node scripts/benchmark.mjs after
node scripts/prepare-render-baseline.mjs
node scripts/compare-render.cjs
node scripts/report-performance.mjs
~~~

同数据首屏：临时设置 COSMOS_BASELINE_DATA=public/data/news-vectors.json，执行 build 与 node scripts/profile-browser.cjs after-29；随后清除该变量并重新 build，恢复 73 条。旧首屏原始证据保存在 verification/baseline-browser.json；再次复现旧版需使用 90fe59c 源码。

关键证据：verification/baseline-compute.json、after-compute.json、render-comparison.json、embedding-cache.json、after-results.json。原始资料 news-source.json 和 news-vectors.json 未改写。版本是本地候选，Pages 发布仍依赖已有 Actions，需要用户单独批准；本次未推送或触发 CI。
`);
console.log('PERFORMANCE.md generated from executed measurements.');
