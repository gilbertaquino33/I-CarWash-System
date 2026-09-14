export interface Shop {
  id: number;
  shop_name: string;
  province: string;
  city: string;
  barangay: string;
  total_bays: number;
  owner_id: string | null;
}

export interface ShopReviewStats {
  shop_id: number;
  review_count: number;
  avg_rating: number;
}

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface ShopReview {
  id: number;
  shop_id: number;
  customer_name: string;
  customer_email: string;
  rating: number;
  comment: string;
  status: ReviewStatus;
  created_at: string;
}

export type ServiceType = "walk-in-wash" | "online-reservation" | "home-service";
export type QuoteStatus = "new" | "contacted" | "closed";

export interface QuoteRequest {
  id: number;
  shop_id: number;
  full_name: string;
  email: string;
  phone: string;
  service_type: ServiceType;
  preferred_date: string | null;
  message: string | null;
  status: QuoteStatus;
  created_at: string;
}

export type ProfileRole = "admin" | "staff" | "customer";

export interface Profile {
  id: string;
  full_name: string;
  email_address: string;
  mobile: string | null;
  role: ProfileRole;
  shop_id: number | null;
  avatar_url: string | null;
  created_at?: string;
}
