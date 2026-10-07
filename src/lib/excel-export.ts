import writeExcelFile from "write-excel-file/browser";

import type { KPISummary } from "./types";
import {
  DEFAULT_TARGET,
  roundPct,
} from "./kpi-utils";

const COLORS = {
  HEADER_BG: "#F1F5F9",
  PASS_BG: "#D1FAE5",
  PASS_TEXT: "#047857",
  FAIL_BG: "#FFE4E6",
  FAIL_TEXT: "#BE123C",
  BORDER: "#CBD5E1",
} as const;

type HorizontalAlignment =
  | "left"
  | "center"
  | "right";

type VerticalAlignment =
  | "top"
  | "center"
  | "bottom";

type CellStyle = {
  height?: number;

  align?: HorizontalAlignment;
  alignVertical?: VerticalAlignment;

  wrap?: boolean;

  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "bold";

  textColor?: string;
  backgroundColor?: string;

  borderColor?: string;
  borderStyle?: "thin";
};

type ExcelCell = CellStyle & {
  value: string | number;
};

type ExcelRow = ExcelCell[];

function createCell(
  value: string | number,
  style: CellStyle = {},
): ExcelCell {
  return {
    value,

    height: 24,

    borderColor: COLORS.BORDER,
    borderStyle: "thin",

    ...style,
  };
}

function createHeaderCell(
  value: string,
): ExcelCell {
  return {
    value,

    height: 30,

    fontFamily: "Sarabun",
    fontSize: 12,
    fontWeight: "bold",

    backgroundColor:
      COLORS.HEADER_BG,

    align: "center",
    alignVertical: "center",

    wrap: true,

    borderColor: COLORS.BORDER,
    borderStyle: "thin",
  };
}

function createResultStyle(
  isPass: boolean,
): CellStyle {
  return {
    align: "center",
    alignVertical: "center",

    backgroundColor:
      isPass
        ? COLORS.PASS_BG
        : COLORS.FAIL_BG,

    textColor:
      isPass
        ? COLORS.PASS_TEXT
        : COLORS.FAIL_TEXT,

    fontWeight: "bold",
  };
}

function createFacilityStyle(
  isPass?: boolean,
): CellStyle {
  if (isPass === undefined) {
    return {
      align: "center",
      alignVertical: "center",
    };
  }

  return {
    align: "center",
    alignVertical: "center",

    backgroundColor:
      isPass
        ? COLORS.PASS_BG
        : COLORS.FAIL_BG,

    textColor:
      isPass
        ? COLORS.PASS_TEXT
        : COLORS.FAIL_TEXT,
  };
}

export async function exportToExcel(
  data: KPISummary[],

  hospitalMap: Record<
    string,
    {
      name: string;
      tambon_id: string;
    }
  >,

  facilityKeys: string[],
) {
  const staticColumns = [
    {
      header: "#",
      width: 5,
    },
    {
      header: "หมวด",
      width: 22,
    },
    {
      header: "กลุ่มย่อย",
      width: 16,
    },
    {
      header:
        "ตัวชี้วัด (Indicator)",
      width: 40,
    },
    {
      header: "Target",
      width: 18,
    },
    {
      header: "Result (%)",
      width: 15,
    },
  ];

  const facilityColumns =
    facilityKeys.map(
      (key) => ({
        header:
          hospitalMap[key]?.name ||
          key,

        width: 12,
      }),
    );

  const columnDefinitions = [
    ...staticColumns,
    ...facilityColumns,
  ];

  const columns =
    columnDefinitions.map(
      ({ width }) => ({
        width,
      }),
    );

  const headerRow: ExcelRow =
    columnDefinitions.map(
      ({ header }) =>
        createHeaderCell(header),
    );

  const rows: ExcelRow[] =
    data.map(
      (kpi, index) => {
        const isRawCount =
          kpi.totalTarget === 0;

        const targetValue =
          kpi.targetValue ||
          DEFAULT_TARGET;

        const resultValue =
          isRawCount
            ? kpi.totalResult
            : roundPct(
                kpi.percentage,
              );

        const row: ExcelRow = [
          createCell(
            index + 1,
          ),

          createCell(
            kpi.category ?? "",
          ),

          createCell(
            kpi.subgroup ?? "",
          ),

          createCell(
            kpi.title,
            {
              alignVertical:
                "center",

              wrap: true,
            },
          ),

          createCell(
            `≥ ${targetValue} (${kpi.targetMonths} เดือน)`,
          ),

          createCell(
            resultValue,

            isRawCount
              ? {
                  align:
                    "center",

                  alignVertical:
                    "center",
                }
              : createResultStyle(
                  kpi.percentage >=
                    targetValue,
                ),
          ),
        ];

        for (
          const key
          of facilityKeys
        ) {
          const breakdown =
            kpi.breakdown?.[key];

          if (!breakdown) {
            row.push(
              createCell(
                "-",
                createFacilityStyle(),
              ),
            );

            continue;
          }

          if (isRawCount) {
            row.push(
              createCell(
                breakdown.result,

                createFacilityStyle(),
              ),
            );

            continue;
          }

          if (
            breakdown.target === 0
          ) {
            row.push(
              createCell(
                "-",
                createFacilityStyle(),
              ),
            );

            continue;
          }

          row.push(
            createCell(
              roundPct(
                breakdown.percentage,
              ),

              createFacilityStyle(
                breakdown.percentage >=
                  targetValue,
              ),
            ),
          );
        }

        return row;
      },
    );

  const sheetData: ExcelRow[] = [
    headerRow,
    ...rows,
  ];

  const date =
    new Date()
      .toISOString()
      .split("T")[0];

  await writeExcelFile(
    sheetData,
    {
      sheet:
        "PA Dashboard 2569",

      columns,
    },
  ).toFile(
    `pa-dashboard-${date}.xlsx`,
  );
}
