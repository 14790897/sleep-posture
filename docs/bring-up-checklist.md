# v0 样机Bring-up 清单

> **当前方案是 SuperMini 载板**：接线/电源/充电以 `hardware/supermini-carrier-full-tp4056/` 为准；下面第 3 节的 I2C 检查仍适用于 BMI270 模块或载板。

按顺序做，每步通过再进入下一步。不要一上来就戴在身上采整夜。

## 1. 收货与断电检查

- [ ] 电池标称 3.7 V，万用表测 3.6–4.2 V；无鼓包、无破皮。
- [ ] 开发板 USB-C 口、排针无短路；IMU 模块丝印型号正确。
- [ ] 杜邦/硅胶线无断芯；JST-PH 插头极性正确（红正黑负）。

## 2. 只插 USB，不接电池

- [ ] 开发板 3V3 对 GND 约 3.3 V。
- [ ] 3V3 对 GND 电阻不为 0（断电测）。
- [ ] 板子不烫；USB 口不松动。

## 3. 接 IMU，扫描 I2C

- [ ] `3V3→VCC`、`GND→GND`、`GPIO4→SDA`、`GPIO5→SCL`。
- [ ] 上电后串口日志出现 `imu: BMI270 ready at 0x68` 或 `imu: LSM6DS3 ready at 0x6a`。
- [ ] 若报错：BMI270 芯片 ID 是 0x24、地址 0x68/0x69；LSM6DS3TR-C 的 WHO_AM_I 是 0x69/0x6A、地址 0x6A/0x6B。检查 SDA/SCL 是否接反、模块是否 3.3 V、SA0/SDO 电平。

## 4. 烧录固件

```
cd sleep-posture\firmware
reconfigure.bat   # 首次/依赖变化后跑一次
build.bat
idf.py -p COMx flash monitor
```

- [ ] 日志出现 `sleep posture firmware v1`。
- [ ] 无重启循环、无 `imu read failed` 刷屏。
- [ ] 设备广播名 `SleepPosture` 能在手机/PC 蓝牙列表看到。

## 5. BLE 连接与 MTU

- [ ] `python tools/ble/ble_logger.py --out data/raw/bringup.csv --duration 60` 能连上。
- [ ] 日志 `mtu=247`（至少 ≥ 27）。
- [ ] 60 s 内 CSV 行数约 3000（50 Hz）；`bad_crc=0`。
- [ ] `seq` 基本连续；丢包率 < 1%。

## 6. 静态重力检查

把设备平放，分别让 `+Z`、`-Z`、`+X`、`-X`、`+Y`、`-Y` 朝上，各 30 s：

- [ ] 朝上的轴读数约 +1000 mg，另外两轴 < 100 mg。
- [ ] 六个方向没有轴映射错误。
- [ ] 静止时陀螺模长 < 2 °/s（校准后）。

## 7. 陀螺校准

- [ ] 设备静止，`ble_logger.py --calibrate` 或发 `0x03`。
- [ ] 日志出现 `gyro bias: ...`。
- [ ] 重新上电后校准仍存在（NVS 生效）。

## 8. 佩戴静态四点

- [ ] 元件面朝外、`TOP` 朝头，带子贴身不勒。
- [ ] 仰/俯/左/右各 3 分钟 × 3 轮，段间休息。
- [ ] `posture_ref.py eval` 稳态准确率 ≥ 95%，unknown < 5%。

## 9. 电池与充电

- [ ] 断开 USB，电池供电正常，BLE 仍可连接。
- [ ] 载板 `VSYS` 是电池电压（3.4–4.2V），不是 5V；SuperMini `5V` 脚接 VSYS。
- [ ] SuperMini `3V3` 脚输出约 3.3V；电池降到约 3.5V 时仍 ≥3.0V（板载 LDO 可能开始掉压）。
- [ ] MCP73831 充电指示灯状态正确；充电电流约 200 mA（PROG 5k）。
- [ ] 连续推流 2 h，电压下降在预期内，板子不烫。
- [ ] 编程时关掉电源开关，只插 SuperMini USB-C；不要同时插两个 USB / 同时供电。
- [ ] 充电时不要戴在身上。

## 10. 常见故障

| 现象 | 优先检查 |
|---|---|
| 串口无日志 | USB 线是否数据线、COM 口、BOOT 按键 |
| `WHO_AM_I` 异常 | SDA/SCL 接反、模块供电、地址 0x6A/0x6B |
| BLE 搜不到 | 广播名、天线方向、供电、是否已连其他主机 |
| 能连但无数据 | MTU < 27、是否订阅 Data 特征、是否发 START_STREAM |
| 数据跳变/乱码 | CRC 过滤、地线接触、I2C 上拉、线太长 |
| 姿态左右反 | 元件面朝向、`TOP` 方向、`ax` 符号 |
| 续航明显偏短 | 是否 50 Hz 连续推流、LDO 发热、电池容量虚标 |
