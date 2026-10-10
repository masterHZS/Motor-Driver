# XL7005A（芯龙 XLSEMI，立创 C50848）EN / FB 关键参数查证报告

**查证日期**：本次会话
**查证对象**：XL7005A（立创商城 C50848，详情页 id=51859，封装 SOP8-EP）
**结论摘要**：`V_FB = 1.25 V (1.225/1.25/1.275)` **确认**；`V_EN(th) = 1.25 V` **错误** —— EN 是**低有效**输入，门限 typ `1.6 V(关) / 0.8 V(开)`，且**无 min/max**。
**因此本设计 V3.0 的 EN/UVLO 拓扑（`VCC_BUS—R15(130k)—EN—R16(15k)—PGND`，按高有效 1.25 V 计算 12.08 V 门限）在原理上不成立，必须修改。**

---

## 1. 结论表

| 参数 | Min | Typ | Max | 测试条件 | 数据手册出处 |
|---|---|---|---|---|---|
| **V_FB**（FB 反馈基准，pin 3） | **1.225 V** | **1.25 V** | **1.275 V** | Vin=20–80 V, Vout=15 V, Iload=0.1–0.2 A, Ta=25 ℃，图 4 系统参数测量电路 | Rev 1.9 第 5 页 / Rev 1.0 第 5 页 |
| **V_EN 高（稳压器关断 OFF）** | *（空）* | **1.6 V** | *（空）* | EN 阈值，Min./Max. 两列在数据手册中留空 | 同上 |
| **V_EN 低（稳压器导通 ON）** | *（空）* | **0.8 V** | *（空）* | EN 阈值，Min./Max. 两列在数据手册中留空 | 同上 |
| **EN 极性** | **低有效**：低电平=工作，高电平=关机，悬空=低电平（即默认导通） | | | Pin Description 表 | Rev 1.9 第 2 页 |
| **EN 迟滞（hysteresis）** | **数据手册未规定**（全文无 hysteresis/迟滞/回差 字样，也无 EN 的 min/max） | | | — | 全文检索确认 |
| **EN 输入漏电流 IH** | — | 6 µA | 20 µA | VEN=2.5 V（关断） | EC 表 |
| **EN 输入漏电流 IL** | — | 1 µA | 10 µA | VEN=0.5 V（导通） | EC 表 |
| **EN 内部上拉/下拉** | 无上拉。**内部下拉**（"悬空时为低电平"），阻值未标称，由漏电流反推 ≈400–500 kΩ(typ) / ≥125 kΩ(最差) | | | Pin Description + 漏电流反推 | Rev 1.9 第 2、5 页 |
| **EN 绝对最大电压** | −0.3 V | | **7 V**（Rev 1.9） / **Vin**（Rev 1.0） | Absolute Maximum Ratings | Rev 1.9 / Rev 1.0 第 4 页 |
| **V_OUT 公式** | `VOUT = 1.25 × (1 + R2/R1)`，R2=Vout→FB，R1=FB→GND | | | Figure 4 | Rev 1.9 第 3 页 |

> ⚠️ **关键**：`1.6 V` 与 `0.8 V` 都是 **Typ.** 列的值；**Min./Max. 两列为空**。已用 PDF layout 模式按列坐标逐字核对（列头 `Min.`@87 / `Typ.`@98 / `Max.`@108；`1.6` 与 `0.8` 均落在偏移 99，即 Typ. 列）。这不是一个精密比较器门限，**没有任何容差保证**。

---

## 2. 原文引用

### 2.1 EN / FB 门限（Rev 1.9 英文，第 5 页）

表名：**XL7005A Electrical Characteristics** → 子表 **Electrical Characteristics (DC Parameters)**
表头条件：`Vin = 48V, GND=0V, Vin & GND parallel connect a 33uf/100V capacitor; Iout=0.2A, Ta = 25℃; the others floating unless otherwise specified.`
列头：`Parameters | Symbol | Test Condition | Min. | Typ. | Max. | Unit`

```
EN Pin Threshold                VEN   High (Regulator OFF)      1.6              V
                                      Low  (Regulator ON)       0.8
EN Pin Input Leakage Current    IH    VEN=2.5V (OFF)            6        20      uA
                                IL    VEN=0.5V (ON)             1        10      uA
```

同页 FB 行（表名：**XL7005A Electrical Characteristics** → 子表 **System parameters test circuit figure 4**）：

```
VFB   FB Voltage   Vin =20V to 80V, Vout=15V  Iload=0.1A to 0.2A    1.225   1.25   1.275   V
```

中文版（Rev 1.9，第 5 页，表名：**XL7005A 电气特性** → **电气特性(直流参数)**）：

```
EN 脚阈值电压    VEN    高(关)      1.6     V
                        低(开)      0.8
EN 脚输入漏电流   IH     VEN=2.5V (关)    6    20    uA
                 IL     VEN=0.5V (开)    1    10    uA
反馈电压          VFB    Vin =20V 到 80V, Vout=15V  Iload=0.1A 到 0.2A   1.225  1.25  1.275  V
```

### 2.2 EN 极性与 FB 说明（Rev 1.9 第 2 页，表名：**Table 1 Pin Description**）

```
Pin Number  Pin Name  Description
3           FB        Feedback Pin (FB). Through an external resistor divider network, Feedback
                      senses the output voltage and regulates it. The feedback threshold voltage
                      is 1.25V.
4           EN        Enable Pin. Drive EN pin low to turn on the device, drive it high to turn it
                      off. Floating is default low.
```

中文版（表名：**表 1.引脚说明**）：

```
引脚号  引脚名  描述
3       FB     反馈引脚，通过外部电阻分压网络，检测输出电压进行调整。参考电压为 1.25V。
4       EN     使能引脚，低电平工作，高电平关机，悬空时为低电平。
```

### 2.3 输出电压公式（Rev 1.9 第 3 页，Figure 4 XL7005A Typical Application Circuit）

```
VOUT=1.25*(1+R2/R1)          R2=30K/1%  R1=2.7K/1%   →  15V 输出
```

### 2.4 绝对最大额定值（Rev 1.9 第 4 页，表名：**Absolute Maximum Ratings（Note1）**）

```
Parameter                 Symbol   Value        Unit
Input Voltage             Vin      -0.3 to 100  V      (Rev 1.0 为 -0.3 to 85 V)
Feedback Pin Voltage      VFB      -0.3 to 7    V      (Rev 1.0 为 -0.3 to Vin)
EN Pin Voltage            VEN      -0.3 to 7    V      (Rev 1.0 为 -0.3 to Vin)
```

### 2.5 「1.25 V」的真正出处 —— 是 FB 基准，不是 EN 门限

芯龙官网选型表 `products_DC_DC_buck_hv.html`（列名就写着「**基准电压**」）：

```
型号      产品特征        功率  输入电压   频率     开关电流  电压精度  效率  输出电压  基准电压   封装
XL7005A   高压恒压、使能   5W    5~100V    150KHz   0.4A      ±2%      87%   ADJ      1.25V     SOP8-EP
```

芯龙《产品手册》`XLSEMI_Product_Manuals.pdf` 同样有 `Feedback Voltage` 列：

```
XL7005A   5W   5~100V   150KHz   0.4A   ±2%   87%   ADJ   1.25V   SOP8-EP   EN ACTIVE
```

> **结论**：`1.25 V` 是 XL7005A 的**反馈基准电压（FB reference / 基准电压）**，出现在选型表的「基准电压」列。设计文档 §6.2 写的「`EN` **高有效**，阈值 `V_EN(th) ≈ 1.25 V`（**与 FB 基准同源**，XL7005A 数据手册）」是把选型表的「基准电压」列误当成了 EN 门限 —— **数据手册中不存在任何 1.25 V 的 EN 门限**。

### 2.6 迟滞（hysteresis）：未规定

* XL7005A 数据手册（Rev 1.0 / Rev 1.9，中英文）全文检索 `hyster` / `迟滞` / `回差` / `VIH` / `VIL` → **0 命中**。
* XL7005A 的 Features 只有 `TTL shutdown capability` / `EN脚TTL关机功能`，**没有**迟滞条目。
* 旁证（同厂对照）：**XL1509** 的 Features 明确写着 `EN pin with hysteresis function`，并在 EC 表给出 `1.4 V / 0.8 V`。XL7005A **没有**这条声明。

> 因此 `0.8 V ↔ 1.6 V` 之间应视为**数据手册未定义带**，不能当作"有保证的迟滞"来做设计。

### 2.7 与设计文档旧值的逐项核对

| 项目 | 数据手册实测值 | 文档旧值 | 判定 |
|---|---|---|---|
| 输入电压范围 | **5–80 V**（Features `Operating Voltage: 5V~80V`；EC 表 `Input operation voltage Vin 5 / 80 V`）；绝对最大 100 V | 5–80 V | ✅ 一致 |
| 最大输出电流 | **0.4 A**（Features `Maximum 0.4A Output Current`；EC 表 `Switch Current Limit IL min 0.5 A`） | 0.4 A | ✅ 一致 |
| 开关频率 | **150 kHz**（Features `Fixed 150KHz Switching Frequency`；EC 表 `Fosc 120/150/180 kHz`） | 150 kHz | ✅ 一致 |
| 静态电流 | **2.5 mA typ / 5 mA max**（EC 表 `Quiescent Supply Current Iq: VEN=0V, VFB=2V`） | 2.5 mA | ✅ 一致 |

> 注 1：芯龙官网选型表把 XL7005A 写成 `5~100V`，但数据手册 Features 与 EC 表的**工作**范围是 5–80 V，100 V 是绝对最大额定值（Rev 1.9）。立创商城参数表也写 `工作电压 5V~80V`。以 **5–80 V 工作** 为准。
> 注 2：`Iq = 2.5 mA` 的测量条件是 **`VEN = 0V`，即 EN 低电平＝使能导通态**。关断态是 `Shutdown Supply Current IS = 85 µA typ / 200 µA max @ VEN=2V`。原文档取 2.5 mA 作为静态电流是对的，但要记住它对应「EN 拉低＝导通」。

---

## 3. 来源 URL

### 一手权威来源（厂商 / 原厂授权渠道）

1. **芯龙官网 XL7005A 英文数据手册 Rev 1.9**（2025-11-28）
   `http://www.xlsemi.com/datasheet/XL7005A-EN.pdf`
2. **芯龙官网 XL7005A 中文数据手册 Rev 1.9**
   `http://www.xlsemi.com/datasheet/XL7005A-CN.pdf`
3. **芯龙官网 DC-DC 高压降压选型表**（含「基准电压 = 1.25V」列）
   `http://www.xlsemi.com/products_DC_DC_buck_hv.html`
4. **芯龙《产品手册》**
   `http://www.xlsemi.com/datasheet/XLSEMI_Product_Manuals.pdf`
5. **芯龙官网 XL7005A DEMO 板手册**
   `http://www.xlsemi.com/demo/XL7005A-DEMO.pdf`

### 立创商城渠道（C50848）

6. **立创商城中文商品页（id=51859）** — 页面「数据手册PDF」链接
   `https://item.szlcsc.com/51859.html`
7. **立创商城托管的数据手册 PDF（Rev 1.0，2014-12-01）**
   `https://atta.szlcsc.com/upload/public/pdf/source/20150821/1457707346919.pdf`
8. **立创商城全球站同一份数据手册（Rev 1.0，与 7 字节完全相同）**
   `https://datasheet.lcsc.com/datasheet/pdf/03709da1532840a69ffb43b2a0452964.pdf?productCode=C50848`
9. **嘉立创 EDA 组件接口**（Manufacturer = XLSEMI(芯龙)，Manufacturer Part = XL7005A）
   `https://lceda.cn/api/products/C50848/components`

### 交叉验证（同厂同类器件，用于「迟滞」旁证）

10. **XL1509 英文数据手册**（Features 含 `EN pin with hysteresis function`）
    `http://www.xlsemi.com/datasheet/XL1509-EN.pdf`

> 本地留存的原始 PDF 与文本提取件见 `06_参考资料\芯片知识库\_datasheet\XL7005A_权威来源\`。
> （原路径为 `01_PCB/02_参考/...`，该目录已合并进 `06_参考资料/`。）
> 未采用的来源：alldatasheet.com / alldatasheet.jp 返回 HTTP 403（Cloudflare 拦截），仅作旁证未采信。
> **未引用任何二手博客、论坛或 AI 生成内容。**

### 版本说明（重要）

| | 立创商城供档 | 芯龙官网供档 |
|---|---|---|
| 版本 | **Rev 1.0** | **Rev 1.9** |
| PDF 创建日期 | 2014-12-01 | 2025-11-28 |
| MD5 | `AAAFBCBF8E0EA98FFC29D815D4E3664C`（中/英文站同一份） | EN `D81AF5FDB8B1186B5EE5E6CF35BCDE1D` / CN `37D42E95721CB2D48B5837A7724A3C8C` |

**两版在 `V_FB` 与 `V_EN` 阈值上完全一致**（本报告结论不受版本影响），但下列参数不同：

| 项目 | Rev 1.0 | Rev 1.9 |
|---|---|---|
| 标题耐压 | 80 V | 100 V |
| 最大占空比 DMAX | **100 %** | **90 %** |
| 最小压降 | **1 V** | **2 V** |
| EN / FB 绝对最大 | −0.3 to **Vin** | −0.3 to **7 V** |
| 包装 | 2500 只/卷 | 4000 只/卷 |
| 效率 @Vin=36V | 85 % | 86 % |

---

## 4. 对本设计的影响

### 4.1 已核对的真实拓扑（来自 V3.0 网表，非文档描述）

```
NET "VCC_BUS": ... U2.1(VIN), R15.1 ...
NET "EN"     : R15.2, R16.1, C29.1, U2.4(EN)
NET "PGND"   : ... R16.2, C29.2, U2.5~U2.9 ...
```
即：`VCC_BUS —R15(130 kΩ)— EN(U2.4) ‖ R16(15 kΩ) ‖ C29(100 nF) — PGND`。与题述一致。

### 4.2 EN 节点电压

`Ven = Vbus × 0.0934 … 0.1034`

（分母已计入 EN 引脚漏电流：无负载 0.10345；typ 漏电 6 µA@2.5 V≈417 kΩ → 0.10021；最差漏电 20 µA@2.5 V≈125 kΩ → 0.09340）

### 4.3 `R16 = 15 kΩ` 时的**实际**开启/关断门限

| | 母线电压 | 说明 |
|---|---|---|
| 稳压器被命令**关断** | **Vbus ≳ 15.5 – 17.1 V**（nom ≈ **16.0 V**） | `Ven = 1.6 V` 交点 |
| 稳压器**保证导通** | **Vbus ≲ 7.7 – 8.6 V**（nom ≈ **8.0 V**） | `Ven = 0.8 V` 交点 |
| **未定义带** | **约 8.0 V – 16.0 V** | 数据手册未规定状态 |

| 电池组 | Ven 范围 | 实际后果 |
|---|---|---|
| **3S（9.0–12.6 V）** | 0.84 – 1.30 V | **全部落在 0.8–1.6 V 未定义带内**，导通与否不受数据手册保证（批次/温度差异会导致部分板子不启动） |
| **4S（12.0–16.8 V）** | 1.12 – 1.74 V | 满充附近（≳16 V）**被命令关断** —— 与"低压保护"意图完全相反 |
| < ~8 V | < 0.8 V | 唯一保证导通的区间 |

**所以 12.08 V 这个门限不存在。** 在 Vbus = 12.083 V 时 `Ven = 1.13 – 1.25 V`，正好停在未定义带正中间，**不跨越任何门限、不产生任何翻转**。设计文档 §6.2 的整张方案对比表建立在错误极性之上。

### 4.4 是否需要改 R16？—— **改 R16 单独无法解决**

被动电阻分压 `R15/R16` 只能让 `Ven` **随 Vbus 单调上升**。配上**低有效** EN，结果必然是：
> **母线越高越关断，母线越低越导通** —— 与 UVLO 完全相反。

不存在任何 `R16` 取值能让"低压关断、高压导通"成立。**必须改拓扑，而不是改一个电阻值。**

#### 方向 A：放弃 EN-UVLO，让芯片常开（改动最小，推荐至少先做这个）

* **EN 直接接 PGND**（最稳，唯一有保证的做法）。
* 若必须保留一个电阻：要保证 `Ven < 0.8 V` 在 Vbus=16.8 V 成立 → `R16 ≤ 6.5 kΩ`；留余量取 `Ven ≤ 0.4 V` → `R16 ≤ 3.1 kΩ`（取 **3.0 kΩ**，此时 16.8 V 下 Ven≈0.38 V）。
  注意：`0.8 V` 是 typ 且**无 min**，所以严格来说只有"直接接地"才是被保证的。
* 代价：失去电池过放硬件保护。板上已有 `VBUS_SENSE`（R30/R31/R48 → ADC），可由 MCU 软件判断欠压后关断下游，或另加保护电路。

#### 方向 B：保留 ~12.1 V UVLO —— 需要增加一级反相

用 NPN（如 MMBT3904/BC847）作反相器：

```
VCC_BUS ──[ Ra ]──┬── Q1.B
                  [ Rb = 15 kΩ ]        Q1.E → PGND
                  │
                 PGND
EN ──[ Rpull 100 kΩ ]── +3.3V/+5V 轨      Q1.C → EN
```

* Vbus > UVLO → `V_A > V_BE(on)` → Q1 饱和 → EN 被拉低 → **导通** ✔
* Vbus < UVLO → Q1 截止 → EN 被 `Rpull` 拉高 → **关断** ✔

若保留 `R16 = 15 kΩ` 作 `Rb`：`Ra = (12.1 / V_BE − 1) × 15 kΩ`

| V_BE | Ra | 实际翻转点（Ra=270 kΩ 时） |
|---|---|---|
| 0.60 V | 287 kΩ | 11.40 V |
| 0.65 V | 264 kΩ | **12.35 V** |
| 0.70 V | 244 kΩ | 13.30 V |

* 即 **`R16 = 15 kΩ` 可以保留，只需把 `R15` 由 130 kΩ 改为 ≈260–270 kΩ 并加入 Q1 + 上拉**。
* ⚠️ `V_BE` 有 ±50 mV 批次分散与约 −2 mV/℃ 温漂 → 门限分散约 **±1 V**。要精确门限请用比较器或专用电压监控 IC（TL431+比较器 / 复位监控芯片），不要用 V_BE 做基准。
* ⚠️ EN 上拉只能拉到 **≤5 V 轨**：Rev 1.9 的 EN 绝对最大是 **7 V**。**不要把 EN 直接上拉到 VIN 或 12 V 轨。**

### 4.5 额外发现 ①：V2→V3 的"修复"把问题改反了

设计文档 §6.2 记载 V2 的隐患为：

> 「`EN` 被 `R16` 永久拉到 PGND → XL7005A **永不启动** → 无 12 V → FD6288T 无供电 → **整板上电即死**」

按真实数据手册，**EN 低电平＝工作**。所以 V2 的接法（EN 经 R16=10 kΩ 到 PGND，`EN_H` 悬空）实际会让芯片**一直开着**，只是没有 UVLO —— **不会"上电即死"**。

V3.0 把 `EN_H` 与 `EN` 合并、并把 R16 由 10 kΩ 改成 15 kΩ 之后，反而把 EN 抬进了 0.8–1.6 V 未定义带（4S 满充时还会越过 1.6 V 关断）。**就"能不能出 12 V"而言，V3.0 比 V2 更危险。**

> 合并 `EN_H`/`EN` 这个连通性修复本身是对的（消除悬空网络），但**极性判断从头就是错的**，所以选定的 R16=15 kΩ 是错的。

### 4.6 额外发现 ②：Buck 裕量不足（独立于 EN 问题）

目标 `Vout = 1.25 × (1 + 8.66k/1k) = 12.075 V`（VFB 容差下 11.83–12.32 V），而母线最低 9.0 V。XL7005A 是**降压**器，`Vout < Vin` 是硬约束：

| 依据 | 12.1 V 输出所需最低母线 |
|---|---|
| Rev 1.9 最小压降 2 V | **≥ 14.1 V** |
| Rev 1.0 最小压降 1 V | ≥ 13.1 V |
| Rev 1.9 最大占空比 90 % | ≥ 13.4 V（未计损耗） |
| Rev 1.0 最大占空比 100 % | 占空比不成为限制 |

**后果：**
* **3S（9.0–12.6 V）根本不可能输出 12.1 V** —— 即使满充 12.6 V 也达不到。文档 §6.2 表格中 3S 一列写的「仅在满充附近工作（12.6→12.1 V）」**不成立**。
* **4S（12.0–16.8 V）** 只在母线 ≳13.5–14 V（约电池上半段）能稳压 12.1 V；再低就随母线跌落。
* 已知辅助电源负载仅 **11 mA**（文档 §8），轻载下实际压降会明显小于额定 0.4 A 条件下的值，所以真实可用区间会比上表宽；但"Vout < Vin"与占空比上限无法绕过。
* **建议**：若必须同时支持 3S，应把输出目标降到 ~9–10 V（例如 `R2=6.8 kΩ / R1=1 kΩ` → 9.75 V），或改用降压-升压（buck-boost）拓扑。若只支持 4S，需把 UVLO 门限提到 ≥14 V 并接受下半段无法稳压。

### 4.7 需要确认的一项

* **实际来料是 Rev 1.0 还是 Rev 1.9**（影响 DMAX 90% vs 100%、最小压降 2 V vs 1 V、EN 绝对最大 7 V vs Vin）。立创商城 C50848 页面供档是 Rev 1.0，芯龙官网现行版是 Rev 1.9。建议向立创 FAE 或芯龙 sales@xlsemi.com 确认在产版本。

---

## 5. 未确认项（明确声明）

1. **EN 迟滞（hysteresis）是否存在及其数值** —— **未确认**。Rev 1.0 与 Rev 1.9、中英文共 4 份官方档全文均无 `hysteresis` / `迟滞` / `回差` 字样，也无 EN 的 min/max。**数据手册未规定**，故不能假设存在可依赖的迟滞。`0.8–1.6 V` 应作为未定义带处理。
2. **EN 输入阻抗 / 内部上下拉电阻的具体阻值** —— **数据手册未标称**。仅有"悬空时为低电平"（⇒ 内部下拉，不是上拉）与漏电流数据。本报告中的 ≈417 kΩ / ≈500 kΩ / ≥125 kΩ 均为**由漏电流反推**，非数据手册标称值。
3. **是否存在独立于 EN 门限的 VIH/VIL 逻辑电平规格** —— **不存在**。数据手册只有一行 `EN Pin Threshold VEN`（1.6 V / 0.8 V typ），Features 里的 `TTL shutdown capability` 是描述性说法，**没有**给出 TTL 的 2.0 V/0.8 V 规格。因此 EN 应按"typ 门限 1.6 V/0.8 V、无 min/max 的逻辑输入"处理，**不是**精密比较器门限。
4. **未采用的检索路径及失败原因**（供留痕）：
   * `http://xlsemi.com/datasheet/XL7005A%20datasheet-English.pdf` → HTTP 404（文件名含空格，已废弃）
   * `http://xlsemi.com/datasheet/XL7005A%20datasheet-Chinese.pdf` → HTTP 404（同上）
   * `https://www.alldatasheet.jp/html-pdf/1134397/XLSEMI/XL7005A/509/2/XL7005A.html` → HTTP 403（Cloudflare）
   * `https://www.alldatasheet.com/datasheet-pdf/pdf/763197/ETC2/XL7005A.html` → HTTP 403（Cloudflare）
   * `https://item.szlcsc.com/datasheet/XL7005A/51859.html`（"放大查看"在线预览）→ 返回空壳页面，无正文
   * 以上失败路径均已由芯龙官网 PDF（成功下载并本地解析）替代，**不影响结论**。

---

## 6. 附：本地留存的权威证据

原始 PDF 与文本提取件（pypdf 6.15.0 提取，含 layout 模式列对齐核对脚本输出）：
`06_参考资料\芯片知识库\_datasheet\XL7005A_权威来源\`

| 文件 | 说明 |
|---|---|
| `XL7005A-EN.pdf` / `.txt` | 芯龙官网英文 Rev 1.9 |
| `XL7005A-CN.pdf` / `.txt` | 芯龙官网中文 Rev 1.9 |
| `LCSC_C50848_Rev1.0.pdf` / `.txt` | 立创商城供档 Rev 1.0（中/英文站同一份） |
| `XL1509-EN.pdf` | 迟滞旁证（XL1509 明示有 EN 迟滞，XL7005A 没有） |
| `XLSEMI_Product_Manuals.pdf` | 芯龙产品手册（Feedback Voltage = 1.25V） |
| `XL7005A-DEMO.pdf` | 官方 DEMO 板手册 |
