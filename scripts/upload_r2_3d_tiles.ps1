param(
  [string]$Bucket = "lct-3d-models",
  [string]$Source = "D:\Work\3D\20260810_\terra_b3dms",
  [string]$Prefix = "20260810/terra_b3dms"
)

$ErrorActionPreference = "Stop"
$env:NO_COLOR = "1"

if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
  throw "Source folder not found: $Source"
}

$tileset = Join-Path $Source "tileset.json"
if (-not (Test-Path -LiteralPath $tileset -PathType Leaf)) {
  throw "tileset.json not found: $tileset"
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

Write-Host "Checking Wrangler login..."
npx wrangler whoami

Write-Host "Ensuring R2 bucket exists: $Bucket"
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$bucketInfo = npx wrangler r2 bucket info $Bucket 2>&1
$bucketInfoExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($bucketInfoExitCode -eq 0) {
  Write-Host "Bucket already exists; continuing."
} else {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $createOutput = npx wrangler r2 bucket create $Bucket 2>&1
  $createExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  $createOutput | ForEach-Object { Write-Host $_ }
  if ($createExitCode -ne 0) {
    $createText = ($createOutput | Out-String)
    if ($createText -match "already exists|already own|BucketAlreadyExists") {
      Write-Host "Bucket already exists; continuing."
    } else {
      throw "Failed to create R2 bucket. See Wrangler output above."
    }
  }
}

Write-Host "Applying CORS from scripts/r2-cors.json"
npx wrangler r2 bucket cors set $Bucket --file scripts/r2-cors.json --force

Write-Host "Enabling public r2.dev URL for first-stage testing"
npx wrangler r2 bucket dev-url enable $Bucket

$root = (Resolve-Path -LiteralPath $Source).Path
$files = Get-ChildItem -LiteralPath $root -Recurse -File
$total = $files.Count
$index = 0

foreach ($file in $files) {
  $index += 1
  $relative = $file.FullName.Substring($root.Length).TrimStart("\", "/") -replace "\\", "/"
  $key = "$Prefix/$relative"
  $contentType = Get-ContentType -Path $file.FullName
  Write-Progress -Activity "Uploading 3D Tiles to R2" -Status "$index / $total $relative" -PercentComplete (($index / $total) * 100)
  if (($index -eq 1) -or ($index % 25 -eq 0) -or ($index -eq $total)) {
    Write-Host "Uploading $index / $total : $relative"
  }
  $uploadOutput = npx wrangler r2 object put "$Bucket/$key" --file "$($file.FullName)" --content-type "$contentType" --remote --force 2>&1
  if ($LASTEXITCODE -ne 0) {
    $uploadOutput | ForEach-Object { Write-Host $_ }
    throw "Failed uploading $relative"
  }
}

Write-Progress -Activity "Uploading 3D Tiles to R2" -Completed
Write-Host "Upload complete."
Write-Host "Top-level tileset key: $Prefix/tileset.json"
Write-Host "Use the r2.dev public URL ending with:"
Write-Host "/$Prefix/tileset.json"
