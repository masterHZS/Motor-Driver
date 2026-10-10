# HC32F005 高级定时器 ADT（Advanced Timer）硬件知识库

> **来源**：本文件全部结论**仅**来自本机 HC32F005 DDL 源码包，**未联网、未使用任何外部资料**。
> DDL 根目录（下文所有相对路径均以此为根）：
> `C:\Users\28572\Desktop\motor-drive\Project\Soft\02_参考\hc32ddl-app-master\`
>
> **规则**：每条事实都带 `文件名:行号 + 符号名`。凡本地文件无法证实的，一律不猜测，
> 集中列在 **§12 未确认/待核对**，正文中以 `⚠️未确认` 就地标记。
>
> **决定性结论（先给答案）**：单颗 ADT **只有 2 个通道（CHxA/CHxB）= 1 组互补对**；
> 本器件有 **3 颗 ADT（TIM4/TIM5/TIM6）**，因此**"3 对互补 PWM（6 路）"只能靠三颗 ADT 联动实现**，
> 单颗 ADT 无法产生 3 对。详见 §2。

## 0. 引用缩写对照（完整相对路径）

| 缩写 | 完整相对路径（相对 DDL 根目录） |
|---|---|
| `adt.h` | `Drivers\hc32f005\inc\adt.h`（859 行） |
| `adt.c` | `Drivers\hc32f005\src\adt.c`（1618 行） |
| `hc32f005.h` | `Project\hc32f005\hc32f005.h`（3584 行，寄存器定义） |
| `HC32F005.svd` | `Project\hc32f005\EWARM\HC32F005.svd`（SVD 外设结构） |
| `int_h.h` | `Project\hc32f005\interrupts_hc32f005.h` |
| `int_c.c` | `Project\hc32f005\interrupts_hc32f005.c` |
| `startup.s` | `Project\hc32f005\EWARM\startup_hc32f005.s` |
| `hc_timer.c` | `User\Application\src\hc_timer.c`（214 行，实际使用范例） |
| `hc_timer.h` | `User\Application\inc\hc_timer.h` |
| `adc.h` | `Drivers\hc32f005\inc\adc.h` |
| `vc.h` | `Drivers\hc32f005\inc\vc.h` |
| `sysctrl.h` | `Drivers\hc32f005\inc\sysctrl.h` |
| `reset.h` | `Drivers\hc32f005\inc\reset.h` |
| `ddl.h` | `Drivers\hc32f005\inc\ddl.h` |
| `ddl_device.h` | `Project\hc32f005\ddl_device.h` |
| `base_types.h` | `Project\hc32f005\base_types.h` |
| `HC32F003.h` | `Project\hc32f005\MDK\RTE\Device\HC32F003C4PA\HC32F003.h`（同 IP 的另一份头文件，命名不同） |

---

## 1. ADT 实例数量、基地址与中断向量

**结论：本器件有 3 个 ADT 实例 —— TIM4 / TIM5 / TIM6（没有 TIM3 型"高级定时器"）。**

| 项目 | TIM4 | TIM5 | TIM6 | 依据 |
|---|---|---|---|---|
| 结构体类型 | `M0P_ADTIM_TypeDef` | 同 | 同 | `hc32f005.h:2371`（typedef 起）～`hc32f005.h:2560`（结束） |
| 基地址宏 | `M0P_ADTIM4_BASE` = `M0P_PERIPH_BASE + 0x3000` | `M0P_ADTIM5_BASE` = `+0x3400` | `M0P_ADTIM6_BASE` = `+0x3800` | `hc32f005.h:3526` `M0P_PERIPH_BASE (0x40000000UL)`；`hc32f005.h:3528-3530` |
| 实例指针宏 | `M0P_ADTIM4` = `0x40003000` | `M0P_ADTIM5` = `0x40003400` | `M0P_ADTIM6` = `0x40003800` | `hc32f005.h:3554-3556` |
| 中断号 | `ADTIM4_IRQn = 18` | `ADTIM5_IRQn = 19` | `ADTIM6_IRQn = 20` | `hc32f005.h:90-92` |
| 启动文件向量 | `TIM4_IRQHandler` | `TIM5_IRQHandler` | `TIM6_IRQHandler` | `startup.s:101-103`（向量表）、`startup.s:242-257`（PUBWEAK 定义） |
| ISR 包装 | `TIM4_IRQHandler()` | `TIM5_IRQHandler()` | `TIM6_IRQHandler()` | `int_c.c:321-326 / 334-339 / 347-352` |
| 用户回调（`__WEAK`） | `Tim4_IRQHandler` | `Tim5_IRQHandler` | `Tim6_IRQHandler` | `int_c.c:77-79`（声明），`int_c.c:324/337/350`（调用） |
| 回调开关宏 | `INT_CALLBACK_TIM4` | `INT_CALLBACK_TIM5` | `INT_CALLBACK_TIM6` | `int_h.h:91-93` |

补充证据与要点：

- SVD 中 ADTIM5/ADTIM6 是**从 ADTIM4 派生**（同一寄存器模型）：
  `HC32F005.svd:3188-3196`（`<peripheral derivedFrom="ADTIM4"> <name>ADTIM5</name> <baseAddress>0x40003400`）、
  `HC32F005.svd:3197-3205`（ADTIM6，`0x40003800`）。
- 同一 IP 的另一份本地头文件里三实例叫 `M0P_ADT0/1/2`（地址完全相同）：
  `HC32F003.h:3305-3307` `M0P_ADT0/1/2`，结构体名 `M0P_ADT_TypeDef`（`HC32F003.h:2347`）。
  → **命名有两套：`ADTIM4/5/6`（F005 头）与 `ADT0/1/2`（F003 头），地址一致。**
- 三颗 ADT **共用一个时钟门控位**：`sysctrl.h:217` `SysctrlPeripheralAdvTim = 10u`（"高级时钟"）；
  共用复位掩码：`reset.h:96` `ResetMskAdvTim = 1u<<10u`（注释"高级定时器TIM4/5/6"）。
  使能写法：`hc_timer.c:77` `Sysctrl_SetPeripheralGate(SysctrlPeripheralAdvTim, TRUE)`。
- NVIC 使能写法：`hc_timer.c:113` `EnableNvic(ADTIM4_IRQn, IrqLevel2, TRUE)`。

### 1.1 寄存器映射（一实例内偏移，SVD 实测 + 头文件结构体交叉验证）

| 偏移 | 寄存器 | 头文件结构体行 | 偏移 | 寄存器 | 头文件结构体行 |
|---|---|---|---|---|---|
| 0x00 | `CNTER` | `hc32f005.h:2373-2377` | 0x7C | `HCELR` | `hc32f005.h:2472-2476` |
| 0x04 | `PERAR` | `hc32f005.h:2378-2382` | 0x80 | `HCPAR` | `hc32f005.h:2477-2481` |
| 0x08 | `PERBR` | `hc32f005.h:2383-2387` | 0x84 | `HCPBR` | `hc32f005.h:2482-2486` |
| 0x0C | *(保留)* | `hc32f005.h:2388` `RESERVED3[4]` | 0x88 | `HCUPR` | `hc32f005.h:2487-2491` |
| 0x10 | `GCMAR` | `hc32f005.h:2389-2393` | 0x8C | `HCDOR` | `hc32f005.h:2492-2496` |
| 0x14 | `GCMBR` | `hc32f005.h:2394-2398` | 0x100 | `IFR` | `hc32f005.h:2498-2502` |
| 0x18 | `GCMCR` | `hc32f005.h:2399-2403` | 0x104 | `ICLR` | `hc32f005.h:2503-2507` |
| 0x1C | `GCMDR` | `hc32f005.h:2404-2408` | 0x108 | `CR` | `hc32f005.h:2508-2512` |
| 0x40 | `DTUAR` | `hc32f005.h:2410-2414` | 0x110 | `AOSSR` | `hc32f005.h:2514-2518` |
| 0x44 | `DTDAR` | `hc32f005.h:2415-2419` | 0x114 | `AOSCL` | `hc32f005.h:2519-2523` |
| 0x50 | `GCONR` | `hc32f005.h:2421-2425` | 0x118 | `PTBKS` | `hc32f005.h:2524-2528` |
| 0x54 | `ICONR` | `hc32f005.h:2426-2430` | 0x11C | `TTRIG` | `hc32f005.h:2529-2533` |
| 0x58 | `PCONR` | `hc32f005.h:2431-2435` | 0x120 | `ITRIG` | `hc32f005.h:2534-2538` |
| 0x5C | `BCONR` | `hc32f005.h:2436-2440` | 0x124 | `PTBKP` | `hc32f005.h:2539-2543` |
| 0x60 | `DCONR` | `hc32f005.h:2441-2445` | 0x3F4 | `SSTAR` | `hc32f005.h:2545-2549` |
| 0x68 | `FCONR` | `hc32f005.h:2447-2451` | 0x3F8 | `SSTPR` | `hc32f005.h:2550-2554` |
| 0x6C | `VPERR` | `hc32f005.h:2452-2456` | 0x3FC | `SCLRR` | `hc32f005.h:2555-2559` |
| 0x70 | `STFLR` | `hc32f005.h:2457-2461` | — | — | — |
| 0x74 | `HSTAR` | `hc32f005.h:2462-2466` | — | — | — |
| 0x78 | `HSTPR` | `hc32f005.h:2467-2471` | — | — | — |

> SVD 侧同表：`HC32F005.svd` ADTIM4 段（起始 `HC32F005.svd:563`）逐条 `CNTER 0x0 / PERAR 0x4 / … / SCLRR 0x3FC`。
> **本地两份来源（SVD 与 `hc32f005.h` 结构体）完全一致，无多余寄存器。**

### 1.2 只有 3 个实例、无第 4 个（否定证据）
- 全 DDL 中 `ADTIM` 只出现在 `hc32f005.h:90-92`（IRQn）、`hc32f005.h:2371`（typedef）、`hc32f005.h:3528-3530`、`hc32f005.h:3554-3556`；
- `startup.s:242-257` 只有 `TIM4/TIM5/TIM6_IRQHandler` 三个 ADT 向量；
- `int_h.h:91-93` 只有 `INT_CALLBACK_TIM4/5/6`。

---

## 2. 通道数与互补输出（**本次设计的决定性问题**）

### 2.1 单颗 ADT 只有 2 个通道：CHxA / CHxB

| 证据 | 内容 |
|---|---|
| 枚举只有 2 个值 | `adt.h:83-87` `en_adt_CHxX_port_t { AdtCHxA = 0u, AdtCHxB = 1u }` |
| PCONR 只有 A/B 两组位域 | `hc32f005.h:337-360` `stc_adtim_pconr_field_t`：A 组 = bit0..12（`CAPCA/STACA/STPCA/STASTPSA/CMPCA/PERCA/OUTENA/DISSELA/DISVALA`），B 组 = bit16..28（`CAPCB/…/DISVALB`） |
| 中间 bit13-15、bit29-30 全为保留 | `hc32f005.h:348` `RESERVED13:3`、`hc32f005.h:358` `RESERVED29:2` |
| 比较基准只有 A/B 用于输出 | `Adt_SetCompareValue` 只对 `GCMAR/GCMBR` 与 CH 对应（`adt.c:1384-1410`）；CHC/CHD 虽在枚举中（`adt.h:168-169` `AdtCompareC/D`）但端口侧无对应引脚位域 |
| 端口配置 API 只支持两通道 | `adt.c:844-888` `Adt_CHxXPortCfg()`：`switch` 只有 `case AdtCHxA` / `case AdtCHxB`，其他返回 `ErrorInvalidParameter`（`adt.c:883-884`） |
| 硬件捕获只有 A/B | `adt.c:511` `Adt_CfgHwCaptureA()` / `adt.c:552` `Adt_CfgHwCaptureB()` |
| 通道配置结构体注释 | `adt.h:571-584` `stc_adt_TIMxX_port_cfg_t`（注释标题即 "ADT TIMxX端口配置"） |

**因此：单颗 ADT = 1 组互补对（CHxA + CHxB），不可能产生 3 对。**

### 2.2 互补输出如何形成（没有独立"反相"位）

`PCONR` 中**没有 INVEN/极性反转位域**（见上表位域清单，A 组 bit0-12 无极性位）。
互补输出靠"周期匹配 / 比较匹配各自设定输出电平"实现：

- 周期匹配时端口状态：`adt.h:218-224` `en_adt_pconr_perc_t { AdtCHxPeriodLow=0, AdtCHxPeriodHigh=1, AdtCHxPeriodKeep=2, AdtCHxPeriodInv=3 }` → `PCONR.PERCA/PERCB`
- 比较匹配时端口状态：`adt.h:232-238` `en_adt_pconr_cmpc_t { AdtCHxCompareLow=0, AdtCHxCompareHigh=1, AdtCHxCompareKeep=2, AdtCHxCompareInv=3 }` → `PCONR.CMPCA/CMPCB`
- 典型互补写法（**本库推导，非厂商示例，需实测**）：CHA: `PERC=High + CMPC=Low`；CHB: `PERC=Low + CMPC=High`。
- 输出使能独立：`PCONR.OUTENA`（bit8）/ `OUTENB`（bit24），由 `stc_adt_CHxX_port_cfg_t.bOutEn` 写入（`adt.c:862 / 876`）。

### 2.3 死区发生器：一颗 ADT 只有 **1 组**，CHA/CHB 共用

- 死区使能位只有 1 个：`hc32f005.h:373-380` `stc_adtim_dconr_field_t { DTCEN:1(bit0), SEPA:1(bit8) }`；SVD 同：`HC32F005.svd:1114-1131`。
- 死区基准寄存器只有 1 组（`DTUAR` / `DTDAR`）：`adt.h:825-829` `Adt_SetDTUA/Adt_SetDTDA`，实现 `adt.c:1542-1548 / 1560-1566`。
- → **不能给 CHA/CHB 分别设置不同死区值，一颗 ADT 只能一组死区。**

### 2.4 三对互补 PWM（6 路）的可行方案

| 方案 | 可行性 | 依据 / 代价 |
|---|---|---|
| 单颗 ADT 出 3 对 | **不可行** | §2.1（只有 CHA/CHB） |
| TIM4 + TIM5 + TIM6 各出 1 对（共 6 路） | **可行** | 三实例同结构体（`hc32f005.h:3528-3530`），各有独立 `CNTER/PERAR/GCMAR/GCMBR/PCONR/DCONR`（`hc32f005.h:2371-2560`） |
| 三颗同步启动/停止/清零 | **有硬件支持** | `adt.c:592-616` `Adt_SwSyncStart()` → `M0P_ADTIM4->SSTAR`；`adt.c:627-651` `Adt_SwSyncStop()` → `SSTPR`；`adt.c:662-686` `Adt_SwSyncClear()` → `SCLRR`；位定义 `ADTIM_SS_TIM4=1/TIM5=2/TIM6=4`（`adt.c:80-82`），结构体 `adt.h:506-512` `stc_adt_sw_sync_t` |
| 三颗同时刹车 | **有统一刹车控制** | 端口刹车、软件刹车、AOS 相关寄存器在 DDL 中**只写 `M0P_ADTIM4`**（`adt.c:909-914 / 929 / 959-960 / 974 / 1022-1027`），见 §4 与 ⚠️§12 |

**风险（必须在动手前核对）**：三颗 ADT 的 6 路 CHA/CHB 是否都在所选封装上引出？
本地 DDL **没有引脚复用表**，`⚠️未确认`，见 §12 与 §11。

---

## 3. 死区（Dead Time）

| 项目 | 结论 | 依据 |
|---|---|---|
| 寄存器 | `DTUAR`（偏移 0x40）、`DTDAR`（偏移 0x44） | `hc32f005.h:2410-2419`（结构体）、`HC32F005.svd:747-748 / 772-773` |
| 位宽 | **16 bit**（`DTUA:16` / `DTDA:16`，bit31 为 `RSV`） | `hc32f005.h:294-299` `stc_adtim_dtuar_field_t{ DTUA:16 }`；`hc32f005.h:301-306` `stc_adtim_dtdar_field_t{ DTDA:16 }` |
| 使能 / 模式 | `DCONR.DTCEN`(bit0) 死区功能使能；`DCONR.SEPA`(bit8) 上下基准是否自动相等 | `hc32f005.h:373-380`；SVD `HC32F005.svd:1123-1131` |
| 分离设定枚举 | `adt.h:282-286` `en_adt_dconr_sepa_t { AdtCHxDtSeperate = 0u（DTUAR/DTDAR 分别设定）, AdtCHxDtEqual = 1u（DTDAR 自动等于 DTUAR） }` | 同左 |
| 配置 API | `adt.c:1579-1587` `Adt_CfgDT(ADTx, bDTEn, bEqual)` → `DCONR_f.DTCEN = bDTEn; DCONR_f.SEPA = bEqual;` | 同左 |
| 写值 API | `adt.c:1542-1548` `Adt_SetDTUA()` → `ADTx->DTUAR = u16Value`；`adt.c:1560-1566` `Adt_SetDTDA()` → `ADTx->DTDAR = u16Value` | 同左 |
| 复位默认值 | `0xFFFF`（最大） | `adt.c:1140-1141`（`Adt_DeInit` 中 `DTDAR = 0xFFFF; DTUAR = 0xFFFF;`） |
| 可编程范围 | **0 ~ 65535 个基准计数**（16 位寄存器） | 由位宽推得（`hc32f005.h:294-306`）+ 默认值 `0xFFFF`（`adt.c:1140-1141`） |
| 时钟源与分频 | **本地查无**：`DCONR` 只有 `DTCEN`/`SEPA` 两位（`hc32f005.h:373-380`、`HC32F005.svd:1114-1131`），`adt.h` 中**没有任何死区分频枚举**（全文件枚举清单见 `adt.h:83-499`） | `⚠️未确认`，见 §12 |
| 上升沿/下降沿独立设定 | 只有"上基准 `DTUAR` / 下基准 `DTDAR`"的**分离 vs 相等**选择（`SEPA`），**没有**"上升沿/下降沿"字样 | `adt.h:282-286`（原文为"DTUAR和DTDAR分别设定"）；`⚠️未确认`（上下基准 ↔ 上升/下降沿的对应关系本地无说明） |

**结论（可确认部分）**：死区基准值可达 16 bit，两路基准可分别设定（`SEPA=0`）或强制相等（`SEPA=1`）；
**死区基准时钟源/分频在本地文件中不存在任何字段或枚举**，实际死区时间 = 基准计数 × 基准时钟周期，其中基准时钟未知。

---

## 4. 刹车（Brake）

### 4.1 刹车输入源（本地可证实的 3 类 + 1 类特殊）

| 刹车源 | 结论 | 依据 |
|---|---|---|
| ① 端口刹车（外部引脚 BKIN 类） | **有**，最多 **16 路** 端口刹车，可逐路使能 + 逐路极性 | `adt.h:602-607` `stc_adt_disable_3_cfg_t { stc_adt_break_port_cfg_t stcBrkPtCfg[16]; bFltEn; enFltClk; }`；`adt.c:941-963` `Adt_Disable3Cfg()`；`adt.c:900-917` `Adt_EnableBrakePort(port, cfg)` 写 `PTBKP`(极性) + `PTBKS`(使能) |
| ② 软件刹车 | **有** | `adt.c:972-977` `Adt_SwBrake(bSwBrk)` → `AOSSR_f.SOFTBK`（`hc32f005.h:652` bit7）；`adt.h:764-765`（注释："仅适用于无效条件3使能的情况下"） |
| ③ VC 比较器刹车 | **有**（VC → ADT 刹车） | `vc.h:196-215` `en_vc_output_cfg_t` 含 `VcOutBrake`（`vc.h:213` "刹车控制"）；硬件位 `hc32f005.h:2219` `stc_vc_vc0_out_cfg_field_t.BRAKE`（VC0）、`hc32f005.h:2240`（VC1） |
| ④ 同高同低刹车（无效条件 1） | **有**：TIM4/5/6 输出"同高/同低"即触发强制无效 | `adt.h:614-622` `stc_adt_disable_1_cfg_t { bTim6OutSH,bTim5OutSH,bTim4OutSH,bTim6OutSL,bTim5OutSL,bTim4OutSL }`；`adt.c:1014-1030` `Adt_Disable1Cfg()` → `AOSSR.SMH0-2/SML0-2`（`hc32f005.h:653-658`） |
| ⑤ 刹车端口极性 | `adt.h:452-456` `en_adt_ptbrk_polarity_t { AdtPtBrkHigh=0（高有效）, AdtPtBrkLow=1（低有效） }` → `PTBKP.POLn`（`hc32f005.h:713-733`，16 个 POL0..POL15） | 同左 |
| ⑥ 刹车端口输入滤波 | `AOSSR.BFILTEN`(bit4) + `AOSSR.BFILTS`(bit3:2) | `hc32f005.h:649-651`；`adt.c:959-960`；滤波档 `adt.h:294-300` `en_adt_fconr_nofick_t { AdtFltClkPclk0=0, /4=1, /16=2, /64=3 }` |

### 4.2 刹车后的输出状态选项（DISVAL）与"条件选择"（DISSEL）

| 枚举 | 取值 | 含义 | PCONR 位域 |
|---|---|---|---|
| `en_adt_pconr_disval_t`（`adt.h:190-196`） | `AdtTIMxDisValNorm = 0` | 条件成立时 **正常输出**（按 PERC/CMPC 逻辑） | `DISVALA` bit12:11 / `DISVALB` bit28:27（`hc32f005.h:347 / 357`，SVD `HC32F005.svd:996-1060`） |
| 同上 | `AdtTIMxDisValHiZ = 1` | 输出 **高阻态** | 同上 |
| 同上 | `AdtTIMxDisValLow = 2` | 输出 **低电平** | 同上 |
| 同上 | `AdtTIMxDisValHigh = 3` | 输出 **高电平** | 同上 |
| `en_adt_pconr_dissel_t`（`adt.h:204-210`） | `AdtCHxDisSel0..3 = 0..3` | 选择"强制输出无效条件 0/1/2/3"作用于该通道 | `DISSELA` bit10:9 / `DISSELB` bit26:25（`hc32f005.h:346 / 356`） |

**联动关系（关键）**：刹车不是直接拉低引脚，而是先产生"强制输出无效条件"，
再由 `PCONR.DISSELx` 决定哪一路条件作用到该通道、由 `PCONR.DISVALx` 决定作用后的电平。
→ 写刹车后**必须**把 `enDisSel` 设成对应条件号、`enDisVal` 设成期望状态：
`adt.c:863-864`（CHA：`DISSELA = pstcAdtCHxXCfg->enDisSel; DISVALA = pstcAdtCHxXCfg->enDisVal;`）、
`adt.c:877-878`（CHB）；结构体字段 `adt.h:580-581`。

**本地可对应的条件号**：条件 1 = 同高同低刹车（`adt.c:1014` `Adt_Disable1Cfg` 注释"无效条件1配置(同高同低刹车)"）；
条件 3 = 端口刹车/软件刹车（`adt.c:941` `Adt_Disable3Cfg` 注释"无效条件3配置"、`adt.c:972`）。
**条件 0 与条件 2 在本地 DDL 中没有任何配置 API 或注释说明 → `⚠️未确认`（§12）。**

### 4.3 刹车标志与"能否自动恢复"

| 项目 | 结论 | 依据 |
|---|---|---|
| 端口刹车标志 | `AOSSR.FBRAKE`(bit0)，读 `adt.c:987-990` `Adt_GetPortBrakeFlag()`；清 `adt.c:1000-1003` `Adt_ClearPortBrakeFlag()` → `AOSCL_f.FBRAKE = 0` | `hc32f005.h:647`、`hc32f005.h:665` |
| 同高同低标志 | `AOSSR.FSAME`(bit1)，`adt.c:1040-1043` / `adt.c:1053-1056` → `AOSCL_f.FSAME = 0` | `hc32f005.h:648`、`hc32f005.h:666` |
| **专用刹车 NVIC 中断** | **本地查无**：`ICONR`（`hc32f005.h:323-335`）只有 `INTENA/B/C/D`、`INTENOVF`、`INTENUDF`、`INTENDE`（死区时间错误），**没有刹车中断使能位**；`en_adt_irq_type_t`（`adt.h:477-486`）同样没有刹车项 | → **刹车只能轮询 `Adt_GetPortBrakeFlag()` / `Adt_GetSameBrakeFlag()`** |
| 自动恢复（latch / 自动清除 / 周期性重试） | **本地查无任何字段**：`AOSSR`/`AOSCL`（`hc32f005.h:645-669`）没有 latch/auto-recovery 位；释放刹车只能靠软件：`Adt_SwBrake(FALSE)`（`adt.c:972-977`）或 `Adt_ClearBrakePort()`（`adt.c:927-930`，把 `PTBKS` 清零） | `⚠️未确认`（§12） |
| 与"周期性强制无效"的联动 | 周期侧机制是 `VPERR`（有效周期）——`adt.h:308-332`（`PCNTS`/`PCNTE`）、`adt.c:1353-1371` `Adt_SetValidPeriod()` → `VPERR.GEPERIA~D`/`PCNTE`/`PCNTS`；`BCONR.BENP` 为周期值双缓冲（`adt.c:1318-1324`）。**本地无任何文字说明 VPERR 与刹车条件的硬件联动** | `⚠️未确认`（§12） |

---

## 5. 时钟与控制

### 5.1 计数时钟源与分频 —— `en_adt_cnt_ckdiv_t` 全枚举（`adt.h:121-131`）

| 枚举值 | 名称 | 含义 | 写位域 |
|---|---|---|---|
| 0 | `AdtClkPClk0` | PCLK0 | `GCONR.CKDIV` = bit6:4（`hc32f005.h:312`；SVD `HC32F005.svd:797` 段 `CKDIV : [6:4]`） |
| 1 | `AdtClkPClk0Div2` | PCLK0 / 2 | 同上 |
| 2 | `AdtClkPClk0Div4` | PCLK0 / 4 | 同上 |
| 3 | `AdtClkPClk0Div8` | PCLK0 / 8 | 同上 |
| 4 | `AdtClkPClk0Div16` | PCLK0 / 16 | 同上 |
| 5 | `AdtClkPClk0Div64` | PCLK0 / 64 | 同上 |
| 6 | `AdtClkPClk0Div256` | PCLK0 / 256 | 同上 |
| 7 | `AdtClkPClk0Div1024` | PCLK0 / 1024 | 同上 |

> ⚠️ **注意分频序列不是 2 的幂连续**：`/16` 之后直接跳到 `/64`（`adt.h:127-128`），没有 `/32`。
> 时钟源只有 **PCLK0** 一种（无外部时钟/编码器时钟选择字段，见 §12）。
> 写入路径：`adt.c:1107-1109` `Adt_Init()` → `GCONR_f.MODE / DIR / CKDIV`；调用范例 `hc_timer.c:80-83`（`AdtClkPClk0Div16`）。

### 5.2 计数模式与方向

| 枚举 | 值 | 名称 | 依据 |
|---|---|---|---|
| `en_adt_cnt_mode_t` | 0 | `AdtSawtoothMode` 锯齿波 | `adt.h:139-144` |
| 同上 | 4 | `AdtTriangleModeA` 三角波 A | 同上 |
| 同上 | 5 | `AdtTriangleModeB` 三角波 B | 同上 |
| `en_adt_cnt_dir_t` | 0 / 1 | `AdtCntDown` 递减 / `AdtCntUp` 递加 | `adt.h:152-156` |
| 写位域 | `GCONR.MODE` bit3:1、`GCONR.DIR` bit8（`hc32f005.h:311,314`） | | |

> ⚠️ 模式枚举值 **不是 0/1/2 而是 0/4/5**（`MODE` 3 bit 字段，bit2 置位表示三角波）。
> `Adt_Init` 的参数校验只判断上界：`adt.c:1102-1105` `if (AdtTriangleModeB < pstcAdtBaseCntCfg->enCntMode) return ErrorInvalidParameter;`
> → **1/2/3 这种非法值不会被拦截**，会被直接写进 `MODE`（踩坑项，§10）。
> 计数方向也可从状态读：`STFLR.DIRF` bit31（`hc32f005.h:430`）、`en_adt_state_type_t.AdtCntDir = 31`（`adt.h:498`）。

### 5.3 周期寄存器与双缓冲

| 寄存器 | 作用 | 依据 |
|---|---|---|
| `PERAR`（0x04） | 计数周期（主） | `hc32f005.h:2378-2382`；`adt.c:1301-1306` `Adt_SetPeriod()` |
| `PERBR`（0x08） | 周期缓冲值（副） | `hc32f005.h:2383-2387`；`adt.c:1318-1324` `Adt_SetPeriodBuf()`（同时置 `BCONR_f.BENP = 1u`） |
| `BCONR.BENP`（bit8） | 周期缓冲传送使能 | `hc32f005.h:368`；清除：`adt.c:1335-1341` `Adt_ClearPeriodBuf()`（`BENP=0; PERBR=0;`） |
| 默认周期 | `0xFFFF` | `adt.c:1134`（`Adt_DeInit`） |

### 5.4 比较基准寄存器

| 寄存器 | 本地可确认的用途 | 依据 |
|---|---|---|
| `GCMAR`(0x10) / `GCMBR`(0x14) | 通用比较基准 A/B（对应 CHxA/CHxB 的比较输出），**同时是捕获值寄存器** | `adt.c:1384-1410` `Adt_SetCompareValue()` 写 `GCMAR/GCMBR`；`adt.c:1483-1500` `Adt_GetCaptureValue()` 读 `GCMAR_f.GCMA / GCMBR_f.GCMB`；位域 16 bit（`hc32f005.h:266-278`） |
| `GCMCR`(0x18) / `GCMDR`(0x1C) | **比较值缓冲 / 捕获缓存值**（A/B 各一） | `adt.h:809-815`（注释"配置通用比较值/捕获值的缓存传送"、"清除比较输出计数值/捕获值缓存"）；`adt.c:1423-1441` `Adt_EnableValueBuf()` → `BCONR.BENA/BENB`（`hc32f005.h:364,366`）；`adt.c:1513-1530` `Adt_GetCaptureBuf()` 读 `GCMCR_f.GCMC / GCMDR_f.GCMD` |
| `BCONR.BENA`(bit0)/`BENB`(bit2) | CHA/CHB 的比较值缓冲传送使能 | `hc32f005.h:364-366`；`adt.c:1427-1434` |
| 默认值 | 四个 GCMxR 复位均为 `0xFFFF` | `adt.c:1136-1139` |

### 5.5 专用比较基准 SpclCompA / SpclCompB —— **本地查无实现**

| 项目 | 结论 | 依据 |
|---|---|---|
| 枚举存在 | `adt.h:178-182` `en_adt_special_compare_t { AdtSpclCompA = 0u, AdtSpclCompB = 1u }` | 同左 |
| 谁在用 | **无**：全 DDL 搜索 `AdtSpclComp` 只命中定义处（`adt.h:180-181`）；`adt.c` 中**没有任何函数接受该类型**，所有 API 用的是 `en_adt_compare_t`（`adt.h:164-170`） | `⚠️未确认` |
| 唯一寄存器痕迹 | `IFR.SAMLF`(bit14) / `IFR.SAMHF`(bit15) 及对应清除位 `ICLR.SAMLC`/`SAMHC`（`hc32f005.h:606-607`、`hc32f005.h:623-624`），但 `en_adt_irq_type_t`（`adt.h:477-486`）与 `ICONR`（`hc32f005.h:323-335`）中**没有它们的使能位** | `⚠️未确认` |
| 结论 | **专用比较基准（SpclCompA/B）在本地 DDL 中是"孤儿枚举"，作用与寄存器均未暴露 → 归入 §12 待核对** | — |

### 5.6 有效周期（VPERR）

| 枚举 | 取值 | 依据 |
|---|---|---|
| `en_adt_vperr_pcnts_t` | `AdtPeriodCnts0=0`（无效）…`AdtPeriodCnts7=7`（每隔 7 个周期有效一次） | `adt.h:308-318` |
| `en_adt_vperr_pcnte_t` | `AdtPeriodCnteDisable=0` / `AdtPeriodCnteMin=1`（上/下溢点或波谷）/ `AdtPeriodCnteMax=2`（上/下溢点或波峰）/ `AdtPeriodCnteBoth=3` | `adt.h:326-332` |
| 位域 | `VPERR.GEPERIA~D`(bit0-3)、`PCNTE`(bit17:16)、`PCNTS`(bit20:18) | `hc32f005.h:404-415`；SVD `HC32F005.svd:1248` 段 |
| 配置 API | `adt.c:1353-1371` `Adt_SetValidPeriod()`；结构体 `adt.h:673-681` | 同左 |
| 读取 | `adt.c:1259-1269` `Adt_GetVperNum()` → `STFLR_f.VPERNUM`（bit23:21，`hc32f005.h:428`） | 同左 |

### 5.7 硬件事件（启动/停止/清零/递加/递减/捕获）

| 类别 | 事件数 | 枚举 | 寄存器 | 依据 |
|---|---|---|---|---|
| 硬件启动/停止/清零/捕获事件 | 16 种 + 使能位 | `en_adt_hw_trig_t`（`adt.h:393-412`）：`AdtHwTrigAos0..3`(0-3)、`AdtHwTrigCHxARise/Fall`(4/5)、`CHxBRise/Fall`(6/7)、`TimTriARise/Fall`(8/9)、`TriB`(10/11)、`TriC`(12/13)、`TriD`(14/15)、`AdtHwTrigEnd=16` | `HSTAR`(0x74)、`HSTPR`(0x78)、`HCELR`(0x7C)、`HCPAR`(0x80)、`HCPBR`(0x84)；使能位 = bit31（`ADTIM_HW_STASTPCLR_EN 31`，`adt.c:78`） | API：`adt.c:285/360/435/511/552` |
| 硬件递加/递减事件 | 20 种 | `en_adt_hw_cnt_t`（`adt.h:421-444`）：0-7 为 CHxA/CHxB 电平+边沿组合、8-15 为 TIMTRIx 边沿、16-19 为 AOS0-3、`AdtHwCntMax=20` | `HCUPR`(0x88)、`HCDOR`(0x8C)（位域 20 bit，`hc32f005.h:543-593`） | API：`adt.c:203/245` |

---

## 6. PWM 相关高级功能逐项核对（有 / 无 + 证据）

| 功能 | 结论 | 证据 |
|---|---|---|
| **载波 / Chopper（高频调制）** | **本地查无** | 全 DDL 搜索 `载波`、`CHOP`、`Chopper` 只命中 `hc_timer.c:83` 的一句注释（"ADT载波、计数模式、时钟配置"，实为 `Adt_Init`，注释本身不可信）；`PCONR`/`GCONR`/`CR`/`DCONR` 无任何载波位域（`hc32f005.h:308-380`、`hc32f005.h:629-643`）→ **判定：无载波功能（在本地证据范围内）** |
| **PWM 展频 / Dither** | **有** | 枚举 `adt.h:464-468` `en_adt_pwm_dither_type_t { AdtPwmDitherUnderFlow=0, AdtPwmDitherOverFlow=1 }`；结构体 `adt.h:629-634` `stc_adt_pwm_dither_cfg_t`；寄存器 `CR.DITENA`(bit8)/`DITENB`(bit9)/`DITENS`(bit10)（`hc32f005.h:638-640`）；API `adt.c:1067-1081` `Adt_PwmDitherCfg()`。**注意 `DITENS` 是 A/B 共用一个选择位** |
| **ADT → ADC 硬件触发** | **有（双向证据）** | ① ADT 侧：`adt.h:532-540` `stc_adt_irq_trig_cfg_t` 六个字段注释均为"…使能触发ADC"（下溢/上溢/匹配 D/C/B/A）；写入实现 `adt.c:772-777` → `CR_f.CMAE/CMBE/CMCE/CMDE/OVFE/UDFE`（`hc32f005.h:631-637`）；② ADC 侧：`adc.h:168-203` `en_adc_trig_sel_t` 含 `AdcTrigTimer4 = 5`、`AdcTrigTimer5 = 6`、`AdcTrigTimer6 = 7`（`adc.h:175-177`，"选择timer4/5/6中断源，自动触发ADC采样"）；③ 配置结构体 `adc.h:236-240` `enAdcTrig0Sel/enAdcTrig1Sel` |
| **AOS / 内部互联触发** | **有** | ① ADT 作为 AOS 的**被触发方**：`ITRIG.IAOS0S~IAOS3S`（`hc32f005.h:703-711`，4 bit×4）选择 AOS0~3 各自的**源**，源枚举 `adt.h:366-384` `en_adt_itrig_iaosxs_t`（TIM0/1/2、LPTIMER、**TIM4/5/6**、UART0/1、LPUART、VC0/1、RTC、PCA、SPI、ADC）；配置 API `adt.c:740-752` `Adt_AosTrigCfg()`（只写 `M0P_ADTIM4->ITRIG`）。② AOS 事件可作为 ADT 的启动/停止/清零/捕获/递加/递减事件：`AdtHwTrigAos0..3`（`adt.h:395-398`）、`AdtHwCntAos0..3`（`adt.h:439-442`）。③ 本器件**没有独立的 AOS 寄存器块/基地址宏**（`hc32f005.h:3526-3556` 地址表内无 AOS） → AOS 是内部互联网络，仅在 ADT 的 `ITRIG` 中选源 |
| **端口触发输入（TIMTRIA~D）** | **有**：4 个触发端口 × 16 个引脚可选 | `adt.h:93-99` `en_adt_trig_port_t { AdtTrigA..D }`；`adt.h:340-358` `en_adt_ttrig_trigxs_t`（P01,P02,P03,P14,P15,P23,P24,P25,P26,P27,P31,P32,P33,P34,P35,P36）；寄存器 `TTRIG.TRIGAS/BS/CS/DS`（`hc32f005.h:693-701`）；配置 API `adt.c:792-831` `Adt_PortTrigCfg()` |
| **互补输出 + 死区** | **有**（1 对/实例） | §2.2、§3 |
| **硬件捕获（输入捕获）** | **有**（CHxA/CHxB） | §8 |
| **重复计数 / 有效周期** | **有** | §5.6 |
| **三实例同步 启/停/清** | **有** | §2.4（`SSTAR/SSTPR/SCLRR`） |
| **外部时钟 / 编码器模式** | **本地查无** | `en_adt_cnt_ckdiv_t` 只有 PCLK0 系列（`adt.h:121-131`）；`GCONR` 无外部时钟选择位（`hc32f005.h:308-321`）→ 无编码器接口 |
| **PWM 逐周期更新/影子寄存器（CH 值）** | **有**（BENA/BENB + GCMCR/GCMDR） | §5.4 |

---

## 7. 端口功能选择

### 7.1 `en_adt_CHxX_port_t` 语义（`adt.h:83-87`）

`AdtCHxA = 0u` / `AdtCHxB = 1u` —— 它是**"同一颗 ADT 内的通道号选择器"**，不是实例选择器
（实例用指针 `M0P_ADTIM4/5/6` 传入）。所有带 `en_adt_CHxX_port_t` 参数的 API 都靠它做 `if/switch` 分流：

| 参数处 | 分流结果 | 依据 |
|---|---|---|
| `Adt_CHxXPortCfg(ADTx, port, cfg)` | A → `PCONR_f.*A` + `FCONR_f.NOFIENGA/NOFICKGA`；B → `PCONR_f.*B` + `FCONR_f.NOFIENGB/NOFICKGB` | `adt.c:855-881` |
| `Adt_EnableValueBuf(ADTx, port, en)` | A → `BCONR_f.BENA`；B → `BCONR_f.BENB` | `adt.c:1427-1434` |
| `Adt_ClearValueBuf(ADTx, port)` | A → `GCMCR = 0`；B → `GCMDR = 0` | `adt.c:1456-1463` |
| `Adt_GetCaptureValue(ADTx, port, *p)` | A → `GCMAR_f.GCMA`；B → `GCMBR_f.GCMB` | `adt.c:1487-1494` |
| `Adt_GetCaptureBuf(ADTx, port, *p)` | A → `GCMCR_f.GCMC`；B → `GCMDR_f.GCMD` | `adt.c:1517-1524` |

### 7.2 `PCONR` 全部字段（`hc32f005.h:337-360` / SVD `HC32F005.svd:931` 段）

| 字段 | 位 | 枚举（`adt.h`） | 含义 |
|---|---|---|---|
| `CAPCA` / `CAPCB` | A:0 / B:16 | `en_adt_pconr_capc_t`（`adt.h:258-262`）：`AdtCHxCompareOutput=0`（比较输出） / `AdtCHxCompareInput=1`（捕获输入） | **比较/捕获功能切换** |
| `STACA` / `STACB` | A:1 / B:17 | `en_adt_pconr_port_out_t`（`adt.h:246-250`）：`Low=0` / `High=1` | 计数**开始**时端口输出电平 |
| `STPCA` / `STPCB` | A:2 / B:18 | 同上 | 计数**停止**时端口输出电平 |
| `STASTPSA` / `STASTPSB` | A:3 / B:19 | `en_adt_pconr_stastps_t`（`adt.h:270-274`）：`AdtCHxStateSelSS=0`（由 STACB/STPCB 决定）/ `AdtCHxStateSelKeep=1`（保持先前状态） | 启停时的输出来源选择 |
| `CMPCA` / `CMPCB` | A:5:4 / B:21:20 | `en_adt_pconr_cmpc_t`（`adt.h:232-238`） | 计数值 == `GCMxR` 时端口动作 |
| `PERCA` / `PERCB` | A:7:6 / B:23:22 | `en_adt_pconr_perc_t`（`adt.h:218-224`） | 计数值 == 周期值时端口动作 |
| `OUTENA` / `OUTENB` | A:8 / B:24 | `stc_adt_CHxX_port_cfg_t.bOutEn`（`adt.h:574`） | 端口输出使能 |
| `DISSELA` / `DISSELB` | A:10:9 / B:26:25 | `en_adt_pconr_dissel_t`（`adt.h:204-210`） | **选择哪一路"强制输出无效条件"作用于该通道** |
| `DISVALA` / `DISVALB` | A:12:11 / B:28:27 | `en_adt_pconr_disval_t`（`adt.h:190-196`） | **强制输出无效条件成立时该通道的输出状态**（正常/高阻/低/高） |

### 7.3 `DISVAL` 的精确语义（原文）
`adt.h:192-195`：
`AdtTIMxDisValNorm = 0u` "强制输出无效条件0~3中被选择的条件成立时，CHx端口正常输出"；
`HiZ = 1u` 高阻态；`Low = 2u` 低电平；`High = 3u` 高电平。
→ **即：`DISVAL` 只有在 `DISSEL` 选中的条件成立时才生效；`Norm` 不是"忽略"，而是"照常按 PERC/CMPC 输出"。**

### 7.4 `FCONR` 全部字段（滤波，`hc32f005.h:382-402` / SVD `HC32F005.svd:1146` 段）

| 字段 | 位 | 作用 |
|---|---|---|
| `NOFIENGA` / `NOFIENGB` | A:0 / B:4 | CHx 端口**捕获输入**滤波使能（`adt.c:865 / 879`；结构体字段 `adt.h:582` `bFltEn`） |
| `NOFICKGA` / `NOFICKGB` | A:2:1 / B:6:5 | CHx 滤波采样基准时钟（`en_adt_fconr_nofick_t`，`adt.h:294-300`） |
| `NOFIENTA..D` | 16 / 20 / 24 / 28 | TIMTRIA~D **触发输入**滤波使能（`adt.c:804/810/816/822`） |
| `NOFICKTA..D` | 18:17 / 22:21 / 26:25 / 30:29 | TIMTRIA~D 滤波采样基准时钟（`adt.c:805/811/817/823`） |

### 7.5 引脚复用号（AF 号）—— 本地只有一处范例
`hc_timer.c:56-62`（`App_AdtPortInit`）+ `hc_timer.h:14-17`：

| 通道 | 端口/引脚 | 方向 | AF | 依据 |
|---|---|---|---|---|
| TIM4_CHA | `GpioPort2 / GpioPin3`（P23） | `GpioDirIn` | `GpioAf3` | `hc_timer.c:55-58` 注释"P23设置为TIM4_CHA"；`hc_timer.h:14-15` |
| TIM4_CHB | `GpioPort2 / GpioPin4`（P24） | `GpioDirIn` | `GpioAf1` | `hc_timer.c:60-62`；`hc_timer.h:16-17` |
| AF 号枚举全集 | `GpioAf0..GpioAf7` | — | — | `gpio.h:112-122` |

> **除上表外的所有 ADT 引脚复用号/封装引脚号本地均无表 → §12 待核对。**
> 注意 `TTRIG` 可选的 16 个引脚（`adt.h:342-357`）与 `adc.h:186-201` 的引脚触发源清单**完全同集合**，
> 可作为"该器件对外引出的引脚集合"的**间接**参考（P01,P02,P03,P14,P15,P23,P24,P25,P26,P27,P31,P32,P33,P34,P35,P36）。

---

## 8. 输入捕获（做零交叉时间戳用）

**结论：可以，且这是 DDL 范例本身演示的用法（`hc_timer.c` 整个例程就是 TIM4 CHA/CHB 双边沿捕获）。**

| 环节 | 说明 | 依据 |
|---|---|---|
| 可做捕获的通道 | **只有 CHxA 与 CHxB**（每颗 ADT 2 路） | `adt.h:258-262`（CAPC）+ `adt.c:853-884`；`adt.c:511/552` |
| 切换为捕获 | `Adt_CHxXPortCfg(ADTx, AdtCHxA, &cfg)` 且 `cfg.enCap = AdtCHxCompareInput` | `adt.c:856 / 870`；范例 `hc_timer.c:88 / 95` |
| 捕获触发事件 | 16 种硬件事件：AOS0-3、CHxA 升/降、CHxB 升/降、TIMTRIA~D 升/降 | `adt.h:393-412`；API `adt.c:511-525` `Adt_CfgHwCaptureA()`、`adt.c:552-566` `Adt_CfgHwCaptureB()` |
| 捕获值寄存器 | `GCMAR`(A) / `GCMBR`(B)，16 bit | `adt.c:1487-1494`；`hc32f005.h:266-278` |
| 捕获缓存 | `GCMCR`(A) / `GCMDR`(B)，需先使能 `BCONR.BENA/BENB` | `adt.c:1423-1441`、`adt.c:1513-1530` |
| 捕获中断 | `ICONR.INTENA/INTENB`（`AdtCMAIrq/AdtCMBIrq`），向量 `ADTIM4_IRQn` | `adt.h:479-480`；`hc_timer.c:111-113` |
| 输入滤波 | `FCONR.NOFIENGA/B` + `NOFICKGA/B`（PCLK0、/4、/16、/64） | `adt.h:294-300`；`adt.c:865-866` |
| 清零计数（时间戳对齐） | 可用硬件清零事件：`AdtHwTrigCHxARise/Fall`、`CHxBRise/Fall` 等 → `HCELR` | `adt.h:399-402`；`hc_timer.c:104-108`（范例里被注释掉） |

### 8.1 精度取决于什么（本地可证实的三条）

1. **计数分辨率 = PCLK0 ÷ CKDIV**（`adt.h:121-131` 全枚举；`hc_timer.c:82` 用 `AdtClkPClk0Div16`）→ **分辨率就是死区之外最关键的精度天花板**；
2. **计数器只有 16 bit**（`hc32f005.h:245-250` `CNT:16`）→ 单次最多 65535 个计数就必须软件处理环绕：
   范例 `hc_timer.c:167-181`（`if (valeFall > valeRise) … else periodHigh = (0xFFFF - valeRise) + valeFall;`）；
3. **输入滤波会引入延迟**：使能 `NOFIENGA/B` 后按 `NOFICKGA/B` 选定的采样时钟采样（`adt.h:294-300`），
   范例中该滤波被注释掉（`hc_timer.c:89-90 / 96-97`）。
   另：捕获是"边沿事件 → 锁存 CNT"，无亚周期插值，量化误差 ±1 个计数。

---

## 9. 中断（源、使能、标志、向量）

### 9.1 中断类型 `en_adt_irq_type_t`（`adt.h:477-486`）与使能位

| 枚举 | 值 | 含义 | `ICONR` 位域（`hc32f005.h:323-335`） |
|---|---|---|---|
| `AdtCMAIrq` | 0 | 计数匹配 A（或 **捕获输入 A**） | `INTENA` bit0 |
| `AdtCMBIrq` | 1 | 计数匹配 B（或 **捕获输入 B**） | `INTENB` bit1 |
| `AdtCMCIrq` | 2 | 计数匹配 C | `INTENC` bit2 |
| `AdtCMDIrq` | 3 | 计数匹配 D | `INTEND` bit3 |
| `AdtOVFIrq` | 6 | **上溢**匹配 | `INTENOVF` bit6 |
| `AdtUDFIrq` | 7 | **下溢**匹配 | `INTENUDF` bit7 |
| `AdtDTEIrq` | 8 | **死区时间错误** | `INTENDE` bit8 |
| （无） | — | **刹车中断：本地查无** | `ICONR` 无刹车位（见 §4.3） |

- 使能/禁止：`adt.c:117-134` `Adt_CfgIrq(ADTx, enAdtIrq, bEn)` → `ICONR |= / &= ~(1u<<enAdtIrq)`。
- 中断触发 ADC 的使能位在另一个寄存器 `CR`（`adt.c:764-780`，见 §6）。

### 9.2 标志与状态

| 寄存器 | 字段 | 依据 |
|---|---|---|
| `IFR`（0x100） | `CMAF`0 `CMBF`1 `CMCF`2 `CMDF`3 `OVFF`6 `UDFF`7 `DTEF`8，以及 `SAMLF`14 `SAMHF`15 | `hc32f005.h:595-610` |
| `ICLR`（0x104） | `CMAC`0 `CMBC`1 `CMCC`2 `CMDC`3 `OVFC`6 `UDFC`7 `DTEC`8，`SAMLC`14 `SAMHC`15 | `hc32f005.h:612-627` |
| `STFLR`（0x70） | `CMAF..DTEF` + `VPERNUM`(bit23:21) + `DIRF`(bit31)；`Adt_GetState()` 用位偏移直接读（`en_adt_state_type_t`，`adt.h:489-499`；`adt.c:1281-1289`） | `hc32f005.h:417-431` |
| 读标志 | `adt.c:147-159` `Adt_GetIrqFlag()` → 读 `IFR` | — |
| 清标志 | `adt.c:171-176` `Adt_ClearIrqFlag()` → `ICLR = ~(1u<<irq)`；`adt.c:187-191` `Adt_ClearAllIrqFlag()` → `ICLR = 0` | **语义 = "写 0 清除对应标志位，写 1 不动作"**（跨模块证据见下） |

**`ICLR` 清标志语义（跨模块交叉验证，非猜测）**：

| 模块 | 函数与文档 | 写法 | 结论 |
|---|---|---|---|
| PCA | `pca.c:103-106` `Pca_ClrItStatus()`，注释"清除中断源的标志位" | `M0P_PCA->ICLR &= ~(uint32_t)(1<<It_Src);` | **把目标位写 0 = 清除** |
| FLASH | `flash.c:156-160` `Flash_ClearIntFlag()` | `M0P_FLASH->ICLR &= ~(uint32_t)enFlashIntType;` | 同上 |
| CLKTRIM | `trim.c:123-129` `Trim_ClearIntFlag()` | `M0P_CLK_TRIM->ICLR &= ~(uint32_t)enIntType;` | 同上 |
| RAM | `ram.c:124-126` `Ram_ClearIntFlag()`，注释"清除中断标志" | `M0P_RAM->ICLR = 0u;` | **写 0 = 清全部** |
| ADC | `adc.c:112-115 / 125-128 / 138-141 / 151-154` `Adc_ClrContIrqState()` 等，注释"清除ADC xxx中断状态" | `M0P_ADC->ICLR = ~(1<<3);` 等 | 整寄存器写 `~mask` = 只把目标位清 0、其余位写 1（不动作） |
| ADT | `adt.c:174 / 189` | 同上两种写法 | 与 ADC 完全同构，**一致，不矛盾** |

### 9.3 向量与范例

| 实例 | IRQn | 向量符号 | 用户回调名 | 范例 |
|---|---|---|---|---|
| TIM4 | `ADTIM4_IRQn = 18`（`hc32f005.h:90`） | `TIM4_IRQHandler`（`startup.s:101`、`int_c.c:321`） | `Tim4_IRQHandler`（`int_c.c:77`） | `hc_timer.c:154-213` |
| TIM5 | `ADTIM5_IRQn = 19`（`hc32f005.h:91`） | `TIM5_IRQHandler`（`startup.s:102`、`int_c.c:334`） | `Tim5_IRQHandler`（`int_c.c:78`） | — |
| TIM6 | `ADTIM6_IRQn = 20`（`hc32f005.h:92`） | `TIM6_IRQHandler`（`startup.s:103`、`int_c.c:347`） | `Tim6_IRQHandler`（`int_c.c:79`） | — |

`hc_timer.c:157-212` 的 ISR 结构（可作模板）：
读标志 → 清标志 → 取捕获值 → 重设捕获边沿 → 算周期（含 16 位环绕处理）。

---

## 10. 踩坑项（从 `adt.c` / `hc_timer.c` 实际写法提炼）

| # | 坑 | 证据 | 应对 |
|---|---|---|---|
| 1 | **`ICLR` 是"写 0 清除"型寄存器**：清一个标志必须整寄存器写 `~mask`（或直接 `=0` 清全部），**绝不能写 `ICLR \|= (1u<<irq)`**（写 1 = 不动作）；也不要对 `ICLR` 做读-改-写以外的臆测 | `adt.c:174`（`ICLR = ~(1u<<enAdtIrq)`）与 `adt.c:189`（`ICLR = 0`）两种用法并存；跨模块同构证据：`adc.c:114`（注释"清除ADC CONT中断状态"）、`pca.c:105`（注释"清除中断源的标志位"，用 `&= ~mask`）、`flash.c:160`、`trim.c:129`、`ram.c:126` | 清单标志用 `Adt_ClearIrqFlag()`，清全部用 `Adt_ClearAllIrqFlag()`；**不要**自己写 `ICLR \|= mask` |
| 2 | **改配置前必须先停计数**：`Adt_Init/Adt_CHxXPortCfg/Adt_CfgDT/Adt_SetPeriod*` 都是**直接写寄存器**，DDL 内部不做保护 | `adt.c:1125-1127`（`Adt_DeInit` 第一步 `GCONR_f.START = 0`）；范例顺序是先配置、最后才 `Adt_StartCount`（`hc_timer.c:127-136`，起计数在 `hc_timer.c:133`） | 运行中改模式/周期/死区：`Adt_StopCount()` → 配置 → `Adt_StartCount()`；周期/比较值想在线改则用双缓冲（`Adt_SetPeriodBuf` `adt.c:1318`、`Adt_EnableValueBuf` `adt.c:1423`） |
| 3 | **`Adt_CfgHwCaptureA/B()` 会顺手把通道切成捕获输入**（隐式改 `PCONR.CAPCA/B`），调用者可能没意识到通道已不能再输出 PWM | `adt.c:523` `ADTx->PCONR_f.CAPCA = 1;`、`adt.c:564` `ADTx->PCONR_f.CAPCB = 1;` | 要么把它当作"启用捕获"的完整动作，要么之后显式用 `Adt_CHxXPortCfg` 改回 `AdtCHxCompareOutput` |
| 4 | **`GCMCR/GCMDR` 一身两职**：既是 CHA/CHB 的**比较值缓冲**，又是**捕获缓存**。`Adt_ClearValueBuf()` 用"写 0"来清缓冲，与"读捕获缓存"共用同一寄存器 | 写：`adt.c:1458 / 1462`；读：`adt.c:1519 / 1523` | 同一通道不要同时使用比较输出缓冲与捕获缓存 |
| 5 | **"只写 `=` 不写 `|=`" 的寄存器**：以下 API 都是**整寄存器覆盖写**，多字段共用时后写会覆盖先写 | `Adt_SetPeriod`→`PERAR=`（`adt.c:1303`）、`Adt_SetPeriodBuf`→`PERBR=`（`adt.c:1320`）、`Adt_SetCompareValue`→`GCMxR=`（`adt.c:1390-1402`）、`Adt_SetDTUA/DTDA`→`DTUAR/DTDAR=`（`adt.c:1545 / 1563`）、`Adt_DeInit` 全部 `=`、`Adt_CfgZMask` 只写 `GCONR` 的 3 个 ZMSK 字段（`adt.c:1606-1608`，与 `Adt_Init` 写 `GCONR` 的 MODE/DIR/CKDIV **字段不冲突但同寄存器**） | 同寄存器不同字段的配置要在同一阶段完成，且注意"先 `Adt_Init` 再 `Adt_CfgZMask`"（字段位不同，可共存） |
| 6 | **位域 `|=` 写法**：硬件事件寄存器是"读-改-写"置位，只置位、不能单独清位 | `adt.c:213-214`（`HCUPR = u32Val \| (1u<<en)`）、`adt.c:294-295`（`HSTAR`）、`adt.c:369-370`（`HSTPR`）、`adt.c:445-446`（`HCELR`）、`adt.c:521-522 / 562-563`（`HCPAR/HCPBR`） | 想清某一事件只能整寄存器清零（`Adt_ClearHwStart/Stop/Clear/CntUp/CntDown`，如 `adt.c:310 / 385 / 461 / 230 / 271`），**不能用 `|=` 组合多组事件后再撤销其中一个** |
| 7 | **`ASSERT` 默认是空实现**，所以下面这些"看着有校验"的代码在量产编译下**什么都不做**，而且宏体本身引用了**不存在的符号** | `base_types.h:87-91`：`#ifdef __DEBUG_ASSERT → assert(...) #else #define ASSERT(x) {}`；`adt.c:153 / 1227 / 1264 / 1285` 使用 `IS_VALID_ADT_UNIT(enAdtUnit)`，但 **`IS_VALID_ADT_UNIT` 全 DDL 无定义**，`enAdtUnit` 也不存在；`adt.c:66-77` `IS_VALID_ADT_STATE` 引用 `AdtCMSAUF/AdtCMSADF/AdtCMSBUF/AdtCMSBDF`，这些枚举**在 `adt.h` 中不存在** | 不要依赖 DDL 的参数校验；打开 `__DEBUG_ASSERT` 前必须自行修掉这些符号 |
| 8 | **AOS/刹车/同步/触发类寄存器在 DDL 中只写 `M0P_ADTIM4`**，即使函数签名传了 `ADTx` | `adt.c:614/649/684`（同步启停清）、`adt.c:747-750`（AOS 源）、`adt.c:803-823`（TTRIG/FCONR）、`adt.c:909-914/929/959-960/974/1002/1022-1027/1055`（刹车与标志） | 认定这些是"全局控制"；`⚠️` 是否三颗实例的同类寄存器都有效未确认（§12） |
| 9 | **`Adt_EnableHwStart/Stop/Clear` 只置 bit31**（`ADTIM_HW_STASTPCLR_EN = 31`，`adt.c:78`），必须先 `Adt_CfgHwXxx` 选事件、再置 bit31 使能；禁用掩码是 `0x7FFFFFFF`（`adt.c:79`，`Adt_DisableHwXxx` 用 `&` 清 bit31） | `adt.c:323-348 / 398-423 / 474-499` | 顺序：`CfgHwStart(事件)` → `EnableHwStart()`；只置 bit31 而不配事件 = 无事件可用 |
| 10 | **16 位计数器环绕必须自己处理** | `hc32f005.h:245-250`（`CNT:16`）；范例 `hc_timer.c:167-181` 手写 `0xFFFF - rise + fall` 处理环绕；`Adt_SetPeriod` 在 `Adt_DeInit` 后为 `0xFFFF`（`adt.c:1134`） | 捕获高电平/低电平脉宽时按范例算法；或用硬件清零事件把 CNT 归零后直接读差值 |
| 11 | **`Adt_Init` 的参数校验有洞**：只检查 `AdtTriangleModeB < enCntMode`，所以 `enCntMode = 1/2/3` 会被写进 `MODE`（3 bit 非法值） | `adt.c:1102-1105`；枚举值 0/4/5（`adt.h:139-144`） | 只用 `AdtSawtoothMode/AdtTriangleModeA/AdtTriangleModeB` 三值 |
| 12 | **`Adt_DeInit` 把 `GCONR` 置 `0x00000100`、`CR` 置 `0x00000300`**（不是全 0）：`GCONR` 的 bit8 = `DIR = 1`（递加），`CR` 的 bit8/9 = `DITENA/DITENB = 1`（两通道展频使能） | `adt.c:1128`（`GCONR = 0x00000100`）、`adt.c:1153`（`CR = 0x00000300`）；位定义 `hc32f005.h:314`（`DIR:1`）、`hc32f005.h:638-639`（`DITENA/DITENB`） | DeInit 之后不要假设"全 0"，尤其展频位被打开了 |
| 13 | **初始化顺序（范例实证）**：外设时钟 → GPIO(方向+AF) → `Adt_Init` → 周期 → 通道功能(捕获/输出) → 硬件事件 → 清标志 → 中断使能 → NVIC → `Adt_StartCount` | `hc_timer.c:53-58`（GPIO 时钟+AF）、`hc_timer.c:77`（ADT 时钟）、`hc_timer.c:80-83`（Init）、`hc_timer.c:85`（Period）、`hc_timer.c:88-98`（通道）、`hc_timer.c:101-108`（事件）、`hc_timer.c:110-113`（标志+中断+NVIC）、`hc_timer.c:133`（Start） | 照此顺序，别颠倒 |

---

## 11. 建议的三相六路互补 PWM 骨架（**本库综合 DDL API 的推导，非厂商示例；引脚需按数据手册核对**）

```c
/* 1) 时钟 + 三实例初始化（三颗共用 SysctrlPeripheralAdvTim，hc_timer.c:77 / sysctrl.h:217） */
Sysctrl_SetPeripheralGate(SysctrlPeripheralAdvTim, TRUE);

stc_adt_basecnt_cfg_t base = { AdtSawtoothMode, AdtCntUp, AdtClkPclk0Div16 }; /* adt.h:642-647 */
Adt_Init(M0P_ADTIM4, &base);   /* adt.c:1093 */
Adt_Init(M0P_ADTIM5, &base);
Adt_Init(M0P_ADTIM6, &base);

Adt_StopCount(M0P_ADTIM4);     /* 改配置前先停：adt.c:1190 */
Adt_SetPeriod(M0P_ADTIM4, PERIOD);  /* adt.c:1301 */

/* 2) 死区（每颗 ADT 一组，CHA/CHB 共用）：adt.c:1542/1560/1579 */
Adt_SetDTUA(M0P_ADTIM4, DEAD_CNT);
Adt_SetDTDA(M0P_ADTIM4, DEAD_CNT);
Adt_CfgDT(M0P_ADTIM4, TRUE, TRUE);          /* DTCEN=1, SEPA=1（DTDAR 自动=DTUAR） */

/* 3) CHA/CHB 互补 + 刹车后输出状态：PCONR（adt.h:571-584 / adt.c:844） */
stc_adt_CHxX_port_cfg_t chA = {0}, chB = {0};
chA.enCap = AdtCHxCompareOutput; chA.bOutEn = TRUE;
chA.enPerc = AdtCHxPeriodHigh;   chA.enCmpc = AdtCHxCompareLow;   /* adt.h:218-238 */
chA.enDisSel = AdtCHxDisSel3;    chA.enDisVal = AdtTIMxDisValLow; /* 刹车→低电平：adt.h:190-210 */
chB = chA; chB.enPerc = AdtCHxPeriodLow; chB.enCmpc = AdtCHxCompareHigh; /* 互补靠 PERC/CMPC，无 INVEN 位 */
Adt_CHxXPortCfg(M0P_ADTIM4, AdtCHxA, &chA);
Adt_CHxXPortCfg(M0P_ADTIM4, AdtCHxB, &chB);
Adt_EnableValueBuf(M0P_ADTIM4, AdtCHxA, TRUE);  /* 在线改占空比用缓冲：adt.c:1423 */
Adt_EnableValueBuf(M0P_ADTIM4, AdtCHxB, TRUE);
Adt_SetCompareValue(M0P_ADTIM4, AdtCompareA, DUTY_A); /* adt.c:1384 */
Adt_SetCompareValue(M0P_ADTIM4, AdtCompareB, DUTY_B);

/* 4) 刹车：端口刹车（无效条件3）+ 软件刹车：adt.c:900 / 941 / 972 */
stc_adt_disable_3_cfg_t d3 = {0};
d3.stcBrkPtCfg[n].bPortEn = TRUE;
d3.stcBrkPtCfg[n].enPol    = AdtPtBrkLow;   /* adt.h:452-456 */
Adt_Disable3Cfg(&d3);
/* 运行中紧急封波：Adt_SwBrake(TRUE); 释放：Adt_SwBrake(FALSE); 状态：Adt_GetPortBrakeFlag(); */

/* 5) 三颗同步启动（TIM4/5/6 一起起）：adt.c:592；位 ADTIM_SS_TIM4/5/6 = 1/2/4 (adt.c:80-82) */
stc_adt_sw_sync_t ss = { TRUE, TRUE, TRUE };   /* adt.h:506-512 */
Adt_StartCount(M0P_ADTIM4); Adt_StartCount(M0P_ADTIM5); Adt_StartCount(M0P_ADTIM6);
Adt_SwSyncStart(&ss);
/* 停：Adt_SwSyncStop(&ss); 清：Adt_SwSyncClear(&ss); 状态：Adt_GetSwSyncState(&ss); */
```

> 该骨架未在真机验证；**引脚 AF 号、三对通道是否全部引出**见 §12。

---

## 12. §未确认/待核对（本地查无，禁止臆造）

| # | 待核对项 | 本地状态 | 已知的本地线索 |
|---|---|---|---|
| 1 | **ADT 引脚复用号（AF 号）全表**（TIM4/5/6 的 CHA/CHB、TIMTRIA~D、刹车输入引脚） | **本地查无引脚复用表** | 唯一范例：TIM4_CHA = P23 @ `GpioAf3`、TIM4_CHB = P24 @ `GpioAf1`（`hc_timer.c:55-62`、`hc_timer.h:14-17`）；`gpio.h:112-122` 只有 `GpioAf0..7` 枚举，无映射表 |
| 2 | **封装引脚号（PIN 号）** | **本地查无** | `ddl_device.h:70` `DDL_MCU_PACKAGE = DDL_DEVICE_PACKAGE_HC_K`；`ddl.h:91-94` 只给出 `HC_C/HC_F/HC_J/HC_K` 四个代号，**注释里没有封装/引脚数说明** |
| 3 | **电气参数**（VDD 范围、温度范围、IO 驱动电流、死区最小/最大 ns、最大计数频率、PCLK0 上限） | **本地查无** | DDL 只给寄存器与枚举 |
| 4 | **死区基准时钟源与分频** | **本地查无字段** | `DCONR` 仅 `DTCEN`(bit0)/`SEPA`(bit8)（`hc32f005.h:373-380`；`HC32F005.svd:1114-1131`）；`adt.h` 无死区分频枚举 |
| 5 | **`DTUAR` 与 `DTDAR` 分别对应上升沿还是下降沿死区** | **本地无说明** | `adt.h:282-286` 只说"上下基准分别设定"；`adt.c:1542/1560` 注释"死区时间上/下基准值" |
| 6 | **"强制输出无效条件 0"与"条件 2"是什么** | **本地查无** | `PCONR.DISSELx` 可选 0~3（`adt.h:204-210`）；DDL 只实现了条件 1（`Adt_Disable1Cfg`，`adt.c:1014`）与条件 3（`Adt_Disable3Cfg`，`adt.c:941`） |
| 7 | **刹车是否支持自动恢复/锁存方式** | **本地查无字段** | `AOSSR`/`AOSCL` 无 latch/auto 位（`hc32f005.h:645-669`）；只有软件释放 `Adt_SwBrake(FALSE)`（`adt.c:972`）/ `Adt_ClearBrakePort()`（`adt.c:927`） |
| 8 | **刹车是否需要/是否有独立中断** | **本地查无** | `ICONR`（`hc32f005.h:323-335`）与 `en_adt_irq_type_t`（`adt.h:477-486`）均无刹车位；只能轮询 `AOSSR.FBRAKE/FSAME` |
| 9 | **专用比较基准 `AdtSpclCompA/B`（`adt.h:180-181`）的作用与对应寄存器** | **本地查无实现** | 仅 `IFR.SAMLF/SAMHF`、`ICLR.SAMLC/SAMHC`（`hc32f005.h:606-607 / 623-624`）与其字面相关，但无使能位、无 API |
| 10 | **`VPERR`（有效周期）与刹车/强制无效条件的硬件联动方式** | **本地无文字说明** | `VPERR` 字段 `GEPERIA~D/PCNTE/PCNTS`（`hc32f005.h:404-415`） |
| 11 | **AOS/刹车/同步/端口触发寄存器是否"只有 TIM4 实例有效、全局生效"** | **无法从 DDL 证明** | SVD 中 ADTIM5/6 从 ADTIM4 派生（`HC32F005.svd:3188-3205`，即三实例都有这些寄存器），但 `adt.c` 一律只写 `M0P_ADTIM4`（`adt.c:614/649/684/747-750/803-823/909-914/929/959-960/974/1002/1022-1027/1055`） |
| 12 | **是否存在载波（Chopper）功能** | **本地查无**（判定：无） | 全 DDL 仅 `hc_timer.c:83` 一句不可信的注释提到"载波" |
| 13 | **是否支持外部时钟/编码器模式** | **本地查无**（判定：无） | `en_adt_cnt_ckdiv_t`（`adt.h:121-131`）只列 PCLK0 系列；`GCONR`（`hc32f005.h:308-321`）无外部时钟选择位 |
| 14 | **`HC32F003.h` 与 `hc32f005.h` 的结构体命名差异是否代表寄存器差异** | 命名不同，**寄存器集合相同**（各 36 个字段结构体一一对应：`HC32F003.h:248-697` `stc_adt_*` vs `hc32f005.h:245-760` `stc_adtim_*`） | 同一大版本下两套命名（`M0P_ADT0/1/2` vs `M0P_ADTIM4/5/6`） |

---

## 13. 一句话速查

- 3 颗 ADT（TIM4/5/6）= 3 组独立"1 对互补 + 1 组死区"，**6 路互补 PWM 要靠三颗联动**（`Adt_SwSyncStart`）。
- 主要控制面：`GCONR`(模式/分频/方向) · `PCONR`(比较捕获/输出逻辑/刹车输出状态) · `DCONR`(死区) · `FCONR`(滤波) ·
  `HSTAR/HSTPR/HCELR/HCPAR/HCPBR`(硬件事件) · `CR`(ADC 触发 + 展频) · `ITRIG/TTRIG`(AOS/端口触发) ·
  `PTBKS/PTBKP/AOSSR/AOSCL`(刹车)。
- 有：互补+死区、展频、ADT→ADC 触发、AOS 互联、4 路端口触发、16 位输入捕获、有效周期。
  无（本地证据范围）：载波/Chopper、外部时钟/编码器。
