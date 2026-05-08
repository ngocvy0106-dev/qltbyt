-- Migration: Update device_allocations UNIQUE constraint
-- This allows multiple allocations per transfer to have same allocation_code
-- as long as they have different device_id or receiver_user_id combinations

-- Drop old UNIQUE constraint on allocation_code alone
ALTER TABLE device_allocations DROP KEY uk_allocation_code;

-- Add new composite UNIQUE constraint on (transfer_id, device_id, receiver_user_id)
-- This prevents duplicate allocations of the same device to the same person from the same transfer
ALTER TABLE device_allocations ADD UNIQUE KEY uk_transfer_device_receiver (transfer_id, device_id, receiver_user_id);

-- Add regular index on allocation_code for fast lookups (allows duplicates)
ALTER TABLE device_allocations ADD KEY idx_allocation_code (allocation_code);
