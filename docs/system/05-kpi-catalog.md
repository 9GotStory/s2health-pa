# 05 — KPI Catalog, กลุ่มรายงาน และตัวชี้วัดที่รองรับ

[กลับดัชนี](README.md) | [ต่อ: Data & API](06-data-and-api.md)

## 1. จำนวน Definition vs Public KPI

| ชนิด | จำนวนใน Registry Seed |
| --- | ---: |
| Physical Source definitions | 18 |
| └─ Physical source-only (ไม่แสดงบน Dashboard) | 5 |
| └─ Physical public KPI | 13 |
| Virtual public KPI | 34 |
| **Definition ทั้งหมด** | **52** |
| **Public KPI ที่คาดจาก Seed** | **47** |

ค่าทดสอบ API ณ 2026-10-11: `KPI_COUNT=47`. อย่างไรก็ตาม จำนวนจาก API **เปลี่ยนได้ตาม Registry/Active Snapshot**, ต้องอ่าน `GET /api/v1/kpis` ของ Active Run ปัจจุบัน; ตารางด้านล่างเป็น **Code-based seed catalog**, ไม่ใช่การเทียบรายการทุกตัวกับ Live API ณ ทุกขณะ

Source: [`backend/migrations/0004_kpi_registry_seed.sql`](https://github.com/9GotStory/pa-dashboard/blob/a3862692c7ffd8dda3c593fd029e1bb67b7fd68b/backend/migrations/0004_kpi_registry_seed.sql). การคำนวณและ Configuration เป็น Data/Config-driven ไม่ควร hardcode 47 KPI ใน React.

## 2. KPI พื้นฐาน (Physical Public 13)

| Machine Key | ชื่อตัวชี้วัด |
| --- | --- |
| `s_kpi_anc12` | หญิงตั้งครรภ์ฝากครรภ์ครั้งแรก ≤ 12 สัปดาห์ |
| `s_anc5` | หญิงตั้งครรภ์ได้รับการดูแลก่อนคลอด 5 ครั้งตามเกณฑ์ |
| `s_kpi_food` | เด็กแรกเกิด–ต่ำกว่า 6 เดือน กินนมแม่อย่างเดียว |
| `s_kpi_childdev4` | เด็ก 0–5 ปี มีพัฒนาการสมวัย |
| `s_kpi_childdev2` | เด็ก 0–5 ปี ที่คัดกรองแล้วพบสงสัยพัฒนาการล่าช้า |
| `s_aged9` | การคัดกรองผู้สูงอายุ 9 ด้าน |
| `s_dm_screen` | ประชาชนอายุ 35 ปีขึ้นไปได้รับการคัดกรองเบาหวาน |
| `s_ht_screen` | ประชาชนอายุ 35 ปีขึ้นไปได้รับการคัดกรองความดันโลหิตสูง |
| `s_ncd_screen_repleate1` | ตรวจติดตามยืนยันวินิจฉัยกลุ่มสงสัยป่วยเบาหวาน |
| `s_ht_screen_follow` | ตรวจติดตามยืนยันวินิจฉัยกลุ่มสงสัยป่วยความดันโลหิตสูง |
| `s_dental_0_5_cavity_free` | เด็กอายุ 0–5 ปี ฟันดีไม่มีผุ |
| `s_kpi_dental28` | เด็กอายุ 6 ปี ได้รับการเคลือบหลุมร่องฟันแท้ |
| `s_kpi_dental33` | การตรวจช่องปากผู้สูงอายุโดยทันตบุคลากร |

หมายเหตุ: ชื่อในตารางนี้สรุปให้อ่านง่าย; ชื่อเต็ม ค่า Target, Link, ลำดับ และ Group ต้องอ่านจาก Registry/Active Catalog เนื่องจากมีการแก้ค่าผ่าน DB Snapshot ได้.

## 3. KPI สร้างเสริมภูมิคุ้มกันโรค (Virtual 34)

Derived from 5 Physical EPI Sources; ชื่อหลัง `__` คือ KPI ที่แยกจากต้นทาง

### เด็กครบ 1 ปี — `s_epi1` (20 KPIs)

`s_epi1__bcg` (BCG), `s_epi1__dtp1` (DTP1), `s_epi1__dtp2` (DTP2), `s_epi1__dtp_hb3` (DTP-HB3), `s_epi1__hbv` (HBV), `s_epi1__hbv2` (HBV2), `s_epi1__hbv3` (HBV3), `s_epi1__hbv4` (HBV4), `s_epi1__hib1` (Hib1), `s_epi1__hib2` (Hib2), `s_epi1__hib3` (Hib3), `s_epi1__ipv` (IPV), `s_epi1__ipv1` (IPV1), `s_epi1__mmr` (MMR), `s_epi1__opv3` (OPV3), `s_epi1__pcv1` (PCV1), `s_epi1__pcv2` (PCV2), `s_epi1__pcv3` (PCV3), `s_epi1__rota` (Rota), `s_epi1__rota1` (Rota1)

**รวมกลุ่มเด็กครบ 1 ปี 20 Machine Keys** รวม PCV1–3 และ Rota/Rota1; ตรวจรหัสจริงกับ Registry เมื่อมีการปรับ Seed

### เด็กครบ 2 ปี — `s_epi2` (6 Vaccine KPIs)

`s_epi2__dtp4`, `s_epi2__opv4`, `s_epi2__mmr1`, `s_epi2__mmr2`, `s_epi2__je2`, `s_epi2__pcv4`.

### เด็กครบ 3 ปี — `s_epi3` (2 Vaccine KPIs)

`s_epi3__je3`, `s_epi3__mmr2`.

### เด็กครบ 5 ปี — `s_epi5` (2 Vaccine KPIs)

`s_epi5__dtp5`, `s_epi5__opv5`.

### Fully Immunized — `s_epi_complete` (4 KPIs)

`s_epi_complete__1y`, `s_epi_complete__2y`, `s_epi_complete__3y`, `s_epi_complete__5y`.

**รวม** 20+6+2+2+4 = **34 Virtual KPIs**.

## 4. Source-only Physical (5; ไม่แสดง Public KPI Card)

`s_epi1`, `s_epi2`, `s_epi3`, `s_epi5` และ `s_epi_complete` เป็น Sources สำหรับคำนวณ KPI ย่อย มิใช่ KPI แยกที่ควรถูกนับเป็น Public Catalog/Pass Rate.

## 5. Metadata/Grouping/Target

Seed มี 2 หมวดหลัก: `kpi_master` (“ตัวชี้วัดพื้นฐาน”) และ `kpi_epi` (“สร้างเสริมภูมิคุ้มกันโรค”). EPI แบ่งกลุ่มย่อยตามช่วงอายุ/fully immunized; UI เรียง `categoryOrder → subgroup → order`.

ตัวชี้วัดแต่ละตัวมี key, title, target value, period/quarter configuration, source sheet, source id, subgroup, sort order, link, metadata. Target ของ KPI เป็น **เกณฑ์เปรียบเทียบ** ไม่ใช่ตัวหาร; ข้อมูล Target/Result ที่ใช้คำนวณอัตราเป็นค่าจาก Backend Result Rows.

**อย่าแก้ชื่อ/รหัสใน React เพื่อเปลี่ยนตัวชี้วัด**: การเพิ่ม/ลบ KPI ต้องผ่าน Registry, Mapping/Calculation, Migration/Config Snapshot, Tests และ Activation ตาม Gate ของ Backend ก่อน แล้ว UI จะอ่าน Catalog ใหม่ผ่าน API.
