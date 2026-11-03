export type Meat = 'chicken' | 'beef' | 'one';

export interface Variant {
  id: string;
  meat: Meat;
  label: string;
  price: number | null; // null => price not set, not orderable
  nutrition: string | null;
  image: string | null;
}

export interface Product {
  id: string;
  slug: string;
  category: string;
  name: string;
  tagline: string | null;
  description: string | null;
  ingredients: string[];
  image: string | null;
  extraGroupId: string | null;
  variants: Variant[];
}

export interface Extra {
  id: string;
  slug: string;
  name: string;
  price: number;
  groupId: string;
}

export interface Branch {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  address: string;
  map_url: string | null;
  lat: number | null;
  lon: number | null;
  coords_verified: boolean;
  delivery_radius_km: number;
  delivery_fee_kzt: number;
  min_order_kzt: number;
  is_active: boolean;
  accepts_orders: boolean;
}

export interface Hours {
  branch_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
}

export interface Catalog {
  configured: boolean;
  products: Product[];
  extras: Extra[];
  branches: Branch[];
  hours: Hours[];
  /** Almaty service area, outer rings of [lon, lat] */
  area: [number, number][][];
}

export type OrderStatus =
  | 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COURIER_ASSIGNED'
  | 'PICKED_UP' | 'ON_THE_WAY' | 'DELIVERED' | 'CANCELLED';

export interface OrderItemRow {
  id: string;
  product_name: string;
  meat: Meat;
  quantity: number;
  unit_price_kzt: number;
  line_total_kzt: number;
  extras: { id: string; name: string; price_kzt: number }[];
}

export interface OrderRow {
  id: string;
  order_no: number;
  user_id: string;
  branch_id: string;
  status: OrderStatus;
  mode: 'DELIVERY' | 'PICKUP';
  contact_phone: string;
  customer_name: string | null;
  address_text: string | null;
  lat: number | null;
  lon: number | null;
  apartment: string | null;
  entrance: string | null;
  floor: string | null;
  intercom: string | null;
  courier_instructions: string | null;
  note: string | null;
  scheduled_for: string | null;
  subtotal_kzt: number;
  discount_kzt: number;
  delivery_fee_kzt: number;
  total_kzt: number;
  payment_method: 'KASPI_QR' | 'ONLINE' | 'CASH';
  courier_id: string | null;
  created_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  order_items?: OrderItemRow[];
}
