CREATE TABLE public.daily_metrics (
  day date PRIMARY KEY,
  checks integer NOT NULL DEFAULT 0,
  changed integer NOT NULL DEFAULT 0,
  detect_samples integer NOT NULL DEFAULT 0,
  detect_avg_ms double precision,
  detect_p95_ms double precision,
  delivery_sent integer NOT NULL DEFAULT 0,
  delivery_dead integer NOT NULL DEFAULT 0,
  delivery_avg_ms double precision,
  delivery_p95_ms double precision,
  sync_errors integer NOT NULL DEFAULT 0,
  health_samples integer NOT NULL DEFAULT 0,
  health_errors integer NOT NULL DEFAULT 0,
  health_p95_ms double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.daily_metrics TO service_role;

ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER daily_metrics_touch
BEFORE UPDATE ON public.daily_metrics
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.rollup_daily_metrics(p_day date DEFAULT (current_date - 1))
RETURNS public.daily_metrics
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d_from timestamptz := p_day::timestamptz;
  d_to   timestamptz := (p_day + 1)::timestamptz;
  row_out public.daily_metrics;
BEGIN
  INSERT INTO public.daily_metrics AS m (
    day, checks, changed, detect_samples, detect_avg_ms, detect_p95_ms,
    delivery_sent, delivery_dead, delivery_avg_ms, delivery_p95_ms,
    sync_errors, health_samples, health_errors, health_p95_ms
  )
  SELECT
    p_day,
    (SELECT count(*)::int FROM public.heartbeat_checks WHERE created_at >= d_from AND created_at < d_to),
    (SELECT count(*)::int FROM public.heartbeat_checks WHERE changed AND created_at >= d_from AND created_at < d_to),
    (SELECT count(*)::int FROM public.heartbeat_checks WHERE notify_ms IS NOT NULL AND created_at >= d_from AND created_at < d_to),
    (SELECT avg(notify_ms)::double precision FROM public.heartbeat_checks WHERE notify_ms IS NOT NULL AND created_at >= d_from AND created_at < d_to),
    (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY notify_ms) FROM public.heartbeat_checks WHERE notify_ms IS NOT NULL AND created_at >= d_from AND created_at < d_to),
    (SELECT count(*)::int FROM public.notification_outbox WHERE status = 'sent' AND created_at >= d_from AND created_at < d_to),
    (SELECT count(*)::int FROM public.notification_outbox WHERE status = 'dead' AND created_at >= d_from AND created_at < d_to),
    (SELECT avg(extract(epoch FROM (sent_at - created_at)) * 1000)::double precision FROM public.notification_outbox WHERE sent_at IS NOT NULL AND created_at >= d_from AND created_at < d_to),
    (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (sent_at - created_at)) * 1000) FROM public.notification_outbox WHERE sent_at IS NOT NULL AND created_at >= d_from AND created_at < d_to),
    (SELECT count(*)::int FROM public.sync_logs WHERE status = 'error' AND created_at >= d_from AND created_at < d_to),
    (SELECT count(*)::int FROM public.dulms_health_samples WHERE created_at >= d_from AND created_at < d_to),
    (SELECT count(*)::int FROM public.dulms_health_samples WHERE (status_code IS NULL OR status_code >= 400) AND created_at >= d_from AND created_at < d_to),
    (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FROM public.dulms_health_samples WHERE created_at >= d_from AND created_at < d_to)
  ON CONFLICT (day) DO UPDATE SET
    checks = EXCLUDED.checks,
    changed = EXCLUDED.changed,
    detect_samples = EXCLUDED.detect_samples,
    detect_avg_ms = EXCLUDED.detect_avg_ms,
    detect_p95_ms = EXCLUDED.detect_p95_ms,
    delivery_sent = EXCLUDED.delivery_sent,
    delivery_dead = EXCLUDED.delivery_dead,
    delivery_avg_ms = EXCLUDED.delivery_avg_ms,
    delivery_p95_ms = EXCLUDED.delivery_p95_ms,
    sync_errors = EXCLUDED.sync_errors,
    health_samples = EXCLUDED.health_samples,
    health_errors = EXCLUDED.health_errors,
    health_p95_ms = EXCLUDED.health_p95_ms
  RETURNING m.* INTO row_out;

  RETURN row_out;
END;
$$;

REVOKE ALL ON FUNCTION public.rollup_daily_metrics(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollup_daily_metrics(date) TO service_role;