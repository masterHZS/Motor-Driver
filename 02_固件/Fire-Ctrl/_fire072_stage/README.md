# Fire-072 —— HC32F072 数控 DCDC 电源固件

把 `Fire-Ctrl/Simple_DCDC`（**STM32F103C8T6** + STM32 HAL + FreeRTOS + u8g2）
完整复刻到 **HC32F072JATA**（小华半导体，Cortex-M0+，LQFP48，128KB Flash / 16KB RAM）。

- 原工程：`../Fire-Ctrl/Simple_DCDC/`
- 本工程：`../Fire-072/`（独立板卡，不依赖也不改动任何现有 072 工程）

---

## 1. 结论：能移，但重点是"重写外设层"，业务逻辑可以照搬

| 层次 | 原工程 | F072 | 能否直接搬 |
|---|---|---|---|
| 控制算法（前馈+慢积分）、标定公式 | `freertos.c` | 同 | ✅ 逻辑照搬，**常数必须重标** |
| UI / 按键状态机 / MOS / 半桥 / 格式化 | `ui.c` `input.c` `power_switch.c` | 同 | ✅ 仅换 GPIO 调用 |
| 图形库 u8g2（46 个文件，~40MB 字体表） | `Core/u8g2/` | 同 | ✅ **一行没改**，纯可移植 C |
| 外设驱动（GPIO/TIM/ADC/DMA/I2C/EXTI） | STM32 HAL | XHSC DDL | ❌ **全部重写** |
| 内核 | FreeRTOS + CMSIS-RTOS2 | 自带轻量内核 | ⚠️ 见 §4 |

原代码里 **没有一行 HAL 调用出现在 `Core/u8g2/` 内部**，所以图形库是白拿的；
真正的工作量集中在"把 HAL 的 6 个外设 API 换成 DDL 的等效调用"。

---

## 2. 编译与烧录

```powershell
# 编译（产物在 build/fire072.elf/.hex/.bin）
.\build.ps1

# 指定工具链
.\build.ps1 -ToolchainBin "C:\Users\limer\.toolchain-arm\xpack-arm-none-eabi-gcc-12.3.1-1.1\bin"

# 编译 + 用 DAPLink/pyOCD 烧录
.\build.ps1 -Flash

# 出问题时看完整诊断（把编译器输出原样落到 stdout）
.\build.ps1 -Diag
```

也提供了 `Makefile`，装了 GNU make 的环境可以直接 `make` / `make flash`。

**注意**：`build.ps1` 刻意写成**纯 ASCII**。Windows PowerShell 5.1 对没有 BOM 的
`.ps1` 按系统 ANSI 代码页（本机 GBK）解码，脚本里写中文会导致解析失败。
中文注释留在 C 源码和 README 里，C 源码用 `-finput-charset=UTF-8` 明确编码。

### 当前固件占用

```
   text    data     bss     dec     hex
  24652      20    4836   29508    7344     (fire072.elf)

Flash: 24.6 KB / 128 KB  = 19%
RAM  :  4.9 KB /  16 KB  = 30%   (其中 u8g2 显存 1KB + 任务栈 1.9KB)
```

---

## 3. 目录结构

```
Fire-072/
├── build.ps1              一键编译/烧录（无 make 依赖）
├── Makefile               等价 make 版本
├── core/                  HC32F072 启动 + 系统时钟 + 中断入口（XHSC 官方）
├── cmsis/                 CMSIS Core-M0+ 头
├── drivers/inc|src/       XHSC DDL 驱动库（官方，未改）
├── user/ddl_device.h      DDL 芯片/封装选择头
├── ldscripts/hc32f072.ld  链接脚本（128K Flash / 16K RAM）
└── Core/
    ├── Inc/               本工程头文件（改动集中在这里）
    └── Src/               本工程源码
        ├── board.h        ★ 引脚表 + 全部标定常数（取代 .ioc + main.h）
        ├── os_api.[ch]    ★ 轻量内核（取代 FreeRTOS + CMSIS-RTOS2）
        ├── main.c         主程序
        ├── freertos.c     ★ 四个任务的业务逻辑（与原文件一一对应）
        ├── app_adc.c      ADC 顺序扫描 + DMAC 搬运
        ├── app_tim.c      TIM3 三路 PWM（模拟 DAC 参考）
        ├── i2c.c          I2C0 主机（DDL 状态机版）
        ├── gpio.c         GPIO + 按键 PORT 中断
        ├── u8g2_port.c    u8g2 字节/延时回调
        ├── ui.c / input.c / LED.c / power_switch.c / shared_data.c
        └── Core/u8g2/     u8g2 图形库（原样复制）
```

> `app_adc.*` / `app_tim.*` / `app_i2c.*` / `app_led.*` 等文件名**故意加了 `app_` 前缀**：
> DDL 自己在 `drivers/inc/` 下有同名的 `adc.h` / `timer3.h` / `i2c.h`，
> 不加前缀会被先搜到的 DDL 头文件遮蔽（这个坑实际踩过两次）。

---

## 4. 引脚对照表

| 功能 | 原 F103 | 原复用 | F072 引脚 | F072 复用 | 说明 |
|---|---|---|---|---|---|
| **PWMIN**（模拟 DAC 参考） | PA8 | TIM1_CH1 | **PA6** | TIM3_CH0A (AF2) | 同一引脚号，换了定时器 |
| **PWM_ADJ2** | PA7 | TIM3_CH2 | **PA7** | TIM3_CH1A (AF2) | |
| **OLED SCL** | PB6 | I2C1_SCL | **PB6** | I2C0_SCL (AF1) | F072 的 I2C 引脚**不可 remap** |
| **OLED SDA** | PB7 | I2C1_SDA | **PB7** | I2C0_SDA (AF1) | |
| BUTTON_UP | PC13 | EXTI13 | PC13 | PORTC 中断 | |
| BUTTON_DOWN | PA15 | EXTI15 | PA15 | PORTA 中断 | |
| BUTTON_LEFT | PA12 | EXTI12 | PA11 | PORTA 中断 | |
| BUTTON_RIGHT | PB9 | EXTI9 | PB9 | PORTB 中断 | |
| BUTTON_MID | PA11 | EXTI11 | PA12 | PORTA 中断 | |
| **HVSE / HVDF1 / HVDF2** | PA0 / PA1 / PA2 | ADC1_IN0/1/2 | PA0 / PA1 / PA2 | AIN0 / AIN1 / AIN2 | **完全一致** |
| **V2.5 标定** | PA3 | ADC1_IN3 | PA3 | AIN3 | **完全一致** |
| **ADJ1_FB** | PA4 | ADC1_IN4 | PA4 | AIN4 | **完全一致** |
| **ADJ2_FB** | PA5 | ADC1_IN5 | PA5 | AIN5 | **完全一致** |
| **VCC_MONITOR** | PB1 | ADC1_IN9 | PB1 | AIN9 | **完全一致** |
| MOS1/2/3 | PB10/PB11/PB12 | GPIO | PB10/PB11/PB12 | GPIO | 一致 |
| HB1 高边 | **PA8** | — | **PB13** | GPIO | ⚠️ 原工程与 PWMIN 抢 PA8 |
| HB1 使能 | PB13 | — | **PC0** | GPIO | 避让 |
| HB2 高边 | **PA9** | — | **PB14** | GPIO | ⚠️ 原工程与调试串口抢 PA9 |
| HB2 使能 | PB14 | — | **PC1** | GPIO | 避让 |
| HB3 高边 | **PA10** | — | **PB15** | GPIO | ⚠️ PA10 是 F072 的 UART0_RX |
| HB3 使能 | PB15 | — | **PC2** | GPIO | 避让 |
| LED1~4 | PB3/PB4/PB5/PB8 | GPIO | PC3/PC4/PC5/PC6 | GPIO | 避让 |
| 调试串口 | — | — | PA9(TX)/PA10(RX) | UART0 AF1 | 接 DAPLink，与 F072_MotorCtrl 一致 |

**模拟前端可以照抄原板接法**：F072 的 AIN0~AIN7 与 F103 的 PA0~PA7 一一对应，
分压网络不用重新设计。

> `PA9/PA10` 在 F072 上固定是 UART0，**不能再像 F103 那样拿去当 HB2/HB3 的高边输出**。
> `PC13` 在 F072 上是纯 GPIO（无复用），正好适合做按键或开关量。

---

## 5. 外设逐项对照

| 原（F103 / HAL / CubeMX） | 本工程（F072 / DDL） |
|---|---|
| `HAL_Init()` + `SystemClock_Config()`，HSE 8M×PLL9 = **72MHz** | `Sysctrl_SetRCHTrim(RCH24M)` + `Sysctrl_ClkInit()`，**24MHz** 内部 RCH |
| `MX_GPIO_Init()` → `HAL_GPIO_Init()` + `HAL_NVIC_EnableIRQ(EXTIx)` | `Gpio_Init()` + `Gpio_EnableIrq()` + `EnableNvic(PORTA/PORTB/PORTC_E_IRQn)` |
| ADC1 规则组 7 Rank + `ContinuousConvMode` | ADC **顺序扫描(SQR)** 7 通道 + `Adc_SGL_Always_Start()` |
| DMA1_Channel1 循环模式自动搬结果 | **DMAC 通道0**，源固定 `SQRRESULT0`，块大小 7，连续传输 |
| `HAL_ADCEx_Calibration_Start()` | F072 无此步骤（上电自校准） |
| TIM1_CH1 PWM（72MHz/720 = 100kHz） | **TIM3_CH0A** PWM（24MHz/720 = **33.3kHz**） |
| `__HAL_TIM_SET_COMPARE()` | `Tim3_M23_CCR_Set()` |
| I2C1 + DMA + 传输完成中断 + 信号量 | **I2C0 阻塞式状态机**（F072 的 I2C 无 DMA 请求） |
| FreeRTOS 10 + CMSIS-RTOS2，`configTOTAL_HEAP_SIZE=12288` | **自带轻量内核**，零堆，全静态 |
| `osDelay` / `osMutexAcquire` / `osMessageQueueGet` / `osEventFlagsSet` | 同名同义 API（`os_api.h`） |

### 关于内核：为什么没有用真 FreeRTOS

原 CubeMX 配置里 `configTOTAL_HEAP_SIZE = 12288`，光 FreeRTOS 堆就吃掉 12KB；
再叠加 ADCTask(4KB) / ControlTask(2KB) / ButtonTask(2KB) / DisplayTask(2KB) 的栈，
在 **16KB RAM** 的 F072 上必然溢出。

而且本工程实际只有：1 路 100Hz 控制环、1 路 ADC 扫描、按键扫描、低优先级刷屏 ——
**没有真正的并发需求**。所以 `os_api.c` 用约 40 行汇编 + 一个 tick 中断实现了
任务 / 延时 / 互斥 / 信号量 / 消息队列 / 事件标志，API 名字与语义对齐 CMSIS-RTOS2，
`freertos.c` 的业务代码因此可以逐行保留。

任务栈按字节实配（CMSIS-RTOS2 里 `stack_size` 单位是字节，原代码写的 `1024*4` 是把"字"当"字节"了）：

| 任务 | 优先级 | 栈 | 职责 |
|---|---|---|---|
| ADCTask | 4 | 512 B | 每 1ms 采样，16 点平均 + EMA，反推 VDDA，算 Vout |
| ControlTask | 4 | 256 B | 10ms 控制环：前馈 + 慢积分 → 写 PWMIN |
| ButtonTask | 3 | 256 B | 阻塞等按键事件，消抖 + 长按连发 |
| DisplayTask | 2 | 640 B | u8g2 刷屏（最低优先级，靠抢占自然限帧） |
| defaultTask | 3 | 128 B | 占位（与原工程一致） |
| idle | 0 | 128 B | `wfi` |

---

## 6. 控制电压原理（本板为什么要这么标定）

### 6.1 模块本身：RT8289 是定压 Buck

RT8289 内部有 **1.222V 基准**，只盯住 FB 脚：

```
Vout = 1.222 × (Rtop + Rbot) / Rbot
```

本板 `R6 = 30k`（上）、`R7 = 1.8k`（下），所以芯片自身的"死"输出是
`1.222 × 17.667 ≈ 21.6V`。它靠调开关占空比把 FB 死死钉在 1.222V。

### 6.2 怎么变成可调：往 FB 节点注入电流

由网表反推的模拟前端：

```
MCU PWM ──R1(10k)──┬── C11(22nF) ── GND      ← RC 低通：PWM → 直流
                   │
                   └──R2(10k)──┬── U2 IN1-(脚2)
              R3(10k) ─────────┘   (R3 另一端接 LM358 输出，C12 到 FB)

5V ──R4(28k)──┬── U2 IN1+(脚3)
       R5(4.02k)
              │
             GND
```

1. **PWM → 直流**：R1C11 = 220µs，转折 ~723Hz，远低于 PWM 频率，
   节点上只剩 `V(PWMIN) = D × 3.3V`。3.3V 高电平直接过 10k 到 3.3V 运放输入，
   **不需要电平转换**。
2. **R4/R5 造中点**：给出双向调节的偏置，让 D 在 0~100% 都能推 FB。
3. **运放把 FB 钉住**：LM358 反相端接 FB、同相端是"目标"，
   于是 FB 必须等于同相端电压，电流差额由运放输出经 R3/C12 配平。
   芯片为了自保只能改占空比，直到输出重新平衡 ——
   **等价于把 1.222V 这个内部基准"平移"了**。

### 6.3 由此得到的方向与增益

按 R1=R2=R3=10k、R4=28k、R5=4.02k 解 KCL，得到近似关系：

```
Vout ≈ -DCDC_PWM_GAIN_V_PER_V × (V(PWMIN) - DCDC_PWM_OFFSET_V)
DCDC_PWM_GAIN_V_PER_V = 35.3      DCDC_PWM_OFFSET_V = 39.6
```

**两条关键结论：**

1. **单调反向**：占空比 ↑ → V(PWMIN) ↑ → FB 抬高 → 芯片以为输出过高 →
   降占空比 → **输出电压 ↓**。控制环必须按这个方向收敛，否则正反馈跑飞。
   （`board.h` 里留了 `PWM_DIRECTION_INVERTED` 开关，实测方向反了就取反。）
2. **约 35 倍增益**：PWM 直流电压每变 1V，输出约变 35V。3.3V 满量程理论对应
   100V 以上，实际被 RT8289 的 26V 上限截住，**有效占空比只在很窄一段**。
   反算出来的前馈式：`D ≈ 1.234 - 0.0154 × Vset`。

### 6.4 ⚠️ 原固件的增益是错的

`freertos.c` 里写的是：

```c
#define PSU_GAIN_OUT   (8.0f)      /* Vout = 8 × Vref_equiv */
#define FB_R_TOP_OHM   (30000.0f)
#define FB_R_BOT_OHM   (1800.0f)   /* 实际分压比 17.667 */
```

**8× 和 17.667× 自相矛盾**，而按本板网表反推真实增益约 **35× 且反向**。
所以原代码的前馈项 `duty_ff = (Vset/8)/VDDA` 算出来的占空比是错的，开机就偏。

本工程的处理：保留"前馈 + 慢积分"的结构，把前馈换成上面那组标定常数，
并把 `PSU_GAIN_OUT` 保留在源码里仅供对照。

**上电标定方法**（必做）：手动给两个占空比（例如 D=0.50 与 D=0.60），
用万用表量对应输出电压，解二元一次方程重新拟合
`DCDC_PWM_GAIN_V_PER_V` 和 `DCDC_PWM_OFFSET_V`。

---

## 7. 与原工程的差异清单（必须知道的几件事）

### 7.1 原代码里的两个引脚冲突，本工程已修掉

| 冲突 | 原代码 | 后果 |
|---|---|---|
| PA8 一脚两用 | `.ioc` 里 `PA8 = TIM1_CH1`，但 `HB1_Set()` 又用 `GPIOA PIN_8` 当半桥高边 | `HAL_TIM_MspPostInit` 已把 PA8 配成 AF_PP，之后 `HAL_GPIO_WritePin` 改的是复用功能引脚的寄存器 —— **PWM 参考和 HB1 门极抢同一个脚** |
| PA9/PA10 | `HB2_Set()` 用 PA9、`HB3_Set()` 用 PA10 | 在 F072 上这两个脚固定是 UART0_TX/RX，**不能当 GPIO 输出** |

本工程把 HB1/HB2/HB3 高边改到 PB13/PB14/PB15，使能改到 PC0/PC1/PC2。

### 7.2 原工程 UI 和控制环是两套，互相不引用

- `ui.c` / `input.c` 走 `g_adj_target.adj1/2_set_v` + `g_display_page`
- `freertos.c` 的 `StartControlTask` / `StartDisplayTask` 走 `static float s_vset_v` + `s_duty_cmd`

两边**都不引用对方**：按键改的是 `g_adj_target`，而真正输出 PWM 的是 `s_vset_v`
（永远停在 12.0V）。同一份 `.ioc` 被两代代码共用、没清干净。

本工程的处理：**以 `freertos.c` 那套为准**（它才是真正驱动输出的），
`ui.c` / `input.c` / `shared_data.c` 原样保留作为备用 UI 实现。
另外把双通道补齐了：ADJ1/ADJ2 各有一套前馈+慢积分，分别写 TIM3_CH0A / CH1A。

### 7.3 本板 FB 没有引到 MCU，闭环实际是开环

查网表：`OFB` 网络里只有 `U2.1.6` 和 `U2.1.7`（LM358 第二路输入），
**没有连到任何连接器**。所以：

- 固件里"用 2.5V 标定反推 VDDA → 再用 FB 分压算 Vout"这条链路，**在这块板上是断的**；
- `s_vout_v` 恒为 0，积分器会一路推到限幅 —— 这是**当前硬件的预期行为**，
  等于退化成正馈 + 常数偏置；
- 想恢复真闭环，需要把 FB（或输出分压点）引一路到 MCU 的 ADC 输入
  （板上 `AIN4/PA4` 已经预留好）。

### 7.4 OLED 刷新速度

原来用 DMA 推 132 字节帧，现在 F072 的 I2C0 没有 DMA 请求，改成阻塞式状态机。
一帧 1024 字节 @100kHz 约 90ms。因为 DisplayTask 是**最低优先级且从不主动 delay**
（与原工程一致），它只在 ADC/Control/Button 都空闲时才刷屏，不影响控制环。
想更快就把 `board.h` 的 `BOARD_I2C_BAUD` 提到 400000（需屏支持）。

### 7.5 PWM 频率 100kHz → 33.3kHz

F103 是 72MHz/720 = 100kHz；F072 的 RCH 是 24MHz，同样 720 计数得到 33.3kHz。
对 R1C11 = 220µs 的 RC 来说，33.3kHz 的纹波仍可忽略。

> **升级建议**：HC32F072 自带 **2 路 12bit 500Ksps DAC**（`Dac0_Init()` /
`Dac0_SetChannelData()` 已在 `drivers/src/dac.c` 里）。换用真 DAC 可以直接消除
PWM 纹波和建立时间。**代价**：DAC0_OUT 只能出在 `PA04`、DAC1_OUT 只能出在 `PA05`
（全片仅此两脚），需要把模拟前端挪到这两个脚上。

---

## 8. 安全提示

- 首次上电**必须用限流电源**，从低设定值（如 3V）开始，空载确认后再接负载。
- 方向若反了会正反馈跑飞，第一次上电请把设定值给 0 或很低，并盯着输出。
- 修改 `board.h` 的标定常数后重新编译，不要直接烧旧 hex。
- MOS / 半桥部分本工程只做了原代码的等价移植，**没有加入互锁和死区**，
  接功率级前请自行确认门极时序。

---

## License

原工程 Simple_DCDC 为 GPL-3.0，本复刻工程沿用同一许可。
XHSC DDL 驱动库为 BSD 3-Clause（见 `drivers/` 各文件头）。
