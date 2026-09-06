/**
 * Lọc video theo NGÀY ĐĂNG nằm trong khoảng đang chọn.
 *
 * Vì sao cần, dù danh sách đầu vào đã "theo khoảng ngày": số liệu của TikTok và
 * YouTube trong khoảng là LƯỢT TĂNG THÊM trong khoảng đó, nên một video đăng
 * từ tháng 6 vẫn lọt vào bảng "7 ngày qua" nếu tuần qua nó còn được xem thêm.
 * Về mặt phân tích thì đúng, nhưng đặt cạnh tab Tổng quan — nơi liệt kê video
 * THEO NGÀY ĐĂNG — hai bảng nói hai chuyện khác nhau dưới cùng một nhãn
 * "7 ngày qua", và đó là thứ khiến người xem mất lòng tin vào cả hai.
 *
 * Không đệm cho đủ N dòng: khoảng đó đăng một video thì bảng hiện đúng một
 * dòng. Thêm video ngoài khoảng cho "đầy bảng" là bịa.
 *
 * So bằng chuỗi `YYYY-MM-DD`: `posted_at` là ISO 8601 nên mười ký tự đầu đã là
 * ngày theo UTC, và so chuỗi trên cùng định dạng là so ngày. Đổi sang `Date`
 * rồi so sẽ kéo theo múi giờ của máy chủ — cùng lớp lỗi lệch-một-ngày mà phần
 * còn lại của app đã tránh bằng cách giữ nguyên chuỗi ngày.
 */
export const filterPostedInRange = <T extends { readonly createdAt: string | null }>(
  videos: readonly T[],
  startDate: string,
  endDate: string,
): readonly T[] => {
  // Thiếu mốc ngày thì giữ nguyên danh sách: lọc bằng một khoảng rỗng sẽ xoá
  // sạch bảng, mà "không biết khoảng" khác hẳn "không có video nào".
  if (!startDate || !endDate) return videos
  return videos.filter((video) => {
    if (!video.createdAt) return false
    const day = video.createdAt.slice(0, 10)
    return day >= startDate && day <= endDate
  })
}

/**
 * Bỏ video nền tảng đã thôi liệt kê ra khỏi bảng XẾP HẠNG.
 *
 * Bảng xếp hạng chỉ có năm dòng và trả lời câu "nên làm thêm nội dung kiểu
 * nào" — một video đã ẩn thì không hành động gì được với nó, mà nó lại chiếm
 * chỗ của video xếp sau đang còn chạy. Lọc ở đây rồi mới cắt năm dòng, nên
 * dòng kế tiếp tự dâng lên thay chỗ.
 *
 * KHÁC lưới "Toàn bộ video theo ngày đăng": ở đó video ẩn vẫn hiện, kèm huy
 * hiệu "Không khả dụng" — lưới đó là bản kiểm kê, giấu đi thì người dùng tưởng
 * video biến mất khỏi app.
 */
export const excludeUnavailable = <T extends { readonly unavailableSince: string | null }>(
  videos: readonly T[],
): readonly T[] => videos.filter((video) => video.unavailableSince === null)
