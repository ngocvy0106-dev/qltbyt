-- Schema for table device_transfers

CREATE TABLE `device_transfers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_id` int DEFAULT NULL,
  `device_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `serial_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `from_department` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_department` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `request_date` date DEFAULT NULL,
  `requester_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transfer_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_transfer_status` (`status`),
  KEY `idx_transfer_date` (`request_date`),
  KEY `idx_transfer_device` (`device_id`),
  CONSTRAINT `fk_transfer_device` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
