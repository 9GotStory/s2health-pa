-- PA Dashboard Backend v2
-- Corrective migration:
-- enforce sync_runs lifecycle and historical evidence invariants.
--
-- Forward-only. 0001 remains immutable.

CREATE FUNCTION guard_sync_run_lifecycle_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  active_run_id BIGINT;
BEGIN
  -- Run identity and configuration describe the historical
  -- synchronization attempt and cannot be rewritten later.
  IF (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.province_code
      IS DISTINCT FROM OLD.province_code
    OR NEW.fiscal_year
      IS DISTINCT FROM OLD.fiscal_year
    OR NEW.current_quarter
      IS DISTINCT FROM OLD.current_quarter
    OR NEW.expected_source_count
      IS DISTINCT FROM OLD.expected_source_count
    OR NEW.config_snapshot
      IS DISTINCT FROM OLD.config_snapshot
    OR NEW.started_at
      IS DISTINCT FROM OLD.started_at
  ) THEN
    RAISE EXCEPTION
      'Immutable sync run identity/configuration cannot change'
      USING ERRCODE = '23514';
  END IF;

  -- A running attempt may continue running or terminate once.
  IF OLD.status = 'running' THEN
    IF NEW.status NOT IN (
      'running',
      'succeeded',
      'failed'
    ) THEN
      RAISE EXCEPTION
        'Invalid sync run lifecycle transition'
        USING ERRCODE = '23514';
    END IF;

    -- Activation is deliberately separate from completion.
    -- A running -> succeeded transition therefore cannot
    -- manufacture activated_at.
    IF NEW.activated_at IS NOT NULL THEN
      RAISE EXCEPTION
        'Sync run cannot be activated during completion transition'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  -- Failed runs are terminal historical records.
  IF OLD.status = 'failed' THEN
    IF (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.completed_source_count
        IS DISTINCT FROM OLD.completed_source_count
      OR NEW.failed_source_count
        IS DISTINCT FROM OLD.failed_source_count
      OR NEW.finished_at
        IS DISTINCT FROM OLD.finished_at
      OR NEW.activated_at
        IS DISTINCT FROM OLD.activated_at
      OR NEW.error_summary
        IS DISTINCT FROM OLD.error_summary
    ) THEN
      RAISE EXCEPTION
        'Failed sync run is terminal'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  -- Succeeded runs are terminal except for the one-time
  -- activated_at transition performed by dataset activation.
  IF OLD.status = 'succeeded' THEN
    IF (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.completed_source_count
        IS DISTINCT FROM OLD.completed_source_count
      OR NEW.failed_source_count
        IS DISTINCT FROM OLD.failed_source_count
      OR NEW.finished_at
        IS DISTINCT FROM OLD.finished_at
      OR NEW.error_summary
        IS DISTINCT FROM OLD.error_summary
    ) THEN
      RAISE EXCEPTION
        'Succeeded sync run is terminal'
        USING ERRCODE = '23514';
    END IF;

    -- Once activation time exists it is historical evidence
    -- and cannot be rewritten.
    IF (
      OLD.activated_at IS NOT NULL
      AND NEW.activated_at
        IS DISTINCT FROM OLD.activated_at
    ) THEN
      RAISE EXCEPTION
        'Sync run activation timestamp cannot change'
        USING ERRCODE = '23514';
    END IF;

    -- First activation timestamp may be set only after
    -- app_state has atomically selected this run.
    IF (
      OLD.activated_at IS NULL
      AND NEW.activated_at IS NOT NULL
    ) THEN
      SELECT active_sync_run_id
      INTO active_run_id
      FROM app_state
      WHERE singleton_id = 1;

      IF active_run_id IS DISTINCT FROM NEW.id THEN
        RAISE EXCEPTION
          'Sync run activation timestamp requires active dataset pointer'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Unsupported prior sync run status %',
    OLD.status
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER trg_sync_runs_guard_lifecycle_update
BEFORE UPDATE
ON sync_runs
FOR EACH ROW
EXECUTE FUNCTION guard_sync_run_lifecycle_update();
