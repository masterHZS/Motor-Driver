# HC32F072JATA 硬件知识库（XHSC / 小华半导体，Cortex-M0+，LQFP48）

> **来源**：本文件全部结论仅来自本机 HC32F072 DDL 工程
> `C:\Users\limer\Desktop\company\company\ECU_designer\ECU-soft\HC32F072\`
> （`drivers/inc|src`、`core/HC32F072.h`、`core/board_evbhc32lf07x.h`、`debug/HC32F072.svd`、
> `ldscripts/hc32f072.ld`、`user/`、`additional/`）。**未使用网络资料。**
>
> **规则**：每条事实都标注了文件名 + 符号名。凡本地文件无法证实的，一律不猜测，
> 集中列在 **§10 未确认/待核对**，正文中以 `⚠️未确认` 就地标记。
> 关键结论：**本地工程内没有 LQFP48 引脚编号表**（见 §8、§10）。

## 1. 芯片总览

| 项目 | 结论 | 依据 |
|---|---|---|
| 内核 | ARM Cortex-M0+ | `cmsis/core_cm0plus.h`；`ldscripts/hc32f072.ld` 头注释 "ARM Cortex-M0+" |
| 封装 | LQFP48（48 PIN，J 版） | `user/ddl_device.h:` `DDL_MCU_PACKAGE = DDL_DEVICE_PACKAGE_HC_J`，"J package (LQFP48)" |
| 系列宏 | `DDL_DEVICE_SERIES_HC32F072` | `user/ddl_device.h:` `DDL_MCU_SERIES` |
| Flash | **128 KB**（0x00000000–0x0001FFFF） | `ldscripts/hc32f072.ld:` `FLASH (rx) : ORIGIN=0x00000000, LENGTH=128K` |
| RAM | **16 KB**（0x20000000–0x20003FFF） | `ldscripts/hc32f072.ld:` `RAM (rwx) : ORIGIN=0x20000000, LENGTH=16K` |
| 栈/堆默认 | Stack 1 KB / Heap 512 B | `ldscripts/hc32f072.ld:` `STACK_SIZE=0x400`、`HEAP_SIZE=0x200` |
| 最高主频 | 时钟源枚举最高可见 **48 MHz**（RCH 48M / PLL 输出 36–48 MHz） | `drivers/inc/sysctrl.h:` `SysctrlRchFreq48MHz=0x48u`、`SysctrlPllOutFreq36_48MHz=4u` ⚠️未确认（无 datasheet 主频上限声明） |
| 本工程实际时钟 | RCH 8 MHz，HCLK=PCLK=8 MHz（上电默认 RCH 4 MHz） | `user/main.c:` `Sysctrl_SetRCHTrim(SysctrlRchFreq8MHz)`、`SysctrlHclkDiv1`、`SysctrlPclkDiv1` |
| 工作电压 | ⚠️未确认（本地无 VDD/AVDD 范围数据） | — |
| 温度范围 | ⚠️未确认（本地无 -40~85℃ 等数据） | — |
| 调试器/工具链 | DAPLink(CMSIS-DAP)+pyOCD，arm-none-eabi-gcc 12.3.1 | `user/main.c` 头注释；`.vscode/`；`debug/pyocd.yaml` |

## 2. 电压比较器 VC

### 2.1 通道数：**3 个（VC0 / VC1 / VC2）**
- `drivers/inc/vc.h:49` `en_vc_channel_t { VcChannel0=0, VcChannel1=1, VcChannel2=2 }`
- 中断回调三者齐备：`core/interrupts_hc32f072.h:` `INT_CALLBACK_VC0/VC1/VC2`
- 状态位：`vc.h:164` `en_vc_ifr_t { Vc0_Intf, Vc1_Intf, Vc0_Filter, Vc1_Filter, Vc2_Intf, Vc2_Filter }`

### 2.2 输入端多路开关（P 端 `vc.h:101` `en_vc_input_p_src_t` / N 端 `vc.h:126` `en_vc_input_n_src_t`）

P 端枚举名 `VcInPCh<n>`，N 端枚举名 `VcInNCh<n>`（n 即下表"值"）；两表同址编号，故合并：

| 值 | P→VC0 | P→VC1 | P→VC2 | N→VC0 | N→VC1 | N→VC2 |
|---|---|---|---|---|---|---|
| 0 | PC0 | PA0 | PA5 | PA0 | PC0 | PA5 |
| 1 | PC1 | PA1 | PB1 | PA1 | PC1 | PB1 |
| 2 | PC2 | PA2 | PE9 | PA2 | PC2 | PE11 |
| 3 | PC3 | PA3 | PE10 | PA3 | PC3 | PE15 |
| 4 | PA0 | PA4 | PE11 | PA4 | PA0 | PB11 |
| 5 | PA1 | PA5 | PE13 | PA5 | PA1 | PB14 |
| 6 | PA2 | PB1 | PE14 | PA6 | PB0 | PD10 |
| 7 | PA3 | PB2 | PE15 | PA7 | PB1 | PD11 |
| 8 | PA4 | PB10 | PB11 | PC4 | PB2 | PC7 |
| 9 | PA5 | PB12 | PB14 | PC5 | PB3 | DAC0 |
| 10 | PA6 | PB13 | PD9 | DAC0 | DAC1 | DAC0 |
| 11 | PA7 | PB14 | PD10 | `ResDivOut` 电阻分压 | `ResDivOut` | NA |
| 12 | PB4 | PB4 | PD11 | `AiTs` 内部温度 | `AiTs` | `AiTs` |
| 13 | PB5 | DAC0 | PC7 | `AiBg1p2` 1.2V | `AiBg1p2` | `AiBg1p2` |
| 14 | PB6 | PB6 | DAC0 | `AiAdcVref` VREF | `AiAdcVref` | `AiAdcVref` |
| 15 | DAC0 | PB7 | DAC0 | `AiLdo` LDO 输出 | `AiLdo` | `AiLdo` |

**要点**：P 端/N 端字段均只有 4 bit（`core/HC32F072.h:7412` `stc_vc_vc0_cr_field_t { P_SEL:4, N_SEL:4, ... }`），即各 16 档。
**N 端有 GPIO 外部负端输入（重要，已复核更正）**：VC0 的 N 端 ch0–7 = `PA0~PA7`、ch8/9 = `PC4/PC5`；VC1 的 ch0–3 = `PC0~PC3`、ch4/5 = `PA0/PA1`、ch6–9 = `PB0~PB3`；VC2 的 ch0–9 = `PA5/PB1/PE11/PE15/PB11/PB14/PD10/PD11/PC7/DAC0`。
其余档位（≥11）才是内部源：`ResDivOut` 电阻分压 / `AiTs` 温度 / `AiBg1p2` 1.2 V / `AiAdcVref` / `AiLdo`。

> 复核依据：`drivers/src/vc.c:204` `M0P_VC->VC0_CR_f.N_SEL = pstcChannelCfg->enVcInPin_N;` —— `N_SEL` 直接由 `en_vc_input_n_src_t` 写入，而该枚举前 8–10 档就是 GPIO 引脚。
> **结论：`虚拟中性点 → VCx 的 N 端`、`分压后的相电压 → VCx 的 P 端` 这一经典无感过零方案在本芯片上成立**，无需外挂比较器。
⚠️ `vc.h` 中 P 端枚举注释把 ch8~ch15 全部误写成"输入通道7"（只有引脚名可靠）；VC2 的 P14/P15 与 N9/N10 都写作 `DAC0`，疑为笔误。

### 2.3 可编程迟滞 / 偏置电流 / 输出滤波
- 迟滞：`drivers/inc/vc.h:61` `en_vc_cmp_delay_t { VcDelayoff=0, VcDelay10mv=1, VcDelay20mv=2, VcDelay30mv=3 }`（0/10/20/30 mV），寄存器 `VC_CR: VCx_HYS_SEL`
- 偏置电流（功耗档）：`vc.h:73` `en_vc_bias_current_t { VcBias300na=0, VcBias1200na=1, VcBias10ua=2, VcBias20ua=3 }`，寄存器 `VC_CR: VCx_BIAS_SEL`
- 输出滤波（去抖时间）：`vc.h:85` `en_vc_resp_filter_t { VcFilter7us=0, VcFilter14us=1, VcFilter28us=2, VcFilter112us=3, VcFilter450us=4, VcFilter1800us=5, VcFilter7200us=6, VcFilter28800us=7 }`，寄存器 `VCx_CR: DEBOUNCE_TIME`（3 bit）
- 滤波输出使能：`stc_vc_channel_cfg_t.bFlten` → `VCx_CR: FLTEN`

### 2.4 内部 DAC 参考（分压）——`en_vc_div_vref_t` / `stc_vc_dac_cfg_t`
- `VcDivVrefAvcc=0`（AVCC）、`VcDivVrefAdc=1`（ADC_CR0 的 SREF 参考电压）
- `stc_vc_dac_cfg_t { bDivEn(VC_DIV_EN), u8DivVal(VC_DIV, 范围 0–63), enDivVref(VC_REF2P5_SEL) }`
- `vc.c:176` 对 `u8DivVal >= 0x40` 返回 `ErrorInvalidParameter`

### 2.5 中断能力 —— **有**
- 触发方式 `en_vc_irq_sel_t { VcIrqNone=0, VcIrqRise=1, VcIrqFall=2, VcIrqHigh=3 }`（`vc.h:151`）
- API：`Vc_CfgItType()`、`Vc_ItCfg()`（`vc.c:117` 置 `VCx_CR` bit15 `IE`）、`Vc_GetItStatus()`、`Vc_ClearItStatus()`
- 中断标志：`Vc0_Intf` / `Vc1_Intf` / `Vc2_Intf`（`VC_IFR`）
- 使能通道：`Vc_Cmd()` → `VCx_CR` bit16 `EN`

### 2.6 输出路由（`en_vc_output_cfg_t`，`vc.h:179` → 寄存器 `VCx_OUT_CFG`）

| 枚举 | 值 | 含义 |
|---|---|---|
| `VcOutInvTimer` | 0 | 结果输出反向到各 Timer0,1,2,3 **REFCLR** |
| `VcOutTIM0RCLR` | 1 | 结果输出到 **TIM0 REFCLR** 使能控制 |
| `VcOutTIM1RCLR` | 2 | 结果输出到 **TIM1 REFCLR** 使能控制 |
| `VcOutTIM2RCLR` | 3 | 结果输出到 **TIM2 REFCLR** 使能控制 |
| `VcOutTIM3RCLR` | 4 | 结果输出到 **TIM3 REFCLR** 使能控制 |
| `VcOutTIMBK` | 5 | 结果输出到 Timer0,1,2,3 **刹车**控制 |
| `VcOutInvTIM4` | 9 | 结果输出到 Timer4 反向使能 |
| `VcOutTIM4` | 10 | 结果输出到 **Timer4 捕获输入 CHX 使能** |
| `VcOutInvTIM5` | 11 | 结果输出到 Timer5 反向使能 |
| `VcOutTIM5` | 12 | 结果输出到 **Timer5 捕获输入 CHX 使能** |
| `VcOutInvTIM6` | 13 | 结果输出到 Timer6 反向使能 |
| `VcOutTIM6` | 14 | 结果输出到 **Timer6 捕获输入 CHX 使能** |
| `VcOutBrake` | 15 | 结果作为 **Advanced Timer 刹车**控制 |
| `VcOutDisable` | 16 | 结果输出除能 |

**回答"VC 输出能不能到 GPIO 引脚 / 定时器 / AOS"：**
- **到 GPIO 引脚：不能。** 枚举里没有任何"输出到 PXn"选项；`gpio.h` 的 SF（辅助功能）枚举（`en_gpio_sf_t`、`en_gpio_sf_tim_g/e/c_t`、`en_gpio_sf_pca_t`）也没有 VC 输出项。
- **到定时器：能，且是硬件直连**：
  - TIM0/1/2/3 → `REFCLR`（清计数器）/ 刹车；
  - TIM4/5/6（高级定时器） → **捕获输入 CHX**（=硬件打时间戳）/ 反向 / 刹车。
  - 定时器侧同样可见：`drivers/inc/timer3.h:299` `en_tim3_m23ce_occs_t { Tim3OC_Ref_Clr=0 /*来自VC的OC_Ref_Clr*/, Tim3ETRf=1 }`，配合 `timer3.h:616` `stc_bt_m23_OCREF_Clr_cfg_t.bVCClrEn`；`drivers/inc/bt.h:288` 同款；`bt.h:542` `bEnVCBrake`、`timer3.h:541` `bEnVCBrake`。
- **到 ADC / AOS：通过 VCx 中断 + 触发矩阵**（不是直连）：见 §7。
- **⚠️未确认**：`VC0/VC1/VC2_OUT_CFG` 寄存器位域只有 bit0~bit15（`core/HC32F072.h:7442` `stc_vc_vc0_out_cfg_field_t`，bit16 为 `RESERVED16`），而 `VcOutDisable=16`，`vc.c:206` 写的是 `1<<16` → **"Disable"实际落在保留位上，需实测确认**。

## 3. 运放 OPA

- 数量：`drivers/inc/opa.h:45` `en_opa_t { Opa0=5, Opa1=6, Opa2=7, Opa3=8, Opa4=9 }` → **5 个**（枚举值即 `OPA_CR1` 中的位号，见 `HC32F072.h:4762` `stc_opa_cr1_field_t` `EN0..EN4` / `AZEN0..AZEN4`）。
  - ⚠️注意 `opa.c:61` 注释写 "共 3 个 OPA，取值 Opa0,Opa1,Opa2"，而 `opa.c:81/126` 写 "共 5 个"。`Opa_OutChannelConfig()` 只处理 Opa0/1/2；`Opa_Cmd()`/`Opa_CalCmd()` 处理 Opa0..Opa4。
- 输出通道：`HC32F072.h:4746` `stc_opa_cr0_field_t { OP0OEN1..OP0OEN4, OP1OEN1..OP1OEN4, OP2OEN1..OP2OEN4 }` → **OPA0/1/2 各有 4 个输出使能通道**（OUT1..OUT4）
  - 枚举 `en_opa_oenx_t { Opa_Ch_Oen1=0, Opa_Ch_Oen2=1, Opa_Ch_Oen3=2, Opa_Ch_Oen4=3 }`，API `Opa_OutChannelConfig(en_opa_t Opax, stc_opa_oenx_config_t OutChs)`（可同时使能多个通道）
- 自动校零（offset 校准）：`stc_opa_zconfig_t { bClk_sw_set, bAz_pulse, bAdctr_en, enClksrc }`
  - 时钟 `en_opa_clksrc_t`：`Opa_M1Pclk / M2 / M4 / M8 / M16 / M32 / M64 / M128 / M256 / M512 / M1024 / M2048 / M4096Pclk`（13 档自动校准脉宽）
  - API：`Opa_CalConfig()`、`Opa_CalCmd()`、`Opa_CalSwTrig()`（软件触发校零）
  - `bAdctr_en=1` 时 **ADC 启动会触发 OPA 自动校准**
- DAC 输出缓冲互斥：`Opa_DacBufCmd(Opa_Dac0Buff/Opa_Dac1Buff, ...)`
  - `opa.c:89`：使能 `Opa3` 时 DAC0 **不能**用 OPA3 作输出缓冲；`opa.c:92`：使能 `Opa4` 时 DAC1 **不能**用 OPA4 作缓冲。反之 `opa.c:115/118` 使能缓冲会清掉对应 OPA 使能。
- 统一增益缓冲 / 可编程增益档位：**⚠️未确认** —— `opa.h` 与 `HC32F072.h` 的 OPA 寄存器（`OPA_CR0/CR1/CR2/CR`）中**没有任何 GAIN 字段或增益枚举**（全库 grep `GAIN|Gain|增益` 无命中）。增益应是外部电阻设定或需查用户手册。
- OPA 引脚映射：**⚠️未确认** —— 本地无 OPA 输入/输出引脚表。

## 4. ADC

- 分辨率：**12 bit** — `core/HC32F072.h:177` `stc_adc_sqrresult0_field_t { RESULT : 12 }`（单次/顺序/插队结果寄存器均为 12 bit）
- 转换模式：`drivers/inc/adc.h:65` `en_adc_mode_t { AdcSglMode=0（单通道单次）, AdcScanMode=1（顺序/插队扫描） }`
- 通道总数：外部 25 个（CH0–CH24）+ DAC0/DAC1/AVCC-1/3/温度/1.2V 基准 = `en_adc_samp_ch_sel_t` 到 `AdcVref1_2Input=29u`
- 时钟分频：`en_adc_clk_div_t { AdcMskClkDiv1/2/4/8 }`（PCLK / 1,2,4,8）
- 采样周期：`en_adc_samp_cycle_sel_t { AdcMskSampCycle4Clk/6Clk/8Clk/12Clk }`（4/6/8/12 个采样时钟）
- 输入放大器 BUF：`en_adc_op_buf_t { AdcMskBufEnable=1u<<11, AdcMskBufDisable=0 }`
- 参考电压：`en_adc_ref_vol_sel_t`
  - `AdcMskRefVolSelInBgr1p5`（内部 1.5V，SPS ≤ 200 kHz）
  - `AdcMskRefVolSelInBgr2p5`（内部 2.5V，AVDD > 3V 且 SPS ≤ 200 kHz）
  - `AdcMskRefVolSelExtern1`（**外部输入 = PB01**，max AVDD）
  - `AdcMskRefVolSelAVDD`（AVDD）
  - 内部参考使能：`en_adc_in_ref_t { AdcMskInRefEnable=1u<<14, AdcMskInRefDisable=0 }`
- 结果对齐：`en_adc_align_t { AdcAlignRight=0, AdcAlignLeft=1 }`；结果自动累加：`en_adc_result_acc_t`
- 阈值比较中断：`en_adc_irq_type_t { AdcMskIrqJqr/AdcMskIrqSqr/AdcMskIrqReg/AdcMskIrqHt/AdcMskIrqLt/AdcMskIrqSgl }` + `Adc_ThresholdCfg()`
- 通道重映射：`en_adc_channel_remap_type_t { AdcMskMuxMap=0, AdcMskOpaMap=1 }` → `Adc_ChannelRemap()` 写 `ADC_CR0: CHMAP`

### 4.1 ADC 通道 → 引脚 对照表（`drivers/inc/adc.h:99` `en_adc_samp_ch_sel_t`）

| 通道枚举 | 值 | `AdcMskMuxMap`(CHMAP=0) | `AdcMskOpaMap`(CHMAP=1) |
|---|---|---|---|
| `AdcExInputCH0` | 0 | **PA00** | PD08 |
| `AdcExInputCH1` | 1 | **PA01** | PD09 |
| `AdcExInputCH2` | 2 | **PA02** | PD10 |
| `AdcExInputCH3` | 3 | **PA03** | PD11 |
| `AdcExInputCH4` | 4 | **PA04** | PA04 |
| `AdcExInputCH5` | 5 | **PA05** | PA05 |
| `AdcExInputCH6` | 6 | **PA06** | PE08 |
| `AdcExInputCH7` | 7 | **PA07** | PE09 |
| `AdcExInputCH8` | 8 | **PB00** | PE10 |
| `AdcExInputCH9` | 9 | **PB01** | PB01 |
| `AdcExInputCH10` | 10 | **PC00** | PE11 |
| `AdcExInputCH11` | 11 | **PC01** | PE12 |
| `AdcExInputCH12` | 12 | **PC02** | PE13 |
| `AdcExInputCH13` | 13 | **PC03** | PE14 |
| `AdcExInputCH14` | 14 | **PC04** | PC04 |
| `AdcExInputCH15` | 15 | **PC05** | PC05 |
| `AdcExInputCH16` | 16 | **PB02** | PB02 |
| `AdcExInputCH17` | 17 | **PB10** | PB10 |
| `AdcExInputCH18` | 18 | **PB11** | PB11 |
| `AdcExInputCH19` | 19 | **PB12** | PB12 |
| `AdcExInputCH20` | 20 | **PB13** | PB13 |
| `AdcExInputCH21` | 21 | **PB14** | PB14 |
| `AdcExInputCH22` | 22 | **PB15** | PB15 |
| `AdcExInputCH23` | 23 | **PE15** | PE15 |
| `AdcExInputCH24` | 24 | **PC07** | PC07 |
| `AdcDac0Input` | 25 | DAC0 输出（必须使用输入增益） | 同 |
| `AdcDac1Input` | 26 | DAC1 输出（必须使用输入增益） | 同 |
| `AdcAVccdiv3Input` | 27 | 1/3 AVCC（必须使用输入增益） | 同 |
| `AdcAiTsInput` | 28 | 内置温度传感器 BGR_TS（必须使用输入增益） | 同 |
| `AdcVref1_2Input` | 29 | 内部基准 1.2V（必须使用输入增益） | 同 |

### 4.2 规则序列（SQR）与注入/插队（JQR）
- SQR：`en_adc_sqr_chmux_t AdcSQRCH0MUX … AdcSQRCH15MUX`（**16 个**），配置 `Adc_CfgSqrChannel()`，次数 `stc_adc_sqr_cfg_t.u8SqrCnt`（写 `SQR2.CNT = u8SqrCnt-1`，`adc.c:366`），结果 `Adc_GetSqrResult()`
- JQR：`en_adc_jqr_chmux_t AdcJQRCH0MUX … AdcJQRCH3MUX`（**4 个**），配置 `Adc_CfgJqrChannel()`，结果 `Adc_GetJqrResult()`
- 启动/停止：`Adc_SQR_Start/Stop()`、`Adc_JQR_Start/Stop()`、`Adc_SGL_Start/Stop()`、`Adc_SGL_Always_Start/Stop()`
- 中断/状态：`Adc_GetIrqStatus()` / `Adc_ClrIrqStatus()`；DMA 触发：`bSqrDmaTrig` / `bJqrDmaTrig`

### 4.3 外部触发源（`en_adc_trig_sel_t`，`adc.h:172`）
`Adc_SglExtTrigCfg()` / `Adc_SqrExtTrigCfg()` 写 **`ADC_EXTTRIGGER0`**（按位 OR），
`Adc_JqrExtTrigCfg()` 写 **`ADC_EXTTRIGGER1`**（`adc.c:153/175/197`）。可选源（位掩码）：

- 定时器：`AdcMskTrigTimer0 … AdcMskTrigTimer6`（bit0–bit6，**TIM0–TIM6 都能触发**）
- 串口：`AdcMskTrigUart0/1`、`AdcMskTrigLpuart0/1`
- **比较器：`AdcMskTrigVC0`(1u<<11)、`AdcMskTrigVC1`(1u<<12)**（注意：**没有 VC2**）
- 其他：`AdcMskTrigRTC`、`AdcMskTrigPCA`、`AdcMskTrigSPI0/1`、`AdcMskTrigDMA`
- GPIO 边沿：`AdcMskTrigPA03/PB03/PC03/PD03`、`PA07/PB07/PC07/PD07`、`PA11/PB11/PC11`、`PA15/PB15/PC15`
- 高级定时器侧的对应使能：`drivers/inc/adt.h:505` `stc_adt_irq_trig_cfg_t` 中 `bAdtCntMatchA/B/C/DTrigEn`、`bAdtOverFlowTrigEn`、`bAdtUnderFlowTrigEn`、`bAdtSpecilMatchA/BTrigEn`（"使能触发 ADC"），以及 DMA 触发位

## 5. 高级定时器 ADT（TIM4 / TIM5 / TIM6）

### 5.1 关键结论：**单颗 ADT 只有 1 组互补对，不是 3 组**
- 通道枚举 `drivers/inc/adt.h:51` `en_adt_CHxX_port_t { AdtCHxA=0, AdtCHxB=1 }` —— **只有 A / B 两个通道**
- 寄存器 `core/HC32F072.h:580` `stc_adtim_pconr_field_t` 只有 `CAPCA/OUTENA/DISVALA…` 与 `CAPCB/OUTENB/DISVALB…`
- 死区寄存器只有一组：`HC32F072.h:7795` `DTUAR`（上基准）+ `DTDAR`（下基准）；`stc_adtim_dconr_field_t { DTCEN, SEPA }`
- **因此 ADTIM6 提供 1 组带死区的互补输出（CHxA/CHxB）。要做三相六路（CH0/CH0N/CH1/CH1N/CH2/CH2N）需要 ADTIM4+ADTIM5+ADTIM6 三颗同步使用**：
  - `adt.h:479` `stc_adt_sw_sync_t { bAdTim4, bAdTim5, bAdTim6 }`，API `Adt_SwSyncStart/Stop/Clear()`（软件同步启动/停止/清零）
  - 同步开关量也见于 `bEnBKSync`（TIM0/1/2 刹车同步）
- 基址：`core/HC32F072.h:11128-11130` `M0P_ADTIM4 = 0x40003000`、`M0P_ADTIM5 = 0x40003400`、`M0P_ADTIM6 = 0x40003800`
- 时钟门控：`drivers/inc/sysctrl.h:326` `SysctrlPeripheralAdvTim = 10u`（"高级定时器 TIM4/5/6"）

### 5.2 计数与模式
- 计数模式 `en_adt_cnt_mode_t { AdtSawtoothMode=0（锯齿波）, AdtTriangleModeA=4, AdtTriangleModeB=5（三角波=中心对齐） }`
  → **中心对齐支持：是**（三角波 A/B 两种）
- 计数方向 `en_adt_cnt_dir_t { AdtCntDown=0, AdtCntUp=1 }`
- 计数时钟 `en_adt_cnt_ckdiv_t { AdtClkPclk0=0, Div2, Div4, Div8, Div16, Div64, Div256, Div1024 }`
- 周期/比较：`Adt_SetPeriod()`、`Adt_SetPeriodBuf()`、`Adt_SetCompareValue(AdtCompareA/B/C/D, val)`、`Adt_SetValidPeriod()`
- 比较基准：通用 `en_adt_compare_t { AdtCompareA/B/C/D }`；专用 `en_adt_special_compare_t { AdtSpclCompA/B }`
- 计数方向状态：`en_adt_state_type_t` 中 `AdtCntDir=31`

### 5.3 死区（Dead-Time）
- API：`Adt_SetDTUA(ADTx, u16Value)` / `Adt_SetDTDA(ADTx, u16Value)` / `Adt_CfgDT(ADTx, bDTEn, bEqual)`
- `bEqual=TRUE` → `DCONR.SEPA`，DTDAR 自动等于 DTUAR（`adt.h:250` `AdtCHxDtEqual`）
- 复位默认值 `adt.c:1116-1117`：`DTDAR = 0xFFFF`、`DTUAR = 0xFFFF`
- 值的**具体时间范围（ns/计数单位、与 PCLK0 的关系）⚠️未确认**（`Adt_SetDTUA` 不做范围检查，`adt.c:1549`）
- 死区错误中断：`en_adt_irq_type_t.AdtDTEIrq=8`，状态 `AdtDTEF=8`

### 5.4 刹车 / BKIN 输入
- 端口刹车：`Adt_EnableBrakePort(uint8_t port /*0~15*/, stc_adt_break_port_cfg_t*)`，结构 `{ bPortEn, enPol }`
  - 极性 `en_adt_ptbrk_polarity_t { AdtPtBrkHigh=0, AdtPtBrkLow=1 }`
- 无效条件 3（16 路刹车端口 + 滤波）：`Adt_Disable3Cfg(stc_adt_disable_3_cfg_t*)`，其中 `stcBrkPtCfg[16]`
- 无效条件 1（同高/同低刹车）：`Adt_Disable1Cfg(stc_adt_disable_1_cfg_t*)` — `bTim4/5/6OutSH`（同高）、`bTim4/5/6OutSL`（同低）
- 软件刹车：`Adt_SwBrake(TRUE/FALSE)`（仅适用无效条件 3 使能时）；标志 `Adt_GetPortBrakeFlag()` / `Adt_ClearPortBrakeFlag()` / `Adt_GetSameBrakeFlag()`
- 强制输出无效时的端口状态 `en_adt_pconr_disval_t { AdtTIMxDisValNorm / HiZ / Low / High }`
- **VC 可直接刹车高级定时器**：`vc.h` `VcOutBrake=15`（`VCx_OUT_CFG.BRAKE`）

### 5.5 互补输出
- 端口功能模式 `en_adt_pconr_capc_t { AdtCHxCompareOutput=0（比较输出）, AdtCHxCompareInput=1（捕获输入） }` → `PCONR.CAPCA/CAPCB`
- 输出使能 `PCONR.OUTENA/OUTENB`（`adt.c:838/852`）
- 周期匹配/比较匹配行为：`en_adt_pconr_perc_t`、`en_adt_pconr_cmpc_t`
- ⚠️注意：DDL 中**没有显式的 "COMP=互补模式" 开关枚举**（BT/TIM3 有 `en_bt_m23cr_comp_t { Tim3IndependentPWM, Tim3ComplementaryPWM }`；ADT 侧以 `AdtCHxA/AdtCHxB` + 死区 + 极性组合实现）

### 5.6 PWM 展频（dither）
- `Adt_PwmDitherCfg(ADTx, stc_adt_pwm_dither_cfg_t*)`，`{ enAdtPDType(UnderFlow/OverFlow), bTimxBPDEn, bTimxAPDEn }`

### 5.7 载波（Chopper）
- **⚠️未确认**：全工程 grep `载波|Carrier|CARRIER|Chop|CHOP` **无任何命中**，本地无法证实本项目 DDL 是否支持载波功能。

### 5.8 ADTIM6 CH0/CH0N/CH1/CH1N/CH2/CH2N 引脚
- **⚠️未确认 —— 本地文件不含引脚→复用功能对照表。**
  - `drivers/inc/gpio.h:90` 只有 `en_gpio_af_t { GpioAf0 … GpioAf7 }`，并明确注明"具体功能及含义请参考**用户手册 GPIO 复用表**"（`gpio.h:88`）
  - 全工程唯一一处 AF 使用示例：`additional/oled.c:201` `Gpio_SetAfMode(GpioPortB, GpioPin10, GpioAf1)`、`Gpio_SetAfMode(GpioPortB, GpioPin11, GpioAf1)`（PB10/PB11 = I2C1 SCL/SDA）
  - 结论：**ADTIM6 各通道对应哪个 AF 号、哪个引脚，必须查 HC32F072 数据手册/用户手册复用表**。
- ADT 可查到的**输入侧**枚举（不是输出引脚）：
  - 端口触发源 `en_adt_ttrig_trigxs_t`（`adt.h:308`）：`AdtTrigxSelPA3/PB3/PC3/PD3/PA7/PB7/PC7/PD7/PA11/PB11/PC11/PD1/PA15/PB15/PC15/PD5` → TIMTRIA/B/C/D 输入脚
  - 触发端口 `en_adt_trig_port_t { AdtTrigA/B/C/D }`，配置 `Adt_PortTrigCfg()`

## 6. GPIO 引脚复用（AF）机制

### 6.1 机制
- 每个引脚一个 **`PXnn_SEL`** 寄存器（如 `PA00_SEL`），写入 0~7 表示 AF 编号。
  - `core/HC32F072.h:8433` `__IO uint32_t PA00_SEL;` + `stc_gpio_pa00_sel_field_t PA00_SEL_f;`
  - `debug/HC32F072.svd:7765` `<name>PA00_SEL</name>`（SVD 中该字段无功能描述文本，只有 `desc PA00_SEL`）
- 端口偏移由 `en_gpio_port_t` 提供：`GpioPortA=0x00, GpioPortB=0x40, GpioPortC=0x80, GpioPortD=0xc0, GpioPortE=0x1000, GpioPortF=0x1040`
- `drivers/src/gpio.c:263`：
  ```c
  *((uint32_t*)(((uint32_t)(&(M0P_GPIO->PA00_SEL)) + enPort) + (((uint32_t)enPin)<<2))) = enAf;
  ```

### 6.2 配置 API（**注意：本 DDL 没有 `GPIO_SetFunc`**）
| 目的 | API（`drivers/inc/gpio.h`） |
|---|---|
| 复用功能 | `Gpio_SetAfMode(en_gpio_port_t enPort, en_gpio_pin_t enPin, en_gpio_af_t enAf)` |
| 模拟功能 | `Gpio_SetAnalogMode(port, pin)` → 写 `PAADS + enPort` 的对应位 |
| 通用初始化（含默认 AF0） | `Gpio_Init(port, pin, stc_gpio_cfg_t*)` — **`gpio.c:70` 会把该脚 AF 强制清为 `GpioAf0`**，故 `Gpio_Init` 之后再调 `Gpio_SetAfMode` |
| 辅助功能（SF） | `Gpio_SfTimGCfg()` / `Gpio_SfTimECfg()` / `Gpio_SfTimCCfg()`（定时器捕获输入）/ `Gpio_SfPcaCfg()` / `Gpio_SfExtClkCfg()` / `Gpio_SfSsnCfg()` / `Gpio_SfIrqModeCfg()` / `Gpio_SfIrPolCfg()` / `Gpio_SfHClkOutputCfg()` / `Gpio_SfPClkOutputCfg()` |
| 中断 | `Gpio_EnableIrq(port, pin, en_gpio_irqtype_t)`（`GpioIrqHigh/Low/Rising/Falling`）、`Gpio_DisableIrq`、`Gpio_GetIrqStatus`、`Gpio_ClearIrq` |

### 6.3 定时器捕获输入的 SF 选择枚举
- `en_gpio_sf_tim_c_t { GpioSfTim0CA=0, GpioSfTim1CA=3, GpioSfTim2CA=6, GpioSfTim3CA=9, GpioSfTim3CB=12 }`（步进 3 → SF0/SF1/SF2 三选一）
- `en_gpio_sf_tim_g_t { GpioSfTim0G=0, GpioSfTim1G=3, GpioSfTim2G=6, GpioSfTim3G=9 }`（GATE）
- `en_gpio_sf_tim_e_t { GpioSfTim0E=0, GpioSfTim1E=3, GpioSfTim2E=6, GpioSfTim3E=9 }`（ETR）
- `en_gpio_sf_pca_t { GpioSfPcaCH0=0, GpioSfPcaECI=3 }`
- ⚠️即使有这些枚举，**"SF1/SF2 具体对应哪个引脚"仍不在本地文件中**（只能靠手册）。

## 7. TIM0/TIM3 等其他定时器 & AOS 互连矩阵（**关键**）

### 7.1 可用作 1 µs / 100 kHz 时基
- TIM0/1/2 = 基础定时器（BT）：`drivers/inc/bt.h:88` `BtPCLKDiv1=0 … BtPCLKDiv256=7`；`SysctrlPeripheralBaseTim=8u`
- TIM3：`drivers/inc/timer3.h:88` `Tim3PCLKDiv1=0 … Tim3PCLKDiv256=7`；`timer3.h:115` `Tim332bitFreeMode=0（32 位自由计数）` / `Tim316bitArrMode=1`；门控 `SysctrlPeripheralTim3=11u`
- 高级定时器 TIM4/5/6：`AdtClkPclk0 … AdtClkPclk0Div1024`
- **本工程实例**：PCLK = 8 MHz（`user/main.c`）→ TIM3 取 `Tim3PCLKDiv8` = 1 MHz = **1 µs/tick**；取 `Tim3PCLKDiv1` = 125 ns/tick。100 kHz 时基同理用 1 MHz。
- TIM3 中断类型 `en_tim3_irq_type_t`：`Tim3UevIrq=0`、`Tim3CA0Irq=2`、`Tim3CA1Irq=3`、`Tim3CA2Irq=4`、`Tim3CB0Irq=5`、`Tim3CB1Irq=6`、`Tim3CB2Irq=7`、`Tim3BkIrq=14`、`Tim3TrigIrq=15`（F/C 丢失标志 8–13 不是中断）

### 7.2 输入捕获（做零交叉时间戳）
- TIM3/BT：模式 1/23 才有捕获；比较捕获寄存器 `en_tim3_m23_ccrx_t { Tim3CCR0A/0B/1A/1B/2A/2B }`；API `Tim3_M23_...`；中断 `Tim3CA0Irq` 等
- 高级定时器：`Adt_GetCaptureValue(ADTx, AdtCHxA/AdtCHxB, uint16_t*)`、`Adt_GetCaptureBuf()`；`AdtCfgCaptureA/B` 中断源；标志 `AdtCMAF/AdtCMBF`

### 7.3 **VC 输出 → 定时器捕获，具体路径**
1. **直连（推荐，无中断延迟）**：`VC0/1/2_OUT_CFG` 的 `VcOutTIM4(10)` / `VcOutTIM5(12)` / `VcOutTIM6(14)`
   = "结果输出到 Timer4/5/6 **捕获输入 CHX 使能**"（`vc.h:188/190/192`；寄存器位 `HC32F072.h:7452/7454/7456` `TIM4/TIM5/TIM6`）
   → **VC 边沿可硬件触发 ADT 捕获 = 零交叉时间戳，这条路径是本地可证实的。**
2. **直连（清计数）**：`VcOutTIM0RCLR(1)`/`VcOutTIM1RCLR(2)`/`VcOutTIM2RCLR(3)`/`VcOutTIM3RCLR(4)` → 清 TIM0–TIM3 计数器（不是捕获）。定时器侧对应 `Timer3.h:299` `Tim3OC_Ref_Clr = 0 /*来自VC的OC_Ref_Clr*/` + `bVCClrEn`（`timer3.h:616` / `bt.h:605`）。
3. **直连（刹车）**：`VcOutTIMBK(5)`（Timer0-3 刹车）、`VcOutBrake(15)`（Advanced Timer 刹车）；定时器侧 `bEnVCBrake`（`timer3.h:541`、`bt.h:542`）。
4. **经中断/触发矩阵（AOS 式）**：见下。

### 7.4 AOS 事件互连矩阵：本地能看到什么
- **本器件没有独立的 AOS 外设驱动**：全库无 `aos.h`/`aos.c`；SVD 中出现的 `AOSSR`/`AOSCL`/`ITRIG` 都属于 **ADTIM**（`debug/HC32F072.svd:3925/4020/4228`，`HC32F072.h:7901/7906/7921`）。即 **AOS 互连是通过 ADT 内部的 AOS 寄存器 + ADC 触发寄存器实现的，不是独立模块**。
- ADT 的 AOS 源选择 `en_adt_itrig_iaosxs_t`（`adt.h:334`），4 个 4-bit 字段 `ITRIG.IAOS0S/IAOS1S/IAOS2S/IAOS3S`（`HC32F072.h:961` `stc_adtim_itrig_field_t`）：
  源表（值=源）：`0`TIM0_INT `1`TIM1_INT `2`TIM2_INT `3`LPTIMER_INT `4`TIM4_INT `5`TIM5_INT `6`TIM6_INT `7`UART0_INT `8`UART1_INT `9`LPUART_INT **`10`VC0_INT** **`11`VC1_INT（⚠️无 VC2）** `12`RTC_INT `13`PCA_INT `14`SPI_INT `15`ADC_INT
- ADT 的硬件事件 `en_adt_hw_trig_t`（`adt.h:361`）：`AdtHwTrigAos0=0 … AdtHwTrigAos3=3`（"从 AOS 来的事件触发 0-3 有效"）、`AdtHwTrigCHxARise/Fall`、`AdtHwTrigCHxBRise/Fall`、`AdtHwTrigTimTriA/B/C/D Rise/Fall`；对应 API `Adt_CfgHwStart/Stop/Clear()`、**`Adt_CfgHwCaptureA/B()`**、`Adt_CfgHwCntUp/Dwn()`
- 配置入口：`Adt_AosTrigCfg(stc_adt_aos_trig_cfg_t*)`，结构 `{ enAos0TrigSrc, enAos1TrigSrc, enAos2TrigSrc, enAos3TrigSrc }`；递加/递减硬件事件 `en_adt_hw_cnt_t` 同样含 `AdtHwCntAos0..3 = 16..19`

**→ 结论（本任务 b 问）**：
- **VC → ADC：能**，但只能经 `AdcMskTrigVC0` / `AdcMskTrigVC1`（VCx 中断源）作为 ADC 外部触发，且**没有 VC2**。
- **VC → 高级定时器捕获：能**，两条路：① `VcOutTIM4/5/6` 直连捕获输入；② VC0/VC1_INT → ADT `ITRIG.IAOSxS` → `AdtHwTrigAos0..3` → `Adt_CfgHwCaptureA/B()`。
- **VC → TIM0/1/2/3 捕获：不能**（只能 REFCLR 清计数 / 刹车 / 反向），TIM3 捕获必须走引脚（`Gpio_SfTimCCfg` + `GpioSfTim3CA/CB`）。
- **VC → GPIO 引脚：不能**。
- ⚠️未确认：AOS 是否还有 ADT 之外的通用源/目的矩阵（本地无该文档）。

## 8. 最小系统（LQFP48）

### 8.1 本地能证实的
| 项目 | 结论 | 依据 |
|---|---|---|
| 封装 | LQFP48 / 48 PIN | `user/ddl_device.h:` "HC32F072JATA (LQFP48, 48PIN)" |
| 外部高速晶振 XTH | `XTHI = PF0`，`XTHO = PF1`；EVB 用 8 MHz | `core/board_evbhc32lf07x.h:` `EVB_XTHI_PORT=GpioPortF/Pin0`、`EVB_XTHO_*`、`SYSTEM_XTH (8*1000*1000u)` |
| 外部低速晶振 XTL | `XTLI = PC14`，`XTLO = PC15`；32768 Hz | `board_evbhc32lf07x.h:` `EVB_XTLI_PORT=GpioPortC/Pin14`、`EVB_XTLO_*`、`SYSTEM_XTL 32768u` |
| 电源引脚 VCC/AVCC/VSS/AVSS | ⚠️**本地无**（全库 grep `VCC/AVCC/VSS/AVSS` 仅命中注释与 AVCC 电压枚举） | — |
| VCAP / 内部 LDO 电容 | ⚠️**本地无**（全库 grep `VCAP` 零命中；只有 VC `AiLdo` 内部信号名） | — |
| NRST | ⚠️**本地无**（grep `NRST` 零命中） | — |
| BOOT0 | ⚠️**本地无**（grep `BOOT0` 零命中） | — |
| SWDIO / SWCLK | ⚠️本地只有"SWD 端口设为 IO 功能"控制位 `drivers/inc/sysctrl.h:287` `SysctrlSWDUseIOEn=8u`（配合 `Sysctrl_SetFunc()`），**引脚号未给** | — |
| 复位相关外设 | `drivers/inc/reset.h`、`SysctrlPeripheralSwd=25u` 存在（`sysctrl.h:336`） | — |

### 8.2 **明确说明：LQFP48 引脚编号（pin number）在本地文件中完全不存在**
- 工程内**没有** datasheet 的 pin table / pinout 图 / `*_pin.h` 引脚定义文件；
- `core/board_evbhc32lf07x.h` 只给 **EVB 评估板的"端口名+位号"**（如 `GpioPortA`+`GpioPin0`），**不含物理引脚序号**，且该文件是 EVB 板的定义，与本项目的电机驱动板不一定一致；
- SVD（`debug/HC32F072.svd`）只有外设寄存器描述，无引脚信息。
- **结论：要做 LQFP48 最小系统/PCB，必须补齐 HC32F072 数据手册的引脚定义表（Pin Definitions）与封装图。**

### 8.3 EVB 板已有定义（仅作端口参考，非本项目板）
`core/board_evbhc32lf07x.h` 中定义（选摘）：KEY1=PC12、KEY2=PD3、KEY3=PD2、KEY4=PD4、KEY5=PD6；LEDR=PA0、LEDY=PA1、LEDG=PA2；CAN RX=PD0 / TX=PD1 / STB=PD5；I2C0 EEPROM SCL=PB8 / SDA=PB9；I2C1 CODEC SCL=PB10 / SDA=PB11；I2S0 SCK=PD8 / MCK=PD9 / SD=PD10 / WS=PD11；SPI0 CS=PE12 / SCK=PE13 / MISO=PE14 / MOSI=PE15；SPI1 CS=PB12 / SCK=PB13 / MISO=PB14 / MOSI=PB15。

### 8.4 本项目板（motor-drive）实际用到的引脚
| 用途 | 引脚 | 依据 |
|---|---|---|
| 电机 PWM（软件 PWM，复用 TIM3 100 µs 中断） | `MOTOR_PORT`/`MOTOR_PIN`（`additional/motor.h` 定义为 PA5） | `additional/motor.c:` `Gpio_WriteOutputIO(MOTOR_PORT, MOTOR_PIN, …)`；`user/main.c:` "PA5 低速转动" |
| 4 颗信号灯呼吸 | PA0 / PA1 / PA2 / PA9 | `user/main.c:` 头注释 "LED4=PA0, LED2=PA1, LED3=PA2, LED5=PA9" |
| OLED（已注释，疑似硬件问题） | SCL=PB10 / SDA=PB11 | `additional/oled.c:201-202`；`additional/oled.h:` "SCL(PB10) / SDA(PB11)" |

## 9. 踩坑注意项（DDL / 示例代码中发现的）

1. **`Vc_Init()` 覆盖式写 `OUT_CFG`**：`vc.c:206/216/226` 是 `M0P_VC->VC0_OUT_CFG = 1 << enVcOutCfg;`（**赋值，非 `|=`**）→ 每个 VC 通道**一次只能选一条输出路由**；想同时"清 TIM3 计数"+"刹车"，同一通道做不到，需分通道或软件实现。
2. **`VcOutDisable = 16` 落在保留位**：`VCx_OUT_CFG` 位域只到 bit15（`HC32F072.h:7442`），`1<<16` 写不到有效位 → "除能输出"行为**存疑**，需实测。
3. **VC 头文件注释错乱**：`en_vc_input_p_src_t` 的 ch8~ch15 注释全写"输入通道7"（`vc.h:112-119`）；VC2 的 P14/P15 与 N9/N10 都标 `DAC0`（`vc.h:118/119/138/139`）→ 用前需核对手册。
4. **VC2 不在 AOS/ADC 触发源里**：`en_adt_itrig_iaosxs_t` 只有 VC0_INT/VC1_INT；`en_adc_trig_sel_t` 只有 `AdcMskTrigVC0/VC1` → **VC2 只能靠中断 + 软件处理**。
5. **`Gpio_Init()` 会把 AF 清零**：`gpio.c:70` 无条件写 `GpioAf0`，`gpio.c:69` 同时清 `PAADS` 模拟位 → **顺序必须是 `Gpio_Init()` → `Gpio_SetAfMode()` / `Gpio_SetAnalogMode()`**，反了功能静默失效。
6. **不存在 `GPIO_SetFunc`**：本 DDL 用 `Gpio_SetAfMode()`；写成 `GPIO_SetFunc` 会编译不过。
7. **`Gpio_SetAfMode()` 无参数校验**：`gpio.c:261` 裸指针直接写入，`enPort`/`enPin` 传错会**误写其它外设寄存器**且仍返回 `Ok`。
8. **AF 号含义必须查手册**：`gpio.h:88` 明确"具体功能及含义请参考用户手册 GPIO 复用表"，本地无表 → **写错 AF 号不报错，只会静默不工作**。
9. **ADT 只有 1 组互补对**：按"ADTIM6 = 三相六路"设计会踩坑；三相需 ADTIM4/5/6 同步（`Adt_SwSyncStart`）。
10. **`Adt_SetDTUA/DTDA` 无范围检查**：`adt.c:1549/1567` 直接写寄存器，超范围被截断；复位默认 `0xFFFF`（`adt.c:1116`）。
11. **`Adc_Init()` 不清 `EXTTRIGGER0/EXTTRIGGER1`**：三个 `*ExtTrigCfg` 都是 `|=`/`&=` 读改写（`adc.c:157-207`）→ **上电残留触发源可能误触发**，建议初始化时手动清 `M0P_ADC->EXTTRIGGER0/1`。
12. **ADC 结果寄存器命名不一致**：`HC32F072.h:7650` 第 13 个是 `SQR_RESULT13`（**带下划线**），其余为 `SQRRESULT14` 风格，直接引用易写错（`Adc_GetSqrResult()` 用裸指针偏移 `adc.c:541` 规避，但若传 >15 的枚举会越界读）。
13. **注意区分 VC 与 LVD**：两者共用时钟门控 `SysctrlPeripheralVcLvd = 17u`（`sysctrl.h:332`），但寄存器与用途不同（LVD 是欠压检测，`drivers/inc/lvd.h` 阈值 `LvdMskTH1_8V … LvdMskTH2_7V`）。开 VC 前需同时开该门控。
14. **`Sysctrl_SetPeripheralGate()` 必须先开**：本项目 `additional/motor.c:60` 实例 `Sysctrl_SetPeripheralGate(SysctrlPeripheralGpio, TRUE)`；用 VC 需 `SysctrlPeripheralVcLvd`，用 ADT 需 `SysctrlPeripheralAdvTim`，用 TIM3 需 `SysctrlPeripheralTim3`，用 ADC/BGR 需 `SysctrlPeripheralAdcBgr`，用 DAC/OPA 需 `SysctrlPeripheralOpa`。
15. **中断回调机制**：`core/interrupts_hc32f072.h:41` `INT_CALLBACK_ON`（默认）→ 用 `__WEAK` 声明回调，用户**定义同名函数**即可覆盖；若改为 `INT_CALLBACK_OFF` 则须自己写 ISR。NVIC 使能用 `EnableNvic(IRQn_Type, en_irq_level_t, boolean_t)`（默认优先级 `DDL_IRQ_LEVEL_DEFAULT 3u`）。
16. **OPA 注释自相矛盾**（3 个 vs 5 个，见 §3）：`Opa_OutChannelConfig()` 只支持 Opa0/1/2；且 **`Opa_Cmd()` 与 `Opa_DacBufCmd()` 有互斥副作用** —— 相互清除对方的使能位（`opa.c:89-98`、`113-119`），调用顺序会影响结果。

## 10. 未确认 / 待核对（本地文件无法证实的项）

> 以下条目**不可凭本地工程下结论**，需查 HC32F072 数据手册（Datasheet）与用户手册（User Manual）。

| # | 待核对项 | 需要什么资料 |
|---|---|---|
| 1 | **LQFP48 引脚编号表（pin number ↔ 端口/功能）** | 数据手册 Pin Definitions 章节 + 封装图。本地**完全没有**（§8.2） |
| 2 | 最小系统电源/复位/启动/调试引脚：**VCC / AVCC / VSS / AVSS 引脚号与去耦**、**VCAP（内部 LDO 电容）**、**NRST**、**BOOT0**、**SWDIO / SWCLK** 引脚号 | 数据手册（本地 grep `VCAP`/`NRST`/`BOOT0` 全部零命中；SWD 仅有 `SysctrlSWDUseIOEn` 功能位） |
| 3 | **工作电压范围**（VDD/AVDD）、**工作温度范围** | 数据手册电气特性 |
| 4 | **最高主频**（本地仅见 48 MHz 时钟源枚举，无主频上限声明） | 数据手册 |
| 5 | **GPIO 复用功能（AF0–AF7）逐引脚对照表** | 用户手册 GPIO 复用表（`gpio.h:88` 明确指向手册） |
| 6 | **ADTIM6 的 CH0/CH0N/CH1/CH1N/CH2/CH2N 具体输出引脚与 AF 号** | 用户手册 GPIO 复用表（§5.8） |
| 7 | **各系列引脚功能差异**（如 VC2/ADC 的 PE/PD 通道在 LQFP48 是否引出） | 数据手册引脚表 |
| 8 | **ADT 死区时间的物理单位/范围**（DTUAR/DTDAR 与 PCLK0 的换算、最大 ns） | 用户手册 ADT 章节 |
| 9 | **ADT 载波（Chopper）功能是否存在** | 用户手册（本地 grep 零命中） |
| 10 | **ADC 输入"增益"的具体档位**（`adc.h` 多处注明"必须使用输入增益"，但无增益枚举） | 用户手册 ADC/OPA 章节 |
| 11 | **OPA 可编程增益档位与统一增益缓冲模式**、**OPA 引脚映射** | 用户手册 OPA 章节（本地无 GAIN 字段） |
| 12 | **AOS 通用互连矩阵全表**（除 ADT 的 IAOS0S~IAOS3S 与 ADC EXTTRIGGER 外，是否还有其它源/目的） | 用户手册 AOS/事件互连章节 |
| 13 | **`VcOutDisable`(16) 的实际效果**（写入保留位） | 用户手册 + 实测 |
| 14 | **VC2 N 端 "NA"（ch11）与 DAC0 重复项**（`vc.h:139-140`）的真实含义 | 用户手册 VC 章节 |
| 15 | **VC0/1/2 输入通道在 LQFP48 封装中的实际可引出性**（表中含 PD/PE 等大端口） | 数据手册引脚表 |
| 16 | EVB 头文件（`board_evbhc32lf07x.h`）是**评估板**定义，本项目电机驱动板的实际连接 | 本项目原理图（如 `C:\Users\limer\Desktop\motor-drive\Soft\SCH_Schematic1_2026-09-09.pdf`，本次未解析） |

*文件生成来源：本地 DDL 工程静态阅读（未编译、未上板验证）。所有 API/枚举名均按原文抄录。*

## 11. 2026-10-10 增量核查：ADT 三角波输出动作

- 新增官方依据：小华产品页 `https://www.xhsc.com.cn/product/1272.html` 链接的 `RM_HC32F072SeriesReferenceManual_Rev1.80.pdf`，已缓存至 `_datasheet/`，同名 `.txt` 带页码，可定点检索。
- 手册 p355：三角波 A/B 的区别为缓存传输时点；A 在谷点，B 在谷点及峰点。
- 手册 p356、p390：`CMPCA=01` 是比较匹配置高，`CMPCA=11` 才是比较匹配翻转；`PERCA=00` 在计数等于周期值时置低。p363 图16-9 的三角波 PWM 使用 `CMPCA=11`。
- **对当前源码的推导，非实测**：`motor_bemf.c` 使用三角波 A、`PeriodLow/CompareHigh`，但比较值仍为 `P*(1-D)`。按上述事件规则，周期峰点置低，下降途中的比较点置高，此后跨谷点保持高至下一峰点，稳态高电平比例为 `(P+C)/(2P)=1-D/2`。P=600、C=510（软件15%）对应约 **92.5%**；软件5%对应约97.5%。因此软件占空比限幅不能代表实际引脚占空比。
- 本次用离散计数事件模型复核该推导；**尚未测实板 PWM**。端口屏蔽、AF、起停状态及死区等仍需结合引脚波形验证。不得把此模型当作已测得的门极电压。
