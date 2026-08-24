param(
  [string]$Bucket = "lct-3d-models",
  [string]$Source = "D:\Work\3D\20260810_\terra_b3dms",
  [string]$Prefix = "20260810/terra_b3dms",
  [int]$ThrottleLimit = 3,
  [int]$MaxAttempts = 3,
  [string]$NodePath = "C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
  [string]$WranglerPath = "C:\Users\User\AppData\Local\pnpm\store\v11\links\@\wrangler\4.125.0\db7a0711f436d237577c73c18abbe675b310426ffafee196ea40e6194f2de6d6\node_modules\wrangler\bin\wrangler.js"
)

$ErrorActionPreference = "Stop"
$env:NO_COLOR = "1"

if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
  throw "Source folder not found: $Source"
}

if (-not (Test-Path -LiteralPath (Join-Path $Source "tileset.json") -PathType Leaf)) {
  throw "tileset.json not found under: $Source"
}

if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
  throw "Node.js not found: $NodePath"
}

if (-not (Test-Path -LiteralPath $WranglerPath -PathType Leaf)) {
  throw "Wrangler not found: $WranglerPath"
}

function Get-ContentType {
  param([string]$Path)
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".json" { "application/json; charset=utf-8" }
    ".b3dm" { "model/vnd.b3dm" }
    ".glb" { "model/gltf-binary" }
    ".gltf" { "model/gltf+json" }
    ".bin" { "application/octet-stream" }
    default { "application/octet-stream" }
  }
}

$root = (Resolve-Path -LiteralPath $Source).Path
$items = Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {
  $relative = $_.FullName.Substring($root.Length).TrimStart("\", "/") -replace "\\", "/"
  [PSCustomObject]@{
    FullName = $_.FullName
    Key = "$Prefix/$relative"
    ContentType = Get-ContentType -Path $_.FullName
  }
}

Write-Host "Uploading $($items.Count) objects to private R2 bucket '$Bucket' with throttle $ThrottleLimit."
Write-Host "Existing objects may be overwritten safely; public access is not changed."

$results = $items | ForEach-Object -Parallel {
  $env:NO_COLOR = "1"
  $item = $_
  $attempt = 0
  $exitCode = 1
  $output = @()
  while (($attempt -lt $using:MaxAttempts) -and ($exitCode -ne 0)) {
    $attempt += 1
    $output = & $using:NodePath $using:WranglerPath r2 object put "$using:Bucket/$($item.Key)" --file $item.FullName --content-type $item.ContentType --remote --force 2>&1
    $exitCode = $LASTEXITCODE
    if (($exitCode -ne 0) -and ($attempt -lt $using:MaxAttempts)) {
      Start-Sleep -Seconds (2 * $attempt)
    }
  }
  [PSCustomObject]@{
    Key = $item.Key
    ExitCode = $exitCode
    Attempts = $attempt
    Output = ($output | Out-String).Trim()
  }
} -ThrottleLimit $ThrottleLimit

$failed = @($results | Where-Object ExitCode -ne 0)
if ($failed.Count -gt 0) {
  $failed | Format-List Key, ExitCode, Attempts, Output
  throw "$($failed.Count) object upload(s) failed. Re-run the script to retry."
}

Write-Host "Upload complete: $($results.Count) / $($items.Count) objects."
Write-Host "Top-level key: $Prefix/tileset.json"
