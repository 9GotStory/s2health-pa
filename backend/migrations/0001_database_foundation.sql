-- PA Dashboard Backend v2
-- Database Foundation
-- PostgreSQL 18
--
-- Domain tables: 9
--
-- Migration infrastructure table schema_migrations is managed
-- separately by the migration runner.

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE kpi_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY,

  code TEXT NOT NULL,
  name TEXT NOT NULL,

  sort_order INTEGER NOT NULL DEFAULT 0,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  CONSTRAINT pk_kpi_categories
    PRIMARY KEY (id),

  CONSTRAINT uq_kpi_categories_code
    UNIQUE (code)
);

CREATE TABLE kpi_definitions (
  id BIGINT GENERATED ALWAYS AS IDENTITY,

  kpi_key TEXT NOT NULL,
  title TEXT NOT NULL,

  category_id BIGINT NOT NULL,

  kind TEXT NOT NULL,
  source_sheet TEXT NOT NULL,

  source_id TEXT,
  value_prefix TEXT,
  subgroup TEXT,
  link TEXT,

  target_value NUMERIC,

  is_quarterly BOOLEAN NOT NULL DEFAULT FALSE,

  target_months SMALLINT[]
    NOT NULL
    DEFAULT ARRAY[]::SMALLINT[],

  effective_quarter SMALLINT,

  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  updated_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT pk_kpi_definitions
    PRIMARY KEY (id),

  CONSTRAINT uq_kpi_definitions_key
    UNIQUE (kpi_key),

  CONSTRAINT fk_kpi_definitions_category
    FOREIGN KEY (category_id)
    REFERENCES kpi_categories (id)
    ON DELETE RESTRICT,

  CONSTRAINT ck_kpi_definitions_kind
    CHECK (
      kind IN (
        'physical',
        'virtual'
      )
    ),

  CONSTRAINT ck_kpi_definitions_effective_quarter
    CHECK (
      effective_quarter IS NULL
      OR effective_quarter BETWEEN 1 AND 4
    ),

  CONSTRAINT ck_kpi_definitions_target_months
    CHECK (
      array_position(
        target_months,
        NULL
      ) IS NULL
      AND target_months <@
        ARRAY[
          1, 2, 3, 4, 5, 6,
          7, 8, 9, 10, 11, 12
        ]::SMALLINT[]
    )
);

CREATE TABLE tambons (
  id TEXT,

  district_id TEXT NOT NULL,
  name_th TEXT NOT NULL,
  zip_code TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  updated_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT pk_tambons
    PRIMARY KEY (id)
);

CREATE TABLE facilities (
  hospcode TEXT,
  hospname TEXT NOT NULL,

  tambon_id TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  updated_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT pk_facilities
    PRIMARY KEY (hospcode),

  CONSTRAINT fk_facilities_tambon
    FOREIGN KEY (tambon_id)
    REFERENCES tambons (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE sync_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY,

  status TEXT NOT NULL,

  province_code TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  current_quarter SMALLINT NOT NULL,

  expected_source_count INTEGER NOT NULL,

  completed_source_count INTEGER
    NOT NULL
    DEFAULT 0,

  failed_source_count INTEGER
    NOT NULL
    DEFAULT 0,

  config_snapshot JSONB NOT NULL,

  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,

  error_summary JSONB,

  CONSTRAINT pk_sync_runs
    PRIMARY KEY (id),

  CONSTRAINT ck_sync_runs_status
    CHECK (
      status IN (
        'running',
        'succeeded',
        'failed'
      )
    ),

  CONSTRAINT ck_sync_runs_current_quarter
    CHECK (
      current_quarter BETWEEN 1 AND 4
    ),

  CONSTRAINT ck_sync_runs_counts_nonnegative
    CHECK (
      expected_source_count >= 0
      AND completed_source_count >= 0
      AND failed_source_count >= 0
    ),

  CONSTRAINT ck_sync_runs_counts_within_expected
    CHECK (
      completed_source_count
        + failed_source_count
      <= expected_source_count
    ),

  CONSTRAINT ck_sync_runs_lifecycle
    CHECK (
      (
        status = 'running'
        AND finished_at IS NULL
        AND activated_at IS NULL
      )
      OR
      (
        status = 'succeeded'
        AND finished_at IS NOT NULL
        AND expected_source_count > 0
        AND completed_source_count
          = expected_source_count
        AND failed_source_count = 0
      )
      OR
      (
        status = 'failed'
        AND finished_at IS NOT NULL
        AND activated_at IS NULL
      )
    )
);

CREATE TABLE source_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY,

  sync_run_id BIGINT NOT NULL,

  source_name TEXT NOT NULL,
  source_sequence INTEGER NOT NULL,

  hospcode TEXT,
  areacode TEXT,
  date_com TEXT,
  b_year INTEGER,

  target NUMERIC,
  result NUMERIC,

  raw_payload JSONB NOT NULL,

  CONSTRAINT pk_source_records
    PRIMARY KEY (id),

  CONSTRAINT fk_source_records_sync_run
    FOREIGN KEY (sync_run_id)
    REFERENCES sync_runs (id)
    ON DELETE CASCADE,

  CONSTRAINT uq_source_records_run_source_sequence
    UNIQUE (
      sync_run_id,
      source_name,
      source_sequence
    ),

  CONSTRAINT ck_source_records_sequence
    CHECK (
      source_sequence >= 1
    ),

  CONSTRAINT ck_source_records_raw_payload_object
    CHECK (
      jsonb_typeof(raw_payload) = 'object'
    )
);

CREATE TABLE kpi_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY,

  sync_run_id BIGINT NOT NULL,
  kpi_definition_id BIGINT NOT NULL,

  fiscal_year INTEGER NOT NULL,
  period_code TEXT NOT NULL,

  areacode TEXT,
  hospcode TEXT,

  target NUMERIC,
  result NUMERIC,

  details JSONB NOT NULL DEFAULT '{}'::JSONB,

  calculated_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT pk_kpi_results
    PRIMARY KEY (id),

  CONSTRAINT fk_kpi_results_sync_run
    FOREIGN KEY (sync_run_id)
    REFERENCES sync_runs (id)
    ON DELETE CASCADE,

  CONSTRAINT fk_kpi_results_definition
    FOREIGN KEY (kpi_definition_id)
    REFERENCES kpi_definitions (id)
    ON DELETE RESTRICT,

  CONSTRAINT ck_kpi_results_period
    CHECK (
      period_code IN (
        'annual',
        'q1',
        'q2',
        'q3',
        'q4'
      )
    ),

  CONSTRAINT uq_kpi_results_logical
    UNIQUE NULLS NOT DISTINCT (
      sync_run_id,
      kpi_definition_id,
      fiscal_year,
      period_code,
      areacode,
      hospcode
    )
);

CREATE TABLE app_state (
  singleton_id SMALLINT,
  active_sync_run_id BIGINT,

  updated_at TIMESTAMPTZ NOT NULL,

  CONSTRAINT pk_app_state
    PRIMARY KEY (singleton_id),

  CONSTRAINT ck_app_state_singleton
    CHECK (
      singleton_id = 1
    ),

  CONSTRAINT fk_app_state_active_sync_run
    FOREIGN KEY (active_sync_run_id)
    REFERENCES sync_runs (id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_kpi_definitions_category_sort
  ON kpi_definitions (
    category_id,
    sort_order
  );

CREATE INDEX idx_facilities_tambon
  ON facilities (
    tambon_id
  );

CREATE INDEX idx_sync_runs_status_started
  ON sync_runs (
    status,
    started_at DESC
  );

CREATE INDEX idx_source_records_run_source
  ON source_records (
    sync_run_id,
    source_name
  );

CREATE INDEX idx_source_records_run_area
  ON source_records (
    sync_run_id,
    areacode
  );

CREATE INDEX idx_source_records_run_facility
  ON source_records (
    sync_run_id,
    hospcode
  );

CREATE INDEX idx_kpi_results_run_definition
  ON kpi_results (
    sync_run_id,
    kpi_definition_id
  );

CREATE INDEX idx_kpi_results_run_area
  ON kpi_results (
    sync_run_id,
    areacode
  );

CREATE INDEX idx_kpi_results_run_facility
  ON kpi_results (
    sync_run_id,
    hospcode
  );

CREATE FUNCTION guard_app_state_active_sync_run()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_run sync_runs%ROWTYPE;
BEGIN
  IF NEW.active_sync_run_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO target_run
  FROM sync_runs
  WHERE id = NEW.active_sync_run_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Cannot activate unknown sync run %',
      NEW.active_sync_run_id
      USING ERRCODE = '23503';
  END IF;

  IF (
    target_run.status <> 'succeeded'
    OR target_run.finished_at IS NULL
    OR target_run.expected_source_count <= 0
    OR target_run.completed_source_count
      <> target_run.expected_source_count
    OR target_run.failed_source_count <> 0
  ) THEN
    RAISE EXCEPTION
      'Sync run % is not eligible for activation',
      NEW.active_sync_run_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_app_state_validate_active_sync_run
BEFORE INSERT OR UPDATE
ON app_state
FOR EACH ROW
EXECUTE FUNCTION guard_app_state_active_sync_run();

INSERT INTO app_state (
  singleton_id,
  active_sync_run_id,
  updated_at
)
VALUES (
  1,
  NULL,
  NOW()
);
