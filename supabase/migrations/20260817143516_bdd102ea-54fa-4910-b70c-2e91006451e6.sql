UPDATE public.app_settings
SET value = jsonb_set(value::jsonb, '{labels,courses}', '"Courses"'::jsonb, true)::text
WHERE key = 'bot_config';