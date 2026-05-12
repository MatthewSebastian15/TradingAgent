// frontend/src/mockData.js

export const MOCK_RESPONSE = {
  ticker: "NVDA",
  decision: "Buy",
  full_decision: `**Rating**: Buy

**Executive Summary**: NVDA saat ini berada dalam posisi yang sangat kuat di industri semikonduktor global, terutama karena permintaan chip AI yang terus melonjak dari perusahaan-perusahaan teknologi besar. Pendapatan perusahaan tumbuh 262% dibanding tahun lalu, mencapai $26 miliar hanya dalam satu kuartal, angka yang belum pernah dicapai perusahaan chip manapun sebelumnya. Margin keuntungan operasional mereka mencapai 54%, artinya lebih dari separuh setiap dolar pendapatan langsung menjadi keuntungan bersih. Permintaan chip Blackwell generasi terbaru mereka sudah melebihi kapasitas produksi, dengan antrian pemesanan yang memanjang hingga tahun 2026. Dengan posisi monopoli de facto di pasar GPU untuk training AI, NVDA layak mendapat alokasi portofolio 5–7% dengan target masuk secara bertahap.

**Investment Thesis**: Bayangkan NVDA seperti perusahaan yang menjual sekop di tengah demam emas — hanya saja sekop mereka adalah satu-satunya yang bisa dipakai, dan semua penambang emas dunia antre membelinya. Setiap perusahaan yang ingin membangun sistem AI, mulai dari Microsoft, Google, Meta, hingga startup kecil, harus membeli GPU NVDA karena tidak ada alternatif yang setara. Ini yang disebut parit kompetitif: sangat sulit bagi pesaing untuk menyamainya dalam waktu dekat. Di sisi angka, revenue kuartal terakhir $26B tumbuh 262% YoY, margin operasional 54.1%, dan backlog order artinya pesanan yang sudah masuk tapi belum dikirim membentang hingga 2026. Risiko utama ada dua: pertama, regulasi ekspor Amerika ke China bisa memangkas sekitar 15–20% pasar potensial mereka; kedua, valuasi sahamnya mahal di P/E 35x forward, yang berarti pasar sudah memperhitungkan banyak pertumbuhan di harga sekarang. Namun kedua risiko ini sudah diketahui pasar dan sudah sebagian tercermin di harga. Bull case lebih kuat: siklus belanja infrastruktur AI baru saja dimulai, NVDA punya software moat lewat ekosistem CUDA yang sudah dipakai jutaan developer selama 15 tahun sehingga sangat sulit diganti, dan pipeline produk mereka di 2025-2026 terlihat lebih kuat dari generasi sebelumnya. Rekomendasi: beli bertahap dalam 2-3 transaksi, pasang stop loss di $850, dan siapkan horizon investasi minimal 3-6 bulan.

**Price Target**: 1050.0

**Time Horizon**: 3-6 months`,
  trade_date: "2026-05-12",
  agents_used: ["Market Analyst", "News Researcher", "Risk Manager", "Portfolio Manager"],
};

export const MOCK_SELL_RESPONSE = {
  ticker: "TSLA",
  decision: "Sell",
  full_decision: `**Rating**: Sell

**Executive Summary**: TSLA menghadapi tekanan dari dua arah sekaligus: persaingan harga yang semakin brutal dari produsen EV China dan penurunan margin keuntungan yang konsisten selama empat kuartal terakhir. Pangsa pasar mereka di China, yang sebelumnya menjadi mesin pertumbuhan utama, turun 8% dalam satu kuartal saja karena BYD dan Xiaomi menawarkan produk setara dengan harga jauh lebih murah. Margin gross otomotif mereka sudah jatuh ke 14.6% dari 19.3% setahun lalu, dan tren ini belum menunjukkan tanda pembalikan. Segmen robotaxi dan Optimus yang diharapkan menjadi katalis baru masih butuh waktu 2-3 tahun sebelum berkontribusi nyata ke pendapatan. Dengan risiko yang ada, mengurangi eksposur secara bertahap adalah langkah yang lebih bijak dibanding mempertahankan posisi penuh.

**Investment Thesis**: Masalah utama TSLA sekarang bukan soal teknologi, tapi soal harga dan persaingan yang makin berat di pasar yang paling penting baginya. Di China, BYD sudah menjual lebih banyak mobil listrik dari TSLA secara global, dan mereka melakukannya dengan harga yang 20-30% lebih murah untuk spesifikasi serupa. Untuk bersaing, TSLA terus memotong harga, dan ini langsung memukul margin keuntungan mereka. Setiap kali harga dipotong 5%, margin gross turun hampir proporsional karena biaya produksi mereka tidak turun secepat itu. Di Amerika, pasar EV premium mulai jenuh dan insentif pajak federal yang dulu membantu penjualan kini tidak sepasti dulu karena perubahan regulasi. Satu-satunya harapan jangka menengah adalah segmen energy storage dan software FSD (Full Self-Driving), tapi FSD masih dalam proses regulasi yang panjang di sebagian besar negara. Bear case lebih dominan saat ini: tidak ada katalis besar dalam 1-3 bulan ke depan yang bisa membalik tren margin negatif ini. Rekomendasi: kurangi posisi 50% sekarang, dan pertimbangkan exit penuh jika harga tidak recovery di atas $200 dalam 4 minggu ke depan. Stop loss ketat di $220.

**Price Target**: 155.0

**Time Horizon**: 1-3 months`,
  trade_date: "2026-05-12",
  agents_used: ["Market Analyst", "News Researcher", "Risk Manager", "Portfolio Manager"],
};

export const MOCK_HOLD_RESPONSE = {
  ticker: "AAPL",
  decision: "Hold",
  full_decision: `**Rating**: Hold

**Executive Summary**: AAPL saat ini berada di fase konsolidasi di mana bisnis intinya tetap sehat tapi belum ada pendorong pertumbuhan besar yang akan muncul dalam waktu dekat. Segmen Services mereka — yang mencakup App Store, Apple Music, iCloud, dan Apple TV — tumbuh 14% dan sekarang menyumbang hampir 25% dari total pendapatan, memberikan stabilitas yang tidak dimiliki perusahaan hardware murni. Di sisi lain, penjualan iPhone masih stagnan secara unit karena siklus upgrade pengguna melambat dan pasar smartphone premium global sudah relatif jenuh. Integrasi fitur AI di iOS 18 berpotensi menjadi alasan kuat bagi pengguna untuk upgrade di paruh kedua 2026, tapi dampaknya baru akan terlihat di laporan keuangan berikutnya. Dengan fundamentals yang kuat tapi upside terbatas jangka pendek, mempertahankan posisi saat ini adalah keputusan paling rasional.

**Investment Thesis**: AAPL adalah salah satu bisnis paling stabil di dunia, tapi stabil bukan berarti akan naik drastis dalam 3 bulan ke depan. Kekuatan terbesar mereka sekarang adalah ekosistem yang lengkap: begitu seseorang pakai iPhone, mereka cenderung beli Mac, AirPods, Apple Watch, dan berlangganan berbagai layanan Apple, menciptakan pendapatan berulang yang sangat dapat diprediksi. Margin gross mereka di 46% adalah salah satu yang tertinggi di industri hardware konsumen, mencerminkan kekuatan brand dan kemampuan mereka mematok harga premium. Tantangan jangka pendek adalah tidak adanya produk blockbuster baru yang siap diluncurkan — Apple Vision Pro masih niche, dan model iPhone terbaru tidak menghadirkan lompatan yang cukup besar untuk mendorong gelombang upgrade massal. Katalis terbesar yang ditunggu adalah siklus upgrade berbasis AI: jika fitur Apple Intelligence di iOS 18 terbukti berguna dan hanya berjalan optimal di chip A17 ke atas, ratusan juta pengguna iPhone lama punya alasan konkret untuk upgrade di H2 2026. Risiko yang perlu diawasi: tekanan regulasi antitrust terhadap App Store di Eropa dan Amerika bisa memangkas margin Services, yang sekarang menjadi mesin pertumbuhan utama. Hold berarti tidak perlu tambah posisi sekarang, tapi juga tidak ada alasan untuk keluar dari saham yang fundamentalnya sekuat ini.

**Price Target**: 210.0

**Time Horizon**: 6-12 months`,
  trade_date: "2026-05-12",
  agents_used: ["Market Analyst", "News Researcher", "Risk Manager", "Portfolio Manager"],
};

export const MOCK_ERROR_RESPONSE = {
  error: "Analysis failed: 429 RESOURCE_EXHAUSTED. Quota exceeded. Please retry in 60s.",
};