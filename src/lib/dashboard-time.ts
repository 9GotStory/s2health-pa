export const DASHBOARD_TIME_ZONE = "Asia/Bangkok";

/**
 * Format a calendar date using the dashboard's canonical timezone.
 *
 * Use formatToParts instead of locale ordering so the returned value is
 * deterministically YYYY-MM-DD regardless of runtime locale.
 */
export function formatDashboardDate(
  date: Date,
): string {
  const parts = new Intl.DateTimeFormat(
    "en",
    {
      timeZone: DASHBOARD_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    },
  ).formatToParts(date);

  const values = new Map(
    parts.map((part) => [
      part.type,
      part.value,
    ]),
  );

  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");

  if (!year || !month || !day) {
    throw new Error(
      "Unable to format dashboard date",
    );
  }

  return `${year}-${month}-${day}`;
}
