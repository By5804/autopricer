export interface Product {
  name: string;
  category?: string;
  product_id: number;
  minPrice: number;
  maxPrice: number;
  priceUndercutAmount?: number;
  game_id: number;
  item_type_id: number;
  item_info_group_id?: number;
  item_info_id: number;
  isActive: boolean;
  proposedPrice?: number; // New field
}

export interface ProductStatus extends Product {
  status: 'idle' | 'loading' | 'success' | 'error' | 'updated';
  message: string; // This will now be a translation key
  messageParams?: Record<string, string | number | undefined>;
  myPrice?: number;
  competitorPrice?: number;
  competitorStoreName?: string;
  newPrice?: number;
  myStock?: number;
  mySoldCount?: number;
  competitorStock?: number;
  competitorSoldCount?: number;
}