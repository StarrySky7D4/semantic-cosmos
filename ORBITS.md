# 本地三维轨道补丁

发布打包说明：验证截图和演示视频仅保留在原本地开发目录，不发布；历史性能对比须使用原开发分支。以下为此前本地验证记录，发布仅使用用户已授权的本项目 Pages 工作流。

基线：`f2ee556`，分支 `local/halfyear-universe`。仅本地构建、测试和演示；没有推送、触发 Actions 或部署。原 73 条资料、向量和 GPU 一致性修复保留。

## 行为与边界

- 星云、星系、恒星系语义位置固定；文字行星只有展示位置运动。原始 `node.pos`、检索关系、归类、导出 JSON 和工作区存储不写入动画时间或坐标。
- 恒星系 ID 决定轨道倾角与升交点方向，行星有小倾角偏差；来源卫星继续偏转。全部轨迹由真实三维椭圆采样后用同一相机投影，卫星位置叠加行星的当前展示位置。
- 解简化开普勒方程，偏心率为 0.06–0.28。轨道是语义展示示意：为保留初始语义云，保留投影法向残差，并限制行星半长轴 2–24；焦点为局部引导中心。它不模拟真实恒星质量、引力单位或 N 体作用。
- 时间由毫秒时钟推进，速度 0.25–3 倍。全局暂停、继续、重置可用；默认选中行星或恒星系时冻结该系统，释放时扣除暂停时长，保留相位。取消“选中时暂停”后可在详情旁观察卫星运动。自转是轻量三维方向标记。
- 拾取使用刚绘制的展示坐标，聚焦相机跟随当前展示位置；手动拖动释放跟随。选中根/分支时其自身没有公转，不冻结整幅宇宙。
- 遵守 `prefers-reduced-motion`，可显式启用。支持 visibility/freeze/resume 生命周期；逻辑时间排除隐藏时长。仅轨道运动时，桌面近景至多约 30 Hz、远景约 10 Hz、移动端至多约 20 Hz；用户开启相机自转时按相机刷新。
- 只为可见行星按需创建轨道定义，桌面前沿 594、移动端 234，额外来源卫星最多 6。轨迹线最多桌面 32/移动端 12 条。没有全量 N 体求解、全量轨道逐帧更新或新增依赖。

## 本次实测

Edge 154.0.4258.37；真实 NVIDIA Lovelace adapter，`isFallbackAdapter=false`。相同数据、构图参数、1500×1000、缩放 2、相机自转；基线 app 从 git 的 `f2ee556` 编译，新版开启运动和轨迹；单阶段采样约 1.8 秒。渲染开销包含 Canvas 绘制和轨道更新，不包含嵌入或构图。

| 资料 | 可见节点 | 基线单帧中位数 | 轨道版中位数 | 轨道版 P95 | 已创建行星轨道 |
|---|---:|---:|---:|---:|---:|
| 73 条真实资料 | 123 | 1.8 ms | 2.1 ms | 2.6 ms | 73 |
| 1000 条合成，seed 42 | 594 | 2.5 ms | 3.1 ms | 4.3 ms | 463 |
| 10000 条合成，seed 42 | 594 | 2.8 ms | 3.4 ms | 3.9 ms | 451 |

390×844、4 倍 CPU 限速、10000 条合成：234 节点，单帧中位数 9.5 ms、P95 11.3 ms；实际渲染间隔中位数 54.5 ms。只运动、不转相机的真实资料：近景间隔 36.4 ms、远景 103 ms。没有运行 10 万条，也不据此承诺其性能。

CPU 与实际硬件 WebGPU 对同一 73 条资料运行：对齐余弦最低 0.9956418、中位数 0.9988745；GPU 命令提交 4897 次。嵌入总共处理 73 条资料与 6 个主题输入；冷推理 CPU 3685 ms、GPU 9152 ms，GPU 冷加载没有更快。各自重建的 121/125 节点图都验证了相同三维投影路径；数值误差导致边界聚类有差异，不声称像素或拓扑完全相同。

**环境验证边界：**本 Windows Edge 窗口即使通过 CDP 最小化仍报告 `document.hidden=false`，未发隐藏/冻结事件；可见页的 CDP freeze 也未停止 RAF。后台排除时间和恢复通过明确标记的 DOM 生命周期事件验证（隐藏 700 ms，恢复后逻辑时间只增加约 103 ms），没有声称真实系统后台转换已验证。30/60/144 Hz 的纯时钟测试通过。

## 复现与证据

```powershell
$env:COSMOS_CHROMIUM='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npm test
npm run build
npm run test:orbits
npm run test:browser
npm run check:pages
```

轨道专项自己启动/清理 `127.0.0.1:4197`；总超时 180 秒，单次推理 60 秒，导入 20 秒；单元测试单项 10 秒、独立看门狗 30 秒。大压力图通过 JSON 文件导入，避免测试工具对大文本框 fill 的超时。Playwright 录屏所需 ffmpeg 未安装，使用浏览器原生 `canvas.captureStream(20)` + `MediaRecorder` 捕获真实运行画面，没有新增录屏依赖或生成假帧。

若已有 `127.0.0.1:4205` 演示服务，运行 `node tests/orbits-picking.cjs`；`--keep-open` 保留本次自己的浏览器窗口。没有该服务时在另一终端设置 `$env:PORT='4205'` 后运行 `npm run serve`。鼠标测试从实时位置点击正在移动的行星；视频验证实际解码 14 帧、1030×914，播放时间推进。

- `verification/orbits-browser-results.json`：轨道、前后性能、硬件 GPU 和已说明的后台边界。
- `verification/orbits-interaction-results.json`：实际移动拾取、近/远景刷新与视频播放。
- `verification/after-results.json`：15 组兼容回归全部 PASS；21 项单元测试全部 PASS。
- `verification/semantic-cosmos-orbits.webm`：约 1.67 MB 的实际 Canvas 运动，含总览、暂停及事件卫星场景；视频画面不包含侧栏控件，控件与证据详情见截图。
- `verification/orbits-multiple-planes.png`、`orbits-event-and-satellites.png`、`orbits-evidence-detail.png`、`orbits-mobile.png`：真实浏览器截图。移动端图使用合成压力资料。

Library 附件标识另存于工作区 `semantic-cosmos-demo/orbit-library-delivery.json`；Windows 不支持上传工具返回的 POSIX xattr，故记录原文件对应的 Library ID/版本而没有声称已设置 xattr。

既有 Pages 发布路径仍为 `.github/workflows/pages.yml` 的 Actions；发布例外尚未授权。本地提交和 dist 已准备，下一步在父对话取得明确发布授权后再处理该路径。
