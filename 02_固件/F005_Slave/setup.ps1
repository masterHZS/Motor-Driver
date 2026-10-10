#-------------------------------------------------------------------------------
# setup.ps1 - One-click HC32F072JATA development environment setup
#
# Installs:
#   1. ARM GCC toolchain  (xpack-arm-none-eabi-gcc 12.3.1) into .toolchain/
#      - Mirrors: gh-proxy.com (GitHub proxy) -> GitHub direct
#      - SHA256 verified download
#   2. pyOCD (for DAPLink flash/debug) via pip
#      - Mirrors: Tsinghua PyPI -> Aliyun PyPI -> official PyPI
#   3. GNU Make (optional) via winget
#
# Usage:
#   .\setup.ps1               Full setup (idempotent, skips existing)
#   .\setup.ps1 -Toolchain    Only download/verify toolchain
#   .\setup.ps1 -Pyocd        Only install pyocd
#   .\setup.ps1 -Make         Only install make
#-------------------------------------------------------------------------------

param(
    [switch]$Toolchain,
    [switch]$Pyocd,
    [switch]$Make
)

$ErrorActionPreference = "Continue"
$Base = $PSScriptRoot
$ToolDir = Join-Path $Base ".toolchain"

#-----------------------------------------------------------------------------
# Constants
#-----------------------------------------------------------------------------
$ToolVer   = "12.3.1-1.1"
$ToolZip   = "xpack-arm-none-eabi-gcc-12.3.1-1.1-win32-x64.zip"
$ToolUrlGh = "https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack/releases/download/v$ToolVer/$ToolZip"
$ToolUrlProxy = "https://gh-proxy.com/$ToolUrlGh"
$ToolSha256 = "DCD941678C49B780869DB94D5AD3F036B1F18003B968B8AB62AF04648B265E92"

$PipMirrors = @(
    "https://pypi.tuna.tsinghua.edu.cn/simple",
    "https://mirrors.aliyun.com/pypi/simple/"
)

#-----------------------------------------------------------------------------
# Utilities
#-----------------------------------------------------------------------------
function Test-ToolchainExists {
    $gcc = Get-ChildItem $ToolDir -Recurse -Filter "arm-none-eabi-gcc.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    return ($null -ne $gcc)
}

function Invoke-Download {
    param([string]$Url, [string]$OutFile)
    try {
        curl.exe -L --retry 3 -sS -o $OutFile $Url
        return ($LASTEXITCODE -eq 0)
    } catch { return $false }
}

#-----------------------------------------------------------------------------
# 1. Toolchain
#-----------------------------------------------------------------------------
if ($Toolchain -or (-not $Toolchain -and -not $Pyocd -and -not $Make)) {
    Write-Host "==> [1/3] ARM GCC Toolchain (xpack $ToolVer)" -ForegroundColor Cyan

    if (Test-ToolchainExists) {
        Write-Host "    [SKIP] toolchain already present in .toolchain/" -ForegroundColor Green
    } else {
        New-Item -ItemType Directory -Force -Path $ToolDir | Out-Null
        $ZipPath = Join-Path $ToolDir $ToolZip

        Write-Host "    Downloading via gh-proxy.com (GitHub proxy)..."
        if (-not (Invoke-Download $ToolUrlProxy $ZipPath)) {
            Write-Host "    [WARN] gh-proxy.com failed, trying GitHub direct..." -ForegroundColor Yellow
            if (-not (Invoke-Download $ToolUrlGh $ZipPath)) {
                Write-Host "    [ERROR] Download failed from both sources." -ForegroundColor Red
                Write-Host "            Try a different mirror manually:" -ForegroundColor Yellow
                Write-Host "            $ToolUrlGh" -ForegroundColor Yellow
                exit 1
            }
        }

        Write-Host "    Verifying SHA256..."
        $hash = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash
        if ($hash -ne $ToolSha256) {
            Write-Host "    [ERROR] SHA256 mismatch! expected $ToolSha256" -ForegroundColor Red
            Write-Host "            got      $hash" -ForegroundColor Red
            Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
            exit 1
        }
        Write-Host "    SHA256 OK" -ForegroundColor Green

        Write-Host "    Extracting (this takes a moment)..."
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $ToolDir)
        Write-Host "    [OK] toolchain ready" -ForegroundColor Green
    }
}

#-----------------------------------------------------------------------------
# 2. pyOCD
#-----------------------------------------------------------------------------
if ($Pyocd -or (-not $Toolchain -and -not $Pyocd -and -not $Make)) {
    Write-Host "==> [2/3] pyOCD (DAPLink flash/debug)" -ForegroundColor Cyan

    $pyocdFound = Get-Command "pyocd" -ErrorAction SilentlyContinue
    if (-not $pyocdFound) {
        $s = python -c "import sysconfig;print(sysconfig.get_path('scripts'))" 2>$null
        $pyocdScript = Get-ChildItem $s -Filter "pyocd.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($pyocdScript) { $pyocdFound = $pyocdScript }
    }
    if ($pyocdFound) {
        Write-Host "    [SKIP] pyocd already installed" -ForegroundColor Green
    } else {
        $installed = $false
        foreach ($mirror in $PipMirrors) {
            Write-Host "    pip install via $mirror"
            python -m pip install --quiet --no-warn-script-location pyocd -i $mirror
            if ($LASTEXITCODE -eq 0) { $installed = $true; break }
        }
        if (-not $installed) {
            Write-Host "    pip install via official PyPI (fallback)"
            python -m pip install --quiet --no-warn-script-location pyocd
            $installed = ($LASTEXITCODE -eq 0)
        }
        if ($installed) {
            Write-Host "    [OK] pyocd installed" -ForegroundColor Green
        } else {
            Write-Host "    [ERROR] pyocd install failed" -ForegroundColor Red
            exit 1
        }
    }
}

#-----------------------------------------------------------------------------
# 3. GNU Make (optional)
#-----------------------------------------------------------------------------
if ($Make -or (-not $Toolchain -and -not $Pyocd -and -not $Make)) {
    Write-Host "==> [3/3] GNU Make (optional, for make commands)" -ForegroundColor Cyan
    $mkFound = Get-Command "make" -ErrorAction SilentlyContinue
    if (-not $mkFound) {
        $mkFound = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "make.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if ($mkFound) {
        Write-Host "    [SKIP] make already available" -ForegroundColor Green
    } else {
        Write-Host "    Installing via winget (ezwinports.make)..."
        winget install ezwinports.make --accept-package-agreements --accept-source-agreements --silent 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "    [OK] make installed (restart terminal for PATH)" -ForegroundColor Green
        } else {
            Write-Host "    [WARN] winget failed - install GNU make manually" -ForegroundColor Yellow
        }
    }
}

#-----------------------------------------------------------------------------
# Final verification
#-----------------------------------------------------------------------------
Write-Host ""
Write-Host "==================== VERIFICATION ====================" -ForegroundColor Cyan

$env:PATH = (Join-Path $ToolDir "xpack-arm-none-eabi-gcc-$ToolVer\bin") + ";" + $env:PATH

if (Test-ToolchainExists) {
    Write-Host "  [OK] toolchain  : $(arm-none-eabi-gcc --version | Select-Object -First 1)" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] toolchain" -ForegroundColor Red
}

$pyocdCmd = Get-Command "pyocd" -ErrorAction SilentlyContinue
if (-not $pyocdCmd) {
    $s = python -c "import sysconfig;print(sysconfig.get_path('scripts'))" 2>$null
    $pyocdCmd = Get-ChildItem $s -Filter "pyocd.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($pyocdCmd) {
    $t = & $pyocdCmd.FullName list --targets 2>$null | Select-String "hc32f072"
    if ($t) { Write-Host "  [OK] pyocd       : $(python -m pip show pyocd 2>$null | Select-String '^Version' | ForEach-Object {$_.Line}) (hc32f072 target: OK)" -ForegroundColor Green }
    else   { Write-Host "  [OK] pyocd installed but hc32f072 target missing" -ForegroundColor Yellow }
} else {
    Write-Host "  [FAIL] pyocd" -ForegroundColor Red
}

$mkFound = Get-Command "make" -ErrorAction SilentlyContinue
if (-not $mkFound) {
    $mkFound = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "make.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
}
if ($mkFound) { Write-Host "  [OK] make        : GNU Make" -ForegroundColor Green }
else          { Write-Host "  [WARN] make not found (build_comms.ps1 works without it)" -ForegroundColor Yellow }

Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  .uild_comms.ps1       # build firmware" -ForegroundColor White
Write-Host "  .uild_comms.ps1 -Flash# flash via DAPLink" -ForegroundColor White
Write-Host "  pyocd list             # check DAPLink connection" -ForegroundColor White
Write-Host "=====================================================" -ForegroundColor Cyan

