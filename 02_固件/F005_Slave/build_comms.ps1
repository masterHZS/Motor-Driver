# HC32F005无感六步闭环：默认连接上位机，禁止持续开环构建。
# 用户批准：SWD复位窗口10秒后切UART0；VN飞线到P34。
# 默认只编译；-Flash才烧录。本轮不烧录。

param(
    [switch]$Flash,
    [string]$ToolchainBin = $env:ARM_GCC_BIN,
    [int]$TotalMs = 8000,
    [int]$HoldMs = 500,
    [int]$AlignMs = 500,
    [int]$AlignDuty = 5,
    [int]$MaxDuty = 15,
    [int]$MinVbusMv = 13000,
    [int]$SwdReleaseMs = 10000,
    [int]$Direct = 0,
    [int]$Baud = 9600,
    [int]$DirectMinHz = 10,
    [int]$DirectMaxHz = 120,
    [int]$DirectAccelHzPerSecond = 120,
    [int]$OpenLoopStartHz = 5,
    [int]$OpenLoopAccelHzPerSecond = 10,
    [int]$OpenLoopMaxHz = 60,
    [int]$OpenLoopMaxDuty = 10,
    [int]$Reverse = 0,
    [int]$PhaseMap = 0,
    [int]$BemfSign = 1,
    [switch]$UartTxTest,
    [switch]$UartEchoTest,
    [switch]$UartEchoP01
)

$ErrorActionPreference = "Continue"
if ($Direct -ne 0) { throw '禁止持续开环：请使用 -Direct 0 无感闭环版本。' }
if ($MaxDuty -lt 1 -or $MaxDuty -gt 30 -or $AlignDuty -lt 1 -or $AlignDuty -gt $MaxDuty -or $OpenLoopMaxDuty -lt $AlignDuty -or $OpenLoopMaxDuty -gt $MaxDuty) { throw '占空比参数无效，最高只能30%。' }
if ($OpenLoopStartHz -lt 1 -or $OpenLoopMaxHz -lt $OpenLoopStartHz -or $OpenLoopMaxHz -gt 300 -or $OpenLoopAccelHzPerSecond -lt 1) { throw '启动频率参数无效。' }
$Base = $PSScriptRoot
$OffDdl = Join-Path $Base "third_party\xhsc\HC32F005_DDL_Rev2.0.0\HC32F005_DDL_Rev2.0.0"
$BuildName = if ($UartEchoP01) { "build_uart_echo_p01" } elseif ($UartEchoTest) { "build_uart_echo" } elseif ($UartTxTest) { "build_uart_test" } else { "build_comms" }
$Build = Join-Path $Base $BuildName

if ($ToolchainBin -and (Test-Path (Join-Path $ToolchainBin "arm-none-eabi-gcc.exe"))) {
    $env:PATH = "$ToolchainBin;$env:PATH"
}
$gccExe = Get-Command "arm-none-eabi-gcc" -ErrorAction SilentlyContinue
if ($gccExe) {
    $ToolchainBin = Split-Path $gccExe.Source
} else {
    $asciiRoot = Join-Path $env:USERPROFILE ".toolchain-arm"
    $localGcc = $null
    foreach ($root in @($asciiRoot, (Join-Path $Base ".toolchain"))) {
        if (Test-Path $root) {
            $localGcc = Get-ChildItem $root -Recurse -Filter "arm-none-eabi-gcc.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($localGcc) { break }
        }
    }
    if (-not $localGcc) {
        Write-Host "[ERROR] arm-none-eabi-gcc toolchain not found!" -ForegroundColor Red
        exit 1
    }
    $ToolchainBin = $localGcc.DirectoryName
}
$env:PATH = "$ToolchainBin;$env:PATH"

$CpuFlags = @("-mcpu=cortex-m0plus", "-mthumb", "-mfloat-abi=soft")
$BuildDefs = @("-DMOTOR_BUILD_ID=9u", "-DMOTOR_AUTO_SELFTEST=0u", "-DMOTOR_COMM_ENABLE=1u")
if ($UartTxTest) { $BuildDefs += "-DMOTOR_UART_TX_TEST=1u" }
if ($UartEchoTest) { $BuildDefs += "-DMOTOR_UART_ECHO_TEST=1u" }
if ($UartEchoP01) { $BuildDefs += "-DMOTOR_UART_ECHO_P01=1u" }
$SpinDefs = @(
    "-DMOTOR_MAX_DUTY_PERCENT=$($MaxDuty)u",
    "-DMOTOR_ALIGN_DUTY_PERCENT=$($AlignDuty)u",
    "-DMOTOR_OPEN_LOOP_MAX_DUTY_PERCENT=$($OpenLoopMaxDuty)u",
    "-DMOTOR_HOLD_MS=$($HoldMs)u",
    "-DMOTOR_ALIGN_MS=$($AlignMs)u",
    "-DMOTOR_OPEN_LOOP_START_MILLIHZ=$($OpenLoopStartHz * 1000)u",
    "-DMOTOR_OPEN_LOOP_ACCEL_MILLIHZ_PER_SECOND=$($OpenLoopAccelHzPerSecond * 1000)u",
    "-DMOTOR_OPEN_LOOP_MAX_MILLIHZ=$($OpenLoopMaxHz * 1000)u",
    "-DMOTOR_VBUS_MIN_MV=$($MinVbusMv)u",
    "-DMODBUS_SWD_RELEASE_MS=$($SwdReleaseMs)u",
    "-DMODBUS_UART_BAUD=$($Baud)u",
    "-DMOTOR_DIRECT_THROTTLE_MODE=$($Direct)u",
    "-DMOTOR_DIRECT_MIN_MILLIHZ=$($DirectMinHz * 1000)u",
    "-DMOTOR_DIRECT_MAX_MILLIHZ=$($DirectMaxHz * 1000)u",
    "-DMOTOR_DIRECT_ACCEL_MILLIHZ_PER_SECOND=$($DirectAccelHzPerSecond * 1000)u",
    "-DMOTOR_COMMUTATION_REVERSE=$($Reverse)u",
    "-DMOTOR_PHASE_MAP=$($PhaseMap)u",
    "-DMOTOR_BEMF_SIGN_MULTIPLIER=$($BemfSign)",
    "-DMOTOR_SELFTEST_TOTAL_MS=$($TotalMs)u",
    "-DMOTOR_SELFTEST_COAST_MS=500u"
)
$Includes = @("-I$Base\cmsis", "-I$OffDdl\driver\inc", "-I$OffDdl\mcu\common", "-I$Base\port", "-I$Base\core", "-I$Base\user")
$Cflags = $CpuFlags + @("-O2", "-g3", "-gdwarf-2", "-Wall", "-ffunction-sections", "-fdata-sections", "-std=c99", "-Wno-unused-parameter", "-Wno-main", "-Wno-maybe-uninitialized") + $SpinDefs + $BuildDefs + $Includes
$LdHelp = (& arm-none-eabi-ld --help 2>&1 | Out-String)
$NoRwxWarn = @()
if ($LdHelp -match "--no-warn-rwx-segments") { $NoRwxWarn = @("-Wl,--no-warn-rwx-segments") }
$Ldflags = $CpuFlags + @("-T", "$Base\ldscripts\hc32f005.ld", "-Wl,--gc-sections", "-Wl,-Map=$Build\comms.map") + $NoRwxWarn + @("--specs=nano.specs", "--specs=nosys.specs", "-Wl,--start-group", "-lc", "-lm", "-Wl,--end-group")

New-Item -ItemType Directory -Force -Path $Build | Out-Null
$Sources = @((Join-Path $Base "core\startup_hc32f005.S"))
$Sources += (Get-ChildItem (Join-Path $Base "port\*.c") -ErrorAction SilentlyContinue).FullName
$Sources += (Get-ChildItem (Join-Path $OffDdl "driver\src\*.c") -ErrorAction SilentlyContinue).FullName
$Sources += @((Join-Path $Base "user\main.c"), (Join-Path $Base "user\motor.c"), (Join-Path $Base "user\bemf_observer.c"), (Join-Path $Base "user\speed_control.c"), (Join-Path $Base "user\monitor.c"), (Join-Path $Base "user\modbus_slave.c"))

$Objects = @()
foreach ($Src in $Sources) {
    $Obj = Join-Path $Build ([System.IO.Path]::GetFileNameWithoutExtension($Src) + ".o")
    Write-Host "  CC  $($Src.Substring($Base.Length + 1))"
    if ($Src -match '\.(S|s)$') {
        & arm-none-eabi-gcc $CpuFlags -x assembler-with-cpp $Includes -c $Src -o $Obj
    } else {
        & arm-none-eabi-gcc $Cflags -c $Src -o $Obj
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $Objects += $Obj
}

Write-Host "  LD  comms.elf ($(if ($UartEchoP01) { "UART echo P01 test" } elseif ($UartEchoTest) { "UART echo test" } elseif ($UartTxTest) { "UART TX test" } else { "build ID 9" }))"
& arm-none-eabi-gcc $Ldflags -o (Join-Path $Build "comms.elf") $Objects
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& arm-none-eabi-objcopy -O ihex   (Join-Path $Build "comms.elf") (Join-Path $Build "comms.hex")
& arm-none-eabi-objcopy -O binary (Join-Path $Build "comms.elf") (Join-Path $Build "comms.bin")

Write-Host ""
& arm-none-eabi-size (Join-Path $Build "comms.elf")
if ($Flash) {
    Write-Host ""
    Write-Host "  FLASH via pyOCD (DAPLink) -> hc32f005" -ForegroundColor Cyan
    & python -m pyocd flash -t hc32f005 (Join-Path $Build "comms.hex")
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  F005 firmware build OK" -ForegroundColor Cyan
if ($Direct -ne 0) {
    Write-Host "  DIRECT throttle mode: UART $Baud-8N1, 0x0002=0..100 -> duty 0..$MaxDuty%, electrical $DirectMinHz..$DirectMaxHz Hz" -ForegroundColor Cyan
    Write-Host "  Raise throttle = start + speed; lower to 0 = stop; explicit start/stop still supported." -ForegroundColor Cyan
} else {
    Write-Host "  SENSORLESS mode: HOLD $HoldMs ms -> PRECHARGE 300 ms -> ALIGN $AlignMs ms @ $AlignDuty% -> V/f $OpenLoopStartHz..$OpenLoopMaxHz Hz @ up to $OpenLoopMaxDuty%" -ForegroundColor Cyan
    Write-Host "  If it does not lock, do NOT raise voltage first. Check phase/BEMF sign." -ForegroundColor Yellow
}
Write-Host "======================================================" -ForegroundColor Cyan
