# 固件说明

ESP-IDF 工程，目标 `esp32c3`，BLE 使用 NimBLE。

## 目录

| 文件 | 作用 |
|---|---|
| `main/main.c` | 初始化、50 Hz 采样任务、1 Hz 状态任务 |
| `main/imu.c` | 统一 IMU 接口 + 上电自动探测（BMI270 0x24 / BMI220 0x26 / LSM6DS3TR-C） |
| `main/imu_bmi270.c` | BMI270 驱动，调用 `espressif/bmi270` 托管组件 |
| `main/imu_bmi220.c` | BMI220 驱动 + 本地 8 KB Bosch 配置镜像（`bmi220fw.h`，BSD-3-Clause） |
| `main/imu_lsm6ds3.c` | LSM6DS3TR-C I2C 驱动（52 Hz、±2 g、±250 dps） |
| `main/posture.c` | 重力矢量分类 + 迟滞状态机 + 运动检测 |
| `main/calibration.c` | 陀螺零偏校准与 NVS 保存 |
| `main/ble_service.c` | NimBLE GATT 服务、Notify、控制命令 |
| `main/protocol.h/.c` | 帧格式、命令码、CRC8 |
| `main/battery.c` | GPIO1 ADC 电池电压/电量 |
| `build.bat` | 本机 Windows 编译封装（先清 `MSYSTEM` 再加载 IDF） |
| `reconfigure.bat` | 依赖/组件清单变化后重新跑 CMake 配置 |
| `main/idf_component.yml` | 托管依赖：`espressif/bmi270 ^1.1.0`；BMI220 配置镜像在 `main/bmi220fw.h` |

## 编译

本机已安装 ESP-IDF（`C:\Espressif\frameworks\esp-idf-v5.5.2`，实际版本以 `idf.py --version` 为准）。在项目目录：

```
cd sleep-posture\firmware
build.bat
```

`build.bat` 会：

1. 清除 Git Bash 注入的 `MSYSTEM`（否则 `export.bat` 拒绝运行）；
2. 调用 `export.bat` 加载工具链；
3. 首次自动 `idf.py set-target esp32c3`；
4. `idf.py build`。

> 若 ESP-IDF 不在 `C:\Espressif\frameworks\esp-idf-v5.5.2`，先设置 `IDF_PATH` 环境变量再运行 `build.bat`。
>
> 修改 `main/idf_component.yml` 或首次拉取托管组件后，先运行 `reconfigure.bat`，再 `build.bat`。组件会下载到 `managed_components/`（已 gitignore）。

产物：`build/sleep_posture.bin`（当前约 0.5 MB）。

手动方式（ESP-IDF CMD/PowerShell 终端）：

```
idf.py set-target esp32c3
idf.py build
idf.py -p COMx flash monitor
```

## v0 接线（SuperMini 载板）

当前方案是 SuperMini 载板，接线以 `hardware/supermini-carrier-full-tp4056/` 为准。核心连接：

| SuperMini 引脚 | 载板网络 | 说明 |
|---|---|---|
| H1-1 `5V` | VSYS | 电池经开关后的 3.4–4.2V |
| H1-2 `GND` | GND | |
| H1-3 `3V3` | +3V3 | **SuperMini LDO 输出**，给 BMI270/BMI220 |
| H1-4 `GPIO4` | I2C_SDA | |
| H1-7 `GPIO1` | VBAT_ADC | 200k/200k 分压 |
| H2-1 `GPIO5` | I2C_SCL | |
| H2-2 `GPIO6` | IMU_INT | 可选 |

> 编程时关掉载板电源开关（`PROG: PWR OFF`），只插 SuperMini 的 USB-C；不要同时给 SuperMini USB 和 VSYS 供电。

若用裸 LSM6DS3TR-C 模块，接线为 `3V3→VCC`、`GND→GND`、`GPIO4→SDA`、`GPIO5→SCL`，地址 0x6A/0x6B。

## 启动日志

正常应看到：

```
sleep posture firmware v1
imu: BMI270 ready at 0x68, 50 Hz, +/-2 g, +/-250 dps
imu: detected BMI270 at 0x68
ble: connected, conn_handle=...
ble: mtu updated: 247
```

用 BMI220（WHO_AM_I=0x26）时会先看到 `BMI270: Unexpected chip ID 0x26`，随后：

```
BMI220: BMI220 ready at 0x68, 50 Hz, +/-2 g, +/-250 dps
imu: detected BMI220 at 0x68
```

这是自动探测的正常提示，不是故障。用 LSM6DS3TR-C 时会显示 `LSM6DS3 ready at 0x6a, WHO_AM_I=0x6a`。

## 校准

1. 设备静止放在桌面，主机发 `0x03`（或 `ble_logger.py --calibrate`）。
2. 2 s 后日志出现 `gyro bias: ...`，NVS 写入成功。
3. 清校准：发 `0x09`。

安装方向靠丝印 `TOP` 朝头部；v1 才会加两姿态安装角标定（命令 `0x04/0x05` 已预留）。

## 已知限制

- v0 不做离线存储：BLE 断开期间的数据不补。
- v0 不做 light sleep / modem sleep 调优：连续 50 Hz 推流按研究快照约 5–10 h（300–600 mAh），整夜采集建议 `--rate 5/10`，必须实测。
- 默认 BMI270 走 `espressif/bmi270` 托管包；BMI220 用本地 Bosch BSD-3-Clause 8 KB 配置镜像（`main/bmi220fw.h`），两者都 50 Hz 轮询，够用。要 FIFO/深睡时再换 Bosch SensorAPI 或自己补。
- LSM6DS3TR-C 驱动保留，上电自动探测；BMI270 与 BMI220 同为 LGA-14 封装、引脚兼容，LSM6DS3TR-C 不兼容，v1 PCB 默认按 BMI2xy 画。
- **BLE 数据通知**：24 B 帧需要 ATT MTU ≥ 27。固件缓存 `BLE_GAP_EVENT_MTU` 的值；若仍 <27，首次发送时用 `ble_att_mtu()` 补查一次并缓存（不要每帧查询，实测每帧查会在约 1.3 s 后拖死 BLE 主机）。不再用 Data 订阅标志做硬门控，避免重连时订阅事件缺失导致 0 帧。
- Status 帧的 `reserved` 字节自 2026-11-21 起是诊断位（MTU/订阅/句柄/发送结果），主机可忽略。
- 分类阈值和迟滞参数在 `posture.c` 的 `sp_posture_init()` 里，改动后需重新编译。
- 本机 IDF 实际为 v6.1，I2C 组件已拆分为 `esp_driver_i2c`；`main/CMakeLists.txt` 已按此配置。
- v1 主控用 ESP32-C3-MINI-1-H4X；MINI-1-N4 已 NRND，不要用于新板。

## 下一步固件工作

- [ ] 两姿态安装角标定（仰卧 + 右侧卧 → 旋转矩阵）
- [ ] LittleFS 离线 CSV 记录与重连补传
- [ ] modem sleep / 动态连接间隔
- [ ] IMU FIFO + INT1 中断采样
- [ ] 20 字节紧凑帧（兼容 MTU=23）
- [ ] OTA（可选）
