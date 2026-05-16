
-- Enable push notifications feature flag
UPDATE feature_flags SET enabled = true WHERE feature_key = 'push_notifications';

-- Enable notifications for both admin accounts
UPDATE profiles SET notifications_enabled = true WHERE user_id IN (
  '9d8e406b-21db-408e-bf61-cce709f4a328',
  '4370f475-51d4-4d73-bf1c-27c0318f61cb'
);
