#!/bin/bash

# Script de Respaldo para OVO2 (Docker) - Versión Linux
DATE=$(date +%Y%m%d_%H%M)
BACKUP_DIR="$(dirname "$0")/../backups"
BACKUP_FILE="$BACKUP_DIR/ovo2_backup_$DATE.sql"

# Crear directorio de backups si no existe
if [ ! -d "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
    echo -e "\e[36m✅ Directorio 'backups' creado.\e[0m"
fi

echo -e "\e[33m📦 Iniciando respaldo de la base de datos...\e[0m"

# Ejecutar mysqldump a través de Docker
docker exec ovo2-db mysqldump -u root --password=ovo_password_2024 ovo2 > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo -e "\e[32m✅ Respaldo completado satisfactoriamente:\e[0m"
    echo -e "\e[90m   $BACKUP_FILE\e[0m"
else
    echo -e "\e[31m❌ Error: El comando de volcado falló. Asegúrate de que el contenedor 'ovo2-db' esté corriendo.\e[0m"
fi
