const translations: Record<string, string> = {
  "logic.waiting": "Menunggu proses dimulai.",
  "logic.checking": "Mengecek harga pasar...",
  "logic.processFailed": "Proses gagal. Cek log untuk detail.",
  "logic.noCompetitor": "Error: Tidak ditemukan kompetitor untuk produk ini.",
  "logic.outOfStock": "Produk Anda tidak ditemukan di 10 termurah (Stok habis atau tidak kompetitif).",
  "logic.onlySellerSetMax": "Anda satu-satunya penjual. Mengatur harga ke Maksimum.",
  "logic.onlySellerAtMax": "Anda satu-satunya penjual dan sudah di harga Maksimum.",
  "logic.maximizeProfit": "Memaksimalkan profit terhadap kompetitor #2 ({{competitorStoreName}}).",
  "logic.cheapestOptimal": "Anda sudah termurah; harga sudah optimal.",
  "logic.attackFromMax": "Menyerang {{competitorStoreName}} (rank #{{rank}}) dari harga Maksimum.",
  "logic.holdAtMax": "Bertahan di harga Maksimum; tidak ada target valid di atas.",
  "logic.undercutting": "Memotong harga {{competitorStoreName}} (rank #{{rank}}).",
  "logic.undercuttingNewTarget": "P1 terlalu murah. Memotong target baru {{competitorStoreName}} (rank #{{rank}}).",
  "logic.allCompetitorsTooCheap": "Semua kompetitor lebih murah dari Harga Minimum Anda. Menahan harga.",
  "logic.holdPrice": "Menahan harga; tidak ada target non-whitelist yang valid di atas.",
  "logic.matchingWhitelist": "Menyamakan harga dengan pemimpin whitelist {{competitorStoreName}}.",
  "logic.opportunisticMax": "P1 terlalu murah, P3 mahal. Mengatur ke harga Maksimum.",
  "logic.defendingVsP3": "Bertahan melawan {{competitorStoreName}} (rank #3).",
  "logic.noP3SetMax": "P1 terlalu murah dan tidak ada P3. Mengatur ke harga Maksimum.",
  "logic.profitMaximizationVsBelow": "Memaksimalkan profit terhadap kompetitor di bawah Anda ({{competitorStoreName}}).",
  "logic.updateSuccess": "Harga berhasil diperbarui ke Rp {{newPrice}}.",
  "logic.updateFail": "Gagal update: {{errorMessage}}",
  "logic.scrapeFail": "Gagal ambil data: {{errorMessage}}",
  "logic.violatesMinPrice": "Harga usulan Rp {{proposedPrice}} di bawah Min Price Rp {{minPrice}}. Menahan harga.",
  "logic.violatesMaxPrice": "Harga usulan Rp {{proposedPrice}} di atas Max Price Rp {{maxPrice}}. Menahan harga.",
  "logic.priceWarDetected": "Price War terdeteksi melawan {{rivalStoreName}}! Banting harga ke Rp {{newPrice}}.",
  "logic.priceWarRecovery": "Pemulihan Price War: Menyamakan harga P2 Rp {{newPrice}}.",
  "logic.priceWarCooldown": "Harga pasar di bawah floor. Bertahan di Harga Minimum Rp {{minPrice}} (vs {{rivalStoreName}}).",
};

export const formatMessage = (key: string, params?: any): string => {
  let message = translations[key] || key;
  
  if (params && typeof params === 'object') {
    Object.keys(params).forEach((paramKey) => {
      const value = params[paramKey];
      if (value !== undefined && value !== null) {
        // Mengganti {{key}} dengan value
        const regex = new RegExp(`\\{\\{\\s*${paramKey}\\s*\\}\\}`, 'g');
        message = message.replace(regex, String(value));
      }
    });
  }
  
  return message;
};