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
