# Script de Restauración para OVO2 (Docker)
Param(
    [string]$BackupFile
)

if (-not $BackupFile) {
    Write-Host "🔍 No se especificó archivo. Buscando el más reciente en 'backups'..." -ForegroundColor Yellow
    $backupDir = Join-Path $PSScriptRoot "..\backups"
    $latestBackup = Get-ChildItem -Path $backupDir -Filter "*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    
    if (-not $latestBackup) {
        Write-Host "❌ No se encontraron backups en el directorio." -ForegroundColor Red
        return
    }
    $BackupFile = $latestBackup.FullName
}

if (-not (Test-Path $BackupFile)) {
    Write-Host "❌ El archivo de backup no existe: $BackupFile" -ForegroundColor Red
    return
}

Write-Host "⚠️  ADVERTENCIA: Se restaurará la base de datos 'ovo2' desde $BackupFile." -ForegroundColor Yellow
Write-Host "   Esto reemplazará los datos actuales." -ForegroundColor Gray
$Confirm = Read-Host "¿Continuar? (S/n)"

if ($Confirm -ne "s") {
    Write-Host "🚫 Restauración cancelada." -ForegroundColor Cyan
    return
}

Write-Host "🔨 Restaurando base de datos..." -ForegroundColor Yellow

# Ejecutar el restore a través de Docker
try {
    Get-Content $BackupFile | docker exec -i ovo2-db mysql -u root --password=ovo_password_2024 ovo2
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Restauración exitosa." -ForegroundColor Green
    } else {
        Write-Host "❌ Error al restaurar. Revisa si el contenedor 'ovo2-db' está corriendo." -ForegroundColor Red
    }
} catch {
     Write-Host "❌ Ocurrió un error inesperado durante la restauración." -ForegroundColor Red
     Write-Error $_
}
