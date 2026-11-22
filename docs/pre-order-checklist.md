# 打样前检查清单 — SuperMini 载板 v0.5

> 生成日期：2026-11-10。板子：`hardware/supermini-carrier-full-tp4056/`。本文是下单前的最后核对页；电气细节见 `hardware/supermini-carrier-full-tp4056/`，BOM 见 `hardware/bom-supermini-carrier.csv`。

## 1. 当前状态

| 项目 | 结果 |
|---|---|
| 板框 | 30.73 × 50.8 mm（1210 × 2000 mil），**四角圆角 R3（3 mm）**，2 层，**1.0 mm**（外壳也兼容 1.6 mm） |
| 装配孔 | 4 × Ø2.2 mm 非金属化 M2 孔：(2.794,2.794)、(2.032,25.654)、(28.194,33.528)、(28.194,48.768) mm；配套外壳见 `hardware/enclosure-tp4056/` |
| 元件 | 26 个器件：BMI270、TP4056、TPS63031+L1、USB-C、JST-PH、SPDT、8R/9C/LED；**H1 是合并后的 16 焊盘（2×8）SuperMini 裸焊盘封装，无件**；SuperMini 横放，**2026-11-18 在 PCB 上旋转 180°，USB-C 端朝左板边、天线端在板内右侧**（外壳已跟随） |
| 自动布线 | Freerouting 6 mil 规则；0 未布线 |
| PCB DRC | 间距错误 **0**、连接错误 **0**；剩 **1 条 Netlist Error**（见 §5，属占位器件元数据，不是断路） |
| 原理图 | 已按厂商引脚重建（含 U3/L1/C7-C9）；网表与 PCB 逐引脚一致 |
| 原理图 DRC | 0 错误 / 0 警告（NC 引脚已加 noConnected） |
| GND 铺铜 | 顶层+底层 GND 整板实心填充（8…1992 mil）；已确认顶层与底层都有地平面 |
| 制造文件 | `hardware/gerber-tp4056/supermini-carrier-tp4056_gerber.zip`（GTL/GBL/GTO/GBO/GTS/GBS/GTP/GKO + PTH/NPTH/Via 钻孔 + 飞针） |
| 原理图 | `hardware/gerber-tp4056/supermini-carrier-tp4056_schematic.pdf`（A4，厂商符号）+ `.png` |
| 坐标文件 | `hardware/gerber-tp4056/supermini-carrier-tp4056_CPL.csv`（mm，26 件，EasyEDA 原始；H1 为 16 脚合并件，Mid **10.084,40.64** mm / **rot 0**；J2 在 26.035,7.493 mm）；JLC 下单用 `_JLCPCB_CPL.csv`（24 个贴片件，含 J2） |
| 外壳 | `hardware/enclosure-tp4056/`：两件式 3D 打印外壳（35.33×55.4×12.4 mm），**4× M2×12 自攻螺丝**，STEP/STL 已导出；**已按模组 180° 旋转 + 1.0/1.6 mm 双板厚适配**：左壁模组 USB 开口（y 31–50.3，z 3.2–9.2）、右壁天线窗（z 3.2–7.0）、J1 开口 z 3.0–8.1、J2 z 3.3–9.7、SW1 地板 1.0 mm 深让位 |
| 设计 BOM | `hardware/gerber-tp4056/supermini-carrier-tp4056_BOM.tsv`（EasyEDA 导出，仅供参考，R2-R8/C5/C9 值仍是占位） |
| 实际 BOM | **`hardware/bom-supermini-carrier.csv`**（下单以这份为准）；JLC SMT 用 `hardware/gerber-tp4056/supermini-carrier-tp4056_JLCPCB_BOM.csv` |

## 2. 电气复核结论

### 2.1 BMI270（I2C 模式，地址 0x68）

| 焊盘 | 名称 | 接法 | 依据 |
|---:|---|---|---|
| 1 | SDO | GND | 0x68；不可悬空 |
| 2 | ASDX | NC | 辅助接口不用可悬空，**不要接 GND** |
| 3 | ASCX | NC | 同上 |
| 4 | INT1 | IMU_INT → GPIO6 | |
| 5 | VDDIO | +3V3，C4 100nF | 数据手册要求 VDDIO 100nF |
| 6 | GNDIO | GND | |
| 7 | GND | GND | |
| 8 | VDD | +3V3，C5 100nF | 数据手册要求 VDD 100nF |
| 9 | INT2 | NC | 不用请悬空 |
| 10 | OCSB | NC | OIS 不用，参考设计悬空；仅在 ois_en=0 时允许接 GND |
| 11 | OSDO | NC | 同上 |
| 12 | CSB | +3V3 | I2C 模式硬接 VDDIO |
| 13 | SCX | I2C_SCL，R6 4.7k 上拉 | |
| 14 | SDX | I2C_SDA，R5 4.7k 上拉 | |

> 结论：PCB 现有接法正确；不需要改线。C5 在 BOM 里按 100nF 装（原 1µF 占位只影响 BOM 元数据）。

### 2.2 充电 / 电源

- **TP4056-42-EMSOP8**：PROG = R1 5.1k → I ≈ 1200/5.1 ≈ **235 mA**（500 mAh 电池约 0.47C，约 2.3 h 充满）。线性充电，耗散约 (5−3.7)×0.235 ≈ **0.31 W**，EMSOP8 带散热焊盘，首板充电 10 min 摸温度。
- **3.3 V 稳压**：TPS63031DSKR（U3）+ L1 1.5µH，1.8–5.5 V 输入 → 固定 3.3 V/900 mA；VSYS 接 U3-5/6/8，输出 +3V3 供 SuperMini 的 H1.3；H1.1(5V) 已断开 NC，**不要接回 VSYS**。
- **充电指示**：VBUS → R2 1k → LED → STAT；充电时 STAT 拉低，LED 约 2.4 mA。
- **USB-C**：CC1/CC2 各 5.1k 下拉（R7/R8），VBUS 两组引脚都接，GND+4 个固定脚接地，D+/D−/SBU 悬空；仅充电。
- **电池**：JST-PH 1=VBAT，2/3/4=GND；必须买带保护板的 602535 500mAh，红正黑负。
  - 板端 J2 = **JST-PH 2.0 2P 卧式 S2B-PH-SM4-TB(LF)(SN)**（立创 **C295747**，SMT 已含在 JLC CPL，不用另买）。
  - 电池端买 **PH2.0 2P 母头**：JST **PHR-2** 胶壳 + **SPH-002T-P0.5S** 端子，或直接买预压好的 **PH2.0 2P 端子线 10cm**（`bom-prototype.csv` 里的“JST-PH 2.0 端子线 2Pin 10cm”）。
  - **不要买 JST-XH 2.54 / SH1.0 / MX1.25 / 杜邦 2.54**，间距不对；PH2.0 是 2.0 mm、带卡扣。
  - **极性**：J2 的 1 脚是 VBAT、2 脚是 GND；插头红线必须对 1 脚。不同厂家的 PH2.0 线序可能红黑相反，插之前用万用表确认；反接会烧 TP4056（没有反接保护）。
  - **焊接**：买**预压好的 PH2.0 2P 端子线**，剪断裸线端，焊到电池**保护板的输出线 P+/P−**（或电池自带引出线），不要直接焊电芯/镍片；先套热缩管，焊后分别热缩再整体热缩；焊完先量 3.7–4.2 V 和极性，再插 J2。散端子（SPH-002T-P0.5S）要用 PH2.0 压线钳压接，不建议直接焊。
- **电池检测**：VSYS → R3/R4 100k/100k → GPIO1；4.2 V 时 ADC 约 2.1 V，C6 100nF 滤波。开关关掉时读数为 0，属正常。
- **I2C**：4.7k 上拉到 +3V3；总线很短，400 kHz 没问题。
- **没有**：ESD 保护、电池反接保护、power-path。v0.5 接受；插拔/充电时注意，别反接电池，充电时不要戴。

## 3. 佩戴 / 结构

- SuperMini Plus **直接焊在 H1 的 16 个 SMD 焊盘上（2×8、2.54 mm，无插座，不可拆换）**；总厚度比母座方案低约 8 mm（不含电池/软袋）。
- **有 4 个 Ø2.2 mm M2 装配孔**，配套两件式 3D 打印外壳（`hardware/enclosure-tp4056/`，4× M2×12 自攻螺丝）；胸带方案仍用薄布袋/软硅胶仓，弹性胸带 35–40 mm 宽；电池放侧袋，不要压在天线正后方。
- 硅胶线焊点打胶做应力释放；线留松弛，不要让焊点直接受力。
- 丝印方向：`TOP / HEAD` 朝头；元件面朝外。
- **天线端现在在模组右端、板内**（2026-11-18 旋转 180° 后），不再伸出左板边；天线下方载板 GND 铺铜已**开禁布**（顶层+底层，x≈16.7–23.2 mm、y≈35.6–45.6 mm，陶瓷天线外扩约 2 mm；SCL/SDA 已绕开）；首次打样仍请实测 2.4 GHz 距离/丢包。电池/金属不要贴在天线附近。
- 模组 USB-C 现在朝 **左板边**（插头从左侧插入）；外壳已同步更新为**左壁 USB 开口、右壁天线窗**（左壁开口跨整个模组宽度，同时让开模组 PCB 的约 1.0 mm 板边悬出），并按 **1.0/1.6 mm 双板厚** 开 J1/J2/天线窗和 SW1 地板让位。

## 4. 嘉立创下单步骤

1. 打开 <https://www.jlcpcb.com/> → PCB 下单 → 上传 `hardware/gerber-tp4056/supermini-carrier-tp4056_gerber.zip`。
2. 参数：
   - 尺寸 30.73 × 50.8 mm，**2 层**，**1.0 mm** 厚（外壳也兼容 1.6 mm，见 §5），1 oz 铜；
   - 表面处理建议 **ENIG**（LGA-14 0.5 mm 间距，HASL 也能做但平整度差）；
   - 阻焊/丝印颜色随意；R3 圆角已画在板框里；
   - 首单 **5 片**。
3. SMT 贴片：
   - 只贴 **Top 面**；`SW1` 是通孔件，**不要**放进 SMT，自己手焊；H1 现在是 16 个裸 SMD 焊盘（无件），也不进 SMT/CPL；
   - 上传坐标文件 **`hardware/gerber-tp4056/supermini-carrier-tp4056_JLCPCB_CPL.csv`**（已剔除 SW1 手焊件和 H1/H2 裸焊盘，24 个贴片件，**含 J2**）；
   - BOM 用 **`hardware/gerber-tp4056/supermini-carrier-tp4056_JLCPCB_BOM.csv`**；R1/R7/R8=5.1k、R2=1k、R3/R4=100k、R5/R6=4.7k、C1/C3=4.7uF、C2/C7/C8/C9=10uF、C4/C5/C6=100nF、L1=1.5uH；
   - 手焊件：SW1 和 SuperMini Plus 模块（模块直接焊在 H1 的 16 个焊盘上）；SW1 在板上旋转了 90°（CPL 里 28.067, 27.178 mm / rot 90），按丝印方向装；J2（JST-PH）是贴片件，已包含在 SMT 里；完整采购清单仍用 `bom-supermini-carrier.csv`；
   - 24 个 LCSC 料号已核对（TP4056=C21417、TPS63031DSKR=C15516、L1 DFE201612E-1R5M=P2=C882597）；库存/价格下单时复核。
   - BMI270、USB-C、JST、LED 属扩展料，会有上料费；BMI270 需要钢网/回流，建议让嘉立创贴。
4. 下单前在购物车复核 LCSC 库存/价格；BOM 里的料号是 2026-11 快照。
5. **ESP32-C3 SuperMini Plus V2** 开发板单独买 2 块（淘宝），不要打 SMT；22.5×18 mm、2×8 / 2.54 mm、引脚顺序与原 SuperMini 相同，**直接焊到 H1/H2 的 SMD 焊盘上（无插座）**。想用外置天线时，需把板上的天线跳线/0Ω 改到 U.FL 端，再接 2.4 GHz 天线。

## 5. 已知问题 / 为什么 DRC 还有 1 条 Netlist Error

- **2026-11-18 模组 180° 旋转**：H1 从 (393,1600) rot 180 改为 **(397,1600) rot 0**（右移 4 mil 让 1 脚离开左下 R3 圆角板框），+3V3/I2C_SDA/I2C_SCL/IMU_INT/VBAT_ADC 全部重布（SDA/INT 与 +3V3 顶层、SCL/VBAT 底层，模组焊盘内过孔）；PCB DRC 只剩下面这条 U2 元数据 Netlist Error。3D 模型 Transform 改为 `945,709,0,180,0,0,-29.5,0,0`，STEP 里模组 bbox **−2.67…21.34 × 31.65…49.63 × 1.6…5.72 mm**（USB-C 在左、悬出板边约 2.7 mm）。Gerber/CPL/BOM/3D STEP 已重导，备份 `pcb/PCB1.epcb2.rotate180-final-20261118-1447`。
- **2026-11-18 双板厚适配（已完成）**：外壳按 1.6 mm 高位元件 + 1.0 mm 通孔脚的最坏包络开孔：J1 z 3.0–8.1、J2 z 3.3–9.7、天线窗 z 3.2–7.0、SW1 地板 1.0 mm 深让位；STEP 布尔检查 110 个实体在 +3.0（1.6 mm）和 +2.4（1.0 mm top-seated）两个框下与底壳/上盖干涉均为 **0**。PCB 工程/3D STEP 的 stackup 仍是 1.6 mm；如果下单 1.0 mm，建议把 PCB stackup 改成 1.0 后重导 STEP（外壳两种都装得下）。
- **2026-11-18 天线禁布（已完成）**：陶瓷天线投影 x 18.68–21.24、y 37.64–43.64 mm，禁布取 **x 16.69–23.19、y 35.64–45.64 mm**（约 2 mm 外扩），顶层+底层（REGION `9531e5eb535ce7f3`，layer MULTI，prohibit TRACK/COPPER/FILL/PLANE）；SCL 斜线和 SDA 折线已绕开；PCB DRC 0 间距/0 连接，只剩 U2 误报。Gerber/3D STEP 已重导（电源分散后最终 Gerber 60,641 B，见下），备份 `pcb/PCB1.epcb2.antkeepout-20261118-1724`。
- **2026-11-20 电源路径复核（没有 power-path）**：J1 VBUS 只到 TP4056 的 VCC/CE；U2 的 BAT 脚就是 VBAT 节点，经 J2 电池和 SW1 到 VSYS；U3 的 VIN(5)/EN(6)/VINA(8) 都接 VSYS，PS/SYNC(7) 接 GND，VOUT(1)/FB(10) 接 +3V3。**VBUS 与 VSYS 之间没有直通**。TP4056 是充电器，不是 power-path：不接电池时，TPS63031 的输入只能靠 BAT 脚；负载平均电流高于终止阈值（约 24–30 mA）时可停在 4.2 V CV，像 235 mA 限流的 4.2 V 源；一旦低于阈值就终止，BAT 高阻，约 25 µF 电容被拉低，3.3 V 会 brownout，再充形成 1–4 s 打嗝。冷启动时 VBAT<2.9 V 只有 23.5 mA 涓流，可能带不动 TPS63031+ESP32，永远起不来。**台架可先关 SW1 把 BAT 充到 4.2 V，再开 SW1 短时试；正式使用必须接电池**。要无电池/边充边用，需把 USB 5 V 经肖特基直接送 TPS63031 VIN，或换 BQ24075/BQ25180 等带 power-path 的充电器。
- **2026-11-20 不接电池的电流预期**：TP4056 在空载/无电池时把 BAT 电容充到 4.2 V 后就终止，输入电流掉到约 55 µA standby；所以“不接电池串 USB 表测 225–245 mA”不会成立。要看到 235 mA，必须接电池或给 BAT 加 >235 mA 的负载。

- PCB 里 R2–R8 仍然共用 **10 kΩ 占位器件**（C25804），C5 是 1 µF，C9 是 100 nF，U2 的 Footprint 属性为空；原理图里是实际值（R2=1k、R3/R4=100k、R5/R6=4.7k、R7/R8=5.1k、C5=100nF、C9=10uF）。EasyEDA 的网表比较把“器件值/料号”也算差异，所以报 1 条 Netlist Error；**引脚连通性已经逐网络核对一致，0 条 Connection Error**。
- 不影响 Gerber/打样；**装配以 `bom-supermini-carrier.csv` 为准**，JLC 用导出的 `_JLCPCB_BOM.csv`（已按实际值修正）。不要为了消这条错误在已布线的 PCB 上跑「从原理图导入变更」——实测会清空 U2 封装引用、且错误不消失。
- 原理图已换成 **厂商符号 + 局部实线**：充电链路（USB-C→TP4056→R1/D1/R2）、电池分压（R3/R4/C6）、J2→SW1、USB-C CC→R7/R8、IMU_INT 都走实线；SDA/SCL 也已从 H1/H2 经 U1 拉到 R5/R6 上拉（实线），只剩电源/地等用电源标志。单页 A4，左栏电源/电池、右栏核心/IMU；SDA/SCL/IMU_INT/CC 跨块信号用网络标签；**GND 改为每个 GND 引脚独立 GND 标志**（相邻引脚错开长度）。原理图网表与 PCB **逐引脚 0 差异**；**原理图 DRC 0 错误 / 0 警告**。
- 故意 NC 的引脚（U1-2/3/9/10/11、J1 SBU/DN/DP、SW1-3、H1-1/5/6/8、H2-3..8）已加 `noConnected` 标记，不再产生 CHECKFLOATPIN 警告；不需要处理。

## 6. 首板 Bring-up（简版）

1. 目视：BMI270 方向、USB-C 引脚、JST 极性、H1/H2 的 1 脚丝印；万用表测 3V3–GND 不短路。
   - **测试点（2026-11-21）**：TP1 VBUS、TP2 VBAT、TP3 VSYS、TP4 +3V3、TP5 GND（顶面 SMD）；TP6 IMU_INT（顶面）；TP7 I2C_SDA、TP8 I2C_SCL、TP9 GND（底面通孔，模块下方）。PCB 丝印标了 VBUS/VBAT/VSYS/3V3/GND/INT/SDA/SCL/GND；原理图 TP1–TP9 是 `Convert to PCB = no` 的文档符号。
2. 只插充电口、不接电池：VBUS 5 V；TP4056 会把 BAT 电容充到约 4.2 V 后终止，输入电流掉到约 55 µA，CHRG 可能以 1–4 s 闪烁（datasheet 的 no-battery 指示）。要测 225–245 mA 充电电流，必须接电池（或给 BAT 加 >235 mA 负载）；不要用“不接电池”判断充电器好坏。
3. 接电池、开 SW1：VSYS=VBAT，U3 输出 3V3≈3.3 V；SuperMini 能启动。
4. 插 SuperMini、烧固件；串口应出现 `BMI270 ready at 0x68`。
5. I2C 扫描 0x68；读 WHO_AM_I=0x24（BMI270）或 0x26（BMI220，固件已支持）；当前首板为 0x26，串口应出现 `BMI220 ready at 0x68`。
6. 静态六面重力检查；BLE 连接、50 Hz 数据、CRC=0。
7. 充电 10 min 摸 TP4056/电池温度；测 U3 输出 3.3 V 在 150 mA 负载下仍 ≥3.2 V；整机跑 2 h 看压降。

## 7. v1 再说

- 加 ESD（USBLC6-2SC6）、电池反接保护（P-MOS 理想二极管）、power-path（BQ25180）。
- 加 2 个 M2/2 mm 安装孔或穿带孔；加 6 个独立测试点焊盘。
- 若追求薄：裸 ESP32-C3-MINI-1-H4X + 4 层板，去掉 H1/H2 焊盘（模块直接贴装/金手指）。
