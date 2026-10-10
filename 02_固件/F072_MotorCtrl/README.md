# F072_MotorCtrl

HC32F072JATA 开环六步电机控制器，驱动 FD6288T（V1.0 小板或 V3.1 电调功率级）。

本工程现在有两种 UART 模式：

- **默认 / cascade**：UART1 PA2 单线半双工，115200-8N1，供 `F072_Bridge` 级联使用。
- **Direct / standalone**：UART0 PA9(TX) / PA10(RX)，9600-8N1，直接接 DAPLink 虚拟串口 / PC，HostSoftware 可直接通信。

## 1. 直接模式（单颗 F072 外接 V3.1 电调）

```text
HostSoftware
  -> DAPLink 虚拟串口 (9600-8N1)
  -> F072_MotorCtrl direct
  -> V3.1 FD6288T 六路输入
  -> 2216-730KV 三相无刷电机
```

### 1.1 F072 到 V3.1 电调

V3.1 板上 FD6288T 输入网络已经在 TP12～TP17 引出，并带 100 Ω 串阻和 10 kΩ 下拉；外部 F072 直接接这些测试点即可。

| F072 引脚 | H2 位置 | V3.1 测试点 | FD6288T | 功能 |
|---|---|---|---|---|
| PB2 | H2-12 | TP12 / `PWM_AH` | U1 pin1 HIN1 | A 相高边 |
| PA7 | H2-7 | TP13 / `PWM_AL` | U1 pin4 LIN1 | A 相低边 |
| PA4 | H2-6 | TP14 / `PWM_BH` | U1 pin2 HIN2 | B 相高边 |
| PB0 | H2-10 | TP15 / `PWM_BL` | U1 pin5 LIN2 | B 相低边 |
| PB12 | H2-17 | TP16 / `PWM_CH` | U1 pin3 HIN3 | C 相高边 |
| PB1 | H2-9 | TP17 / `PWM_CL` | U1 pin6 LIN3 | C 相低边 |
| GND | GND | TP2 / PGND | COM / PGND | 逻辑地参考 |

注意：

- **不要**把 F072 的 3.3 V / 5 V 输出直连到 V3.1 的 3.3 V 或 VBUS。
- 只接六路信号和 GND；F072 由自己的 USB/5 V 供电，V3.1 功率级由 4S 母线供电。
- 六路信号线尽量短，远离三相输出和自举节点。
- 使用前确认 V3.1 的 FD6288T VCC/自举供电正常；12 V 不能接任何 F072 GPIO。

### 1.2 DAPLink / PC 串口

| DAPLink | F072 |
|---|---|
| UART TX | PA10 / H2-28 |
| UART RX | PA9 / H2-26 |
| GND | GND / H2-11/23/24 |

HostSoftware 使用 `9600-8N1`，Modbus-RTU 从站地址 `1`。如果 DAPLink 同时用于 SWD 烧录和虚拟串口，注意不要把它的 TX/RX 错接到 V3.1 的 TP12～TP17。

## 2. 构建与烧录

直接模式：

```powershell
.\build.ps1 -Direct -ToolchainBin "C:\Users\limer\.toolchain-arm\xpack-arm-none-eabi-gcc-12.3.1-1.1\bin"
```

直接编译并烧录：

```powershell
.\build.ps1 -Direct -Flash -ToolchainBin "C:\Users\limer\.toolchain-arm\xpack-arm-none-eabi-gcc-12.3.1-1.1\bin"
```

输出：

```text
build/hc32f072.elf
build/hc32f072.hex
build/hc32f072.bin
```

默认 cascade 模式（不传 `-Direct`）仍输出 UART1 PA2 半双工 115200 版本，接线见 `../F072_CASCADE_README.md`。

## 3. 协议寄存器

| 地址 | 读/写 | 含义 |
|---|---|---|
| 0x0000 | R | 运行状态（1 运行、0 停止/故障） |
| 0x0001 | R/W | 启停请求 |
| 0x0002 | R/W | 目标油门 0..100 |
| 0x0003 | R/W | PWM 频率 1000..20000 Hz |
| 0x0004 | R | 实际占空比，最大 30% |
| 0x0005 | R | 故障位：0x0001 非法命令，0x0002 通信超时 |
| 0x0006 | R | 当前电换相频率（Hz） |
| 0x0007 | R | 固件版本 0x0100 |
| 0x0008 | R | 通信错误计数 |
| 0x0009 | R | 通信成功计数 |

## 4. 安全限制

- 阶段一为台架开环六步运行，不含反电动势闭环、堵转限流或可靠转速测量。
- 实际占空比硬限制为 30%，启动预定位 200 ms，电换相频率 10→500 Hz 斜坡。
- 通信超过 1 秒无有效请求立即关断六路输出并置故障。
- 非法命令、非法值或未支持功能码会关断输出并置故障。
- 首次上电必须使用限流电源（建议 12.0～16.8 V，限流 5 A），从低油门开始；有条件时先断开电机确认六路波形。
