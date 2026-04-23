-- ============================================================
-- GANTT PROJECT TRACKER - Schema completo
-- La base de datos 'ovo2' es creada automáticamente por el servidor
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS proyectos (
  id_proyecto     INT AUTO_INCREMENT PRIMARY KEY,
  proyecto        VARCHAR(50)  NOT NULL,
  nombre_proyecto VARCHAR(255) NOT NULL,
  descripcion     TEXT,
  color           VARCHAR(20)  DEFAULT '#6366f1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recursos (
  id_recurso  INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(255) NOT NULL,
  area        VARCHAR(100),
  rol         VARCHAR(100),
  valor_hora  DECIMAL(10,2) DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS responsables (
  id_resp INT AUTO_INCREMENT PRIMARY KEY,
  nombre  VARCHAR(255) NOT NULL,
  correo  VARCHAR(255) UNIQUE NOT NULL,
  rol     VARCHAR(100),
  equipo  VARCHAR(100),
  foto    VARCHAR(500)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subresponsables (
  id_subresp INT AUTO_INCREMENT PRIMARY KEY,
  id_lead    INT NOT NULL,
  nombre     VARCHAR(255) NOT NULL,
  correo     VARCHAR(255) UNIQUE NOT NULL,
  FOREIGN KEY (id_lead) REFERENCES responsables(id_resp) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tareas (
  id_tarea                INT AUTO_INCREMENT PRIMARY KEY,
  id_proyecto             INT NOT NULL,
  id_parent               INT DEFAULT NULL,
  id_subresp              INT DEFAULT NULL,
  id_resp                 INT DEFAULT NULL,
  tarea                   VARCHAR(100),
  descripcion             TEXT,
  fecha_inicio            DATE,
  fecha_inicio_proyectada DATE,
  fecha_fin_proyectada    DATE,
  fecha_real_iniciada     DATE,
  duracion_dias           INT DEFAULT 1,
  fecha_fin               DATE,
  fecha_completada        DATE,
  estado                  VARCHAR(50) DEFAULT 'No comenzada',
  responsable             VARCHAR(255),
  avance                  DECIMAL(5,2) DEFAULT 0.00,
  dependencias            TEXT,
  costo_tarea             DECIMAL(10,2) DEFAULT 0.00,
  costo_real              DECIMAL(10,2) DEFAULT 0.00,
  fecha_creacion          DATETIME DEFAULT CURRENT_TIMESTAMP,
  notificado              TINYINT(1) DEFAULT 0,
  recursos                TEXT,
  fecha_iniciada          DATETIME,
  fecha_finalizada        DATETIME,
  tipo_dias               ENUM('calendario','laboral') DEFAULT 'calendario',
  auto_retrasada          TINYINT(1) DEFAULT 0,
  es_compra               TINYINT(1) DEFAULT 0,
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id_proyecto) ON DELETE CASCADE,
  FOREIGN KEY (id_parent)   REFERENCES tareas(id_tarea)       ON DELETE CASCADE,
  FOREIGN KEY (id_subresp)  REFERENCES subresponsables(id_subresp) ON DELETE SET NULL,
  FOREIGN KEY (id_resp)     REFERENCES responsables(id_resp)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dependencias (
  id_dependencia INT AUTO_INCREMENT PRIMARY KEY,
  id_tarea       INT NOT NULL,
  id_predecesora VARCHAR(50) NOT NULL,
  tipo           VARCHAR(10) DEFAULT 'FS',
  lag_dias       INT DEFAULT 0,
  FOREIGN KEY (id_tarea) REFERENCES tareas(id_tarea) ON DELETE CASCADE,
  UNIQUE KEY uq_dep (id_tarea, id_predecesora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tarea_recursos (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  id_tarea   INT NOT NULL,
  id_recurso INT NOT NULL,
  horas_plan DECIMAL(10,2) DEFAULT 0,
  horas_real DECIMAL(10,2) DEFAULT 0,
  FOREIGN KEY (id_tarea)   REFERENCES tareas(id_tarea)     ON DELETE CASCADE,
  FOREIGN KEY (id_recurso) REFERENCES recursos(id_recurso) ON DELETE CASCADE,
  UNIQUE KEY uq_tarea_recurso (id_tarea, id_recurso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS compras (
  id_compra               INT AUTO_INCREMENT PRIMARY KEY,
  id_tarea                INT DEFAULT NULL,
  id_proyecto             INT DEFAULT NULL,
  producto                VARCHAR(255) NOT NULL,
  descripcion             TEXT,
  cantidad                INT DEFAULT 1,
  valor_unitario          DECIMAL(12,2) DEFAULT 0.00,
  valor_total             DECIMAL(12,2) DEFAULT 0.00,
  id_solicitante          INT DEFAULT NULL,
  id_responsable          INT DEFAULT NULL,
  estado                  ENUM('solicitada','solicitando presupuesto','presupuesto recibido','OC emitida','fecha comprometida','entregado') DEFAULT 'solicitada',
  dias_arribo             INT DEFAULT 0,
  fecha_solicitud         DATE DEFAULT NULL,
  fecha_presupuesto_solic DATE DEFAULT NULL,
  fecha_presupuesto_recib DATE DEFAULT NULL,
  fecha_oc_emitida        DATE DEFAULT NULL,
  fecha_comprometida      DATE DEFAULT NULL,
  fecha_entregado         DATE DEFAULT NULL,
  fecha_arribo_estimada   DATE DEFAULT NULL,
  fecha_arribo_necesaria  DATE DEFAULT NULL,
  notas                   TEXT,
  dependencias            TEXT,
  links_facturas          TEXT,
  fecha_creacion          DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_tarea)       REFERENCES tareas(id_tarea)       ON DELETE SET NULL,
  FOREIGN KEY (id_proyecto)    REFERENCES proyectos(id_proyecto)  ON DELETE SET NULL,
  FOREIGN KEY (id_solicitante) REFERENCES responsables(id_resp)   ON DELETE SET NULL,
  FOREIGN KEY (id_responsable) REFERENCES responsables(id_resp)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notas (
  id_nota    INT AUTO_INCREMENT PRIMARY KEY,
  tarea      INT NOT NULL,
  nota       TEXT,
  adjunto    VARCHAR(500),
  link       VARCHAR(500),
  autor      VARCHAR(255),
  fecha_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tarea) REFERENCES tareas(id_tarea) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario      INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  nombre          VARCHAR(255) NOT NULL,
  permisos        VARCHAR(255) DEFAULT 'READ',
  proyectos       TEXT,
  es_admin        TINYINT(1) DEFAULT 0,
  activo          TINYINT(1) DEFAULT 1,
  fecha_creacion  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- SEED: Usuario administrador inicial
-- password: admin123  (bcryptjs, 10 rounds)
-- ============================================================

INSERT IGNORE INTO usuarios (email, password_hash, nombre, permisos, proyectos, es_admin, activo)
VALUES (
  'admin@ovo2.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWq',
  'Administrador',
  'ALL',
  'ALL',
  1,
  1
);
