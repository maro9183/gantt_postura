# Script de Respaldo para OVO2 (Docker)
$date = Get-Date -Format "yyyyMMdd_HHmm"
$backupDir = Join-Path $PSScriptRoot "..\backups"
$backupFile = Join-Path $backupDir "ovo2_backup_$date.sql"

# Crear directorio de backups si no existe
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
    Write-Host "✅ Directorio 'backups' creado." -ForegroundColor Cyan
}

Write-Host "📦 Iniciando respaldo de la base de datos..." -ForegroundColor Yellow

# Ejecutar mysqldump a través de Docker
try {
    docker exec ovo2-db mysqldump -u root --password=ovo_password_2024 ovo2 > $backupFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Respaldo completado satisfactoriamente:" -ForegroundColor Green
        Write-Host "   $backupFile" -ForegroundColor Gray
    } else {
        Write-Host "❌ Error: El comando de volcado falló. Asegúrate de que el contenedor 'ovo2-db' esté corriendo." -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Ocurrió un error inesperado al realizar el respaldo." -ForegroundColor Red
    Write-Error $_
}
