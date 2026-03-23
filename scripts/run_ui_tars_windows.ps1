param(
  [string]$MirrorRoot = (Join-Path $env:USERPROFILE "aria-app-win"),
  [string]$BridgeBaseUrl = "http://127.0.0.1:8000/v1",
  [string]$VlmProvider = "Hugging Face for UI-TARS-1.5",
  [string]$VlmApiKey = "dummy-key",
  [string]$VlmModelName = "cuakg-default",
  [ValidateSet("preview", "dev", "build")]
  [string]$AppMode = "preview",
  [string]$ModelTimeoutMs = "300000"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$localMirrorRoot = $MirrorRoot

Write-Host "Repo root: $repoRoot"
Write-Host "Starting UI-TARS in Windows from the WSL checkout..."
Write-Host "Mirroring repo to: $localMirrorRoot"
Write-Host "This avoids pnpm workspace-link issues on UNC paths."
Write-Host "Using bridge: $BridgeBaseUrl"
Write-Host "App mode: $AppMode"

$null = New-Item -ItemType Directory -Force -Path $localMirrorRoot

$robocopyArgs = @(
  $repoRoot,
  $localMirrorRoot,
  "/MIR",
  "/XD", ".git",
  "/XD", "node_modules",
  "/XD", ".turbo",
  "/XD", "dist",
  "/XD", "out",
  "/XD", ".next",
  "/XF", "pnpm-debug.log"
)

Write-Host "Syncing files..."
& robocopy.exe @robocopyArgs

if ($LASTEXITCODE -ge 8) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

$escapedLocalMirrorRoot = $localMirrorRoot.Replace('"', '""')
$escapedBridgeBaseUrl = $BridgeBaseUrl.Replace('"', '""')
$escapedVlmProvider = $VlmProvider.Replace('"', '""')
$escapedVlmApiKey = $VlmApiKey.Replace('"', '""')
$escapedVlmModelName = $VlmModelName.Replace('"', '""')
$escapedModelTimeoutMs = $ModelTimeoutMs.Replace('"', '""')

$commands = @(
  "set ELECTRON_RUN_AS_NODE=",
  "set UI_TARS_BOOTSTRAP_VLM_SETTINGS=1",
  "set VLM_PROVIDER=$escapedVlmProvider",
  "set VLM_BASE_URL=$escapedBridgeBaseUrl",
  "set VLM_API_KEY=$escapedVlmApiKey",
  "set VLM_MODEL_NAME=$escapedVlmModelName",
  "set UI_TARS_MODEL_TIMEOUT_MS=$escapedModelTimeoutMs",
  "corepack pnpm install --ignore-scripts",
  "corepack pnpm --dir apps\ui-tars run build:deps"
)

if ($AppMode -eq "dev") {
  $commands += "corepack pnpm --dir apps\ui-tars run dev"
} elseif ($AppMode -eq "build") {
  $commands += "corepack pnpm --dir apps\ui-tars run build:dist"
} else {
  $commands += "corepack pnpm --dir apps\ui-tars run build:dist"
  $commands += "corepack pnpm --dir apps\ui-tars run start:dist"
}

$cmd = "cd /d ""$escapedLocalMirrorRoot""&&" + ($commands -join "&&")

cmd.exe /d /c $cmd
