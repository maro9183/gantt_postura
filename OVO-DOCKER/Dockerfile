# Usa una imagen de Node.js ligera
FROM node:18-alpine

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos de configuración de dependencias primero para aprovechar la caché de capas
COPY backend/package*.json ./backend/

# Instala las dependencias en el directorio backend
WORKDIR /app/backend
RUN npm install --production

# Vuelve al directorio raíz de la app
WORKDIR /app

# Copia el resto del código (backend y frontend)
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Exponemos el puerto que usa la aplicación
EXPOSE 3000

# Comando para arrancar la aplicación
WORKDIR /app/backend
CMD ["node", "server.js"]
