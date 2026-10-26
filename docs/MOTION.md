# Motion & IntersectionObserver

Tài liệu cho lớp animation của VN-Tracking: **GSAP** làm animation, **IntersectionObserver**
quyết định thời điểm. Mục tiêu là hiệu ứng nhẹ, không chặn tương tác và không làm layout nhảy.

## 1. IntersectionObserver là gì?

`IntersectionObserver` là Web API báo cho JS biết khi một element **giao với viewport**
(hoặc với một element cha được chỉ định). Thay vì gắn `scroll` listener rồi liên tục đọc
`getBoundingClientRect()` (gây layout thrashing), browser tự tính toán và gọi callback.

```js
const observer = new IntersectionObserver(
  (entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target); // chỉ chạy 1 lần
      }
    });
  },
  {
    root: null,                 // null = viewport
    rootMargin: '0px 0px -8% 0px', // thu nhỏ vùng kích hoạt ở đáy
    threshold: 0.15             // 15% diện tích element lọt vào vùng root
  }
);

observer.observe(document.querySelector('.card'));
```

### Các option quan trọng

| Option | Ý nghĩa | Lưu ý |
| --- | --- | --- |
| `root` | Vùng quan sát | `null` = viewport. Nếu truyền element thì element đó phải là tổ tiên của target và có `overflow`/scroll. |
| `rootMargin` | Nới/thu vùng root, giống CSS margin | Dùng `"300px"` để preload sớm; dùng `"0px 0px -10% 0px"` để chờ element vào sâu hơn. |
| `threshold` | Tỉ lệ diện tích giao (0 → 1) hoặc mảng | `0.01` = vừa chạm; `0.5` = thấy một nửa; mảng `[0, 0.25, 1]` để bắt nhiều mốc. |

### Entry trả về

```js
{
  target,             // element đang quan sát
  isIntersecting,     // true nếu đang giao vùng root
  intersectionRatio,  // 0 → 1
  boundingClientRect, // rect của target
  rootBounds,         // rect của root (null nếu root bị clip)
  intersectionRect,   // phần giao thực tế
  time                // timestamp
}
```

### Những điểm dễ sai

1. **`display: none`** → element không được render, `isIntersecting` luôn `false`.
   Khi tab/panel được mở lại, observer sẽ tự báo lại, nhưng đừng chờ callback khi element
   còn ẩn.
2. **Element cao hơn viewport** → `intersectionRatio` không bao giờ đạt 1. Dùng
   `threshold: 0.01` hoặc `0`, đừng dùng `1`.
3. **`rootMargin` với %** tính theo kích thước root, không phải target.
4. **Không đọc layout trong callback** (trừ khi thật cần). Callback chạy trên main thread,
   đọc/ghi xen kẽ nhiều element sẽ gây jank. Nên gom lại rồi mới ghi DOM/khởi tạo tween.
5. **`unobserve`** khi chỉ muốn hiệu ứng một lần; nếu muốn chạy lại mỗi lần vào/ra thì
   giữ observe và xử lý cả hai chiều.
6. **Reduced motion**: người dùng bật "giảm chuyển động" thì đừng animate; hiện nội dung
   ngay. CSS của project đã bọc toàn bộ trong `@media (prefers-reduced-motion: no-preference)`.
7. **Lenis / smooth scroll**: Lenis vẫn cuộn document thật, nên `root: null` hoạt động
   bình thường. Chỉ cần `data-lenis-prevent` cho các vùng cuộn riêng (đã có sẵn trong app.js).

## 2. Cách project đang dùng

| File | Vai trò |
| --- | --- |
| `static/js/motion.js` | Tạo observer, chạy reveal/count-up/lazy-bg, pause animation off-screen, magnetic hover, page entrance, task-detail timeline và tab Kanban transition. |
| `static/css/motion.css` | Trạng thái ẩn ban đầu + fallback CSS khi GSAP không tải được. Chỉ active khi `<html>` có `.motion-ready`. |
| `templates/base.html` | Nạp `gsap.min.js` (defer) + `motion.js` (defer) + `motion.css`. |

Luồng hoạt động:

```
DOM parse xong
  └─ motion.js thêm .motion-ready / .motion-gsap
       └─ CSS giấu các element opt-in ([data-reveal]...)
            └─ IntersectionObserver theo dõi
                 └─ khi vào viewport: GSAP animate transform + opacity
                      └─ xong: thêm .is-revealed, clear inline style
```

Với reveal, GSAP không quyết định *khi nào* chạy — observer làm việc đó. Nhờ vậy không
cần `ScrollTrigger` (tránh thêm ~50KB và tránh phải đồng bộ thêm với Lenis). Riêng
task detail và chuyển tab là tương tác trực tiếp nên dùng timeline GSAP ngay khi click.

## 3. Cách dùng (opt-in)

Chỉ cần thêm data-attribute, không phải sửa JS:

```html
<!-- Reveal cơ bản -->
<div class="card" data-reveal>...</div>

<!-- Hướng / delay -->
<div data-reveal="left">...</div>
<div data-reveal="right" data-reveal-delay="0.15">...</div>
<div data-reveal="zoom">...</div>
<div data-reveal="fade">...</div>

<!-- Stagger các con trực tiếp -->
<div class="metrics-row" data-reveal-group="0.07">
  <div class="metric-card">...</div>
  <div class="metric-card">...</div>
</div>

<!-- Đếm số -->
<div class="metric-value" data-countup>1.234</div>
<div data-countup="85" data-countup-suffix="%">0%</div>
<div data-countup="1234" data-countup-format="vi">0</div>

<!-- Ảnh nền lazy -->
<div data-bg="/static/img/hero.webp"></div>

<!-- Nút magnetic -->
<button data-magnetic="0.2">Đăng nhập</button>

<!-- Tạm dừng CSS animation khi ra khỏi viewport -->
<section data-pause-offscreen>...</section>

<!-- Page entrance (chạy 1 lần khi load) -->
<main data-motion="page">
  <section data-motion-item>...</section>
  <section data-motion-item>...</section>
</main>
```

### Quy ước

- `data-reveal` và `data-reveal-group` **không nên lồng nhau trên cùng một element**.
- Con trực tiếp của group mặc định tham gia; muốn bỏ qua thì thêm `data-reveal-ignore`.
- Element đã `is-revealed` sẽ không animate lại (one-shot). Cần chạy lại thì gọi
  `VNMotion.refresh(scope)` sau khi render lại DOM.
- Nội dung mới render bằng JS: gọi `window.VNMotion.refresh(container)` hoặc để
  MutationObserver tự quét (đã bật, debounce 140ms).

## 4. API

```js
VNMotion.refresh(scope?) // quét lại subtree (sau khi render/thay tab)
VNMotion.reveal(elOrSelector) // hiện ngay, không animate
VNMotion.countUp(elOrSelector) // chạy lại count-up
VNMotion.taskOpen(modalEl, sourceCard?) // timeline mở trang task (Kanban click)
VNMotion.taskReset(modalEl) // hủy timeline + trả inline style về sạch
VNMotion.tabEnter(tabId) // cột Kanban của tab tuần mới trượt vào
VNMotion.reduced() // true nếu user bật giảm chuyển động
```

### Task detail (Kanban click)

`openModal()` gọi `VNMotion.taskOpen(modal, sourceCard)` sau khi thêm `.open`.
Timeline animate **container + nav + header + 2 cột nội dung** bằng `transform` và
`opacity`; không animate `width/height/top/left`. Khi đóng, `closeModal()`, Escape,
click overlay và chuyển tool page đều gọi `taskReset()` để lần mở sau không bị dính
trạng thái ẩn. Nếu GSAP lỗi hoặc user bật reduced motion, toàn bộ nội dung hiện ngay.

## 5. Thêm trang mới

1. Trang kế thừa `base.html` → đã tự có CSS/JS.
2. Thêm `data-reveal` cho khối nội dung chính, `data-reveal-group` cho hàng card.
3. Không cần thêm `IntersectionObserver` mới; dùng `VNMotion.refresh()` nếu render động.
4. Kiểm tra:
   - Tắt JS → nội dung vẫn hiển thị (không có `.motion-ready`).
   - Bật "giảm chuyển động" trong OS → không animate, nội dung hiện ngay.
   - Tab ẩn → mở lại → card vẫn reveal.
   - Cuộn nhanh / dùng Lenis → không giật, card vào đúng lúc.

## 6. Debug nhanh

```js
// Element nào chưa reveal?
[...document.querySelectorAll('[data-reveal]')]
  .filter(el => !el.classList.contains('is-revealed'))
  .map(el => el.className);

// Trạng thái lớp motion
document.documentElement.className; // motion-ready motion-gsap
window.VNMotion.version;

// Quan sát thủ công 1 element
new IntersectionObserver(e => console.log(e[0])).observe(document.querySelector('.card'));
```

> GSAP được load từ jsDelivr (`gsap@3`). Nếu CDN bị chặn, `motion.js` tự chuyển sang
> fallback CSS (`.motion-css`) và nội dung vẫn hiện bình thường.
