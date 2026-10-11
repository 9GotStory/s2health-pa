# 04 — ฟีเจอร์ทั้งหมดของ Public Dashboard

[กลับดัชนี](README.md) | [ต่อ: KPI Catalog](05-kpi-catalog.md)

เอกสารนี้อธิบาย **สิ่งที่ Implement อยู่จริงใน Public Frontend** ณ Release `7c617d20b573899613535168ad70bc835f342cc8`; ไม่รวม Feature ภายในของ Upstream ที่ไม่ได้ Port มาด้วย

## 1. ภาพรวมหน้า Dashboard

- **หน้าเดียว (Root Page)**: `/s2health-pa/` แสดงชื่อ S2Health PA Dashboard และชื่อเครือข่ายสุขภาพอำเภอสอง
- **วัน/เวลาอัปเดตข้อมูล**: จาก `dataset.sourceLastUpdated` ที่ normalize/format ไม่ใช่ timestamp ของการเปิด Browser
- **สถานะโหลด**: แสดง Skeleton ระหว่างโหลด, error message + ปุ่มลองใหม่เมื่อโหลดไม่ได้, ข้อความ “ยังไม่มีชุดข้อมูลที่พร้อมใช้งาน” เมื่อไม่มี Active Dataset
- **Toast**: แจ้งโหลดข้อมูลสำเร็จหลังมี KPI data ไม่แจ้งว่าโหลดสำเร็จโดยไม่มีรายการ

## 2. ตัวกรอง (DashboardFilter)

- เปิด/ปิด Panel ค้นหาและเลือก **หน่วยบริการหลายแห่ง** หรือ **KPI หลายรายการ** ด้วย Checkbox
- แสดงจำนวน Selection ที่เลือก และล้างทั้งหมดได้
- KPI Filter แยกตาม Category → Subgroup → KPI; กลุ่มที่ไม่มี metadata จะมี fallback ไม่ crash
- หน่วยบริการเรียง/แสดงชื่อจาก Reference; domain ของ Filter มาจาก **union** ระหว่าง Hospital Reference กับทุก Breakdown Key ที่พบจริง เพื่อไม่ทำข้อมูลที่อยู่นอก Registry หายไป
- การเปลี่ยน Filter ส่ง Snapshot ของการเลือกทั้งชุด ทำให้ Facility/KPI สอดคล้องกัน ไม่หายหรือย้อนสถานะใน UI

## 3. URL State / แชร์มุมมอง

- ใช้ Query Parameters `?cat=...&facility=...&kpi=...`; Facility และ KPI มีได้หลายค่า
- Normalize/Sort/Deduplicate ค่า, ตัดค่า URL ที่ไม่อยู่ใน Dataset ที่โหลดแล้ว และไม่สร้าง URL อันตราย
- Browser Back/Forward อ่าน `popstate` คืน Filter/Category โดยไม่ต้อง Reload หน้าใหม่
- การเปลี่ยน Filter/Tab ใช้ `history.pushState`; การทำความสะอาด URL ใช้ `replaceState`
- URL State เป็น **View State** ไม่ใช่ Security Filter ของ Backend; การดู Public API ไม่ต้องผ่าน UI

## 4. Tabs หมวด KPI

- แสดง Tab “ทั้งหมด” และ Category Tabs จาก metadata ของ **ชุด KPI ที่อยู่ภายใต้การเลือก** ไม่ใช่รายการคงที่
- Tab แสดงจำนวนตัวชี้วัดใน Category
- ทั้ง Summary และ Detail แสดงตาม Tab ปัจจุบัน เพื่อหลีกเลี่ยงตัวเลขภาพรวมคนละ Scope กับตาราง

## 5. Summary Cards (4 ใบ)

1. **ตัวชี้วัดทั้งหมด** — จำนวน KPI ใน Current Tab; อาจบอกจำนวน “แบบจำนวน” และ “ไม่มีฐานประเมิน”
2. **อัตราผ่านเกณฑ์** — สัดส่วนของ KPI ที่ “ประเมินได้” และผ่าน Target; ไม่มีผลประเมินจะแสดง “—”
3. **ผ่านเกณฑ์** — KPI เปอร์เซ็นต์ที่ผ่าน Threshold
4. **ต้องปรับปรุง** — KPI เปอร์เซ็นต์ที่ประเมินได้แต่ไม่ผ่าน

สำคัญ: KPI **แบบจำนวน (raw-count)** ไม่ถูกตัดสินผ่าน/ไม่ผ่าน และ KPI แบบเปอร์เซ็นต์ที่ตัวหารเป็นศูนย์ใน Filter Scope ไม่ถูกนับว่าตกเกณฑ์. อัตราผ่านเกณฑ์คำนวณจากเฉพาะกลุ่ม “ประเมินได้”.

## 6. Desktop Table (KPITable)

- แสดง KPI แยกเป็น Block ตาม Category พร้อม Header ของ Subgroup เมื่อมีมากกว่าหนึ่งกลุ่มย่อย
- หัวข้อ KPI พร้อมลิงก์ External HDC/แหล่งรายงาน (เฉพาะเมื่อ Catalog ให้ URL มา)
- แสดง Period (“รายปี”, “สะสม N เดือน”, “Qn”), ตัวตั้ง/ตัวหาร, Target, เปอร์เซ็นต์ และผลรายหน่วยบริการ
- เรียงหน่วยบริการตามกลุ่มตำบล/รหัสตาม logic ของ Table; รองรับ Facility Filter
- คลิกค่าผล KPI ของหน่วยบริการเพื่อเปิด **Detail Modal**
- สถานะสี/ผ่านเกณฑ์ใช้ logic ร่วมกับ Summary; ถ้า KPI แบบจำนวนหรือหารไม่ได้จะแสดง “—” แทนคะแนนเปอร์เซ็นต์ที่ชวนให้เข้าใจผิด
- มีปุ่ม **ส่งออก Excel** และ Feedback เมื่อส่งออกไม่สำเร็จ

## 7. Mobile KPI Cards

- ขนาดหน้าจอเล็กแสดง `KPICardList` และ `KPICard` แทน Table
- KPI Card แสดงชื่อ, ลิงก์ต้นทาง, Period, Target, ค่า Result/Target, %, สถานะ
- กางตารางสรุปรายหน่วยบริการได้ตามเงื่อนไขของ Card; คลิกเพื่อเปิด Detail Modal
- Mobile Detail เลือกข้อมูลอำเภอ/หน่วยบริการตาม Filter ที่เลือก; ไม่คำนวณผล KPI ที่ Backend ไม่ได้ส่งมา

## 8. KPI Detail Modal

- แสดงรายละเอียดระดับหน่วย/พื้นที่พร้อม Target, Result, %, จำนวนรายการ
- Close button, Overlay, Escape และการจัดการ Focus ของ Dialog ตาม Accessibility Contract
- ใช้ semantic `role="dialog"`, `aria-modal`, Label/Description และ Keyboard focus management
- ใช้ข้อมูลจาก KPI Summary/Breakdown ปัจจุบัน; ไม่ใช่คำสั่งแก้ไขฐานข้อมูล

## 9. Export Excel

- ใช้ `write-excel-file/browser` สร้าง `.xlsx` ใน Browser
- ชื่อไฟล์รูปแบบ `pa-dashboard-{fiscalYear}-{date}.xlsx`, Sheet `PA Dashboard {fiscalYear}`
- ส่งออกตาม KPI / Facility Filter ที่ใช้อยู่ พร้อม Category/Subgroup, Period, Result/Target, Target Threshold และข้อมูลหน่วยบริการ
- ไม่ส่งออกข้อมูลผู้ป่วย; ตรวจความเท่ากันของ Scope ระหว่างหน้าจอกับ Excel ด้วย Contract Tests

## 10. KPI Presentation Semantics

- Backend ส่ง `target` และ `result` ที่คำนวณแล้ว; Frontend **รวมผลเพื่อแสดง** และคำนวณอัตรา `result/target*100` เท่านั้น
- `targetValue: null` ใช้ค่า Default เป้าหมาย **80%**; ค่า `targetValue: 0` เป็น Explicit Zero และ **ห้าม**ใช้ `||` แทน `??` เพราะจะทำให้ข้อมูลผิด
- KPI แบบจำนวนมี `totalTarget === 0` ใน Source Model; แสดงจำนวนผลแทนอัตราผ่านเกณฑ์
- ค่า Effective Quarter/Target Months ที่ส่งมามีผลต่อ Period Label และความหมายของเกณฑ์; ห้ามยึดปีปฏิทินแทนปีงบ/Quarter
- ข้อมูล Area ที่ไม่มี Hospcode ใช้ Areacode fallback; ต้องรักษา Label/Filter Domain ของข้อมูลประเภทนี้

## 11. Accessiblity / UI Quality

- Icon ใช้ Lucide ไม่ใช้ Emoji เป็น UI Indicator
- ปุ่มและตัวควบคุมมี ARIA Label, Expanded State, Keyboard Interaction และ Modal Focus Trap
- ฟอนต์ภาษาไทยมาจาก `src/lib/fonts.ts`; หน้า Public Branding แตกต่างจาก Upstream ได้เฉพาะส่วนที่บันทึกไว้ใน Policy

## 12. Feature ที่ไม่ควรอ้างว่ามีใน Public Web

ไม่มีหน้าจัดการผู้ใช้/สิทธิ์แบบ Login, CRUD รายงาน, แก้ Registry, เริ่ม Sync, เพิ่มข้อมูล MOPH, Import Excel เข้า DB หรือหน้า `/sync`. Backend อาจมีคำสั่ง Sync/Health/Reference แต่สิ่งนั้นไม่ใช่ Feature ของหน้า Public และต้องผ่านขอบเขต Ops/Authorization ของ Fedora.

## 13. Mapping Feature → Tests

| ความสามารถ | Tests สำคัญ |
| --- | --- |
| ข้อมูล/API/Run Consistency | `src/lib/dashboard-data.test.ts` |
| ค่าเป้า/ชนิด KPI/Percent | `src/lib/kpi-utils.test.ts`, `kpi-target-resolution-contract.test.mjs`, `kpi-type-filter-contract.test.mjs` |
| URL/back/forward | `dashboard-url-state.test.ts`, `dashboard-url-state-contract.test.mjs` |
| Atomic facility/KPI selection | `dashboard-filter-state-contract.test.mjs` |
| Export/filter | `excel-export-contract.test.mjs` |
| Date/Timezone | `dashboard-time.test.ts` |
| Summary availability | `kpi-summary-availability-contract.test.mjs` |
| Keyboard/ARIA | `accessibility-contract.test.mjs` |

**อ่านเพิ่มเติม:** [06-data-and-api.md](06-data-and-api.md), [08-security-quality.md](08-security-quality.md)
