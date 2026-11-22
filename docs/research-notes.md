# 调研与核查记录

本文件记录 2026-11-03 这轮器件/算法调研里**已核实**的事实、**仍需复核**的点，以及来源。价格/库存是查询快照，LCSC/JLC 页面动态加载，下单前必须重新核对。

## 1. 主控 / ESP32-C3

已核实：

- ESP32-C3 全系单核 RISC-V 160 MHz、400 KB SRAM、无 PSRAM；供电 3.0–3.6 V。
- BLE TX 峰值：0 dBm 170 mA、9 dBm 190 mA、20 dBm 340 mA、-15 dBm 100 mA；RX 86 mA。
- deep sleep 5 µA（RTC timer + RTC memory）、light sleep 130 µA、power-off 1 µA（芯片级）。
- **ESP32-C3-MINI-1-N4 已 NRND**；H4X（105°C）为 Recommended，LCSC **C41349510**；N4X（85°C）可作替代，料号待核对。
- LCSC 料号：MINI-1-N4 C2838502、MINI-1-H4X C41349510、WROOM-02-N4 C2934560、C3FH4 C2858491。价格快照：N4 ¥18.64/1+、H4X ¥18.67/1+、WROOM-02 ¥27.3/1+、C3FH4 ¥12–17。
- 天线：模组放板边、天线伸出版边，天线区全层禁铜/禁器件；外壳内至少 15 mm 净空；远离电池/金属/晶振。
- 电池不要贴在天线正后方（核查阶段发现原调研的“电池放天线反面”建议与 keep-out 冲突，已弃用）。
- SuperMini 批次可能用 C3FN4（EOL）或 C3FH4；样机可接受，多买备件，v1 不依赖。

来源：

- ESP32-C3-MINI-1 datasheet: https://documentation.espressif.com/esp32-c3-mini-1_datasheet_en.html
- ESP32-C3 datasheet: https://documentation.espressif.com/esp32-c3_datasheet_en.html
- ESP32-C3 硬件设计指南: https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c3/pcb-layout-design.html
- LCSC: https://www.lcsc.com/product-detail/C41349510.html , https://www.lcsc.com/product-detail/C2838502.html

## 2. IMU

已核实：

- **最终决定（2026-11-03）**：默认 **BMI270（LCSC C2836813）**，使用 Espressif 托管组件 **`espressif/bmi270` v1.1.0**（I2C 低层驱动，自动加载 Bosch 配置固件，支持 ODR/量程与 g/dps 读取）。该包不支持 SPI/FIFO/中断/aux，但 50 Hz 轮询够用。LSM6DS3TR-C 保留为备选，固件上电自动探测两者。
- **LSM6DS3TR-C（LCSC C967633）**：LGA-14 2.5×3.0 mm，±2/4/8/16 g，±125–2000 °/s，4 KB FIFO，I2C/SPI；组合低功耗约 0.29 mA；参考价 ¥5–8；库存约 2 万（查询快照）。
- **BMI270（LCSC C2836813）**：LGA-14 2.5×3.0 mm，±2–16 g，±125–2000 °/s，2 KB FIFO；低功耗 IMU 约 420 µA，加速度计单独可到 µA 级（低 ODR）；参考价 ¥6.5–12。上电需要 Bosch 配置固件，但 `espressif/bmi270` 包已内置并自动写入，不需要自己维护 8 KB blob。
- **QMI8658A（LCSC C3021082）**：国产替代，组合约 0.75 mA，加速度计 30–55 µA；需另写驱动；参考价 ¥5–9。
- LSM6DSO 比 LSM6DS3TR-C 贵 2–3 倍，性能过剩；LSM6DSV16X/ISM330DHCX/ICM-42688-P 更贵/更偏工业；MPU-6050 已 EOL、3.9 mA，不要用于新设计。
- 嘉立创 SMT：这些 IMU 都在**扩展库**，不是基础库；LGA-14 0.5 mm 间距需钢网/回流/显微镜/X-ray 抽检。**BMI270 与 LSM6DS3TR-C 引脚不兼容**，v1 板子二选一。

来源：

- ST LSM6DS3TR-C: https://www.st.com/en/mems-and-sensors/lsm6ds3tr-c.html
- LCSC C967633: https://www.lcsc.com/product-detail/C967633.html
- QMI8658A datasheet: https://www.qstcorp.com/upload/pdf/202512/13-52-25%20QMI8658A%20Datasheet%20Rev%20D.pdf
- LCSC C3021082: https://www.lcsc.com/product-detail/C3021082.html
- Espressif BMI270 组件: https://components.espressif.com/components/espressif/bmi270
- BMI270 datasheet: https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmi270-ds000.pdf
- LCSC C2836813: https://www.lcsc.com/product-detail/C2836813.html

## 3. 电源 / 充电 / 续航

已核实/强相关：

- **LiPo 4.2 V 不能直连 C3（3.0–3.6 V）**，必须 LDO/充电管理。
- TP4056（C16581）：Rprog 5.1 kΩ ≈ 235 mA；模块常见，但要确认 CC1/CC2 5.1 kΩ，否则 C-to-C 线可能不供电；无 power-path 时边充边用会影响终止判断。
- MCP73831（C424093）：PROG 5 kΩ ≈ 200 mA，SOT-23-5，v1 首选。
- XC6220B331（C69318，待核对）低 Iq/低 dropout；ME6211C33（C82942）可作替代。
- 500 mAh 602535 带保护板（C5154891）；300 mAh 602030（C5182587）为紧凑替代。
- **续航**：连续 50 Hz BLE 推流 + 未深度睡眠优化时，300–600 mAh 约 **5–10 h**；7 天需要 IMU FIFO + C3 深睡 + 每 10–30 s 一包姿态结果（500 mAh 估算约 12.8 天，仅估算）。不要承诺 7 天。

来源：

- ESP-IDF BLE performance: https://docs.espressif.com/projects/esp-techpedia/en/latest/esp-friends/advanced-development/ble-application-note/performance.html
- TP4056 datasheet: https://www.lcsc.com/datasheet/C16581.pdf
- MCP73831: https://www.microchip.com/en-us/product/MCP73831
- XC6220: https://product.torexsemi.com/en/series/xc6220
- LCSC C5154891: https://www.lcsc.com/product-detail/C5154891.html

## 4. 佩戴位置与文献预期

已核实/已修正：

- 胸骨/胸骨旁单点 IMU 是四类可分性最好的位置；腹部次选；腰/背/腕/踝不建议作四类主方案。
- **俯卧召回不能笼统写成 39%–65%**：
  - 39% 来自 Ferrer-Lluís 的胸骨手机方案（单研究，样本少，CI 宽）；
  - 65% 来自 Hexoskin 右侧腰位口袋，不是胸骨；
  - 两者不能合成“胸骨范围”。
- **四类胸骨单点文献有 95.9%–99.2% 的报告**，但样本多为 7–21 人、单夜、受控环境；不能把 87.6%（腹部 12 角度）混进来当作四类准确率。
- 中间姿态（±15° 窄主瓣之外）约占 40% 时间；±45° 四扇区会把这些强行归入最近类，建议输出连续角度 + 置信度 + unknown/过渡。
- 真实居家合理预期：总体 85%–95%；俯卧单独看，目标 65%（拉伸 80%）。
- 头/颈与躯干位置一致率约 46%（Cerritelli 2021，4 人 1 夜，证据弱）；摄像机应看躯干，不能只看头。
- 成人每夜体位变化约 24–34 次（KAKENHI 视频研究，29 人 2 晚）；不要写“10–30 次”的下限 10。

来源：

- Tate et al. 2020, JCSM: https://pmc.ncbi.nlm.nih.gov/articles/PMC7053030/
- Ferrer-Lluís et al. 2021, Sensors: https://pmc.ncbi.nlm.nih.gov/articles/PMC8198328/
- Cerritelli et al. 2021: https://pmc.ncbi.nlm.nih.gov/articles/PMC8686797/
- Abdulsadig & Rodríguez-Villegas 2023, IEEE Access: https://doi.org/10.1109/ACCESS.2023.3246266
- KAKENHI 睡姿研究: https://kaken.nii.ac.jp/en/report/KAKENHI-PROJECT-14570060/145700602003kenkyu_seika_hokoku_gaiyo/

## 5. 算法

已核实/建议：

- C3 是 RV32IMC 160 MHz、无 FPU；规则/线性模型优先，CNN/TCN 不适合单人四类。
- 25 Hz 加速度计足够；需要翻身检测时陀螺 25–50 Hz；2–5 s 特征窗、1 s 步长；30–60 s 迟滞/中值平滑。
- 特征以重力分量/双角度为主，动态统计只做辅助。
- 输出 4 类 + unknown/过渡，并给连续角度/置信度；不要只给硬标签。
- 验证按夜/人分组，报告 time-weighted 混淆矩阵、macro-F1、每类敏感度；不要随机打散窗口。
- 文献数字要分开指标：95.9% 是 agreement、0.87/0.94 是 AUC、0.76 是 balanced accuracy，不能都叫“准确率”。

来源：

- Abdulsadig 2023: https://doi.org/10.1109/ACCESS.2023.3246266
- Ferrer-Lluís 2021: https://pmc.ncbi.nlm.nih.gov/articles/PMC8198328/
- Kapoor & Narayanan 2023: https://arxiv.org/abs/2207.07048
- Varoquaux & Cheplygina 2022: https://pubmed.ncbi.nlm.nih.gov/35413988/

## 6. BLE / 固件

已核实/已修：

- NimBLE 适合 C3；50 Hz × 24 B 仅约 1.2 kB/s，瓶颈是 MTU/连接事件，不是带宽。
- **MTU=23 时 24 B 帧会被 NimBLE 截断**；固件必须等 `BLE_GAP_EVENT_MTU` 报告 ≥27 且主机订阅 Data 后再发。已在 `ble_service.c` 加门控。
- 下一版协议建议收敛到 20 B 定长帧，兼容默认 MTU，并支持多帧拼接。
- 时间戳：设备 `esp_timer` 上电毫秒 + `session_id`；主机记录首帧墙钟偏移。
- 低功耗先 modem sleep + 15–30 ms 连接间隔；300 mAh 连续流式约 13–21 h（研究估算），整夜够用；7 天需 FIFO/深睡。
- 离线日志用 LittleFS，默认存 1 Hz 摘要，原始 50 Hz 不长期落盘。
- OTA 首版走 USB Serial/JTAG，分区预留双 OTA + rollback。

来源：

- ESP-IDF NimBLE: https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-reference/bluetooth/nimble/index.html
- NimBLE GATT: https://mynewt.apache.org/latest/network/ble_hs/ble_gatts.html
- ESP-IDF power management: https://docs.espressif.com/projects/esp-idf/en/stable/esp32c3/api-reference/system/power_management.html
- ESP-IDF LittleFS: https://components.espressif.com/components/joltwallet/littlefs

## 7. 仍需复核 / 本轮限制

- LCSC/JLC 的价格、库存、SMT 上料费是动态加载；本轮部分数字来自查询快照，**无法在静态页面复现**。
- XC6220B331MR-G 的 C69318 可能是克隆/替代料号，下单前核对。
- JST-PH、电源开关、按键、LED、ESD 的具体 LCSC 料号未逐一核对。
- 部分文献数字（Yoon、Tate 的俯卧占比、Kukwa 的模态/人数、2026 综述是否正式发表）未能逐篇在线核对；引用前补 DOI/页码，查不到的删除或标“待核”。
- 本轮 WebSearch 配额已用尽；后续如需补查，发一条新消息继续。
