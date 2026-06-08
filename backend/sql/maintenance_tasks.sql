-- Schema for table maintenance_tasks

CREATE TABLE `maintenance_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_id` int DEFAULT NULL,
  `device_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `maintenance_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Định kỳ',
  `scheduled_date` date DEFAULT NULL,
  `technician_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `cost` decimal(15,2) NOT NULL DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_maintenance_status` (`status`),
  KEY `idx_maintenance_type` (`maintenance_type`),
  KEY `idx_maintenance_date` (`scheduled_date`),
  KEY `idx_maintenance_device` (`device_id`),
  CONSTRAINT `fk_maintenance_device` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
