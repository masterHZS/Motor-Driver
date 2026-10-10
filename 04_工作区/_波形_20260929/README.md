# F005 六路 PWM 逻辑分析记录（2026-09-29）

## 连接

逻辑分析仪：`fx2lafw / Saleae Logic`，8 通道，WinUSB 驱动。

| 分析仪 | MCU 引脚 | 测试点 | 信号 |
|---|---|---|---|
| D0 | P23 | TP12 | HIN1 |
| D1 | P15 | TP13 | LIN1 |
| D2 | P25 | TP14 | HIN2 |
| D3 | P26 | TP15 | LIN2 |
| D4 | P36 | TP16 | HIN3 |
| D5 | P32 | TP17 | LIN3 |

地线：TP2 / AGND。

## 文件

- `precharge_24m_20ms.sr`：预定位阶段短捕获。
- `ramp_24m_100ms.sr`：升速第 0 步短捕获。
- `step_HLF_24m_20ms.sr`：`HLF` 状态定点捕获。
- `step_HFL_verified_24m_20ms.sr`：重新确认的 `HFL` 状态定点捕获；旧 `step_HFL_24m_20ms.sr` 实际误标为 `LFH`。
- `step_FHL_24m_20ms.sr` / `step_LHF_24m_20ms.sr` / `step_LFH_24m_20ms.sr` / `step_FLH_24m_20ms.sr`：其余四个状态定点捕获。
- `independent_six_step_no_bus_200k_5s.sr`：修正为 CHA/CHB 独立输出后的完整正转六步捕获（无母线）。
- `independent_six_step_no_bus_24m_20ms.sr`：早期独立输出模式的 24 MHz 短捕获。
- `polarityfix2_test_0p5hz_200k_5s.sr`：最终极性修正后的连续捕获，完整顺序通过。
- `final_fix_zoom_24m_5ms.sr`：最终 24 MHz 高速细节捕获，稳定 `HLF` 状态。
- `plots/final_independent_six_step_result.png`：最终成果图（状态时间轴 + 原始信号 + 高速细节）。
- `ramp_sequence_200k_6000ms.sr`：旧互补模式的升速段完整捕获，保留作对照。
- `analyze_capture.py`：统计高低占比、半桥同时导通和死区。
- `analyze_sequence.py`：按窗口识别 `H/L/F` 相状态。

## 结论

- 正转参考顺序为：`HLF -> HFL -> FHL -> LHF -> LFH -> FLH -> HLF`，对应 `AB -> AC -> BC -> BA -> CA -> CB`。
- 逻辑门信号中第三相是 HIN=LIN=0（悬空）；它不是由 MCU 输出半电压。电机端电压的中间台阶来自 BEMF/电感/虚拟中性点，必须用示波器测相端才能看到梯形波。
- 三组 HIN/LIN 均无同时为高。
- 新独立输出模式的稳定状态实测为：高边 PWM 相 `HIN≈5% / LIN=0%`，低边常通相 `HIN=0% / LIN≈100%`，悬空相 `HIN=LIN=0%`。
- 新捕获 `independent_six_step_no_bus_200k_5s.sr` 中三组半桥 `both_high_samples=0`，顺序校验为 `HLF -> HFL -> FHL -> LHF -> LFH -> FLH -> ...`。
- 最终极性修正后，连续捕获中 A/B/C 高边 PWM 均稳定为约 5%，没有再出现约 95% 的反向 PWM。
- 24 MHz 短捕获 `final_fix_zoom_24m_5ms.sr` 同样测得三个半桥 `both_high_samples=0`；稳定 `HLF` 窗口为 A: HIN 5.008% / LIN 0%，B: HIN 0% / LIN 100%，C: HIN 0% / LIN 0%。
- 旧互补模式在低边常通状态出现 `HIN/LIN` 同时高，FD6288T 随后把该半桥封掉，这是电机只抖动/转一小格的主要原因之一。
- FD6288T 自带 100/200/300 ns 死区；逻辑分析仪看到的是 MCU 栅极输入，驱动器内部死区不会出现在 HIN/LIN 数字信号上。

## 电机测试记录

早期带电机测试使用了错误的末两步顺序（原为 `... BA -> CB -> CA`），因此当时的抖动、母线塌陷和欠压故障不能作为最终相序结论。

- 首次测试约 6.789 s 触发欠压故障 `0x0008`，母线由约 14.8 V 跌至 8.52 V，峰值电流约 6.88 A。
- 固件已改为 CHA/CHB 独立输出，逻辑顺序和门极组合已在无母线条件重新验证。
- 真实带母线镜像仍需重新构建为正式发布版，并完成“15 V 限流 -> 电机实转”的最终上电验收。

后续带电机测试建议：

1. 先用无母线固件验证 `BUILD_ID=2` 和逻辑捕获，确认 `HLF -> HFL -> FHL -> LHF -> LFH -> FLH`。
2. 再使用 15 V、2 A 限流，优先使用空载/自由转子。
3. 保持低占空比和慢升速，全程监控母线电压和电流。
4. 若仍抖动，用示波器测电机三个相端到虚拟中性点的梯形电压，不要从 HIN/LIN 数字波形推断相电压。
