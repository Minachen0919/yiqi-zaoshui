-- Bedtime reminders: call the push function every 5 minutes
select cron.schedule(
  'bed-reminders',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://sbwxomplnuqrxshxepjj.supabase.co/functions/v1/push',
       headers := '{"Content-Type":"application/json"}'::jsonb,
       body := '{"type":"tick"}'::jsonb
     ) $$
);
