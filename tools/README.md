# PC 端工具

## 目录

- `ble/` — BLE 采集与离线姿态评估（`ble_logger.py`、`posture_ref.py`）
- `visualizer-react/` — 当前 Next.js + Web Bluetooth 直连 3D 应用

## 安装

```
python -m pip install -r tools/requirements.txt
```

Windows 上 `bleak` 使用 WinRT，需要系统蓝牙打开；不需要额外的驱动。

## 1. 采集：`ble_logger.py`

扫描并连接 `SleepPosture`，订阅 Data/Status，写 CSV。

```bash
python tools/ble/ble_logger.py --out data/raw/night01_20261103.csv --calibrate --schedule "supine=180,prone=180,left=180,right=180"
```

常用参数：

| 参数 | 说明 |
|---|---|
| `--out` | 输出 CSV |
| `--schedule` | 按顺序发送地面真值标签，`姿态=秒`，逗号分隔 |
| `--duration` | 总时长（秒）；0 表示直到 Ctrl-C |
| `--rate` | Notify 频率 1–50 Hz，默认 50 |
| `--calibrate` | 开始前发陀螺零偏校准，需静止 3 s |
| `--address` | 直接按 BLE 地址连接，跳过扫描 |
| `--keep-bad` | CRC 错误的行也写入（默认丢弃） |

CSV 字段见 `protocol/ble-protocol.md`；`label_name` 是地面真值，`posture_name` 是设备估计。

整夜采集示例（5 Hz Notify，降低功耗；设备仍 50 Hz 采样）：

```bash
python tools/ble/ble_logger.py --out data/raw/night01_20261103.csv --rate 5 --duration 28800
```

> 24 字节 Data 帧需要 ATT MTU ≥ 27。logger 会打印 `mtu=`；若小于 27，设备端会跳过 Data Notify，先解决 MTU 再采。

## 2. 自检：`posture_ref.py selftest`

用合成四姿态数据验证阈值分类与迟滞逻辑：

```bash
python tools/ble/posture_ref.py selftest
```

期望：`synthetic per-sample accuracy: 100.00%`，`settled correctly: 12/12`。

## 3. 评估：`posture_ref.py eval`

```bash
python tools/ble/posture_ref.py eval data/raw/night01_20261103.csv --settle 10
```

输出：

- 阈值分类与迟滞状态机的样本准确率；
- 稳态时间加权准确率（跳过每段前 `--settle` 秒）；
- 四类 precision/recall/F1；
- 4×4 混淆矩阵；
- unknown 比例。

## 4. 基线模型：`posture_ref.py train`

```bash
python tools/ble/posture_ref.py train "data/raw/night*.csv"
```

- 2 s 窗口、1 s 步长，6 轴 × 4 统计量 = 24 维特征；
- 按文件名前缀分组（`night01_...` → `night01`），留一组交叉验证；
- 输出随机森林的混淆矩阵与 macro-F1。

**注意**：文件名前缀必须能区分夜晚/受试者，否则分组交叉验证会泄漏。建议 `night01_*.csv`、`night02_*.csv`。

## 5. 3D 可视化：`visualizer-react/`

Next.js + three.js + Web Bluetooth 直连板子，不需要 Python 桥接：

```bash
cd tools/visualizer-react
npm install
npm run dev
```

浏览器打开 <http://localhost:3000>，点「连接 BLE」，在 Windows 弹窗里选 **SleepPosture → Pair**。在线版：<https://sleep-posture-3d.vercel.app>。详细说明见 `tools/visualizer-react/README.md`。

## 6. 数据约定

- `t_ms` 是设备上电毫秒；`host_unix_ms` 是主机墙钟。
- 分析时按 `crc_ok == 1` 过滤；`seq` 缺口用于统计丢包。
- `label_name` 为空的行不进入四类评估。
- 不要手改 `data/raw/` 下的原始 CSV；清洗结果写到 `data/processed/`。
