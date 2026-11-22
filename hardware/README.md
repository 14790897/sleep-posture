# 硬件文档索引

## 当前方案：SuperMini 载板

核心板使用现成的 **ESP32-C3 SuperMini**，载板负责 IMU、TP4056 充电、电池接口、电源开关和 TPS63031 3.3 V 升降压。

> **状态（2026-11-22）：首板已手装上电；设计与制造文件完成；充电、外壳和整夜采集尚未验证。**

- [supermini-carrier-full-tp4056/](supermini-carrier-full-tp4056/) — **当前工程（single source of truth）**：EasyEDA 原理图 + PCB
- [gerber-tp4056/](gerber-tp4056/) — **下单文件**：Gerber zip、JLC BOM/CPL、原理图 PDF/PNG
- [enclosure-tp4056/](enclosure-tp4056/) — 两件式 3D 打印外壳（STL + cadquery 源）
- [docs/block-diagram.md](docs/block-diagram.md) — 系统框图、电源、佩戴结构
- [docs/pinout.md](docs/pinout.md) — 裸模组备选方案的引脚与接线
- [bom-supermini-carrier.csv](bom-supermini-carrier.csv) — 载板 BOM（TP4056 + TPS63031）
- [bom-prototype.csv](bom-prototype.csv) — v0 现成模块
- [bom-pcb-v1.csv](bom-pcb-v1.csv) — 裸模组刚性板 BOM（备选）
- [easyeda-pcb-preview.png](easyeda-pcb-preview.png) — PCB 预览图

## 备选方案：裸模组（v1）

如果以后要做得更薄，再回到裸 **ESP32-C3-MINI-1-H4X** + 4 层板：

- [docs/block-diagram.md](docs/block-diagram.md) — 系统框图/电源/佩戴
- [docs/pinout.md](docs/pinout.md) — 裸模组引脚与接线
- [bom-pcb-v1.csv](bom-pcb-v1.csv) — 裸模组 BOM

> 两个方案的固件相同：BMI270 走 GPIO4/5，上电自动探测；SuperMini 载板只是把核心板换成现成开发板。
