-- Full Database Schema
-- Exported automatically

-- -----------------------------------------------------
-- Table `activity`
-- -----------------------------------------------------
CREATE TABLE `activity` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` int DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `user_id` (`user_id`),
  CONSTRAINT `activity_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=510001;

-- -----------------------------------------------------
-- Table `departments`
-- -----------------------------------------------------
CREATE TABLE `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `head_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30012;

-- -----------------------------------------------------
-- Table `device_allocations`
-- -----------------------------------------------------
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

-- -----------------------------------------------------
-- Table `device_serial_counters_v2`
-- -----------------------------------------------------
CREATE TABLE `device_serial_counters_v2` (
  `prefix` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_serial` int unsigned NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`prefix`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `device_transfers`
-- -----------------------------------------------------
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

-- -----------------------------------------------------
-- Table `devices`
-- -----------------------------------------------------
CREATE TABLE `devices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `device_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `manufacturer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'available',
  `value` decimal(15,2) DEFAULT '0.00',
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department_id` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purchase_date` date DEFAULT NULL,
  `warranty_expiry` date DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `maintenance_interval` int DEFAULT NULL,
  `created_by` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `img_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` int DEFAULT '1',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `device_code` (`device_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30001;

-- -----------------------------------------------------
-- Table `maintenance_tasks`
-- -----------------------------------------------------
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

-- -----------------------------------------------------
-- Table `repair_requests`
-- -----------------------------------------------------
CREATE TABLE `repair_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_id` int DEFAULT NULL,
  `device_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `issue_description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `reporter_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `priority` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `technician_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assignee_user_id` int DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `estimated_end_date` date DEFAULT NULL,
  `progress_note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `part_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vendor_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ordered_date` date DEFAULT NULL,
  `expected_arrival` date DEFAULT NULL,
  `cost` decimal(15,2) NOT NULL DEFAULT '0.00',
  `completed_date` date DEFAULT NULL,
  `resolution_result` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_repairs_status` (`status`),
  KEY `idx_repairs_priority` (`priority`),
  KEY `idx_repairs_created_at` (`created_at`),
  KEY `idx_repairs_device_id` (`device_id`),
  CONSTRAINT `fk_repair_device` FOREIGN KEY (`device_id`) REFERENCES `devices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- Table `role`
-- -----------------------------------------------------
CREATE TABLE `role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `role_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `permissions` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `role_name` (`role_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30004;

-- -----------------------------------------------------
-- Table `user_login_sessions`
-- -----------------------------------------------------
CREATE TABLE `user_login_sessions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `device_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `browser` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `login_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_active_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_current` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_user_login_sessions_user` (`user_id`),
  KEY `idx_user_login_sessions_last_active` (`last_active_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=30001;

-- -----------------------------------------------------
-- Table `users`
-- -----------------------------------------------------
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `role_id` int DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Hoạt động',
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `username` (`username`),
  KEY `fk_users_role` (`role_id`),
  KEY `idx_users_department_id` (`department_id`),
  KEY `fk_users_department` (`department_id`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `role` (`id`),
  CONSTRAINT `fk_users_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=90006;

