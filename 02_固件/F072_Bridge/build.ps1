#-------------------------------------------------------------------------------
# build.ps1 - HC32F072JATA build script (Windows PowerShell, no make needed)
#
# Usage:
#   .\build.ps1           Build (output build/hc32f072.elf/.hex/.bin)
#   .\build.ps1 -Clean    Clean build artifacts
#   .\build.ps1 -Flash    Build + flash via pyOCD (DAPLink)
#-------------------------------------------------------------------------------

param(
    [switch]$Clean,
    [switch]$Flash,
    [string]$ToolchainBin = $env:ARM_GCC_BIN
)

$ErrorActionPreference = "Continue"
$Base = $PSScriptRoot
$Build = Join-Path $Base "build"

if ($ToolchainBin -and (Test-Path (Join-Path $ToolchainBin "arm-none-eabi-gcc.exe"))) {
    $env:PATH = "$ToolchainBin;$env:PATH"
}

#-----------------------------------------------------------------------------
# Toolchain auto-detect: system PATH first, then local .toolchain folder
#-----------------------------------------------------------------------------
$gccExe = Get-Command "arm-none-eabi-gcc" -ErrorAction SilentlyContinue
if ($gccExe) {
    $ToolchainBin = Split-Path $gccExe.Source
} else {
    $localGcc = Get-ChildItem (Join-Path $Base ".toolchain") -Recurse `
        -Filter "arm-none-eabi-gcc.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $localGcc) {
        Write-Host "[ERROR] arm-none-eabi-gcc toolchain not found!" -ForegroundColor Red
        Write-Host "        Install xpack-arm-none-eabi-gcc and add it to PATH," -ForegroundColor Yellow
        Write-Host "        or extract the toolchain into the .toolchain folder." -ForegroundColor Yellow
        exit 1
    }
    $ToolchainBin = $localGcc.DirectoryName
}
$env:PATH = "$ToolchainBin;$env:PATH"

#-----------------------------------------------------------------------------
# Compiler flags (arrays: each element becomes one command line argument)
#-----------------------------------------------------------------------------
$CpuFlags  = @("-mcpu=cortex-m0plus", "-mthumb", "-mfloat-abi=soft")
$Includes  = @("-I$Base\core", "-I$Base\drivers\inc", "-I$Base\user", "-I$Base\additional", "-I$Base\cmsis")
$OptFlags  = @("-Og", "-g3", "-gdwarf-2", "-Wall",
               "-ffunction-sections", "-fdata-sections",
               "-std=c99", "-Wno-unused-parameter", "-Wno-main",
               "-Wno-maybe-uninitialized")
$Cflags    = $CpuFlags + $OptFlags + $Includes
$LdScript  = Join-Path $Base "ldscripts\hc32f072.ld"
$Ldflags   = $CpuFlags + @("-T", "$LdScript",
               "-Wl,--gc-sections", "-Wl,-Map=$Build\hc32f072.map",
               "-Wl,--no-warn-rwx-segments",
               "--specs=nano.specs",
               "-Wl,--start-group", "-lc", "-lm", "-Wl,--end-group")

# Helper: run native command, merge stderr into plain text to avoid
# PowerShell wrapping compiler warnings as red error records
function Invoke-Compiler {
    param([scriptblock]$Cmd)
    & $Cmd
    $code = $LASTEXITCODE
    return $code
}

#-----------------------------------------------------------------------------
# Source files
#-----------------------------------------------------------------------------
$Sources = @(
    (Join-Path $Base "core\startup_hc32f072.s"),
    (Join-Path $Base "core\system_hc32f072.c"),
    (Join-Path $Base "core\interrupts_hc32f072.c"),
    (Join-Path $Base "core\syscalls.c")
)
$Sources += (Get-ChildItem (Join-Path $Base "drivers\src\*.c") -ErrorAction SilentlyContinue).FullName
$Sources += (Get-ChildItem (Join-Path $Base "user\*.c") -ErrorAction SilentlyContinue).FullName
$Sources += (Get-ChildItem (Join-Path $Base "additional\*.c") -ErrorAction SilentlyContinue).FullName

$Sources = @($Sources | Where-Object { $_ })

#-----------------------------------------------------------------------------
# Main flow
#-----------------------------------------------------------------------------
if ($Clean) {
    if (Test-Path $Build) { Remove-Item $Build -Recurse -Force }
    Write-Host "[OK] cleaned" -ForegroundColor Green
    exit 0
}

New-Item -ItemType Directory -Force -Path $Build | Out-Null

$Objects = @()
foreach ($Src in $Sources) {
    $ObjName = [System.IO.Path]::GetFileNameWithoutExtension($Src) + ".o"
    $Obj = Join-Path $Build $ObjName
    Write-Host "  CC  $($Src.Substring($Base.Length + 1))"
    if ($Src -match '\.s$') {
        $rc = Invoke-Compiler { & arm-none-eabi-gcc $CpuFlags -x assembler-with-cpp $Includes -c $Src -o $Obj }
    } else {
        $rc = Invoke-Compiler { & arm-none-eabi-gcc $Cflags -c $Src -o $Obj }
    }
    if ($rc -ne 0) { exit $rc }
    $Objects += $Obj
}

Write-Host "  LD  hc32f072.elf"
$rc = Invoke-Compiler { & arm-none-eabi-gcc $Ldflags -o (Join-Path $Build "hc32f072.elf") $Objects }
if ($rc -ne 0) { exit $rc }

Write-Host "  OBJCOPY hc32f072.hex / .bin"
$null = Invoke-Compiler { & arm-none-eabi-objcopy -O ihex (Join-Path $Build "hc32f072.elf") (Join-Path $Build "hc32f072.hex") }
$null = Invoke-Compiler { & arm-none-eabi-objcopy -O binary (Join-Path $Build "hc32f072.elf") (Join-Path $Build "hc32f072.bin") }

Write-Host ""
Invoke-Compiler { & arm-none-eabi-size (Join-Path $Build "hc32f072.elf") }
if ($Flash) {
    Write-Host ""
    Write-Host "  FLASH via pyOCD (DAPLink)"
    $pyocdCmd = Get-Command "pyocd" -ErrorAction SilentlyContinue
    if ($pyocdCmd) {
        & pyocd flash -t hc32f072 (Join-Path $Build "hc32f072.hex")
    } else {
        & python -m pyocd flash -t hc32f072 (Join-Path $Build "hc32f072.hex")
    }
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Build OK: build/hc32f072.elf/.hex/.bin" -ForegroundColor Cyan
Write-Host "  Flash: .\build.ps1 -Flash   (DAPLink via pyOCD)" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan






