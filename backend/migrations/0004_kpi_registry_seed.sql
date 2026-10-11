-- PA Dashboard Backend v2
-- APP-PA-03-T001 KPI/settings registry seed
-- Forward-only numbered SQL migration.
-- R2B seed authority SHA256: 02878bd3f367c2451149464815b8244ac0de5383470e80140082410dc4482278
-- KPI_DEFINITION_COUNT: 52
-- KPI_PHYSICAL_COUNT: 18
-- KPI_VIRTUAL_COUNT: 34
-- SOURCE_ONLY_COUNT: 5
-- PCV_CORRECTION_COUNT: 4
-- Collision policy: fail closed via existing unique constraints.

INSERT INTO app_settings (
  key,
  value,
  updated_at
) VALUES
  ('current_year', to_jsonb('2569'::TEXT), CURRENT_TIMESTAMP),
  ('province_code', to_jsonb('54'::TEXT), CURRENT_TIMESTAMP),
  ('current_quarter', to_jsonb(4::INTEGER), CURRENT_TIMESTAMP);

INSERT INTO kpi_categories (
  code,
  name,
  sort_order,
  metadata
) VALUES
  ('kpi_master', 'ตัวชี้วัดพื้นฐาน', 1, '{}'::JSONB),
  ('kpi_epi', 'สร้างเสริมภูมิคุ้มกันโรค', 2, '{}'::JSONB);

INSERT INTO kpi_definitions (
  kpi_key,
  title,
  category_id,
  kind,
  source_sheet,
  source_id,
  value_prefix,
  subgroup,
  link,
  target_value,
  is_quarterly,
  target_months,
  effective_quarter,
  sort_order,
  is_active,
  metadata,
  updated_at
) VALUES
  ('s_kpi_anc12', 'ร้อยละหญิงตั้งครรภ์ได้รับการฝากครรภ์ครั้งแรกก่อนหรือเท่ากับ 12 สัปดาห์', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_kpi_anc12', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/1c1b8e24aff59258a806f122e264031e', 75, FALSE, NULL, NULL, 1, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_anc5', 'ร้อยละหญิงตั้งครรภ์ที่ได้รับการดูแลก่อนคลอด 5 ครั้ง ตามเกณฑ์', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_anc5', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/bd63b8d99f7054560fcf9c3b96f39c13', 75, FALSE, NULL, NULL, 2, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_kpi_food', 'ร้อยละของเด็กแรกเกิด - ต่ำกว่า 6 เดือน กินนมแม่อย่างเดียว', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_kpi_food', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/4164a7c49fcb2b8c3ccca67dcdf28bd0', 50, FALSE, NULL, NULL, 3, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_kpi_childdev4', 'ร้อยละของเด็กอายุ 0-5 ปี ทั้งหมดตามช่วงอายุที่กำหนดมีพัฒนาการสมวัย', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_kpi_childdev4', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/1b60d68b1cb5b003fcba38a4a0e4027b', 87, TRUE, 9, 3, 4, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_kpi_childdev2', 'ร้อยละของเด็กอายุ 0-5 ปี ที่ได้รับการคัดกรองพัฒนาการ พบสงสัยล่าช้า', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_kpi_childdev2', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/684e99dc7538c8b1a97f19f91a100f08', 20, TRUE, 9, 3, 5, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_aged9', 'การคัดกรองผู้สูงอายุ 9 ด้าน', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_aged9', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/aa86b13e8cb60cae6c3216b7e3e5f151', 80, FALSE, NULL, NULL, 6, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_dm_screen', 'ร้อยละของประชากรอายุ 35 ปีขึ้นไปที่ได้รับการคัดกรองเพื่อวินิจฉัยเบาหวาน', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_dm_screen', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/626c89f6b8d9f7ed90c72c719775eb07', 90, FALSE, NULL, NULL, 7, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_ht_screen', 'ร้อยละของประชากรอายุ 35 ปีขึ้นไปที่ได้รับการคัดกรองเพื่อวินิจฉัยโรคความดันโลหิตสูง', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_ht_screen', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/9702fa28cd2ec73ecc6af89d14f46874', 90, FALSE, NULL, NULL, 8, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_ncd_screen_repleate1', 'ร้อยละการตรวจติดตามยืนยันวินิจฉัยกลุ่มสงสัยป่วยโรคเบาหวาน', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_ncd_screen_repleate1', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/e9e461e793e8258f47d46d6956f12832', 70, TRUE, NULL, NULL, 9, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_ht_screen_follow', 'ร้อยละการตรวจติดตามยืนยันวินิจฉัยกลุ่มสงสัยป่วยโรคความดันโลหิตสูง', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_ht_screen_follow', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/b57439ff27302ade8c38d1dd189644a4', 80, TRUE, NULL, NULL, 10, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_dental_0_5_cavity_free', 'ร้อยละของเด็กอายุ 0-5 ปี ฟันดีไม่มีผุ', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_dental_0_5_cavity_free', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/abt2t2k4z4xeqzytwbave', 80, FALSE, NULL, NULL, 11, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_kpi_dental28', 'ร้อยละเด็ก 6 ปี ได้รับการเคลือบหลุมร่องฟันแท้', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_kpi_dental28', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/e07a6ff3cd63d34a759be4bff5c1a4c6', 25, FALSE, NULL, NULL, 12, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_kpi_dental33', 'การตรวจช่องปากผู้สูงอายุโดยทันตบุคลากร', (SELECT id FROM kpi_categories WHERE code = 'kpi_master'), 'physical', 's_kpi_dental33', NULL, NULL, NULL, 'https://hdc.moph.go.th/pre/public/standard-report-detail/1fb6b46f1d1fd42362f97072f4b3b653', 50, FALSE, NULL, NULL, 13, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1', 's_epi1', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'physical', 's_epi1', NULL, NULL, NULL, NULL, NULL, FALSE, NULL, NULL, 14, TRUE, '{"source_only":true}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi2', 's_epi2', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'physical', 's_epi2', NULL, NULL, NULL, NULL, NULL, FALSE, NULL, NULL, 15, TRUE, '{"source_only":true}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi3', 's_epi3', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'physical', 's_epi3', NULL, NULL, NULL, NULL, NULL, FALSE, NULL, NULL, 16, TRUE, '{"source_only":true}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi5', 's_epi5', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'physical', 's_epi5', NULL, NULL, NULL, NULL, NULL, FALSE, NULL, NULL, 17, TRUE, '{"source_only":true}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi_complete', 's_epi_complete', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'physical', 's_epi_complete', NULL, NULL, NULL, NULL, NULL, FALSE, NULL, NULL, 18, TRUE, '{"limit":5000,"source_only":true}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__bcg', 'เด็กครบ 1 ปี ได้รับวัคซีน BCG', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'bcg', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 100, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__dtp1', 'เด็กครบ 1 ปี ได้รับวัคซีน DTP1', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'dtp1', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 101, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__dtp2', 'เด็กครบ 1 ปี ได้รับวัคซีน DTP2', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'dtp2', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 102, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__dtp_hb3', 'เด็กครบ 1 ปี ได้รับวัคซีน DTP-HB3', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'dtp_hb3', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 103, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__hbv', 'เด็กครบ 1 ปี ได้รับวัคซีน HBV', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'hbv', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 104, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__hbv2', 'เด็กครบ 1 ปี ได้รับวัคซีน HBV2', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'hbv2', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 105, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__hbv3', 'เด็กครบ 1 ปี ได้รับวัคซีน HBV3', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'hbv3', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 106, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__hbv4', 'เด็กครบ 1 ปี ได้รับวัคซีน HBV4', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'hbv4', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 107, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__hib1', 'เด็กครบ 1 ปี ได้รับวัคซีน Hib1', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'hib1', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 108, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__hib2', 'เด็กครบ 1 ปี ได้รับวัคซีน Hib2', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'hib2', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 109, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__hib3', 'เด็กครบ 1 ปี ได้รับวัคซีน Hib3', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'hib3', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 110, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__ipv', 'เด็กครบ 1 ปี ได้รับวัคซีน IPV', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'ipv', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 111, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__ipv1', 'เด็กครบ 1 ปี ได้รับวัคซีน IPV1', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'ipv1', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 112, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__mmr', 'เด็กครบ 1 ปี ได้รับวัคซีน MMR', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'mmr', 'กลุ่มอายุ 1 ปี', NULL, 95, FALSE, NULL, NULL, 113, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__opv3', 'เด็กครบ 1 ปี ได้รับวัคซีน OPV3', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'opv3', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 114, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__pcv1', 'เด็กครบ 1 ปี ได้รับวัคซีน PCV1', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'pcv1', 'กลุ่มอายุ 1 ปี', NULL, 95, FALSE, NULL, NULL, 115, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__pcv2', 'เด็กครบ 1 ปี ได้รับวัคซีน PCV2', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'pcv2', 'กลุ่มอายุ 1 ปี', NULL, 95, FALSE, NULL, NULL, 116, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__pcv3', 'เด็กครบ 1 ปี ได้รับวัคซีน PCV3', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'pcv3', 'กลุ่มอายุ 1 ปี', NULL, 95, FALSE, NULL, NULL, 117, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__rota', 'เด็กครบ 1 ปี ได้รับวัคซีน Rota', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'rota', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 118, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi1__rota1', 'เด็กครบ 1 ปี ได้รับวัคซีน Rota1', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi1', NULL, 'rota1', 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 119, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi_complete__1y', 'เด็กครบ 1 ปี ได้รับวัคซีนครบตามเกณฑ์ (fully immunized)', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi_complete', '28dd2c7955ce926456240b2ff0100bde', NULL, 'กลุ่มอายุ 1 ปี', NULL, 90, FALSE, NULL, NULL, 120, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi2__dtp4', 'เด็กครบ 2 ปี ได้รับวัคซีน DTP4', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi2', NULL, 'dtp4', 'กลุ่มอายุ 2 ปี', NULL, 90, FALSE, NULL, NULL, 121, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi2__opv4', 'เด็กครบ 2 ปี ได้รับวัคซีน OPV4', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi2', NULL, 'opv4', 'กลุ่มอายุ 2 ปี', NULL, 90, FALSE, NULL, NULL, 122, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi2__mmr1', 'เด็กครบ 2 ปี ได้รับวัคซีน MMR เข็มที่ 1', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi2', NULL, 'mmr1', 'กลุ่มอายุ 2 ปี', NULL, 95, FALSE, NULL, NULL, 123, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi2__mmr2', 'เด็กครบ 2 ปี ได้รับวัคซีน MMR เข็มที่ 2', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi2', NULL, 'mmr2', 'กลุ่มอายุ 2 ปี', NULL, 95, FALSE, NULL, NULL, 124, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi2__je2', 'เด็กครบ 2 ปี ได้รับวัคซีน JE2', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi2', NULL, 'je2', 'กลุ่มอายุ 2 ปี', NULL, 90, FALSE, NULL, NULL, 125, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi2__pcv4', 'เด็กครบ 2 ปี ได้รับวัคซีน PCV4', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi2', NULL, 'pcv4', 'กลุ่มอายุ 2 ปี', NULL, 95, FALSE, NULL, NULL, 126, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi_complete__2y', 'เด็กครบ 2 ปี ได้รับวัคซีนครบตามเกณฑ์ (fully immunized)', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi_complete', '35f4a8d465e6e1edc05f3d8ab658c551', NULL, 'กลุ่มอายุ 2 ปี', NULL, 90, FALSE, NULL, NULL, 127, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi3__je3', 'เด็กครบ 3 ปี ได้รับวัคซีน JE3', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi3', NULL, 'je3', 'กลุ่มอายุ 3 ปี', NULL, 90, FALSE, NULL, NULL, 128, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi3__mmr2', 'เด็กครบ 3 ปี ได้รับวัคซีน MMR เข็มที่ 2', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi3', NULL, 'mmr2', 'กลุ่มอายุ 3 ปี', NULL, 90, FALSE, NULL, NULL, 129, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi_complete__3y', 'เด็กครบ 3 ปี ได้รับวัคซีนครบตามเกณฑ์ (fully immunized)', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi_complete', 'd1fe173d08e959397adf34b1d77e88d7', NULL, 'กลุ่มอายุ 3 ปี', NULL, 90, FALSE, NULL, NULL, 130, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi5__dtp5', 'เด็กครบ 5 ปี ได้รับวัคซีน DTP5', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi5', NULL, 'dtp5', 'กลุ่มอายุ 5 ปี', NULL, 90, FALSE, NULL, NULL, 131, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi5__opv5', 'เด็กครบ 5 ปี ได้รับวัคซีน OPV5', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi5', NULL, 'opv5', 'กลุ่มอายุ 5 ปี', NULL, 90, FALSE, NULL, NULL, 132, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP),
  ('s_epi_complete__5y', 'เด็กครบ 5 ปี ได้รับวัคซีนครบตามเกณฑ์ (fully immunized)', (SELECT id FROM kpi_categories WHERE code = 'kpi_epi'), 'virtual', 's_epi_complete', 'f033ab37c30201f73f142449d037028d', NULL, 'กลุ่มอายุ 5 ปี', NULL, 90, FALSE, NULL, NULL, 133, TRUE, '{}'::JSONB, CURRENT_TIMESTAMP);
