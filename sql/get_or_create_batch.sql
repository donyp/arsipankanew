-- Function to safely get or create a batch session for a user within a time window
-- This prevents race conditions during concurrent uploads
CREATE OR REPLACE FUNCTION get_or_create_recent_batch(target_user_id UUID, window_interval INTERVAL)
RETURNS UUID AS $$
DECLARE
    found_id UUID;
BEGIN
    -- Try to find a recent batch
    SELECT id INTO found_id 
    FROM upload_batches 
    WHERE uploader_id = target_user_id 
      AND created_at >= NOW() - window_interval 
    ORDER BY created_at DESC 
    LIMIT 1;

    -- If not found, create one
    IF found_id IS NULL THEN
        INSERT INTO upload_batches (uploader_id, total_files, success_files)
        VALUES (target_user_id, 0, 0)
        RETURNING id INTO found_id;
    END IF;

    RETURN found_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
