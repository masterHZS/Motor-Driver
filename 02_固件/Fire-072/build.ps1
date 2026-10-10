#-------------------------------------------------------------------------------
# build.ps1 - Fire-072 (HC32F072JATA) build / flash script
#
# Usage:
#   .\build.ps1                build  -> build/fire072.elf/.hex/.bin
#   .\build.ps1 -Clean         clean build artifacts
#   .\build.ps1 -Flash         build + flash via pyOCD (DAPLink)
#   .\build.ps1 -Size          print firmware size only
#   .\build.ps1 -Verbose       echo full compiler/linker command lines
#
# NOTE: this script is deliberately ASCII-only. Windows PowerShell 5.1 decodes
#       BOM-less .ps1 files using the system ANSI code page, so non-ASCII text
#       here would break parsing on a GBK machine. Chinese documentation lives
#       in README.md and the source comments instead.
#
# NOTE: GNU make is not installed on this machine, so the source list is
#       expanded here. A Makefile is also provided for environments that have
#       make; both produce the same artifacts.
#-------------------------------------------------------------------------------

param(
    [switch]$Clean,
    [switch]$Flash,
    [switch]$Size,
    [switch]$Verbose,
    [switch]$Diag,
    [string]$ToolchainBin = $env:ARM_GCC_BIN
)

$ErrorActionPreference = "Stop"

$Base   = $PSScriptRoot
$Build  = Join-Path $Base "build"
$Target = "fire072"

#-----------------------------------------------------------------------------
# Toolchain auto-detect: hint -> PATH -> known local install dirs
#-----------------------------------------------------------------------------
function Resolve-Toolchain {
    param([string]$Hint)

    if ($Hint -and (Test-Path (Join-Path $Hint "arm-none-eabi-gcc.exe"))) { return $Hint }

    $cmd = Get-Command "arm-none-eabi-gcc" -ErrorAction SilentlyContinue
    if ($cmd) { return (Split-Path $cmd.Source) }

    foreach ($pattern in @(
        "$env:USERPROFILE\.toolchain-arm\xpack-arm-none-eabi-gcc-*\bin",
        "$Base\.toolchain\xpack-arm-none-eabi-gcc-*\bin",
        "C:\Program Files (x86)\Arm GNU Toolchain arm-none-eabi\*\bin"
    )) {
        $hit = Get-ChildItem $pattern -ErrorAction SilentlyContinue |
               Where-Object { Test-Path (Join-Path $_.FullName "arm-none-eabi-gcc.exe") } |
               Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

$ToolchainBin = Resolve-Toolchain -Hint $ToolchainBin
if (-not $ToolchainBin) {
    Write-Host "[ERROR] arm-none-eabi-gcc not found." -ForegroundColor Red
    Write-Host "        Install xpack-arm-none-eabi-gcc and add it to PATH," -ForegroundColor Yellow
    Write-Host "        or pass -ToolchainBin <dir>." -ForegroundColor Yellow
    exit 1
}

$GCC   = Join-Path $ToolchainBin "arm-none-eabi-gcc.exe"
$OBJCP = Join-Path $ToolchainBin "arm-none-eabi-objcopy.exe"
$SZ    = Join-Path $ToolchainBin "arm-none-eabi-size.exe"
$OD    = Join-Path $ToolchainBin "arm-none-eabi-objdump.exe"

Write-Host "[toolchain] $ToolchainBin" -ForegroundColor Cyan

if ($Clean) {
    if (Test-Path $Build) { Remove-Item -Recurse -Force $Build }
    Write-Host "[clean] removed $Build" -ForegroundColor Green
    if (-not $Flash -and -not $Size) { exit 0 }
}

if (-not (Test-Path $Build)) { New-Item -ItemType Directory -Force $Build | Out-Null }

#-----------------------------------------------------------------------------
# Source list
#-----------------------------------------------------------------------------
$CoreSrc = @(
    "core\startup_hc32f072.s",
    "core\system_hc32f072.c",
    "core\interrupts_hc32f072.c",
    "core\syscalls.c"
)
$DrvSrc  = Get-ChildItem (Join-Path $Base "drivers\src") -Filter *.c |
           ForEach-Object { "drivers\src\" + $_.Name }
$UserSrc = Get-ChildItem (Join-Path $Base "user") -Filter *.c -ErrorAction SilentlyContinue |
           ForEach-Object { "user\" + $_.Name }
$AppSrc  = Get-ChildItem (Join-Path $Base "Core\Src") -Filter *.c |
           ForEach-Object { "Core\Src\" + $_.Name }
$U8g2Src = Get-ChildItem (Join-Path $Base "Core\u8g2") -Filter *.c |
           ForEach-Object { "Core\u8g2\" + $_.Name }

$AllSrc = @($CoreSrc) + @($DrvSrc) + @($UserSrc) + @($AppSrc) + @($U8g2Src)

# Objects mirror the source tree under build\.
# NOTE: the DDL has drivers\src\adc.c and drivers\src\tim.c while the
#       application has Core\Src\adc.c and Core\Src\tim.c, so the object
#       directory layout must not be flattened.
$objects = @()
foreach ($rel in $AllSrc) {
    $obj    = Join-Path $Build ([System.IO.Path]::ChangeExtension($rel, ".o"))
    $objDir = Split-Path $obj -Parent
    if (-not (Test-Path $objDir)) { New-Item -ItemType Directory -Force $objDir | Out-Null }
    $objects += $obj
}

#-----------------------------------------------------------------------------
# Compiler / linker flags
#-----------------------------------------------------------------------------
$CpuFlags = @("-mcpu=cortex-m0plus", "-mthumb", "-mfloat-abi=soft")
# Relative include paths on purpose: the project lives under a path containing
# non-ASCII characters ("02_gujian"), and absolute -I arguments get mangled by
# the ANSI command line, which makes GCC fail to open the headers.
$Includes = @(
    "-ICore/Inc",
    "-ICore/u8g2",
    "-Icore",
    "-Idrivers/inc",
    "-Icmsis",
    "-Iuser"
)

$CFlags = $CpuFlags + @(
    "-Os", "-g3", "-gdwarf-2",
    "-Wall", "-Wextra",
    "-ffunction-sections", "-fdata-sections",
    "-std=c99",
    "-finput-charset=UTF-8",
    "-Wno-unused-parameter",
    "-Wno-maybe-uninitialized",
    "-Wno-main"          # 官方 DDL 约定 int32_t main(void)
) + $Includes

$AsFlags = $CpuFlags + @("-x", "assembler-with-cpp") + $Includes

$LdFlags = $CpuFlags + @(
    "-T", "ldscripts/hc32f072.ld",
    "-Wl,--gc-sections",
    "-Wl,-Map=build/$Target.map",
    "-Wl,--no-warn-rwx-segments",
    "--specs=nano.specs",
    "-Wl,--start-group", "-lc", "-lm", "-Wl,--end-group"
)

$script:WarnCount = 0
$script:ErrFile  = Join-Path $Build "_gcc_out.txt"

<#
  Run a tool and surface its diagnostics.
  Output is redirected to a file and then read back: capturing stderr into a
  PowerShell variable makes PS 5.1 wrap every GCC diagnostic in a
  NativeCommandError, which buries the actual compiler message.
#>
function Invoke-Tool {
    param([string]$Exe, [string[]]$ArgList, [string]$What)

    if ($Verbose) { Write-Host "  $Exe $($ArgList -join ' ')" -ForegroundColor DarkGray }

    if ($Diag) {
        # Diagnostic mode: let cmd.exe do the redirection so GCC diagnostics
        # land verbatim in the file. Capturing stderr through PowerShell makes
        # PS 5.1 wrap every line in a NativeCommandError and truncate the text.
        $argLine = ($ArgList | ForEach-Object {
            if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
        }) -join ' '
        $cmd = '""' + $Exe + '" ' + $argLine + ' 2>&1"'
        $out = cmd /c $cmd
        $code = $LASTEXITCODE
    } else {
        & $Exe @ArgList *> $script:ErrFile
        $code = $LASTEXITCODE
        $out = @()
        if (Test-Path $script:ErrFile) { $out = [System.IO.File]::ReadAllLines($script:ErrFile) }
    }

    foreach ($line in @($out)) {
        $s = "$line"
        if ($s.Trim().Length -eq 0) { continue }
        if ($s -match "warning:") { $script:WarnCount++ }
        if ($code -ne 0) { Write-Host "    $s" -ForegroundColor DarkYellow }
        elseif ($Verbose) { Write-Host "    $s" -ForegroundColor DarkGray }
    }

    if ($code -ne 0) {
        Write-Host "[FAIL] $What (exit $code)" -ForegroundColor Red
        exit 1
    }
}

#-----------------------------------------------------------------------------
# Compile  (working directory must be the project root for the relative
#           include paths and the relative -T linker script to resolve)
#-----------------------------------------------------------------------------
Push-Location $Base
try {
    Write-Host "[build] $($AllSrc.Count) source files" -ForegroundColor Cyan
    $n = 0
    for ($i = 0; $i -lt $AllSrc.Count; $i++) {
        $rel = $AllSrc[$i]
        $obj = $objects[$i]
        $n++
        Write-Host ("  [{0,3}/{1}] {2}" -f $n, $AllSrc.Count, $rel)

        if ($rel.EndsWith(".s")) {
            Invoke-Tool $GCC ($AsFlags + @("-c", $rel, "-o", $obj)) $rel
        } else {
            Invoke-Tool $GCC ($CFlags + @("-c", $rel, "-o", $obj)) $rel
        }
    }

    #-------------------------------------------------------------------------
    # Link
    #-------------------------------------------------------------------------
    $Elf = Join-Path $Build "$Target.elf"
    Write-Host "[link] $Target.elf" -ForegroundColor Cyan
    Invoke-Tool $GCC ($LdFlags + @("-o", $Elf) + $objects) "link"

    Invoke-Tool $OBJCP @("-O", "ihex", $Elf, (Join-Path $Build "$Target.hex")) "objcopy hex"
    Invoke-Tool $OBJCP @("-O", "binary", $Elf, (Join-Path $Build "$Target.bin")) "objcopy bin"

    Write-Host ""
    & $SZ $Elf
    Write-Host ""
} finally {
    Pop-Location
}
if ($script:WarnCount -gt 0) {
    Write-Host "[note] $($script:WarnCount) compiler warning(s) - see log above" -ForegroundColor Yellow
}
Write-Host "======================================================" -ForegroundColor Green
Write-Host "  Build OK -> build\$Target.elf / .hex / .bin" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green

#-----------------------------------------------------------------------------
# Flash
#-----------------------------------------------------------------------------
if ($Flash) {
    Write-Host "[flash] pyOCD -> hc32f072" -ForegroundColor Cyan
    $pyocd = Get-Command "pyocd" -ErrorAction SilentlyContinue
    if (-not $pyocd) {
        Write-Host "[ERROR] pyocd not found. Run: pip install pyocd" -ForegroundColor Red
        exit 1
    }
    & $pyocd.Source flash -t hc32f072 (Join-Path $Build "$Target.hex")
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "[flash] done" -ForegroundColor Green
}
