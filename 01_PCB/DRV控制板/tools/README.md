# tools/ — 设计工具链（数据源 → KiCad → 嘉立创EDA专业版）

**建立**：2026-10-15
**目的**：让「原理图 / PCB / BOM / 网表」全部由**一份数据源**生成并可复现，再转换成嘉立创EDA专业版工程交付。
**依据**：`00_DeepSeek执行计划.md` §2（EDA = 嘉立创EDA专业版，元件与封装用嘉立创官方库并绑定料号）+ `01_PCB/Motor-project/器件选型规范.md` R0/R3/R9。

---

## 0. 本机环境（2026-10-15 实测）

| 项 | 值 |
|---|---|
| **KiCad** | **10.0.6，装在 `F:\Kicad`**（注册表 `InstallLocation = F:\Kicad`） |
| KiCad CLI | `F:\Kicad\bin\kicad-cli.exe` —— 支持 `sym` / `sch` / `pcb` / `fp` / `jobset` |
| KiCad Python | `F:\Kicad\bin\python.exe`（`import pcbnew` 可用；无 `kipy`） |
| Node.js | v24.19.0 |
| Python | 3.14.6 + PyMuPDF（测量/渲染脚本用） |

> ⚠️ **不要默认 `kicad-cli` 在 `C:\Program Files` 下** —— 本机在 **F 盘**。
> `tools/check-kicad.mjs` 会自动按注册表常见位置 + `where.exe` 找，也可用环境变量 `KICAD_CLI` 指定。

---

## 1. 为什么是这条链路

| 约束 | 结论 |
|---|---|
| 计划要求最终交付**嘉立创EDA专业版**工程 | 必须产出 `.eprj3` |
| 我（AI）**无法操作 JLCEDA Pro 的 GUI** | 只能用脚本生成、再由转换器导入 |
| 嘉立创**官方**提供了 KiCad → eprj3 转换器 | `easyeda/kicad-to-easyeda-eprj3`（Apache-2.0，零 npm 依赖，Node ≥ 18）——**已 vendored 到 `tools/vendor/`** |
| 仓库既有做法是「单一数据源 + 生成器」（`_生成器_V3.1/design.mjs`） | 沿用：`tools/design.config.mjs` + `tools/lib/pins.mjs` 是唯一数据源 |
| **本机有 KiCad** | KiCad 只当**中间格式 + 本地验证器**：用它的解析器与渲染器真检验我们的生成物 |

```text
 tools/lib/pins.mjs          ← STM32G431 LQFP64 引脚（已逐脚核实）
 tools/design.config.mjs     ← 元件表（值 + 嘉立创封装名 + LCSC货号）
            │
            ▼   node tools/gen-lib.mjs
 tools/build/drvctrl.kicad_sym   ← KiCad 符号库
            │
            ├─► node tools/validate-lib.mjs   结构自检（括号/符号数/脚号齐全/防就地改写）
            ├─► node tools/check-kicad.mjs    ★ 用本机 KiCad 真解析 + 渲染 SVG
            │
            ▼   node tools/build.mjs libgen        （官方转换器）
 工程/drvctrl.elibz2             ← 嘉立创EDA专业版**库包**（可直接导入）
            │
            ▼   阶段③/④ 补 gen-sch.mjs / gen-pcb.mjs 后：
 工程/drvctrl.kicad_sch / .kicad_pcb
            │
            ▼   node tools/build.mjs eda            （官方转换器）
 工程/eprj3/drvctrl.eprj3/       ← 嘉立创EDA专业版**工程**（sch/ + pcb/）
```

---

## 2. 命令

在 `01_PCB/DRV控制板/` 目录下执行：

| 命令 | 作用 | 现在能用吗 |
|---|---|---|
| `node tools/build.mjs check` | 数据源自检（引脚 64 脚连续无重复；元件表四要素齐全） | ✅ |
| `node tools/build.mjs lib` | 生成 KiCad 符号库 | ✅ |
| `node tools/validate-lib.mjs` | 库结构自检（含「是否被就地改写」守卫） | ✅ |
| `node tools/check-kicad.mjs` | **★ 用本机 KiCad 真解析并渲染全部符号为 SVG** | ✅ |
| `node tools/build.mjs libgen` | 符号库 + 转成 `工程/drvctrl.elibz2` | ✅ |
| **`node tools/build.mjs guard`** | ★ **交付前必跑**：数据源自检 + 与 KiCad 官方符号库逐脚比对 | ✅ |
| **`node tools/test-guards.mjs`**（或 `build.mjs test`） | ★ **闸门注入测试**：故意注入 5 类错误，确认闸门真的会拦 | ✅ 5/5 |
| `node tools/bus-30v-check.mjs` | 30 V 母线下的分压/过压边界/TVS 选型核算 | ✅ |
| **`node tools/ref-pinmap.mjs [--compare]`** | ★ 从 **KiCad 官方库**提取 STM32G431RBTx 脚号，与 `lib/pins.mjs` 逐脚比对 | ✅ |
| **`node tools/_verify-sym.mjs`** | 校验生成的符号内 64 个「脚号↔引脚名」与数据源一致 | ✅ |
| **`node tools/gen-pin-table.mjs`** | 从数据源**重新生成** `02` 文档的 §4.1 全脚表与 §4.2 汇总表 | ✅ |
| **`node tools/parse-af.mjs`** | 按 `AF0..AF15` **显式列结构**解析 DS12589 Table 13 | ✅ |
| **`node tools/adc-timing.mjs`** | ADC 时序计算器（真实采样档位、两过程分离、扇区占比） | ✅ |
| `node tools/check-lcsc.mjs [C号…｜--from-config]` | 立创货号 → 官方封装名 核实 | ✅ |
| `node tools/build.mjs sch` / `pcb` | 生成原理图 / PCB | ⏸ 阶段③/④ |
| `node tools/build.mjs eda` | KiCad 工程 → `工程/eprj3/*.eprj3` | ⏸ 需先有 sch/pcb |

---

## 3. 本机已实测通过（2026-10-15）

```text
$ node tools/build.mjs check
引脚表：64 脚 ✓ 连续无重复
元件表：14 个条目
✓ 自检通过（3 项 LCSC 货号待绑定，不阻塞阶段②）

$ node tools/gen-lib.mjs
[gen-lib] 14 个符号 -> tools/build/drvctrl.kicad_sym (40294 字节)

$ node tools/validate-lib.mjs
  ✓ 括号平衡
  ✓ 缩进风格与生成器一致（未被就地改写）
  ✓ 顶层符号数 14 = 元件表条目数
  ✓ 引脚数 130 = 期望值
  ✓ LQFP64 符号内 1..64 脚号齐全且唯一
  ✓ 每个符号都有 LCSC 属性行
✓ 结构校验通过

$ node tools/check-kicad.mjs          # ★ 用 KiCad 10.0.6 自己的解析器
kicad-cli : F:\Kicad\bin\kicad-cli.exe
version   : 10.0.6
export svg exit=0  渲染出 14 个符号
✓ KiCad 解析并渲染全部符号通过

$ node tools/build.mjs libgen
Wrote 工程/drvctrl.elibz2: 14 symbols, 0 footprints (19133 bytes)

$ node tools/check-lcsc.mjs --from-config
C431633   LQFP-64_L10.0-W10.0-P0.50-LS12.0-BL   STM32G431RBT6 | ST
C6186     SOT-223-3_L6.5-W3.4-P2.30-LS7.0-BR    AMS1117-3.3
C149620   C0603                                 AC0603KRX7R9BB104 | YAGEO
…（共 11 条全部核实）
```

另做过一次**转换器端到端冒烟**：用官方示例工程 `tools/vendor/example/kicad/kicad-project` 转出完整 eprj3 目录（`.eprj3` 索引 + `sch/Schematic1/P1.esch2` + `pcb/PCB1.epcb2`），格式正确、结构完整。

---

## 3.1 ⚠️ 被 KiCad 抓出来的三个真问题（都已修，留痕防复发）

这三个问题**结构自检一个都发现不了**，是导入 KiCad 真解析后才暴露的——这就是为什么要接 KiCad：

| # | 现象 | 根因 | 修法 |
|---:|---|---|---|
| 1 | `kicad-cli sym upgrade` 报「无法加载库」，**整个库起不来** | `.kicad_sym` 库文件里 **symbol 名不能含冒号**。`Device:C` 是**原理图里的 LIBID**，不是库内符号名 | `gen-lib.mjs` 加 `bareName()`：配置里保留 `库名:符号名` 便于阅读，写库时只取冒号后部分 |
| 2 | 符号能加载了，但**参考号/值的文字压在引脚名上** | 属性默认放在 `(xHalf, yHalf+2.54)`，正落在顶部引脚行上 | 参考号与值移到**体上方 +7.62 mm**、左右分开 |
| 3 | 通用符号（LDO/连接器）**引脚名在体中央撞成一团** | 体宽写死 7.62 mm，装不下 `VOUT`/`SHA`；`Conn_02x16` 更严重（两列名字对撞） | 体宽按「**左右两列最长引脚名之和**」自动算，中间留 2.2 mm 空隙 |

**⇒ 规则**：`gen-lib.mjs` 只保证「结构正确」，**版式必须用 `check-kicad.mjs` 渲染出来目视**。

## 3.2 ⛔ 两条工作纪律（血泪）

| # | 禁止 | 原因 |
|---:|---|---|
| 1 | **不要对 `tools/build/` 里的产物跑 `kicad-cli sym upgrade`** | 它是**原地改写**：把生成物改成 KiCad 的 Tab 缩进 + 新 version，从此磁盘上的文件与 `gen-lib.mjs` 的产物不一致（我踩过一次，`validate-lib.mjs` 直接被打瞎，报了误导性的「符号数 0」）。要验证请用 `check-kicad.mjs`（只读） |
| 2 | 不要靠**缩进**切分 `.kicad_sym` 的符号块 | 顶层符号行与子单元行（`名_0_1`）**缩进完全相同**，靠缩进切会把块切在第一个子单元处。必须用**括号配平**（`validate-lib.mjs` 里的 `matchParen`） |

## 3.3 工具链验证覆盖到哪里 / 没覆盖到哪里（诚实边界）

| 环节 | 验证方式 | 状态 |
|---|---|---|
| 数据源自检（引脚 64 脚、元件四要素） | `build.mjs check` | ✅ |
| KiCad 符号库**语法与内容** | `validate-lib.mjs` | ✅ |
| **KiCad 自己能不能解析**（最强验证） | `check-kicad.mjs` → `sym export svg` | ✅ **14/14 通过** |
| 符号**版式**（有没有撞字） | 渲染 SVG → 转 PNG 目视 | ✅ 已逐个看过并修完（见 §3.1） |
| 库 → `.elibz2` | 官方转换器 `convert-kicad-lib.js` | ✅ |
| KiCad 工程 → `.eprj3` | 官方转换器 + 官方示例冒烟 | ✅ |
| 原理图/PCB 生成 | `gen-sch.mjs` / `gen-pcb.mjs` | ⏸ 阶段③/④ |
| 原理图 **ERC** / PCB **DRC** | `kicad-cli sch erc` / `pcb drc`（本机 CLI 已具备） | ⏸ 有了 sch/pcb 就能在本机跑 |

---

## 4. 收到交付物后请这样验证（用户/Codex 操作，约 10 分钟）

| # | 步骤 | 期望结果 |
|---:|---|---|
| 1 | 嘉立创EDA专业版 → **导入本地库** → 选 `工程/drvctrl.elibz2` | 库列表出现 **14 个器件**；`U?` 的 MCU 符号是**四边出脚、64 个脚号** |
| 2 | 对照 `审查/g431_symbol_rendered_by_kicad.png`（KiCad 渲染的 MCU 符号）抽查引脚 | 与 `02_系统方案与资源分配.md` §4.2 的分配表逐条一致 |
| 3 | 看**引脚名**是否已按本设计重命名 | `PA8 → INHA`、`PB13 → INLA`、`PA6 → FAULT_BKIN`、`PA0 → VBEMF_A`、`PC5 → CAL` |
| 4 | 阶段③ 交付 eprj3 工程后：**工具/封装管理器** → 用 LCSC 货号绑定 | 无「缺失封装」报错；封装名与 `04_物料清单_BOM草案.md` 一致 |
| 5 | 阶段③ 后：**设计 → 检查 DRC / 原理图 ERC** | 与本机 `kicad-cli` 跑出的 ERC/DRC 报告对照 |

---

## 5. 目录说明

```text
tools/
├── build.mjs            总入口（check/lib/libgen/sch/pcb/eda）
├── design.config.mjs    ★ 元件表（单一数据源）
├── lib/pins.mjs         ★ STM32G431 LQFP64 引脚（单一数据源）
├── gen-lib.mjs          符号库生成器（含 bareName：库内符号名不得带冒号）
├── validate-lib.mjs     结构自检 + 「防就地改写」守卫（括号配平切块）
├── check-kicad.mjs      ★ 用本机 KiCad 真解析 + 渲染 SVG
├── check-lcsc.mjs       立创货号 → 官方封装名 核实
├── measure/             说明书/数据手册的像素级测量脚本（本文所有数字都能复算）
├── vendor/              official easyeda/kicad-to-easyeda-eprj3（Apache-2.0，原样保留）
│   ├── scripts/         convert-kicad.js / convert-kicad-lib.js / lib/
│   ├── example/         官方示例工程（用于冒烟）
│   └── test/            官方自测（本机沙箱下部分用例因临时目录受限而失败，与转换逻辑无关）
└── build/               生成产物（可重建）：drvctrl.kicad_sym、svg/
```

**规则**：
- ⛔ 不手工编辑 `tools/build/` 与 `工程/` 下的产物——会被下次生成覆盖（与 `器件选型规范.md` R9 对 V3.1 的要求一致）。
- ⛔ 不对生成物跑任何**原地改写**的 kicad-cli 子命令（见 §3.2）。
- ⛔ 不修改 `tools/vendor/` 里的官方代码；需要改就提 issue 或换版本。
- ✅ 所有设计改动只改 `design.config.mjs` / `lib/pins.mjs`，然后重跑 `node tools/build.mjs`。


---

## 6. ⛔ R1 教训：脚号绝不能靠"文本层推断"（2026-10-15 审核退回）

### 发生了什么

初版 `lib/pins.mjs` 的 64 脚映射，是**从 DS12589 的 PDF 文本层按「第几个数字列」推断**出来的。
数据手册的表格跨页、列会合并，这个办法在 pin 27 之后**整体错位** —— 结果 **36/64 个脚号错**，
并且我在错位数据上"推导"出了两只**根本不存在的 `VCAP_1`/`VCAP_2`**（G431RB 的 LQFP64 没有 VCAP）。

更糟的是：当时 `build.mjs check` 只查「1–64 连续无重复」，**全绿**；
`validate-lib.mjs` 也全绿；KiCad 也能渲染。
**三个检查全过，脚号还是错的** —— 我还写了"已逐脚目视核实"。

### 现在的防线（三层，缺一不可）

| 层 | 工具 | 证明什么 |
|---|---|---|
| L1 结构 | `validate-lib.mjs`、`_verify-sym.mjs` | 括号平衡、符号数、脚号齐全、**生成物与数据源一致** |
| L2 **独立权威** | `ref-pinmap.mjs --compare` | **数据源本身的脚号正确**（与 KiCad 官方库 64/64 一致） |
| L3 渲染 | `check-kicad.mjs` | KiCad 能解析、版式不撞字 |

**核心认识（写进纪律）**：

> **结构自检（连续无重复 / 括号平衡 / 能被渲染）一律不构成"引脚正确"的证据。**
> 引脚正确性只能由**独立第三方数据源逐脚比对**保证 —— 用自己的数据去校验自己，永远会"自证正确"。

### 附带的工程纪律

- `gen-pin-table.mjs`：**`02` 文档的引脚表由数据源生成，不手改** —— 手改必然再次漂移。
- `ref-pinmap.mjs` 用 KiCad 官方库时注意：**官方库用 `(extends "基符号")` 派生封装变体，引脚在基符号里**，
  不跟 `extends` 会解析到 0 个引脚（我踩过）。

### L2 的一个局限（诚实边界）

KiCad 官方库给的是**脚号↔引脚名**，**不含 AF 编号与模拟通道**。
AF/ADC 仍然要回 DS12589 的 Table 12/13 —— 但对这两张表，**必须显式建立列结构**
（`parse-af.mjs` 按 `AF0..AF15` 十六列解析，并用 PA0/PA1/PA2 逐格验证过列定义），
**不能再靠 token 顺序猜**（R2 就是这么错的）。


---

## 7. ★ 闸门注入测试：证明闸门真的会拦（2026-10-15 新增）

依据仓库纪律「**一条从未失败过的规则等于没有规则**」，新增 `tools/test-guards.mjs`：
故意向 `lib/pins.mjs` 注入 5 类错误，验证它们**确实被拦**。

| # | 注入的错误 | 由哪个闸门拦 | 结果 |
|---:|---|---|---|
| 1 | 必需信号漏分配（删掉 `DRV_EN`） | `build.mjs check` | ✅ 被拦 |
| 2 | 模拟信号分到没有 ADC 的脚（VN → PB15） | `build.mjs check` | ✅ 被拦 |
| 3 | PWM 低边分到没有 CHxN 的脚（INLA → PB10） | `build.mjs check` | ✅ 被拦 |
| 4 | 分配标记重复占用（两个脚都叫 VBUS） | `build.mjs check` | ✅ 被拦 |
| 5 | **脚号错位（pin 27/28 名字对调）** | **`ref-pinmap.mjs --compare`（独立官方比对）** | ✅ 被拦 |

> ★ **第 5 条是这次注入测试抓出来的真问题**：脚号错位在 `build.mjs check` 下**完全通过**
> —— 因为自检只查「结构自洽」，而脚号错位是「与官方不符」。
> **只有独立第三方数据源比对才能拦这一类错误** —— 这正是 R1 的教训。
> 注入测试跑出这个结果后，才把 `ref-pinmap.mjs` 定为**必跑闸门**。

**新增的自检项**（都是踩过坑才加的）：
- `REQUIRED_SIGNALS` 清单：必需信号（6 路 PWM + 10 路模拟 + 3 路控制 + 调试/时钟）**任何一个没分配就报错**
  —— 起因：重排引脚时把 `DRV_EN`/`CAL` 弄丢了，而旧自检只查「已分配的脚合法」，不查「必需的信号都在」。
- 分配标记**不得重复占用**（电源/地/未用类除外）。
- 被分配为模拟输入的脚**必须有 ADC 通道**。
- 被分配为 `INLA/INLB/INLC` 的脚**必须有 TIM1_CHxN**。

---

## 8. ★ 2026-10-15 用户拍板的引脚变更（R4：改引脚做真同步）

用户不接受「浮空相与 VN 采样时差可忽略」这种放行，**直接改引脚做双 ADC 真同步**：

| 功能 | 旧 | **新** | 通道 | 原因 |
|---|---|---|---|---|
| **VN** | `PB12` | **`PC3`** | **ADC2_IN9**（也含 ADC1_IN9） | `PB12` 只有 ADC1 通道 ⇒ 无法同步；`PC3` 双 ADC 通道 |
| `VBUS` | `PB11` | **`PC1`** | ADC2_IN7 | 腾出 ADC1 |
| `CBUS` | `PA4` | **`PA7`** | ADC2_IN4 | 腾出 `PA4` |
| `IOUTC` | `PB1` | **`PC5`** | ADC2_IN11 | `PB1` 让给低边 PWM |
| `NTC` | `PA5` | **`PA4`** | ADC2_IN17 | 接替 `CBUS` |
| 低边 PWM | `PB13/PB14/PB15` | **`PB1/PB13/PB14`** | TIM1_CH3N/CH1N/CH2N（**AF6**） | 用 ADC1 脚换 PWM 能力（顺带把低边全部收到 AF6） |
| `DRV_EN` / `CAL` | `PA7` / `PC5` | **`PA5` / `PA3`** | GPIO | 接替腾出的脚 |

**最终 ADC 分工**：ADC1 = 浮空相（`PA0/1/2`）+ `IOUTB`（`PB0`）；
ADC2 = **VN（`PC3`，与浮空相同触发同步）** + `IOUTA`（`PC4`）+ `IOUTC`（`PC5`）+ 慢速组（`VBUS/CBUS/NTC`）。
空出 `PB11/PB12/PB15`（`PB12` 保留 `TIM1_BKIN` 作备用刹车）。

**双 ADC 可同步的引脚集合**（同时含 ADC1 与 ADC2 通道）：`PA0 PA1 PA2 PC0 PC1 PC2 PC3`
（运行时用 `DUAL_ADC_PINS` 从 `lib/pins.mjs` 读，不要再手工维护）。
