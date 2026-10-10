param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"

function Set-NormalizedPathEnvironment {
    param([string]$Value)

    Remove-Item Env:Path -ErrorAction SilentlyContinue
    Remove-Item Env:PATH -ErrorAction SilentlyContinue
    $env:Path = $Value
}

function Get-VisualStudioRoot {
    if ($env:VSINSTALLDIR -and (Test-Path -LiteralPath $env:VSINSTALLDIR)) {
        return $env:VSINSTALLDIR.TrimEnd('\')
    }

    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path -LiteralPath $vswhere) {
        $found = & $vswhere -latest -products * `
            -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
            -property installationPath | Select-Object -First 1
        if ($found) {
            return $found.Trim().TrimEnd('\')
        }
    }

    foreach ($candidate in @("D:\VS\VS", "D:\VS2022")) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw "Visual Studio with the MSVC x64 toolchain was not found."
}

function Assert-PathWithin {
    param(
        [string]$Path,
        [string]$Parent
    )

    $resolvedPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    $resolvedParent = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\')
    if (-not $resolvedPath.StartsWith($resolvedParent + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify path outside $resolvedParent`: $resolvedPath"
    }
    return $resolvedPath
}

function Get-CMakeExecutable {
    param([string]$VisualStudioRoot)

    $candidates = @()
    if ($VisualStudioRoot) {
        $candidates += Join-Path $VisualStudioRoot "Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
    }
    $cmakeCommand = Get-Command cmake.exe -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($cmakeCommand) {
        $candidates += $cmakeCommand.Source
    }

    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    throw "CMake was not found. Install the Visual Studio C++ CMake tools component."
}

# Keep only one casing of PATH. VS 2026 MSBuild rejects environments that
# contain both Path and PATH.
Set-NormalizedPathEnvironment $env:Path

$root = Split-Path -Parent $PSScriptRoot
$sourceRoot = $root
$mappedDrive = $null

# Qt qmlimportscanner breaks when the source path contains parentheses.
# Map the project to a temporary clean drive letter for that path shape.
if ($root -match '[()]') {
    foreach ($letter in @('R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z')) {
        $candidateDrive = "${letter}:"
        if (-not (Test-Path -LiteralPath "${candidateDrive}\")) {
            & subst $candidateDrive $root | Out-Null
            if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath "${candidateDrive}\")) {
                $mappedDrive = $candidateDrive
                $sourceRoot = "${candidateDrive}\"
            }
            break
        }
    }
}
$buildDir = Join-Path $sourceRoot "build"
$qtPrefix = "D:/Qt/6.8.3/msvc2022_64"
$qtConfig = Join-Path $qtPrefix "lib/cmake/Qt6/Qt6Config.cmake"
if (-not (Test-Path -LiteralPath $qtConfig)) {
    throw "Qt 6.8.3 MSVC 2022 64-bit was not found at $qtPrefix. Install 'MSVC 2022 64-bit' with Qt MaintenanceTool first."
}

$vsRoot = Get-VisualStudioRoot
$cmake = Get-CMakeExecutable $vsRoot
$vcvars64 = Join-Path $vsRoot "VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path -LiteralPath $vcvars64)) {
    throw "MSVC x64 environment script was not found: $vcvars64"
}

# Load the MSVC x64 environment before CMake and windeployqt run. Without
# VCINSTALLDIR, windeployqt cannot deploy the VC runtime DLLs.
$envOutput = & $env:ComSpec /d /s /c "call `"$vcvars64`" >nul && set"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to load the MSVC x64 environment from $vcvars64"
}

$vcPathLine = $envOutput | Where-Object { $_ -match '(?i)^PATH=' } | Select-Object -Last 1
if (-not $vcPathLine) {
    throw "Failed to read PATH from the MSVC environment."
}
$vcPath = $vcPathLine.Substring($vcPathLine.IndexOf('=') + 1)

foreach ($line in $envOutput) {
    if ($line -match '^([^=]+)=(.*)$' -and $matches[1] -ine 'PATH') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
}
Set-NormalizedPathEnvironment $vcPath
Write-Host "[HostSoftware] Loaded MSVC x64 environment from $vcvars64"

# If the project folder was renamed, the old CMakeCache.txt still points to
# the previous source path. Detect that mismatch and reconfigure from scratch.
$cacheFile = Join-Path $buildDir "CMakeCache.txt"
if (Test-Path -LiteralPath $cacheFile) {
    $cachedHomeLine = Select-String -LiteralPath $cacheFile -Pattern '^CMAKE_HOME_DIRECTORY:INTERNAL=' |
        Select-Object -First 1
    if ($cachedHomeLine) {
        $cachedHome = $cachedHomeLine.Line.Substring($cachedHomeLine.Line.IndexOf('=') + 1).Trim()
        $cachedFull = [System.IO.Path]::GetFullPath($cachedHome).TrimEnd('\')
        $sourceFull = [System.IO.Path]::GetFullPath($sourceRoot).TrimEnd('\')
        if (-not $cachedFull.Equals($sourceFull, [System.StringComparison]::OrdinalIgnoreCase)) {
            Write-Host "[HostSoftware] Detected stale CMake cache from: $cachedHome"
            Write-Host "[HostSoftware] Cleaning build cache so CMake can reconfigure..."
            Remove-Item -LiteralPath $cacheFile -Force
            $cmakeFilesDir = Assert-PathWithin (Join-Path $buildDir "CMakeFiles") $buildDir
            if (Test-Path -LiteralPath $cmakeFilesDir) {
                Remove-Item -LiteralPath $cmakeFilesDir -Recurse -Force
            }
        }
    }
}

$exitCode = 0
try {
    & $cmake -S $sourceRoot -B $buildDir `
        -G "Visual Studio 17 2022" `
        -A x64 `
        "-DCMAKE_PREFIX_PATH=$qtPrefix"
    if ($LASTEXITCODE -ne 0) {
        $exitCode = $LASTEXITCODE
    } else {
        & $cmake --build $buildDir --config $Configuration --parallel
        $exitCode = $LASTEXITCODE
    }
} finally {
    if ($mappedDrive) {
        & subst $mappedDrive /D | Out-Null
    }
}
exit $exitCode
