-- Schema for table device_serial_counters_v2

CREATE TABLE `device_serial_counters_v2` (
  `prefix` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_serial` int unsigned NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`prefix`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
