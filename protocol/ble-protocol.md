# SleepPosture BLE 数据协议 v1

面向原型阶段（ESP32-C3 + NimBLE GATT），主机侧用 PC/手机连接。协议只承载 IMU 原始帧、设备姿态估计、电量和控制命令；地面真值标签由主机记录，不下发到数据帧里。

## 1. 角色与广播

- 设备：BLE Peripheral，单连接。
- 广播名：`SleepPosture`（放在 scan response）。
- 广播包：包含 128-bit Service UUID。
- 建议连接参数：连接间隔 15–30 ms，MTU 247。主机可请求 2M PHY，但 v1 不强制。
- **MTU 必须 ≥ 27**：24 字节 Data 帧 + 3 字节 ATT Notification 头。若协商到默认 23，设备会发送失败；主机应在连接后检查 `mtu_size`，必要时主动发起 MTU 交换。
- 设备行为：连接后默认按 MTU=23 处理，**等到 `BLE_GAP_EVENT_MTU` 报告 ≥27 且主机订阅 Data 特征后才发送 Data Notify**；否则静默跳过，避免 NimBLE 截断 24 字节帧。
- 配对/绑定：v1 不做。数据属于个人健康相关数据，采集时保持本地、不经过云。

Service UUID：

```
b7a10001-4c3d-4e2f-9a8b-1c2d3e4f5a60
```

## 2. GATT 表

| 特征 | UUID | 属性 | 方向 | 说明 |
|---|---|---|---|---|
| Control | `b7a10002-...-5a60` | Write / Write No Response | 主机 → 设备 | 启停、校准、打标 |
| Data | `b7a10003-...-5a60` | Notify | 设备 → 主机 | 24 字节 IMU 帧 |
| Status | `b7a10004-...-5a60` | Read / Notify | 设备 → 主机 | 12 字节状态，1 Hz |
| Log | `b7a10005-...-5a60` | Notify（预留） | 设备 → 主机 | v1 预留：离线日志/事件 |

> v0 固件只实现前三个特征；`b7a10005` 在协议里保留，避免以后改 UUID 基址。

Control 写入的第 1 个字节是命令码，后续为参数。未知命令返回 ATT `Request Not Supported (0x06)`。

## 3. Data 帧（24 字节，小端）

| 偏移 | 长度 | 字段 | 类型 | 单位 | 说明 |
|---:|---:|---|---|---|---|
| 0 | 1 | version | uint8 | — | 当前 `0x01` |
| 1 | 1 | flags | uint8 | — | 见下表 |
| 2 | 2 | seq | uint16 | — | 自增序号，回绕 |
| 4 | 4 | t_ms | uint32 | ms | 设备上电后的毫秒数 |
| 8 | 2 | ax_mg | int16 | mg | 加速度 X |
| 10 | 2 | ay_mg | int16 | mg | 加速度 Y |
| 12 | 2 | az_mg | int16 | mg | 加速度 Z |
| 14 | 2 | gx_ddps | int16 | 0.1 °/s | 角速度 X |
| 16 | 2 | gy_ddps | int16 | 0.1 °/s | 角速度 Y |
| 18 | 2 | gz_ddps | int16 | 0.1 °/s | 角速度 Z |
| 20 | 1 | posture | uint8 | — | 0 unknown / 1 supine / 2 prone / 3 left / 4 right / 5 moving |
| 21 | 1 | confidence | uint8 | % | 0–100，moving 时为 0 |
| 22 | 1 | battery | uint8 | % | 0–100，255 表示未知 |
| 23 | 1 | crc8 | uint8 | — | CRC-8/ATM（poly 0x07，init 0x00），覆盖字节 0–22 |

flags：

| bit | 名称 | 含义 |
|---:|---|---|
| 0 | CALIBRATED | 已加载/完成陀螺零偏校准 |
| 1 | POSTURE_VALID | posture 字段是稳定姿态，不是 unknown |
| 2 | MOVING | 当前处于翻身/运动段 |
| 3 | LOW_BATTERY | 电量 < 15% |
| 4 | STREAMING | 主机已开启数据流 |

示例（仰卧、az=+1000 mg、电量 80%、置信度 90）：

```
01 13 34 12 50 C3 00 00 00 00 00 00 E8 03 00 00
00 00 00 00 01 5A 50 3F
```

- `01` version
- `13` flags = CALIBRATED | POSTURE_VALID | STREAMING
- `34 12` seq = 0x1234
- `50 C3 00 00` t_ms = 50000
- `E8 03` az = +1000 mg
- `01` posture = supine
- `5A` confidence = 90
- `50` battery = 80
- `3F` CRC8

### 坐标约定

传感器佩戴在胸骨，**元件面朝外（远离身体）**，板上丝印 `TOP` 朝头部：

- `+X`：受试者左侧（元件面朝外时，板级 +X 在观察者看来朝右，即受试者左侧）
- `+Y`：朝头部
- `+Z`：垂直胸骨向外

这是**右手系**：`X(左) × Y(头) = Z(前)`。不要写成“X=受试者右侧”，否则左右会反。

静止时加速度计“朝上的轴读 +1 g”：

| 姿态 | 主要重力分量 |
|---|---|
| 仰卧 | `az ≈ +1 g` |
| 俯卧 | `az ≈ -1 g` |
| 左侧卧（左侧朝下） | `ax ≈ -1 g` |
| 右侧卧（右侧朝下） | `ax ≈ +1 g` |

如果元件面朝向身体佩戴，左右会互换；如果 `TOP` 朝脚，四类会整体映射错。因此丝印、佩戴说明和固件映射是协议的一部分。

## 4. Status 帧（12 字节，小端）

| 偏移 | 长度 | 字段 | 类型 | 说明 |
|---:|---:|---|---|---|
| 0 | 1 | version | uint8 | `0x01` |
| 1 | 1 | battery | uint8 | %，255 未知 |
| 2 | 1 | posture | uint8 | 同 Data 帧 |
| 3 | 1 | confidence | uint8 | % |
| 4 | 1 | flags | uint8 | 同 Data 帧 |
| 5 | 1 | reserved | uint8 | 0；2026-11-21 起作诊断位：bit0 MTU≥27、bit1 Data 已订阅、bit2 data handle 非 0、bit3 上次 data notify 成功、高 4 位 = MTU/16（15 表示 ≥240） |
| 6 | 2 | session_id | uint16 | 每次上电随机 |
| 8 | 4 | uptime_s | uint32 | 上电秒数 |

Status 每 1 秒 Notify 一次，也支持 Read。主机用 `session_id` 区分不同上电会话，用 `uptime_s` 与 Data 帧的 `t_ms` 交叉校验。

> `reserved` 的诊断位只用于 bring-up/排障；主机工具应忽略未知位。

## 5. Control 命令

| 命令 | 码 | 参数 | 说明 |
|---|---:|---|---|
| START_STREAM | `0x01` | `[rate_hz]` 可选，1–50 | 默认 50 Hz；设备按 `50/rate` 抽取 Notify |
| STOP_STREAM | `0x02` | — | 停止 Notify，但继续采样和姿态计算 |
| CALIB_GYRO | `0x03` | — | 设备静止 2 s，计算陀螺零偏并写 NVS |
| CALIB_MOUNT_SUPINE | `0x04` | — | v1 预留：仰卧安装角标定 |
| CALIB_MOUNT_RIGHT | `0x05` | — | v1 预留：右侧卧标定 |
| MARK_EVENT | `0x06` | `[label]` | 主机打点，设备日志记录 |
| SET_LABEL | `0x07` | `[label]` | 地面真值标签；主要用于主机日志对齐 |
| SET_TIME | `0x08` | `[unix_ms u64]` | v1 预留 |
| CLEAR_CALIB | `0x09` | — | 清除 NVS 中的零偏 |
| SET_RAW_MODE | `0x0a` | `[0/1]` | v1 预留 |

`label` 取值与 posture 一致：0 unknown、1 supine、2 prone、3 left、4 right、5 moving。

## 6. 带宽与时序

- 50 Hz × 24 B = 1200 B/s 应用层负载；加 GATT Notify 头约 1.3 kB/s。
- MTU 247 时，一个 Notification 可容纳多个帧；v1 仍然一帧一个 Notification，便于主机按 `seq` 丢包检测。
- 连接间隔 30 ms 时，每个连接事件发 1–2 个 Notify，50 Hz 需要约 3 个连接事件/秒的余量；实际由主机与设备调度决定。
- `seq` 不连续表示丢包；主机应记录丢包率，不要插值伪造 IMU 数据。
- `t_ms` 是设备单调时钟（上电清零），主机在首帧记录 `host_unix_ms - t_ms` 作为偏移；跨会话必须用 `session_id` 区分。

## 7. 版本与兼容

- `version` 字段用于帧格式升级；主机遇到未知版本应拒绝解析并提示升级。
- 新增字段只能追加在 CRC 之前，并提升 version；v1 主机按长度截断解析。
- 下一版协议考虑收敛到 **20 字节定长帧**（去掉 crc/battery，把 posture/confidence 压进 flags），以兼容默认 MTU=23；在 24B 帧阶段必须遵守 MTU 门控。
- 未来若加入加密/绑定，Service UUID 不变，通过 Control 命令协商；不破坏旧主机的基本读取。

## 8. 安全与隐私

- v1 无配对、无加密：只适合个人、短距离、可信环境。
- 采集文件只保存在本地；文件名和元数据不要写入真实姓名、住址等个人信息。
- 设备广播名固定，不包含 MAC 以外的身份信息。
