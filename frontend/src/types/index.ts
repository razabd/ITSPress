export interface User {
  id: number;
  name: string;       // dari endpoint login/profile (gin.H memakai key "name")
  full_name?: string; // dari serialisasi model GORM (json tag "full_name"), dipakai saat preload
  email: string;
  role: 'pelanggan' | 'publisher' | 'admin';
  has_passphrase?: boolean;
}

export interface Book {
  ID: number;
  title: string;
  description: string;
  cover_url: string;
  format: string;
  price: number;
  publisher_id: number;
  publisher?: User;
  lcp_content_id?: string;
  encrypted_file_path?: string;
  is_withdrawn?: boolean;
  preview_page_count?: number;
  author?: string;
  published_year?: number;
  isbn?: string;
  page_count?: number;
}

export interface Transaction {
  ID: number;
  user_id: number;
  book_id: number;
  status: 'pending' | 'success' | 'failed';
  midtrans_order_id?: string;
  snap_token?: string;
  payment_url?: string;
  book?: Book;
  CreatedAt: string;
}

export interface License {
  ID: number;
  user_id: number;
  book_id: number;
  transaction_id: number;
  lcp_license_id: string;
  license_file_path: string;
  book?: Book;
  expires_at?: string;
  revoked_at?: string | null;
  CreatedAt: string;
}

export interface CartItem {
  ID: number;
  user_id: number;
  book_id: number;
  book?: Book;
  CreatedAt: string;
}
