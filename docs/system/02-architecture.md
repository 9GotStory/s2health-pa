# 02 — สถาปัตยกรรมและการไหลของข้อมูล

[กลับดัชนี](README.md) | [ต่อ: Repository Map](03-repository-map.md)

## 1. Architecture ระดับระบบ

~~~text
MOPH Open Data (report_data)
           | HTTPS, fetch 18 physical sources
           v
Fedora / rootless Podman / private application network
+------------------------------------------------------+
| One-shot MOPH Sync -> source_records -> KPI compute   |
|                   -> kpi_results                     |
|                   -> atomic active_sync_run_id       |
|                            |                         |
| PostgreSQL 18 <---- Fastify Backend-v2 API           |
|  private volume       GET /api/v1/*                   |
+----------------------------|-------------------------+
                             | host-local loopback
                             v
                   Tailscale Funnel HTTPS
                      public API origin
                             ^
                             | HTTPS + CORS (GET JSON)
                             |
  Browser <-- HTML/JS/CSS -- GitHub Pages static export
                       s2health-pa
~~~

Diagram แสดง **logical data path ที่ใช้กับ Public Edition** ไม่ใช่ผังทุก Network Interface/Service ของ Fedora. Backend source ยังมี self-hosted Next.js Web ภายในสำหรับ use case แยกต่างหาก; GitHub Pages ไม่ได้ Reverse Proxy ผ่าน Self-hosted Web.

## 2. ฝั่ง Browser / Public Frontend

- `next.config.ts` ตั้ง `output: 'export'`, `trailingSlash: true`, ปิด optimization ที่ต้องมี Image Server และใช้ `NEXT_PUBLIC_BASE_PATH`
- GitHub Pages URL คือ `https://9gotstory.github.io/s2health-pa/`, Base Path สำหรับ build คือ `/s2health-pa`
- Browser เรียก `NEXT_PUBLIC_API_BASE_URL + /api/v1/...` โดยตรง; ค่า Origin ถูก inject ขณะ Build ผ่าน GitHub Repository Variable `PUBLIC_API_BASE_URL`
- Client ส่ง `Accept: application/json`, `mode: cors`, `credentials: omit`, `cache: no-store` และใช้ AbortSignal เพื่อเลิกคำขอเมื่อ unmount
- ไม่มี Server-Side API หรือ Next.js Runtime บน GitHub Pages; การแก้ env variable เพียงอย่างเดียวไม่เปลี่ยน bundle ที่ Deploy แล้วจนกว่า Build ใหม่

## 3. ฝั่ง Fedora และ Trust Boundary

- Public GET API: Fastify Backend-v2 ทำงานหลัง Tailscale Funnel HTTPS; Config CORS อนุญาต Origin ของ GitHub Pages
- API container ฟัง port 3001 ภายใน, host-local ingress ผ่าน loopback `127.0.0.1:13001` ตามเอกสาร Infra; **อย่า publish host API เป็น 0.0.0.0**
- PostgreSQL ไม่ publish host port; DB ใช้ private Podman Network
- Web/API/DB/Sync ใช้ OCI images + Quadlet ตามขอบเขต deployment ที่ได้รับอนุญาต
- Prometheus/Grafana เป็นเครื่องมือติดตามของ Fedora; ไม่ใช่โค้ด UI Dashboard บน GitHub Pages
- โปรดแยก **Repo Architecture Intent** (`infra/README.md`, ADR) ออกจาก **Host State**: การมี template หรือ workflow ไม่ได้ยืนยันว่าบริการ/timer/backup แต่ละส่วนทำงานแล้ว

## 4. Data Lifecycle — จาก MOPH ถึงจอ

1. Database seed กำหนด `app_settings`, `kpi_categories` และ `kpi_definitions` แบบ config-driven
2. Sync one-shot อ่าน Config, ล็อกงาน และสร้าง `sync_runs` ใหม่แยกจาก active dataset
3. ดึงข้อมูล 18 Physical Source จาก `https://opendata.moph.go.th/api/report_data` แล้ว validate/save ลง `source_records`
4. คำนวณ KPI ที่ประกาศไว้จาก Physical/Virtual Source เป็น `kpi_results` ของ run ใหม่นั้น
5. ตรวจ completeness/ความถูกต้องและ activate โดยเปลี่ยนตัวชี้ `app_state.active_sync_run_id` อย่างเป็นธุรกรรม (atomic)
6. `/api/v1/dashboard` ส่ง dataset+results ของ Active Run; `/api/v1/kpis` ส่ง `{activeSyncRunId, kpis}` จาก Active Snapshot
7. Frontend โหลดสอง Endpoint อย่างสอดคล้อง; หาก Identity ต่างกันระหว่าง activate ให้ reload แบบ bounded ก่อนสร้าง Model และแสดงผล

**หลักการ:** Sync ที่ล้มเหลวหรือไม่ครบ **ต้องไม่กลายเป็นข้อมูล Active Public**; Dashboard จะไม่แสดงการจับคู่ Catalog กับ Results จากคนละ Run

## 5. ขอบเขตข้อมูลส่วนบุคคล

API ที่ใช้งานสาธารณะเป็นข้อมูล KPI เชิงสรุประดับพื้นที่/หน่วยบริการตาม Contract ปัจจุบัน ไม่ใช่ EHR/PHR หรือ Record คนไข้. การเพิ่ม Field/Endpoint ใหม่ต้องตรวจ Privacy Classification, CORS, API authorization และ Export Boundary ใหม่ทุกครั้ง.

## 6. จุดอ้างอิง

- [Backend v2 Architecture ADR](https://github.com/9GotStory/pa-dashboard/blob/a3862692c7ffd8dda3c593fd029e1bb67b7fd68b/docs/architecture/0001-backend-v2-architecture.md)
- [Deployment Foundation](https://github.com/9GotStory/pa-dashboard/blob/a3862692c7ffd8dda3c593fd029e1bb67b7fd68b/infra/README.md)
- [Public Upstream Policy](../frontend-upstream.md)
- [06-data-and-api.md](06-data-and-api.md)
