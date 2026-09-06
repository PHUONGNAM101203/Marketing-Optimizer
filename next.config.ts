import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Bộ nhớ đệm phía trình duyệt cho các trang ĐỘNG — mặc định của Next là
     * TẮT (`dynamic: 0`), nghĩa là rời một trang rồi quay lại là nạp lại toàn
     * bộ từ server, kể cả khi vừa mới ở đó vài giây trước.
     *
     * Cả app này là trang động (mọi trang đọc dữ liệu theo site và khoảng
     * ngày), nên mặc định đó biến mỗi lần bấm qua lại giữa Tổng quan / Kênh /
     * Khám phá thành một lượt render đầy đủ kèm hàng chục truy vấn — trong khi
     * dữ liệu chỉ đổi mỗi giờ một lần theo lịch đồng bộ.
     *
     * 60 giây là mức thận trọng so với chu kỳ đồng bộ một giờ: dữ liệu cũ nhất
     * người dùng có thể thấy là 60 giây, đổi lại việc quay lại trang vừa xem là
     * tức thì. Bấm "Đồng bộ lại" vẫn thấy số mới ngay — hành động đó gọi
     * `router.refresh()`, và lệnh đó xoá sạch bộ đệm này chứ không đọc từ nó.
     */
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
}

export default nextConfig
