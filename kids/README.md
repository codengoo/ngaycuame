# Thêm / sửa trang cho từng cháu

Mỗi cháu là một thư mục trong `kids/`. Tên thư mục chính là đường dẫn trang:
`kids/tan-phat/` → `https://loi-chuc-gui-me.nghiadt.workers.dev/tan-phat/`

```
kids/<duong-dan>/
  kid.json     tên, lời chúc, ngày
  avatar.png   ảnh của cháu (.png / .jpg / .jpeg / .webp)
  audio.m4a    file ghi âm (.m4a / .mp3 / .wav / .ogg / .aac)
  transcript.json  tự tạo khi build – lời chúc chuyển từ file ghi âm
```

## Thêm cháu mới

Tạo thư mục **đặt theo tên bé (có dấu)**, chép vào 1 file ghi âm (và 1 ảnh nếu có) – tên file gì cũng được:

```
kids/Minh Anh/
  IMG_0123.jpg
  Ghi âm mới.m4a
```

```
npm run build      # tạo trang public/minh-anh/
npm run deploy     # build + đưa lên Cloudflare
```

Khi build, thư mục được tự sắp xếp lại:

- `kids/Minh Anh/` → `kids/minh-anh/` (đường dẫn trang), tên "Minh Anh" ghi vào `kid.json`.
  Nếu thư mục đặt sẵn kiểu `minh-anh` thì tên thành "Minh Anh" không dấu – sửa lại trong `kid.json`.
- Ảnh → `avatar.*`, ghi âm → `audio.*`. Mỗi thư mục chỉ để **1** ảnh và **1** file ghi âm.
  Không có ảnh thì dùng hình minh hoạ chung `template/avatar.png`.
- Chưa có `kid.json` thì tự tạo; lời chúc lấy từ ghi âm (`transcript.json`).

(`npm run new-kid -- "Minh Anh"` vẫn dùng được nếu muốn tạo sẵn thư mục.)

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
- `wish` – tuỳ chọn, lời chúc gõ tay (nội dung ghi âm). `\n` để xuống dòng. Chữ được tô dần khi phát audio.
  Bỏ trống thì dùng lời chúc tự chuyển từ ghi âm (xem dưới).
- `date` – ngày dưới tên (mặc định `20/10/2026`).
- `avatarFocus` – tuỳ chọn, vị trí giữ lại khi cắt ảnh tròn (`"50% 20%"` = lấy cao hơn, ví dụ khi mặt ở sát trên).

## Lời chúc tự chuyển từ ghi âm

`npm run build` gửi file ghi âm lên Cloudflare Workers AI (Whisper) và lưu kết quả vào
`kids/<cháu>/transcript.json`:

```json
{ "audioHash": "…", "text": "Mẹ Ly ơi, con chúc mẹ 20/10 vui vẻ và xinh đẹp.\nCon yêu mẹ nhiều lắm ạ." }
```

- Chỉ chạy lại khi file ghi âm thay đổi, nên có thể **sửa tay `text`** (máy hay nghe sai giọng trẻ con) – bản sửa được giữ.
- Xoá `transcript.json` để chuyển lại từ đầu.
- Dùng tài khoản đã `npx wrangler login`, hoặc biến môi trường `CLOUDFLARE_API_TOKEN` (quyền Workers AI) + `CLOUDFLARE_ACCOUNT_ID`.
- Không kết nối được thì build vẫn chạy (chỉ cảnh báo), trừ khi cháu đó chưa có lời chúc nào.
- Nếu `kid.json` có `wish` thì trang dùng `wish`, không dùng transcript.
- `words` là thời điểm của từng từ trong ghi âm, dùng để tô chữ lời chúc kiểu karaoke. Máy nghe sai vài
  chữ vẫn khớp được; nếu lời chúc khác hẳn ghi âm thì chữ chạy theo sóng âm như cũ (build có cảnh báo).

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
