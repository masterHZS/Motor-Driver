# HostSoftware

HostSoftware 是 ECU 上位机界面工程，当前以界面原型为主，使用 Qt 6.8.3 + C++ + QML 开发，UI 全部由 QML 实现，C++ 负责参数存储和主题切换。

## 技术栈

- 开发语言：C++17 / QML / JavaScript
- Qt 版本：Qt 6.8.3
- 构建系统：CMake
- 编译器：MSVC 2022 64-bit
- 生成器：Visual Studio 17 2022 / x64
- IDE：Visual Studio Code

## 工程目录

```text
HostSoftware(codex)/
├── .vscode/
│   ├── c_cpp_properties.json
│   ├── extensions.json
│   ├── launch.json
│   ├── settings.json
│   └── tasks.json
├── qml/
│   ├── AirPressureGauge.qml
│   ├── CActionButton.qml
│   ├── CComboBox.qml
│   ├── CParameterEditRow.qml
│   ├── CParameterRow.qml
│   ├── Main.qml
│   ├── SpeedGauge.qml
│   ├── Thermometer.qml
│   └── ThrottleControl.qml
├── scripts/
│   └── build-vs.ps1
├── src/
│   ├── CParameterStore.cpp
│   ├── CParameterStore.h
│   ├── CTheme.cpp
│   ├── CTheme.h
│   └── main.cpp
├── CMakeLists.txt
├── CMakePresets.json
├── ParaSetttings.ini
├── README.md
├── Readme.txt
└── ToolChain.docx
```

## 工具链

当前工程按以下本机路径配置：

- Qt：`D:/Qt/Qt6.8.1/6.8.3/msvc2022_64`
- Visual Studio 2022：`D:/VS2022`
- CMake：系统 `cmake`
- VSCode C++ 编译器路径：`D:/VS2022/VC/Tools/MSVC/14.44.35207/bin/Hostx64/x64/cl.exe`

如需迁移到其他电脑，需要同步修改以下文件中的路径：

- `CMakePresets.json`
- `.vscode/c_cpp_properties.json`
- `scripts/build-vs.ps1`

## 项目路径说明

当前工程根目录为：

```text
E:\Project\HostSoftware(codex)
```

请使用 VSCode 直接打开该目录，`.vscode` 中的任务和调试配置都使用 `${workspaceFolder}`，会自动跟随当前工作区路径。

如果工程目录曾从其他名称改名而来，请关闭仍指向旧路径的 VSCode 窗口，重新打开新目录。构建脚本会自动检测失效的 CMake 缓存并重新配置。

## 构建方式

### 1. VSCode 构建

在 VSCode 中按 `Ctrl+Shift+B`，默认任务为：

- `Build HostSoftware (Debug)`

也可在“终端 -> 运行任务”中选择：

- `Build HostSoftware (Debug)`
- `Build HostSoftware (Release)`
- `Run HostSoftware (Debug)`

### 2. 命令行构建

Debug：

```powershell
cd E:\Project\HostSoftware(codex)
powershell -ExecutionPolicy Bypass -File .\scripts\build-vs.ps1 -Configuration Debug
```

Release：

```powershell
cd E:\Project\HostSoftware(codex)
powershell -ExecutionPolicy Bypass -File .\scripts\build-vs.ps1 -Configuration Release
```

### 3. CMake Presets

工程同时提供 CMake Presets：

- `msvc-debug`
- `msvc-release`

在已加载 MSVC x64 环境的终端中可以执行：

```powershell
cmake --preset msvc-debug
cmake --build --preset debug
```

## 运行与调试

### Debug 模式

Debug 可执行文件：

```text
E:\Project\HostSoftware(codex)\build\Debug\HostSoftware.exe
```

VSCode 调试方式：

1. 按 `Ctrl+Shift+B` 构建 Debug。
2. 按 `F5` 启动 `Debug HostSoftware`。

Debug 构建包含 `.pdb` 调试符号，可正常打断点调试。

### Release 模式

Release 可执行文件：

```text
E:\Project\HostSoftware(codex)\build\Release\HostSoftware.exe
```

Release 用于最终交付和性能测试，不包含调试符号。

## 界面布局

主界面采用左中右水平布局：

- 左侧：连接属性、控制按钮、状态机控制，约占 1/4。
- 中间：数据监控，约占 1/2。
- 右侧：参数设置、功能测试、油门推杆、气压表，约占 1/4。

窗口最小尺寸为 1280 x 720。

### 左侧区域

通信设置包含三个下拉菜单：

- COM 口选择
- 波特率
- 数据位

宽度比例为 `3 : 2 : 1`。

控制区域包含：

- 转速控制
- 油门控制
- 关闭控制

初始显示“转速控制”和“油门控制”，点击任一按钮后切换为绿色“关闭控制”按钮。

状态机控制包含：

- 启动
- 停车/散热
- 紧急停车

三种状态同时只能生效一种，初始为“紧急停车”。

### 中间区域

引擎状态区域显示：

- 引擎状态
- 故障码

转速、温度区域包含：

- 转速表：量程 0-70000 rpm，表盘标题为 `x1000 rpm`，刻度值为 0-70，LCD 显示实际转速。
- 排气温：量程 0-1000。
- ECU 温度：量程 0.0-100.0。

详细参数矩阵包含 10 个参数：

- 当前油泵电压
- 控制电压
- 动力电压
- 电流
- 油泵最大电压
- 油泵点火电压
- 转速加速系数
- 启动时间
- 最高转速
- 怠速转速

### 右侧区域

参数设置按钮会打开模态参数窗口，参数窗口包含 10 个参数，每行包含：

- 参数名
- 当前值
- 修改值输入框

窗口底部按钮：

- 应用
- 完成
- 取消

功能测试按钮会打开模态功能测试窗口，包含：

- 测试主油路电磁阀
- 测试热火头
- 燃油清零
- 油泵排除空气
- 测试点火电磁阀
- 测试启动电机
- 推力清零
- 测试油泵(短时)
- 测试油泵(长时)
- 关闭油泵
- 返回

油门推杆组件：

- 推杆初始位于轨道底部。
- 可通过鼠标拖动改变油门百分比。
- 轨道宽度为推杆宽度的 0.8 倍。
- LCD 宽度为推杆宽度的 1.2 倍。

气压表组件：

- 名称：气压（kPa）
- LCD 显示当前气压。

## 主题切换

程序内置两套主题：

- 亮色主题
- 工业风暗色主题

按键盘 `Tab` 键即可切换。

主题由 `CTheme` 统一管理，所有界面元素均读取主题颜色，包括：

- 窗口背景
- 面板和版块背景
- 文字颜色
- 转速表、温度计
- LCD 显示
- 按钮
- 输入框
- 下拉菜单

## 参数保存

参数保存在应用程序运行目录下的 `ParaSetttings.ini` 中：

```text
build\Debug\ParaSetttings.ini
```

文件格式示例：

```ini
[Parameters]
currentOilPumpVoltage=0
controlVoltage=0
powerVoltage=0
current=0
oilPumpMaxVoltage=0
oilPumpIgnitionVoltage=0
speedAccelerationCoefficient=0
startTime=0
maxSpeed=0
idleSpeed=0
```

参数窗口操作逻辑：

- 修改参数后，“应用”按钮变为可用。
- 点击“应用”弹出确认框，确认后保存到 ini。
- 点击“完成”先应用，再关闭窗口。
- 点击“取消”不保存，直接退出。

## 模拟数据

转速表、排气温、ECU 温度使用模拟数据动态显示：

- 每 250ms 更新一次模拟目标值。
- LCD 数字显示实时目标值。
- 指针和温度柱使用平滑动画过渡。

油门推杆不使用模拟数据，完全由用户手动拖动控制。

## 自定义组件

- `CActionButton`：统一风格的操作按钮。
- `CComboBox`：完全自绘下拉菜单，避免默认样式高亮遮挡文字。
- `CParameterRow`：参数矩阵行。
- `CParameterEditRow`：参数设置窗口编辑行。
- `SpeedGauge`：转速表。
- `Thermometer`：温度计。
- `ThrottleControl`：油门推杆。
- `AirPressureGauge`：气压表。

## 代码规范

- 类名使用大驼峰，并加前缀 `C`。
- 成员变量加前缀 `m_`。
- 局部变量和函数使用小驼峰。

示例：

```cpp
class CMyClassName
{
private:
    int m_memberName = 0;
};
```

## 常见问题

### 1. 构建时报 qmlimportscanner 路径错误

如果工程目录包含中文或特殊字符，Qt 的 `qmlimportscanner` 可能无法处理长路径。当前构建脚本已自动使用 8.3 短路径调用 CMake。

### 2. 应用后参数没有立即刷新

参数矩阵和参数窗口当前值通过 `CParameterStore.currentValues` 绑定，点击应用后会立即刷新。

### 3. 构建时提示 CMake 缓存路径不匹配

构建脚本会自动检测 `CMakeCache.txt` 中的旧源码路径并清理缓存。

### 4. 如何确认当前运行的是 Debug 还是 Release

查看运行的可执行文件路径：

- Debug：`build\Debug\HostSoftware.exe`
- Release：`build\Release\HostSoftware.exe`
