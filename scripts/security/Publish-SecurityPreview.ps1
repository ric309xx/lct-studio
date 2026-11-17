# 於使用者 PowerShell 執行：僅建立預覽分支，不推送 main，不執行本機建置工具。
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$branchName = 'security-preview-20261118'
$checkoutRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.codex-tmp\preview-20261118'))
$expectedParent = [IO.Path]::GetFullPath((Join-Path $projectRoot '.codex-tmp')) + [IO.Path]::DirectorySeparatorChar
if (-not $checkoutRoot.StartsWith($expectedParent, [StringComparison]::OrdinalIgnoreCase)) { throw '預覽目錄位置不正確' }
if (Test-Path -LiteralPath $checkoutRoot) { throw '預覽目錄已存在；請交由助理確認，不要刪除或覆寫。' }
$base = 'd484d25fd09720387228e4ed5783fae02791ce3c'
Push-Location -LiteralPath $projectRoot
try {
  & git cat-file -e "$base`^{commit}"
  if ($LASTEXITCODE -ne 0) { throw '最新正式提交尚未下載' }
  & git -c gc.auto=0 worktree add -b $branchName $checkoutRoot $base
  if ($LASTEXITCODE -ne 0) { throw '無法建立隔離預覽工作目錄' }
  $files = Get-Content -LiteralPath (Join-Path $projectRoot 'scripts\security\preview-files.json') -Encoding UTF8 -Raw | ConvertFrom-Json
  foreach ($relative in $files) {
    if ($relative -match '(^|[\/])\.(local|env|git|codex-tmp)([\/]|$)' -or $relative -match 'secrets|access-passwords') { throw "不允許的檔案：$relative" }
    $sourcePath = [IO.Path]::GetFullPath((Join-Path $projectRoot $relative))
    $targetPath = [IO.Path]::GetFullPath((Join-Path $checkoutRoot $relative))
    if (-not $sourcePath.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $targetPath.StartsWith($checkoutRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '檔案路徑超出專案範圍' }
    New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($targetPath)) -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath
  }
  Push-Location -LiteralPath $checkoutRoot
  try {
    & git add --all
    if ($LASTEXITCODE -ne 0) { throw '預覽檔案加入失敗' }
    & git commit -m '整合最新官網功能與後端資安驗證，準備雲端預覽'
    if ($LASTEXITCODE -ne 0) { throw '預覽提交失敗' }
    & git -c gc.auto=0 push origin "HEAD:refs/heads/$branchName"
    if ($LASTEXITCODE -ne 0) { throw '預覽分支推送失敗，未更動 main' }
    Write-Host '預覽分支已推送；尚未發布正式官網。'
  } finally { Pop-Location }
} finally { Pop-Location }
