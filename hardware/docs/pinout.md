# 引脚分配与接线

> **当前方案是 SuperMini 载板**：见 [current carrier project](../supermini-carrier-full-tp4056/)。下面的 GPIO/IMU/充电引脚表是**裸 ESP32-C3-MINI-1 备选方案**，留作以后做薄板时参考。

> 模组引脚号以 ESP32-C3-MINI-1 数据手册为准；下表按 **GPIO 名称**分配，画原理图时再映射到具体焊盘。

## 1. ESP32-C3 侧

| 信号 | GPIO | 方向 | 说明 | 备注 |
|---|---|---:|---|---|
| I2C SDA | GPIO4 | 双向 | IMU 数据 | 4.7 kΩ 上拉到 3V3 |
| I2C SCL | GPIO5 | 输出 | IMU 时钟 | 4.7 kΩ 上拉到 3V3，400 kHz |
| IMU INT1 | GPIO6 | 输入 | 预留中断/唤醒 | v1 未使用，可留测试点 |
| LED | GPIO7 | 输出 | 状态指示 | 低电平点亮，串 1 kΩ |
| BOOT/用户键 | GPIO9 | 输入 | 下载模式/打点 | 内部上拉，按下为低 |
| VBAT_ADC | GPIO1 | 模拟 | 电池电压 | ADC1_CH1，200 kΩ/200 kΩ 分压 |
| USB D- | GPIO18 | 双向 | USB Serial/JTAG | 与 USB-C D- 相连 |
| USB D+ | GPIO19 | 双向 | USB Serial/JTAG | 与 USB-C D+ 相连 |
| UART TX | GPIO21 | 输出 | 调试串口 | 测试点 |
| UART RX | GPIO20 | 输入 | 调试串口 | 测试点 |
| 备用 | GPIO10 | — | 预留 | 测试点 |
| EN | EN | 输入 | 复位 | 10 kΩ 上拉 + 1 µF 到地 + 按键到地 |
| 3V3 | — | 电源 | LDO 输出 | 1 µF + 100 nF 去耦 |
| GND | — | 电源 | 地 | 多点过孔 |

**避免用作普通 IO**：GPIO2、GPIO8（启动 strapping），GPIO3（JTAG 相关），GPIO18/19 已被 USB 占用。

## 2. IMU 侧（默认 BMI270）

| BMI270 信号 | 连接到 | 说明 |
|---|---|---|
| VDD | 3V3 | 100 nF + 1 µF 去耦 |
| VDDIO | 3V3 | 可与 VDD 同源 |
| GND | GND | 多点接地 |
| SDX / SDA | GPIO4 | I2C 数据 |
| SCX / SCL | GPIO5 | I2C 时钟 |
| SDO / SA0 | GND | 7 位地址 0x68；接 VDDIO 则为 0x69 |
| CSB | VDDIO | 拉高选择 I2C |
| INT1 | GPIO6 | 预留；当前固件轮询，不用中断 |
| INT2 | 悬空/NP | v1 不用 |

固件自动探测 BMI270 `0x68/0x69`；I2C 总线上 4.7 kΩ 上拉即可，模块自带的 10 kΩ 可保留（并联约 3.2 kΩ），不影响 400 kHz。

**备选 LSM6DS3TR-C**：引脚定义与 BMI270 **不兼容**。LSM6DS3TR-C 的 `SA0/SDO` 接 GND → 地址 0x6A，`CS` 拉高选 I2C；固件也会自动探测 `0x6A/0x6B`。画 v1 板时按选定的那一颗连，不要试图共用同一 footprint。

## 3. 电源/充电侧

| 器件 | 引脚 | 连接到 | 说明 |
|---|---|---|---|
| USB-C | VBUS | MCP73831 VDD + 10 µF | 5V 输入 |
| USB-C | GND | GND | |
| USB-C | CC1 | 5.1 kΩ → GND | C 口识别 |
| USB-C | CC2 | 5.1 kΩ → GND | C 口识别 |
| USB-C | D- | GPIO18 | |
| USB-C | D+ | GPIO19 | |
| MCP73831 | PROG | 5 kΩ → GND | 约 200 mA 充电 |
| MCP73831 | STAT | LED → 1 kΩ → VDD | 开漏状态 |
| MCP73831 | VBAT | 电池 + / 电源开关 | 1 µF 到地 |
| 电池 | + | 电源开关 → XC6220/ME6211 VIN | 500 mAh 602535，JST-PH 2.0 |
| 电池 | − | GND | |
| 电源开关 | 两端 | 电池 + ↔ LDO VIN | 单刀单掷 |
| XC6220/ME6211 | VIN | 开关输出 | 1 µF 到地 |
| XC6220/ME6211 | VOUT | 3V3 | 1 µF + 100 nF |
| XC6220/ME6211 | EN | VIN | 上拉使能 |

## 4. 电池分压

```
VBAT ── 200 kΩ ──┬── GPIO1 (ADC1_CH1)
                 │
                200 kΩ
                 │
                GND
GPIO1 ── 100 nF ── GND
```

4.2 V 电池 → 2.1 V 到 ADC；GPIO1 不是 strapping 脚，可以安全使用。200 kΩ/200 kΩ 的源阻抗约 100 kΩ，比 1 MΩ/1 MΩ 更适合 C3 ADC。

## 5. v0 模块接线（不画板）

以 ESP32-C3 SuperMini + BMI270 模块为例：

| SuperMini | IMU 模块 | 说明 |
|---|---|---|
| 3V3 | VCC | 确认模块支持 3.3V |
| GND | GND | |
| GPIO4 | SDA | |
| GPIO5 | SCL | |
| GPIO6 | INT1 | 可悬空 |

电池经 TP4056 模块接开发板 **5V pad**；SuperMini 的板载 LDO 在 LiPo 末端可能失去稳压，第一次上电先用 USB，确认串口日志出现 `imu: BMI270 ready`。不要把 4.2 V 电池直接接 3V3 pad。

## 6. 丝印/装配标记

- 板正面丝印：`TOP ↑ HEAD`，箭头朝头部。
- 板背面丝印：`SleepPosture v1`、`b7a10001`（服务 UUID 前 8 位）、`BAT 3.7V`、`COMPONENT SIDE OUT`。
- **佩戴方向：元件面朝外（远离身体），TOP 朝头**。此时板级 `+X` 指向受试者左侧，固件按 `ax > 0 = 右侧卧` 映射；反装会让左右互换。
- IMU 尽量靠近板中心，远离 USB 座、电池线和天线。
- 天线端（模组天线一侧）下方与周围 **禁止铺铜/走线**，按模组 datasheet 留 keep-out；佩戴时让天线端朝上或朝外。
