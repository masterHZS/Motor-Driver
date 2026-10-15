中文 | [English](README.en.md)

# kicad-to-easyeda-eprj3

将 KiCAD 工程文件转换为嘉立创EDA（EasyEDA Pro）的 eprj3 工程格式，并将 KiCad 库转换为嘉立创EDA库文件 `.elibz2`。Convert KiCAD project files to the eprj3 project format of EasyEDA Pro, and KiCad libraries to the EasyEDA Pro library format `.elibz2`.

## 功能

- **工程转换**：批量遍历目录下所有 `.kicad_sch` / `.kicad_pcb`，生成完整的 eprj3 文件夹工程（`<name>.eprj3` 索引 + `sch/` + `pcb/`）
- **库转换**：把一个目录下的全部 KiCad 库（`*.kicad_sym` 符号库 + `*.pretty/*.kicad_mod` 封装库）打包成一个嘉立创EDA专业版库文件 `.elibz2`

## 环境要求

- Node.js ≥ 18，无任何 npm 依赖。

## 用法

### 1) KiCad 工程 → eprj3 工程（批量）

```bash
node scripts/convert-kicad.js convert <KiCad工程目录> <输出目录> [--project-name <名称>]
```

案例 — 转换本仓库自带的示例工程：

```bash
node scripts/convert-kicad.js convert example/kicad/kicad-project ./eprj3 --project-name kicad-project
```

输出：

```text
Created eprj3 project at D:/…/eprj3
  sch: kicad-project.kicad_sch -> D:/…/eprj3/sch/Schematic1/P1.esch2
  pcb: kicad-project.kicad_pcb -> D:/…/eprj3/pcb/PCB1.epcb2
```

生成的工程可直接用嘉立创EDA专业版打开：`<输出目录>/kicad-project.eprj3`，内含 `sch/`（原理图）与 `pcb/`（PCB）。

- 两个目录按位置传入：第 1 个是 KiCad 工程目录，第 2 个是 eprj3 输出目录
- 工程目录下每个 `*.kicad_sch` 生成一张原理图（`Schematic1`、`Schematic2` …），每个 `*.kicad_pcb` 生成一块板（`PCB1`、`PCB2` …）

### 2) KiCad 库目录 → 嘉立创EDA库包 .elibz2

```bash
node scripts/convert-kicad-lib.js convert <KiCad库目录> <输出.elibz2> [--name <库名>]
```

案例 — 把符号库与封装库放进同一个目录后整体打包（目录扫描不递归，`.kicad_sym` 与 `.pretty/` 需是直接子项）：

```text
mylibs/
├── Device.kicad_sym
├── LED.kicad_sym
├── Resistor_SMD.pretty/
│   ├── R_0805_2012Metric.kicad_mod
│   └── …
└── LED_SMD.pretty/
    └── …
```

```bash
node scripts/convert-kicad-lib.js convert mylibs ./DeviceLED.elibz2 --name DeviceLED
```

输出：

```text
  sym lib: Device.kicad_sym (533 symbols)
  sym lib: LED.kicad_sym (63 symbols)
  footprint lib: LED_SMD.pretty (100 footprints)
  footprint lib: Resistor_SMD.pretty (67 footprints)
Wrote DeviceLED.elibz2: 596 symbols, 167 footprints (636245 bytes)
```

生成的 `DeviceLED.elibz2` 可通过嘉立创EDA专业版的库导入功能安装到本地库中。

- 扫描目录下所有 `*.kicad_sym`（符号库）与 `*.pretty/`（封装库，读取其中 `*.kicad_mod`），全部合并写入**一个** `.elibz2`
- `--name` 可选：覆盖包名（默认取输出文件名去掉 `.elibz2` 后缀）
- `.elibz2` 是 zip 压缩包，内含：
  - `device2.json` — 器件/符号/封装索引（uuid → 元数据）；符号 `docType:2`、封装 `docType:4`，每个符号自动生成一个器件条目
  - `<库名>.elibu` — 记录流（与 `.esch2`/`.epcb2` 同格式），每个符号/封装写成两段：`DOCHEAD+META` 与 `DOCHEAD+记录`
- 符号 `Footprint` 属性（如 `Resistor_SMD:R_0805`）与转换出的封装名匹配时，器件的 `Footprint` 属性自动关联到对应封装 uuid
- 电源符号（`symbol_type "power"`）的 META `docType` 写为 18；封装文档包含 19 层表 + `ACTIVE_LAYER` + 完整 `CANVAS`，且不带 `PART` 记录
- 示例：`example/easyeda/easyeda-pro-libs.elibz2` 为嘉立创EDA专业版导出的参考库包

## 转换覆盖范围（best-effort）

输出严格对齐 [easyeda-pro-format-skill](https://github.com/easyeda/easyeda-pro-format-skill) 的官方格式文档（types / 字段定义 / JSON Schemas），并以真实导出数据校准 schema 与实际导出不一致之处；可另参考 [官方 eprj3 格式示例工程](https://github.com/easyeda/easyeda-pro-eprj3-format)：

| KiCad | eprj3 |
| --- | --- |
| `lib_symbols`（原理图内嵌符号库） | `.esch2` 内嵌 `SYMBOL` 文档段（`PART`/图形/引脚）+ `DEVICE` 文档段 |
| `symbol` 实例（含 `property`、`mirror`） | `COMPONENT`（`partId` 指向内嵌 `PART`，`DeviceName` 指向 `DEVICE`，镜像/旋转已换算）+ `Designator`/`Value` `ATTR` |
| `wire` | `WIRE` + 多条共享 `lineGroup` 的 `LINE` |
| `bus` / `bus_entry` | `BUS` + `LINE` / `BUSENTRY` |
| `junction` | 填充 `CIRCLE`（电气节点） |
| `no_connect` | 两条 `LINE`（X 标记） |
| `label` / `global_label` / `hierarchical_label` | `NETLABEL` |
| `text` / `text_box` | `TEXT`（+ `RECT` 边框） |
| `polyline` / `rectangle` / `circle` / `arc` / `bezier` | `POLY` / `RECT` / `CIRCLE` / `ARC`（三点求圆心）/ `BEZIER`，stroke/fill 样式同步映射 |
| `image` | `OBJ`（base64 内嵌） |
| `sheet`（层次图） | `RECT` + 名称 `TEXT` + 引脚 `NETLABEL` |
| 引脚电气/图形类型 | `PIN.electric` / `PIN.pinShape` 数值映射 |
| `footprint`（含 `pad`） | `.epcb2` 内嵌 `FOOTPRINT` 文档段（`PART`/`PAD`/丝印图形）+ `DEVICE` 文档段 + `COMPONENT` 放置 + `Designator`/`Footprint`/`Device` `ATTR` |
| pad 网络 / 椭圆孔 | `PAD_NET`（绑定元件引脚）+ `NET` 索引记录 / `holeType ROUND` 宽高 |
| `segment` / `arc`（PCB 走线） | 对应层上的 `FILL`（直线为闭合细多边形；圆弧为带 `ARC` 段的闭合多边形） |
| `via` | `VIA`（网络/孔径/盘径） |
| `zone` | `POUR`（`pourType`/`keepIsland`）+ 每个 `filled_polygon` 合并出的 `POURED`（`pourFill`，head id 关联 `POUR`）；keepout → `REGION`（`regionType PROHIBIT` + `prohibitType`） |
| `dimension`（aligned/orthogonal/radial/leader） | `DIMENSION`（`dimensionType LENGTH-CONSTRAINT` + `controlDot`） |
| `gr_line` / `gr_arc` / `gr_rect` / `gr_poly` / `gr_circle` / `bezier` | `LINE` / `ARC` / 闭合 `POLY`（圆为 `["CIRCLE",…]` 路径、贝塞尔为 `"C"` 段路径） |
| `gr_text` | `STRING`（对齐 origin、镜像、knockout→reverse） |
| `gr_rect`/`gr_line`/`gr_arc`/`gr_poly` on `Edge.Cuts` | 拼接为 `POLY` `BOARD_OUTLINE`（`layerId=11`） |
| 层映射 | `F.Cu=1`、`B.Cu=2`、`F.SilkS=3`、`B.SilkS=4`、`F.Mask=5`、`Edge.Cuts=11`、`In{n}.Cu=14+n`…；PCB 文档写入官方 60 层表 |

- 单位换算：KiCad mm → eprj3 mil（×39.3700787）；坐标轴翻转：KiCad Y 向下 → eprj3 Y 向上；旋转角 (360−deg)%360
- uuid 关联（官方约定）：`.esch2` 页面 / `.epcb2` / `.ecfg` 的 `DOCHEAD.uuid` 分别等于索引中 `sheets` / `pcbs` / `schematics` 的 uuid
- 同时生成 `sch/<名称>/<名称>.ecfg`（设计规则骨架）与 `.evar`（装配变量，空）
- **不迁移**：3D 模型、网络类、SPICE 模型、自定义规则；无法翻译的元素会跳过并告警

### 库转换覆盖范围（.elibz2）

| KiCad 库 | .elibz2 |
| --- | --- |
| `*.kicad_sym` 内每个 `(symbol …)` | `SYMBOL` 文档段（`PART`/`PIN`/`POLY`/`RECT`/`CIRCLE`/`ARC`/`BEZIER`）+ `device2.json` 符号索引 + 器件条目 |
| `symbol_type "power"` | META `docType:18`（电源类） |
| 符号 `property`（Reference/Value 之外的） | 器件 `attributes` 透传 |
| 符号 `Footprint` 属性 | 与封装名匹配时自动写入器件 `attributes.Footprint`（uuid） |
| `*.pretty/*.kicad_mod` 每个 `(footprint …)` | `FOOTPRINT` 文档段（19 层表 + `PAD`/`POLY`/`ARC` + `ACTIVE_LAYER`）+ `device2.json` 封装索引 |
| pad `thru_hole`/`oval` 钻孔 | `PAD` 的 `holeDiameter`/`holeWidth`/`holeType ROUND` |
| `F.SilkS`/`B.SilkS` 图形 | layerId 3/4；Fab/CrtYd/Dwgs 等其余 → Document 层 13 |

## 目录结构

```
kicad-to-easyeda-eprj3/
├── scripts/
│   ├── convert-kicad.js      ← 工程批量转换入口（→ eprj3 工程目录）
│   ├── convert-kicad-lib.js  ← 库转换入口（→ .elibz2 库包）
│   └── lib/
│       ├── kicad.js          ← KiCad S-expression 解析器
│       ├── kicad-to-eprj3.js ← 符号/封装 → eprj3 记录
│       ├── eprj3.js          ← eprj3 读写核心（源自 easyeda-eprj3-skill，已按官方示例修正）
│       ├── elibz2.js         ← .elibz2 库包组装（device2.json + .elibu）
│       ├── zip.js            ← 零依赖 zip 读写（zlib deflate/store）
│       └── utils.js
├── example/
│   ├── easyeda/              ← 嘉立创EDA专业版参考库包 easyeda-pro-libs.elibz2
│   └── kicad/                ← 示例 KiCad 工程
└── test/
    ├── smoke.js              ← 端到端冒烟测试（68 项断言）
    └── validate-format.js    ← 用官方 JSON Schemas 校验生成记录的格式验证器
```

## 测试

```bash
npm test
```

另可用官方 Schemas 逐条校验生成的记录（sch/pcb/lib 三种上下文，lib 按文档 docType 自动路由）：

```bash
node test/validate-format.js <生成的 .esch2|.epcb2|.elibu> <sch|pcb|lib>
```

> 验证器依赖 [easyeda-pro-format-skill](https://github.com/easyeda/easyeda-pro-format-skill) 的 `validate.js`，默认在其同级目录查找；也可通过环境变量 `EASYEDA_FORMAT_SKILL` 指定路径。注：官方 Schemas 与真实导出数据存在少量出入（如 `POUR.pourType`、PCB `ATTR.groupID`、`DIMENSION` 结构等），验证器已按真实导出数据校准。

## 相关项目

- [easyeda-pro-format-skill](https://github.com/easyeda/easyeda-pro-format-skill) — 嘉立创EDA Pro 文件格式技能包（types 索引、图元字段定义、JSON Schemas、validate.js），本仓库的格式权威参考
- [easyeda-eprj3-skill](https://github.com/easyeda/easyeda-eprj3-skill) — 教 AI 编码助手从零生成 `.eprj3` 工程的技能包；本仓库的 `scripts/lib/eprj3.js` 与 `utils.js` 即来自该项目的核心库
- [easyeda-pro-eprj3-format](https://github.com/easyeda/easyeda-pro-eprj3-format) — 官方 eprj3 格式示例工程

## License

[Apache-2.0](LICENSE)
