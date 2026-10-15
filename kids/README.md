# Thêm / sửa trang cho từng cháu

Mỗi cháu là một thư mục trong `kids/`. Tên thư mục chính là đường dẫn trang:
`kids/tan-phat/` → `https://loi-chuc-gui-me.nghiadt.workers.dev/tan-phat/`

```
kids/<duong-dan>/
  kid.json     tên, lời chúc, ngày
  avatar.png   ảnh của cháu (.png / .jpg / .jpeg / .webp)
  audio.m4a    file ghi âm (.m4a / .mp3 / .wav / .ogg / .aac)
```

## Thêm cháu mới

```
npm run new-kid -- "Minh Anh"        # tạo kids/minh-anh/kid.json
# chép ảnh  → kids/minh-anh/avatar.jpg
# chép audio → kids/minh-anh/audio.m4a
npm run build                         # tạo trang public/minh-anh/
npm run deploy                        # build + đưa lên Cloudflare
```

## kid.json

```json
{
  "name": "Minh Anh",
  "wish": "Mẹ ơi, con chúc mẹ 20/10 luôn vui vẻ!\nCon yêu mẹ nhiều lắm ạ!",
  "date": "20/10/2026",
  "avatarFocus": "50% 30%"
}
```

- `name` – tên hiển thị ("của bé …", "Con của mẹ, …", tiêu đề khi chia sẻ link).
- `wish` – lời chúc (nội dung ghi âm). `\n` để xuống dòng. Chữ được tô dần khi phát audio.
- `date` – ngày dưới tên (mặc định `20/10/2026`).
- `avatarFocus` – tuỳ chọn, vị trí giữ lại khi cắt ảnh tròn (`"50% 20%"` = lấy cao hơn, ví dụ khi mặt ở sát trên).

## Ảnh

- Ảnh **có nền trong suốt** (PNG cắt nền, như hình minh hoạ hiện tại) hiển thị "nổi" ở đầu trang.
- Ảnh **chụp thường** tự hiển thị trong khung tròn viền trắng.
- Ảnh xem trước khi chia sẻ link (`og.jpg`) được tạo tự động từ ảnh của cháu.

## Ghi chú

- `npm run build` cần Chrome hoặc Edge trên máy (đặt `CHROME_PATH` nếu không tự tìm thấy).
- Trang chủ `/` hiển thị cháu ghi trong `site.json` → `defaultKid`.
- Xoá một thư mục cháu rồi `npm run build` sẽ xoá luôn trang của cháu đó.
- `site.json` → `"indexable": false` để không cho Google lập chỉ mục các trang (nên cân nhắc vì có tên và ảnh của trẻ).
- Không sửa trực tiếp `public/<cháu>/index.html` – file này được tạo từ `template/index.html`.
