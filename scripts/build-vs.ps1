param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$sourceRoot = (& $env:ComSpec /d /s /c "for %I in (`"$root`") do @echo %~sI" |
    Select-Object -Last 1).Trim()
if (-not $sourceRoot) {
    throw "Failed to resolve a short path for: $root"
}

$buildDir = Join-Path $sourceRoot "build"
$qtPrefix = "D:/Qt/Qt6.8.3/6.8.3/msvc2022_64"

# Load the MSVC x64 environment before CMake and windeployqt run. Without
# VCINSTALLDIR, windeployqt cannot deploy the VC runtime DLLs.
$vsRoot = $env:VSINSTALLDIR
if (-not $vsRoot) {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path -LiteralPath $vswhere) {
        $vsRoot = (& $vswhere -latest -property installationPath | Select-Object -First 1).Trim()
    }
}
if (-not $vsRoot) {
    $vsRoot = "D:\VS2022"
}

$vcvars64 = Join-Path $vsRoot "VC\Auxiliary\Build\vcvars64.bat"
if (Test-Path -LiteralPath $vcvars64) {
    $envOutput = & $env:ComSpec /d /s /c "call `"$vcvars64`" >nul && set"
    if ($LASTEXITCODE -eq 0) {
        foreach ($line in $envOutput) {
            if ($line -match '^([^=]+)=(.*)$') {
                [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
            }
        }
        Write-Host "[HostSoftware] Loaded MSVC x64 environment from $vcvars64"
    }
}

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
            $cmakeFilesDir = Join-Path $buildDir "CMakeFiles"
            if (Test-Path -LiteralPath $cmakeFilesDir) {
                Remove-Item -LiteralPath $cmakeFilesDir -Recurse -Force
            }
        }
    }
}

& cmake -S $sourceRoot -B $buildDir `
    -G "Visual Studio 17 2022" `
    -A x64 `
    "-DCMAKE_BUILD_TYPE=$Configuration" `
    "-DCMAKE_PREFIX_PATH=$qtPrefix" `
    "-DCMAKE_EXPORT_COMPILE_COMMANDS=ON"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

& cmake --build $buildDir --config $Configuration
exit $LASTEXITCODE
