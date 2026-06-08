-- Schema for table device_allocations

CREATE TABLE `device_allocations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `allocation_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transfer_id` int DEFAULT NULL,
  `device_id` int DEFAULT NULL,
  `from_department` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `to_department` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `allocation_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `allocation_reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requester_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `receiver_user_id` int DEFAULT NULL,
  `receiver_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('pending','approved','rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uk_allocation_code` (`allocation_code`),
  KEY `idx_transfer_id` (`transfer_id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_receiver_user_id` (`receiver_user_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
