param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Prefix,
  [string]$Bucket = "lct-3d-models",
  [string]$LogDirectory = "$env:APPDATA\xdg.config\.wrangler\logs",
  [string]$LogNameFrom,
  [string]$LogNameTo,
  [int]$ThrottleLimit = 10,
  [int]$MaxAttempts = 5,
  [string]$NodePath = "C:\Program Files\nodejs\node.exe",
  [Parameter(Mandatory = $true)][string]$WranglerPath
)

$ErrorActionPreference = "Stop"
$env:NO_COLOR = "1"
$root = (Resolve-Path -LiteralPath $Source).Path
$wrangler = (Resolve-Path -LiteralPath $WranglerPath).Path
$logs = Get-ChildItem -LiteralPath $LogDirectory -File | Where-Object {
  (!$LogNameFrom -or $_.Name -ge $LogNameFrom) -and (!$LogNameTo -or $_.Name -le $LogNameTo)
}

$attempts = foreach ($log in $logs) {
  $text = Get-Content -LiteralPath $log.FullName -Raw
  $match = [regex]::Match($text, 'Creating object "([^"]+)"')
  if ($match.Success -and $match.Groups[1].Value.StartsWith("$Prefix/")) {
    [PSCustomObject]@{
      Key = $match.Groups[1].Value
      Succeeded = $text.Contains("Upload complete.")
    }
  }
}

$failedKeys = @($attempts | Group-Object Key | Where-Object { -not ($_.Group.Succeeded -contains $true) } | ForEach-Object Name | Sort-Object)
Write-Host "Retrying $($failedKeys.Count) keys that have no successful upload log."

$results = $failedKeys | ForEach-Object -Parallel {
  $key = $_
  $relative = $key.Substring($using:Prefix.Length + 1).Replace('/', [IO.Path]::DirectorySeparatorChar)
  $file = Join-Path $using:root $relative
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    return [PSCustomObject]@{ Key = $key; ExitCode = 2; Output = "Local source file not found: $file" }
  }
  $contentType = if ([IO.Path]::GetExtension($file).Equals('.json', [StringComparison]::OrdinalIgnoreCase)) { 'application/json; charset=utf-8' } else { 'application/octet-stream' }
  $exitCode = 1
  $output = @()
  for ($attempt = 1; $attempt -le $using:MaxAttempts -and $exitCode -ne 0; $attempt++) {
    $output = & $using:NodePath $using:wrangler r2 object put "$using:Bucket/$key" --file $file --content-type $contentType --remote --force 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and $attempt -lt $using:MaxAttempts) {
      Start-Sleep -Seconds ([Math]::Min(60, 10 * $attempt))
    }
  }
  [PSCustomObject]@{ Key = $key; ExitCode = $exitCode; Output = ($output | Out-String).Trim() }
} -ThrottleLimit $ThrottleLimit

$failed = @($results | Where-Object ExitCode -ne 0)
if ($failed.Count) {
  $failed | Format-List Key, ExitCode, Output
  throw "$($failed.Count) retry upload(s) failed."
}

Write-Host "Retry complete: $($results.Count) / $($failedKeys.Count) objects."
