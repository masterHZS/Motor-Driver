#-------------------------------------------------------------------------------
# flash_under_reset.ps1 - recover SWD when P27/P31 have been switched to UART0
#
#   .\flash_under_reset.ps1
#   .\flash_under_reset.ps1 -Image .\build_comms\comms.hex
#
# pyOCD's normal attach can fail with "No ACK" after the firmware has released
# SWD_USE_IO.  This wrapper first connects under nRESET to force the device back
# to its reset-time SWD pin state, halts it, then performs the normal flash.
#-------------------------------------------------------------------------------
param(
    [string]$Image = "",
    [string]$Target = "hc32f005",
    [string]$ToolchainBin = $env:ARM_GCC_BIN
)

$ErrorActionPreference = "Stop"
$Base = $PSScriptRoot
if (-not $Image) { $Image = Join-Path $Base "build_comms\comms.hex" }
$Image = (Resolve-Path $Image).Path

Write-Host "[1/2] connect under reset and halt" -ForegroundColor Cyan
& python -m pyocd commander -t $Target -M under-reset -q -c "reset halt"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/2] flash while halted: $Image" -ForegroundColor Cyan
& python -m pyocd flash -t $Target -M halt $Image
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "flash complete; target reset and running" -ForegroundColor Green
