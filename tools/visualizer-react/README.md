# SleepPosture 3D — React 版

Next.js 16 + React 19 + Tailwind CSS + three.js（Turbopack）。**页面通过 Web Bluetooth 直连板子**，不再需要 Python 桥接。

在线：<https://sleep-posture-3d.vercel.app>

## 部署

Vercel 已连接 GitHub 仓库 `14790897/sleep-posture`：push 到 `main` 会自动生产部署，Pull Request 会自动创建 Preview。Vercel 项目的 Root Directory 已设为 `tools/visualizer-react`。

## 运行

```powershell
cd C:\git-program\claude-hardware\sleep-posture\tools\visualizer-react
npm install
npm run dev
```

用 **Chrome / Edge** 打开 <http://localhost:3000>，点右上角「**连接 BLE**」，在 Windows 弹窗里选 **SleepPosture → Pair**。

- 需要安全上下文：`localhost` 可以，普通 http 域名不行。
- **连接弹窗**：选 SleepPosture 后点 **Pair**。如果连上后出现 MTU 23、找不到自定义服务或连上即断，到「设置 → 蓝牙和其他设备 → SleepPosture → 删除设备」再重连。
- **没有蓝牙适配器**：页面会显示「未检测到可用的蓝牙适配器」。先插回 USB 蓝牙适配器，或在 Windows 设置中打开蓝牙；用系统 Chrome/Edge，内置预览窗没有完整的蓝牙选择器。
- 数据帧 24 字节，需要 ATT MTU ≥ 27。连上但一直没帧时，看「设置 → 诊断」里的 BLE 位（MTU/订阅/句柄/发送）；先删配对再重连。
- 连接后页面会向控制特征写入 Start stream **25 Hz**（`0x01 0x19`，固件 `notify_div=2`）。
- 本项目使用 Web Bluetooth 直连，不依赖 Python 桥接。

## 热更新

`npm run dev` 是 Next 的 **Fast Refresh**：改 React/CSS 后浏览器自动更新，不用手动刷新。预览卡左下角的小 `N` 是 Next 开发工具徽标（仅 dev；生产构建没有）。

## 结构

- `lib/pose-engine.ts`：IMU 姿态引擎。加速度/陀螺互补滤波、3D 全姿态 / 锁航向、静止零偏估计、断流冻结、3 步校准、localStorage（`sp.sensorToBoard.v2` / `sp.yawOffset`）。
- `hooks/useBle.ts`：`navigator.bluetooth.requestDevice` → GATT → data/status notifications；24 字节数据帧与 12 字节状态帧解析、CRC-8、Start stream；**默认 25 Hz**（50 Hz 在 Windows Web Bluetooth 下会丢约 2% notification）。50 Hz 帧写引擎，4 Hz 低优先级更新 React 指标。带 **GATT 自动重连**（400ms→5s 退避）、**3 s 无数据重发 Start stream**、**8 s 无数据强制重连**；手动「断开」/卸载会阻止自动重连。
- `lib/pose-engine.ts` 的 `seqStride` 按 `50 / 推流率` 计算：25 Hz 时固件每 2 帧发一次，正常跳号不再算丢帧；诊断里的「CRC / 丢帧」是真实缺失帧数。
- **HMR 注意**：Next Fast Refresh 对普通组件/CSS 是热更新；但**改了 Hook 顺序**（例如给 `useBle` 增删 `useState/useRef/useEffect`）时，旧页面状态会和新 Hook 顺序对不上，React 会报 `change in the order of Hooks` 并崩溃，需要硬刷新一次。这不是 BLE 掉线；改完 Hook 结构后刷新即可，之后不要再动 Hook 顺序。
- **直连丢帧**：Chrome/Windows 在 50 Hz 下持续丢约 2% notification（静止 160 s 也有 245 次缺口）；默认 25 Hz 静止 60 s 实测 **1,500/1,500 帧、平均 25.08 Hz**。需要更高帧率再改 `STREAM_RATE`，但当前 Windows 链路不建议 50 Hz。
- `components/BoardScene.tsx`：three.js 场景；`next/dynamic` + `ssr:false` 单独加载，避免把 three.js 打进首屏。
- `components/Sidebar.tsx` / `SettingsDialog.tsx` / `CalibrationDialog.tsx` / `Onboarding.tsx`：状态、设置、3 步校准、朝向提示。
- `app/page.tsx`：页面编排；`app/globals.css`：Vercel/Geist 设计 token。

## 交互

- **连接 BLE / 断开**：Web Bluetooth 直连；不需要桥接。
- **3D 全姿态 / 锁航向**：全姿态跟完整 yaw/roll/pitch；锁航向只跟倾斜、不漂。
- **翻转 180°**：模型与实物整体差 180° 时一键修正，存 localStorage，刷新/热更新后保留。
- **归零**：把当前姿态设为基准。
- **设置**：方向、显示航向、测试姿态、3 步校准、BLE 诊断。
- **方向校准（可选）**：平放自动采样 → 垫高 HEAD 30–60° 保持 → 垫高右手边 30–60° 保持；不需要一边抬板子一边按按钮。
- 断流 >0.5 s 模型冻结并提示等待下一帧，不会按最后一帧角速度继续转。

## 设计

- 主设计 skill：`frontend-design`（Anthropic，非模板化 production-grade UI）。
- 视觉参考：Vercel/Geist（浅色 `#fafafa` 页面、`#eaeaea` hairline、Geist Sans/Mono + Noto Sans SC、12px 卡片、6px 控件、蓝色 focus）。
- 质量审查：Vercel Web Interface Guidelines（focus、labels、dialog、reduced-motion、tabular-nums 等）。
- 字体：`geist` npm 包 + `public/fonts/NotoSansSC.woff2`（Google Fonts 子集，OFL）。
