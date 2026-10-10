# F072_Bridge

第一颗 HC32F072 透明 UART 网关。

- UART0：PA9(TX) / PA10(RX)，9600-8N1，接 DAPLink 虚拟串口。
- UART1：PA2(TX) / PA3(RX)，全双工，115200-8N1，接 F005 的下游串口。
- 不解析 Modbus，不生成响应，不在本地实现寄存器。
- 双向环形缓冲，主循环使用 UART 查询发送，接收使用中断。

编译：

```powershell
.\build.ps1 -ToolchainBin "C:\path\to\arm-none-eabi\bin"
```

输出位于 `build\hc32f072.elf/.hex/.bin`。使用 `-Flash` 可通过 DAPLink/pyOCD 烧录。

