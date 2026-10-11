# 06 — Data Model, API และ Run Consistency

[กลับดัชนี](README.md) | [ต่อ: Deployment & Operations](07-deployment-operations.md)

## 1. ใครเป็นเจ้าของข้อมูล

- **Upstream MOPH Open Data**: ข้อมูลต้นทางระดับรายงาน; Backend เป็นผู้ร้องขอ/ตรวจคุณภาพ
- **PostgreSQL Backend-v2**: เก็บ Config, Reference, Sync History, Records, KPI Results และ Active Run
- **Public Fastify Read API**: ส่ง JSON ที่ validate ผ่าน SQL/read contracts
- **Public Next.js Frontend**: อ่านข้อมูล, ตรวจ shape/type, เชื่อม Dataset และ Catalog ที่ตรง Run แล้วสร้าง Presentation Model เท่านั้น

ห้ามใช้ Frontend เป็น Authority ของสูตร MOPH หรือออกแบบให้แก้ PostgreSQL ผ่าน Browser

## 2. Logical PostgreSQL Tables

| Table | บทบาท |
| --- | --- |
| `app_settings` | ค่า Current Year, Province Code, Quarter และ Config ขอบเขตที่อนุมัติ |
| `kpi_categories` | รหัส/ชื่อ/ลำดับหมวด KPI |
| `kpi_definitions` | KPI Registry (Physical/Virtual, Source Mapping, Target, Quarter, Link, Metadata) |
| `facilities` | อ้างอิงรหัสและชื่อหน่วยบริการ รวมความสัมพันธ์กับตำบล |
| `tambons` | อ้างอิงรหัสและชื่อตำบล |
| `sync_runs` | บันทึกการ Sync แต่ละครั้ง, Status, Counters, Activation |
| `source_records` | Raw/Normalized Source ที่ผูกกับ Sync Run รวม `raw_payload JSONB` |
| `kpi_results` | ผลตัวตั้ง/ตัวหารที่ Backend คำนวณต่อ Run, KPI, Period และ Area |
| `app_state` | Singleton State ชี้ `active_sync_run_id` ที่ API ต้องอ่าน |

SQL Constraints/Indexes/Migrations อยู่ที่ `pa-dashboard/backend/migrations/`; ต้องอ่าน SQL ก่อนเปลี่ยน Table/Column. ไม่ใช้แนวทาง “1 Table ต่อ 1 KPI”.

## 3. API Contract สำหรับ Public Browser

ทุก Endpoint ด้านล่างเป็น **GET** และ URL เกิดจาก `NEXT_PUBLIC_API_BASE_URL` ต่อกับ Path; CORS ต้องอนุญาต Browser Origin `https://9gotstory.github.io`

| Endpoint | รูปแบบระดับบน (Top-Level) | Client ใช้ทำอะไร |
| --- | --- | --- |
| `/api/v1/dashboard` | `{dataset, results}` | Active Run + 1 แถวต่อ KPI/Period/Area |
| `/api/v1/kpis` | `{activeSyncRunId, kpis}` | Active Snapshot ของ Metadata/KPI/Target |
| `/api/v1/facilities` | `{facilities}` | แผนที่หน่วยบริการ (Hospcode, Tambon) |
| `/api/v1/tambons` | `{tambons}` | รายชื่อตำบล |
| `/api/v1/sync-status` | Status/Counters/Latest Run | สำหรับการตรวจสอบ Backend; ไม่ได้เป็น 1 ใน 4 Public UI Fetch หลัก |
| `/api/v1/health/live` | Liveness | Backend Ops |
| `/api/v1/health/ready` | Readiness + DB check | Backend Ops |

ตัวอย่าง **โครงสร้างเพื่ออธิบาย ไม่ใช่ Payload ปัจจุบันทั้งหมด**:

~~~json
{
  "dataset": {
    "syncRunId": "1",
    "fiscalYear": 2569,
    "currentQuarter": 4,
    "activatedAt": "2026-10-01T00:00:00.000Z",
    "sourceLastUpdated": null
  },
  "results": [
    {
      "kpiKey": "s_anc5",
      "periodCode": "annual",
      "areacode": "5406",
      "hospcode": "06413",
      "target": 100,
      "result": 90
    }
  ]
}
~~~

ตัวเลข/วันที่/Row ในตัวอย่างนี้เป็น **ข้อมูลสมมติสำหรับอธิบาย Schema** ไม่ใช่ค่าผลลัพธ์จริง; `results` ของ Production มีหลายแถว/รายการ. KPI Catalog มี metadata เช่น `key`, `title`, `target`, `order`, `categoryCode`, `category`, `categoryOrder`, `subgroup`, `isQuarterly`, `targetMonths`, `effectiveQuarter`, `link`.

## 4. Feature 031 — ป้องกันข้อมูลคนละ Active Run

`src/lib/dashboard-data.ts` มี `parseKpiCatalogSnapshot` และ `loadConsistentDashboard`:

1. Fetch+Validate `/api/v1/dashboard` ก่อน ถ้า `dataset: null` และ `results: []` ถือว่า “ยังไม่มีชุดข้อมูล” ไม่ต้องขอ Endpoint อื่น
2. เมื่อมี Dataset ให้ Fetch `kpis`, `facilities`, `tambons`
3. **เทียบแบบ String Exact** ระหว่าง `dashboard.dataset.syncRunId` และ `catalog.activeSyncRunId` — ต้องเป็น Decimal String เช่น `"1"`; เมื่อไม่มี Active Catalog ยอมรับ `null` ตาม Contract
4. หาก Run ไม่ตรงกันเพราะ Dataset ถูก Activate ระหว่าง Fetch ให้ Reload **ทั้ง Dashboard + Catalog + References** ใหม่ 1 ครั้ง (สูงสุด 2 Attempts)
5. ถ้าผิดซ้ำ/Malformed/KPI Missing/Invalid Reference: **Throw Error, Fail Closed** ไม่แสดงเลขผสมหรือค่า Cache เก่าที่อาจหลอกว่าถูกต้อง
6. AbortSignal ทำให้ Cancel คำขอ/Delay/State Update เมื่อ Component Unmount หรือการโหลดถูกยกเลิก

หลัง Identity ผ่านแล้ว `buildDashboardModel` ตรวจว่า Catalog KPI ทุกตัวมี Rows, Results ไม่มี Unknown KPI, Period สอดคล้องกับ Catalog, Numeric Finite; สร้าง Aggregates และ Breakdown (Hospcode/Areacode Fallback) เพื่อการแสดงผล

## 5. Semantics ของ KPI

- `result` = ตัวตั้ง/จำนวนผล จาก Backend; `target` ใน Result Row = ตัวหาร/ฐานข้อมูลในการคิด %
- ถ้ามีตัวหาร >0 → `percentage = result / target * 100`
- `targetValue` ใน KPI Catalog = เกณฑ์ผ่าน เช่น 80; ต่างจาก `target` ใน Result Row
- `targetValue: null` ใช้ Fallback 80%; Explicit `0` ยังคงเป็น 0
- ตัวชี้วัดประเภท **raw-count** ซึ่งมี `totalTarget===0` แสดง “จำนวน” ไม่ตัดสินผ่านเกณฑ์หรือเก็บเป็นเปอร์เซ็นต์ใน Summary; ถ้ากรองจนตัวหารเป็นศูนย์ใน KPI เปอร์เซ็นต์ จะจัดเป็น “ไม่มีฐานประเมิน” แยกจาก raw-count
- Period Label ใช้ `periodCode` ของ Row และ `targetMonths` ที่ Backend ส่ง; ข้อมูล Annual/Quarterly ต้องไม่ผสมกัน
- Code Keys เป็น Machine ID ของ KPI; ห้ามเปลี่ยนโดยไม่มี Registry/Contract Migration

## 6. Consistency ที่ระดับ DB

Sync Runs ใหม่เป็นข้อมูลแยกจาก Active; บันทึก Source Records/Results ผูก Run ก่อน Activate. API Read Query ใช้ `app_state.active_sync_run_id` เป็นตัวชี้หลัก. Feature 031 เพิ่ม Snapshot Catalog Identity เพื่อให้หลาย HTTP GET ที่เกิดคนละจังหวะไม่ถูกประกอบข้าม Run.

## 7. ทดสอบ Live API เมื่อจะ Release

- ตรวจ 4 Endpoint คืน HTTP 200, JSON shape, CORS allow-list
- เทียบ `dataset.syncRunId` กับ `activeSyncRunId` หลังอ่าน Dashboard/KPI Catalog ในรอบใกล้กัน
- ตรวจ `KPI_COUNT`, `RESULT_COUNT`, `FACILITY_COUNT`, `TAMBON_COUNT` เพื่อจับ Drift (ไม่บังคับตัวเลขเดิมเป็นค่าคงที่)
- ตรวจ API Live **ที่ GitHub Actions Variable ใช้จริง** ไม่ใช่ API localhost ตัวอื่น
- หาก Catalog ยังเป็นรูปแบบ Legacy `{kpis: []}` ไม่มี `activeSyncRunId` — **ห้าม Deploy Frontend ที่บังคับ Feature 031**; ต้อง Cutover Backend ที่ได้รับอนุญาตก่อน

อ้างอิง: [Upstream Read API](https://github.com/9GotStory/pa-dashboard/blob/a3862692c7ffd8dda3c593fd029e1bb67b7fd68b/backend/src/modules/read-api.ts), [Public Loader](../../src/lib/dashboard-data.ts).
