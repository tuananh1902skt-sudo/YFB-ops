# 02 — Data Dictionary

Status: DRAFT — v0.1

Định nghĩa **ý nghĩa nghiệp vụ** của mọi khái niệm và trường dữ liệu trong hệ thống.
File này trả lời câu hỏi "con số này nghĩa là gì, lấy từ đâu". Kiểu dữ liệu vật lý, khoá,
index nằm ở `04_DATABASE_SCHEMA.md`.

**Quy tắc bắt buộc**: mọi trường mới thêm vào database phải được định nghĩa ở đây trước.
Không có định nghĩa ở đây = không được đưa vào schema.

---

## 1. Từ điển khái niệm cốt lõi

Đây là những từ bị hiểu nhầm nhiều nhất giữa người và hệ thống. Toàn bộ code, UI, báo
cáo phải dùng đúng nghĩa này.

| Khái niệm | Định nghĩa chính xác | Không phải là |
|---|---|---|
| **Ca** (Live Session) | Đơn vị vận hành của **agency**: một khoảng thời gian có host/trợ live được phân công, có target riêng, có kết quả riêng | Không phải 1 phiên phát sóng của TikTok |
| **Room** (Platform Room) | Một phiên phát sóng liên tục theo cách TikTok ghi nhận, định danh bằng `Room ID`. Kết thúc khi tắt sóng | Không phải 1 ca |
| **Snapshot** | Một lần trợ live tải report cho một Room tại một thời điểm. Số liệu trong đó là **cộng dồn từ lúc mở Room đến thời điểm tải** | Không phải kết quả riêng của ca vừa xong |
| **Ca nối** | Nhiều ca agency diễn ra liên tiếp trong **cùng một Room** (bàn giao không tắt sóng) | Không phải 2 Room khác nhau |
| **Restart** | Một ca bị cắt thành **nhiều Room** (rớt mạng/mất điện/lỗi nền tảng, hoặc Operation chủ động restart để làm mới traffic) | Không phải 2 ca |
| **Attribution** | Quá trình quy kết kết quả từ dữ liệu Room/Snapshot về đúng từng ca | Không phải chia đều theo thời gian |
| **Ownership** | Ca đó do **agency** vận hành hay do **brand tự live in-house** | — |
| **GMV** | Doanh thu gộp do TikTok quy kết cho phiên live (cột `Attributed GMV`), **chưa trừ hoàn hàng** | Không phải doanh thu thực nhận |
| **NMV (ước tính)** | `GMV × (1 − tỷ lệ hoàn ước tính của account)`. Luôn là **ước tính** trong scope hiện tại | Không phải NMV thật (cần ~15 ngày mới chốt) |
| **Target** | Chỉ tiêu do brand đưa xuống hoặc agency đặt, ở cấp kỳ hoặc cấp ca | — |
| **Achievement** | `GMV thực tế / Target`, chỉ tính trên phần `AGENCY` | — |
| **Data Confidence** | Mức độ tin cậy của kết quả một ca, phụ thuộc vào việc dữ liệu snapshot có đủ hay không | Không phải độ chính xác của TikTok |

---

## 2. Danh mục giá trị chuẩn (Enums)

Các giá trị dưới đây là **canonical**, dùng thống nhất trong DB, API và UI.

### 2.1. `user_role`
`SUPER_ADMIN`, `MANAGEMENT`, `ACCOUNT`, `OPERATION`, `HOST`, `ASSISTANT`,
`DATA_ANALYST`, `FINANCE`

Ghi chú: một người có thể mang nhiều role, và role trong **một ca cụ thể** được lưu riêng
(xem `session_staff_role`) — vì thực tế có người vừa làm host ca này, vừa làm trợ live ca
khác.

### 2.2. `session_staff_role`
`HOST`, `ASSISTANT`

### 2.3. `session_status`
| Giá trị | Ý nghĩa |
|---|---|
| `DRAFT` | Mới tạo, chưa lên kế hoạch đầy đủ |
| `PLANNING` | Đang lên kế hoạch (chưa mở đăng ký) |
| `OPEN_FOR_BOOKING` | Đã mở ca cho host/trợ đăng ký |
| `PENDING_APPROVAL` | Có người đăng ký, chờ Operation duyệt |
| `CONFIRMED` | Đã chốt nhân sự |
| `READY` | Đã đủ điều kiện lên sóng (có target, có nhân sự, có sản phẩm) |
| `LIVE` | Đang live |
| `DATA_PENDING` | Ca đã kết thúc, chưa có snapshot nào |
| `DATA_PARTIAL` | Có snapshot nhưng chưa đủ để chốt KPI |
| `DATA_COMPLETE` | Đủ dữ liệu, KPI đã tính |
| `ANALYZED` | Đã có phân tích/nhận xét |
| `COMPLETED` | Đóng ca |
| `CANCELLED` | Huỷ (chỉ từ các trạng thái trước `LIVE`) |

### 2.4. `session_ownership`
`AGENCY`, `BRAND_INHOUSE`, `UNKNOWN`

`UNKNOWN` là mặc định khi phát hiện đoạn dữ liệu không khớp ca đã book. **Chỉ Operation**
được phép chuyển `UNKNOWN` → `AGENCY`/`BRAND_INHOUSE`.

### 2.5. `session_event_type`
`SESSION_STARTED`, `SESSION_ENDED`, `HANDOVER_AGENCY_TEAM`, `HANDOVER_TO_INHOUSE`,
`HANDOVER_FROM_INHOUSE`, `HOST_CHANGED`, `ASSISTANT_CHANGED`, `OVERTIME_EXTENDED`,
`ENDED_EARLY`, `RESTART_TECHNICAL`, `RESTART_STRATEGIC`, `UPLOAD_CORRECTED`

Các event **bắt buộc có lý do**: `ENDED_EARLY`, `RESTART_TECHNICAL`, `RESTART_STRATEGIC`,
`UPLOAD_CORRECTED`.

### 2.6. `event_review_status`
`LOGGED` (trợ live vừa ghi) → `VERIFIED` (Operation xác nhận đúng) hoặc `CORRECTED`
(Operation sửa, bắt buộc kèm lý do).

### 2.7. `attribution_method`
| Giá trị | Khi nào dùng |
|---|---|
| `FULL_SNAPSHOT` | Snapshot đầu tiên của Room → chính là kết quả ca đầu tiên |
| `SNAPSHOT_DELTA` | Ca nối: lấy snapshot hiện tại trừ snapshot liền trước cùng Room |
| `ROOM_SUM` | Ca có restart: cộng kết quả các đoạn Room lại |
| `MANUAL` | Operation nhập/chỉnh tay (bắt buộc có lý do + audit log) |
| `SHARED_UNALLOCATED` | Thiếu snapshot ở ranh giới → không tách được, kết quả đang bị **chia sẻ giữa nhiều ca**, chưa quy kết cho ai |

### 2.8. `data_confidence`
`HIGH`, `MEDIUM`, `LOW`, `NEEDS_REVIEW` — định nghĩa điều kiện ở
`01_BUSINESS_RULES.md` mục 6.5.

### 2.9. `import_type`
`LIVE_PERFORMANCE` (file `Creator-Live-Performance_*.xlsx`),
`ADS_DAILY` (file `Campaign_overview_data_*.xlsx`)

### 2.10. `import_status`
`UPLOADED` → `PARSED` → `VALIDATED` → `MATCHED` / `PARTIALLY_MATCHED` / `NEEDS_REVIEW` /
`FAILED`

### 2.11. `target_rule_type`
| Giá trị | Ý nghĩa |
|---|---|
| `FIXED_PERIOD_GMV` | Brand giao chỉ tiêu GMV cố định theo kỳ |
| `GMV_PER_HOUR` | Chỉ tiêu tính theo GMV trên mỗi giờ live |
| `HYBRID` | Kết hợp nhiều kiểu |
| `AGENCY_PROPOSED` | Agency tự đề xuất dựa trên lịch sử (phase sau) |

### 2.12. `target_source`
`BRAND` (brand đưa xuống), `AGENCY` (agency tự đặt), `ALLOCATED` (được phân bổ từ target
cấp kỳ xuống ca)

### 2.13. `fee_component_type`
`FIXED_PER_HOUR`, `FIXED_PER_PERIOD`, `PCT_GMV`, `PCT_NMV`

Một hợp đồng có thể có **nhiều component cộng lại** (xem `01_BUSINESS_RULES.md` mục 9).

### 2.14. `campaign_type`
`DAILY`, `CAMPAIGN`, `PAYDAY`, `MEGA_CAMPAIGN`, `BRAND_DAY`, `FLASH_SALE`, `OTHER`

Lưu dạng bảng tham chiếu (không phải enum cứng) để agency tự thêm loại mới.

### 2.15. `platform`
`TIKTOK_SHOP` (hiện tại). `SHOPEE` để dành cho tương lai, chưa build.

---

## 3. Định nghĩa trường theo nhóm thực thể

### 3.1. Tổ chức

| Trường | Ý nghĩa |
|---|---|
| `client.name` | Tên khách hàng (pháp nhân ký hợp đồng) |
| `brand.name` | Tên thương hiệu vận hành live. Một client có thể có nhiều brand |
| `platform_account.external_shop_id` | Định danh shop trên nền tảng. Đã xác nhận: **1 brand = 1 tài khoản TikTok Shop** |
| `platform_account.timezone` | Mặc định `Asia/Ho_Chi_Minh` (GMT+7) — múi giờ của mọi mốc thời gian trong file export |
| `platform_account.estimated_refund_rate` | Tỷ lệ hoàn ước tính của account này, dùng tính NMV ước tính. Cấu hình riêng từng account |
| `system_settings.key` / `value` | Các ngưỡng cấu hình được. Nhóm import: `data_submission_grace_minutes` (30), `room_continuity_max_gap_hours` (8), `segment_match_min_overlap_minutes` (2), `segment_match_min_overlap_ratio` (0.1). Nhóm dashboard: `target_warning_percent` (90), `data_confidence_good_percent` (80), `data_confidence_warning_percent` (50) |

### 3.2. Ca live (`live_sessions`)

| Trường | Ý nghĩa | Nguồn |
|---|---|---|
| `session_date` | Ngày vận hành của ca. Ca kết thúc sau nửa đêm vẫn tính theo **ngày bắt đầu** | Agency |
| `planned_start_at` / `planned_end_at` | Kế hoạch từ Planning | Agency |
| `actual_start_at` / `actual_end_at` | Thực tế, suy ra từ Room + Session Event Log | Hệ thống + trợ live |
| `ownership` | Agency hay brand in-house | Operation xác nhận |
| `target_gmv` | Chỉ tiêu GMV của riêng ca này | Agency / phân bổ |
| `status` | Xem 2.3 | Hệ thống |
| `data_confidence` | Xem 2.8 | Hệ thống tính |

**Nguyên tắc**: `planned_*` và `actual_*` không bao giờ ghi đè lẫn nhau. Achievement luôn
so với **actual**.

### 3.3. Nhân sự trong ca (`live_session_staff`)

| Trường | Ý nghĩa |
|---|---|
| `role_in_session` | `HOST` hoặc `ASSISTANT` — role tính theo **từng ca**, không cố định theo người |
| `started_at` / `ended_at` | Khoảng thời gian người này thực sự đảm nhiệm trong ca. Khi có `HOST_CHANGED` giữa ca, ca **không** bị tách đôi, nhưng mỗi người có khoảng thời gian riêng để tính hiệu suất cá nhân |

### 3.4. Dữ liệu nền tảng (raw)

| Trường | Ý nghĩa |
|---|---|
| `platform_rooms.platform_room_id` | `Room ID` từ TikTok. **Luôn lưu dạng text** (19 chữ số, vượt giới hạn số nguyên an toàn của JavaScript) |
| `room_snapshots.snapshot_end_at` | Cột `End Time` của file = **thời điểm trợ live tải report**. Là khoá sắp thứ tự snapshot trong cùng Room |
| `room_snapshots.*` (gmv, orders, views…) | Số liệu **cộng dồn từ đầu Room**, không phải của riêng ca |
| `raw_import_rows.raw_values` | Giá trị **string nguyên văn** của mọi ô. Bất biến, không bao giờ sửa |

### 3.5. Kết quả ca (`session_attributions`)

| Trường | Ý nghĩa |
|---|---|
| `method` | Cách tính ra con số này (xem 2.7) — luôn hiển thị được cho người dùng |
| `gmv`, `orders`, `items_sold`, … | Kết quả **đã tách riêng cho ca này** |
| `source_snapshot_id` / `prev_snapshot_id` | Hai snapshot dùng để tính delta → phục vụ truy vết ngược (data lineage) |
| `segment_start_at` / `segment_end_at` | Mốc đầu–cuối của riêng đoạn này (mốc snapshot, không phải giờ kế hoạch) |
| `duration_minutes` | Thời lượng của riêng đoạn này. **Không** lấy từ cột `Duration` của file — đó là thời lượng cả Room |
| `confidence` | Xem 2.8 |
| `computed_reason` | Vì sao dòng này ra như vậy — dùng để hiển thị cho Operation, không phải log kỹ thuật |
| `is_current` | Chỉ dòng `true` được tính. Tính lại thì dòng cũ chuyển `false` và **vẫn nằm trong DB** để truy vết |

Một ca có **một dòng cho mỗi Room** nó đã dùng (ca restart → nhiều dòng). Ràng buộc
`session_attributions_one_per_room_idx` chặn việc tồn tại hai dòng hiện hành cho cùng
một cặp (ca, Room).

**Mã cảnh báo đoạn live** (ghi vào `computed_reason`, engine sinh ra khi tách ca):

| Mã | Nghĩa | Hệ quả |
|---|---|---|
| `NEGATIVE_DELTA` | Số cộng dồn giảm so với snapshot trước | **Không ghi số** cho đoạn đó, ca chuyển `NEEDS_REVIEW` |
| `DUPLICATE_SNAPSHOT_TIME` | Hai snapshot cùng Room trùng mốc `End Time` | `NEEDS_REVIEW` |
| `SNAPSHOT_BEFORE_ROOM_START` | `End Time` sớm hơn `Start Time` của Room | `NEEDS_REVIEW` |
| `CONTINUITY_GAP_EXCEEDED` | Khoảng cách giữa 2 snapshot vượt `room_continuity_max_gap_hours` | `NEEDS_REVIEW`, không tự coi là một ca liền mạch |

**Chỉ các trường cộng dồn (CUM) mới được tính bằng phép trừ.** Các chỉ số dẫn xuất (AOV,
CTR, CVR, GMV/giờ…) phải **tính lại** từ các trường đã tách — danh sách CUM vs DERIVED
nằm ở `03_TIKTOK_DATA_MAPPING.md` mục A.4.

### 3.6. Ads (`ads_daily`)

| Trường | Ý nghĩa |
|---|---|
| `stat_date` | Ngày (độ mịn nhỏ nhất TikTok cho phép) |
| `ads_spend` | Chi phí ads **toàn shop** trong ngày |
| `ads_gross_revenue` | Doanh thu do ads quy kết, **toàn shop, mọi nguồn traffic** — không phải doanh thu live |

**Cảnh báo**: không gắn các trường này vào ca. Xem `01_BUSINESS_RULES.md` mục 10.

---

## 4. Quy tắc bảo trì file này

1. Thêm trường mới vào DB → định nghĩa ở đây trước.
2. Thêm giá trị enum mới → bổ sung vào mục 2, kèm ý nghĩa.
3. Đổi ý nghĩa một trường đang có → phải ghi rõ ngày đổi và lý do (vì dữ liệu lịch sử
   trước đó mang nghĩa cũ).
4. Mỗi chỉ số hiển thị trên dashboard phải truy được về định nghĩa ở đây hoặc ở
   `05_KPI_DICTIONARY.md`.
