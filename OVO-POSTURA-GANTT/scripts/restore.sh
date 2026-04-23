#!/bin/bash

# Script de Restauración para OVO2 (Docker) - Versión Linux
BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo -e "\e[33m🔍 No se especificó archivo. Buscando el más reciente en 'backups'...\e[0m"
    BACKUP_DIR="$(dirname "$0")/../backups"
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.sql 2>/dev/null | head -1)
    
    if [ -z "$LATEST_BACKUP" ]; then
        echo -e "\e[31m❌ No se encontraron backups en el directorio.\e[0m"
        exit 1
    fi
    BACKUP_FILE="$LATEST_BACKUP"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "\e[31m❌ El archivo de backup no existe: $BACKUP_FILE\e[0m"
    exit 1
fi

echo -e "\e[33m⚠️  ADVERTENCIA: Se restaurará la base de datos 'ovo2' desde $BACKUP_FILE.\e[0m"
echo -e "\e[90m   Esto reemplazará los datos actuales.\e[0m"
read -p "¿Continuar? (s/n): " confirm

if [ "$confirm" != "s" ]; then
    echo -e "\e[36m🚫 Restauración cancelada.\e[0m"
    exit 0
fi

echo -e "\e[33m🔨 Restaurando base de datos...\e[0m"

# Ejecutar el restore a través de Docker
cat "$BACKUP_FILE" | docker exec -i ovo2-db mysql -u root --password=ovo_password_2024 ovo2

if [ $? -eq 0 ]; then
    echo -e "\e[32m✅ Restauración exitosa.\e[0m"
else
    echo -e "\e[31m❌ Error al restaurar. Revisa si el contenedor 'ovo2-db' está corriendo.\e[0m"
fi
