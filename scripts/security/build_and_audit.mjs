// 先確認已整合正式站功能，避免舊原始碼覆蓋較新的部署。
await import('./check_source_base.mjs');
if(process.exitCode)process.exit(process.exitCode);
// 發布前先打包，再以嚴格模式阻止已知的憑證或私人檔案外洩。
await import('../build_public_site.mjs');
process.argv.push('--strict');
await import('./audit_public_site.mjs');
