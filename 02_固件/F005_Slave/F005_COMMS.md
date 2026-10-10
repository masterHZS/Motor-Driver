# F005 直连从站固件说明（临时直接油门模式）

## 1. 目标

让 F005 按 HostSoftware 的 Modbus-RTU 从站协议工作：

- 地址：`1`
- 串口：UART0，`9600-8N1`（与当前 HostSoftware 默认一致）
- 引脚：`P14/TP6 = UART0_TXD(AF6)`、`P27/TP3 = UART0_RXD(AF5)`
- 支持功能码：`0x03` 读保持寄存器，`0x06` 写单寄存器
- 寄存器映射保持与 HostSoftware 兼容：

| 地址 | 读/写 | 含义 |
|---|---|---|
| 0x0000 | R | run state |
| 0x0001 | R/W | 启动=1，停止=0 |
| 0x0002 | R/W | 油门/目标百分比 0..100 |
| 0x0003 | R/W | PWM 频率；当前 F005 仅接受 20000 Hz |
| 0x0004 | R | 实际占空比 |
| 0x0005 | R | fault |
| 0x0006 | R | 电换相 Hz |
| 0x0007 | R | 固件版本 |
| 0x0008 | R | 通信错误计数 |
| 0x0009 | R | 通信成功计数 |

## 2. ★ SWD / 烧录保护窗口

`P27(SWDIO)` 和 `P31(SWCLK)` 是这个板子唯一的 SWD 烧录口。UART0 的 TX 使用专用的 `P14/TP6`，RX 复用 `P27/TP3`，这样不会把 SWCLK 直接短到 UART 数据线上。

因此通信固件的行为是：

1. 每次复位后，P27/P31 **保持 SWD 功能**，不初始化 UART0，不驱动 UART 引脚。
2. 默认延时 `5000 ms`（`MODBUS_SWD_RELEASE_MS`）后，才执行 `Sysctrl_SetFunc(SysctrlSWDUseIOEn, TRUE)`，把 P27 切到 UART0_RXD AF5，并把 P14 切到 UART0_TXD AF6。
3. 释放后到下一次复位前，SWD 不能再在线调试；需要重新烧录时，让 DAPLink 拉 nRESET 或手动断电，复位后 5 秒内烧录。

如果 P27 已经切到 UART，普通 `pyocd flash` 可能报 `No ACK`。此时使用复位下烧录脚本：

```powershell
.\flash_under_reset.ps1 -Image .\build_comms\comms.hex
```

构建时可覆盖延时：

```powershell
.\build_comms.ps1 -SwdReleaseMs 8000
```

## 3. 接线（PC/USB-TTL 直连 F005）

| F005 | PC / DAPLink 虚拟串口 |
|---|---|
| TP6 / P14 / UART0_TXD | USB-TTL RXD |
| TP3 / P27 / UART0_RXD | USB-TTL TXD |
| TP2 / GND | GND |

P31/TP4 仍保留为 SWCLK。P27 是 SWDIO，运行时用作 UART0_RXD；烧录时仍按第 2 节在复位后 5 秒窗口内连接 SWD。P14/P27 使用两线全双工串口，不再需要 F072 透明桥。

## 4. 构建

```powershell
cd C:\Users\limer\Desktop\motor-driver\02_固件\F005_Slave
.\build_comms.ps1
# 默认：UART 9600-8N1 + 直接油门模式
# 输出：build_comms\comms.hex
```

原 BEMF 传感器无刷控制仍可通过参数构建：

```powershell
.\build_comms.ps1 -Direct 0 -Baud 115200
```

## 5. 直连通信与控制测试

1. 先用限流 4S 电源；PC/USB-TTL 与 F005 共地，TX/RX 交叉连接。
2. 烧录 `build_comms\comms.hex`，复位后在 5 秒窗口内可继续用 pyOCD。
3. 5 秒后 UART0 启动；此时用 HostSoftware 打开串口（9600-8N1），发标准帧：
   - 读状态：`01 03 00 00 00 0A C5 CD`
   - 启动：`01 06 00 01 00 01 19 CA`
   - 停止：`01 06 00 01 00 00 D8 0A`
   - 油门 50%：`01 06 00 02 00 32 A9 DF`
   - 油门 100%：`01 06 00 02 00 64 29 E1`
4. 直接油门模式下，写 `0x0002` 的非零值会隐式启动：先 HOLD -> PRECHARGE -> ALIGN，再进入开环运行。油门 0 会立即停车。
5. 软件仍限制最大实际占空比（默认 25%）；`0x0002=100` 将映射为 `0x0004=25`，避免把上位机 0..100 原样当作功率占空比。

## 6. 监控

`user/monitor.c` 每 100 ms 更新一份快照，包含：

- 运行状态、故障、启停请求、油门、实际占空比、电换相 Hz、PWM 频率
- 母线电压 counts/mV、峰值电流 counts/mA
- BEMF 采样、BEMF 门限、过零计数、换相步数
- 通信成功/错误计数、固件版本

Modbus `0x03` 读寄存器直接使用这份快照；SWD RAM marker 也继续在 `user/main.c` 更新，便于无串口时观察。

## 7. 当前限制

- PWM 频率固定 20 kHz；写 `0x0003 != 20000` 返回非法值异常，避免未经重新验证就改载波/死区。
- 直接油门模式是临时开环台架方案：`0x0002` 同时映射实际占空比和电换相频率（默认 10..120 Hz，频率加减速约 120 Hz/s），不使用 BEMF 闭环。
- 通信超时在收到有效启动或油门命令后武装；超过 1 秒没有有效 Modbus 帧会关断并置 `COMM_TIMEOUT`。
- 占空比上限、启动频率和最大频率均可通过 `build_comms.ps1` 参数调整；首次接电机必须限流并从小油门开始。



