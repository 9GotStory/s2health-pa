-- PA Dashboard Backend v2
-- Correct target_months semantics:
--   SMALLINT[] -> nullable SMALLINT
--
-- target_months represents one reporting/display
-- month count (1..12), not a set of months.
--
-- Safety policy:
--   []    -> NULL
--   [N]   -> N
--   [A,B] -> REFUSE migration
--
-- Applied migrations 0001/0002 remain immutable.

DO $$
DECLARE
  current_type OID;
BEGIN
  SELECT attribute.atttypid
  INTO current_type
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid =
      'kpi_definitions'::REGCLASS
    AND attribute.attname =
      'target_months'
    AND NOT attribute.attisdropped;

  IF current_type IS NULL THEN
    RAISE EXCEPTION
      'target_months column does not exist';
  END IF;

  IF current_type <>
      'SMALLINT[]'::REGTYPE::OID THEN
    RAISE EXCEPTION
      'Expected target_months type SMALLINT[], found %',
      current_type::REGTYPE;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM kpi_definitions
    WHERE cardinality(target_months) > 1
  ) THEN
    RAISE EXCEPTION
      'Refusing target_months scalar migration: multi-value target_months arrays exist';
  END IF;
END;
$$;

ALTER TABLE kpi_definitions
  DROP CONSTRAINT
    ck_kpi_definitions_target_months;

ALTER TABLE kpi_definitions
  ALTER COLUMN target_months
    DROP DEFAULT;

ALTER TABLE kpi_definitions
  ALTER COLUMN target_months
    DROP NOT NULL;

ALTER TABLE kpi_definitions
  ALTER COLUMN target_months
    TYPE SMALLINT
    USING (
      CASE
        WHEN cardinality(target_months) = 0
          THEN NULL
        ELSE target_months[1]
      END
    );

ALTER TABLE kpi_definitions
  ADD CONSTRAINT
    ck_kpi_definitions_target_months
  CHECK (
    target_months IS NULL
    OR target_months BETWEEN 1 AND 12
  );
