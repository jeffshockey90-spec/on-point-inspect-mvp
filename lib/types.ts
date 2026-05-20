export type Client = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at?: string;
};

export type Realtor = {
  id: string;
  full_name: string;
  brokerage: string | null;
  email: string | null;
  phone: string | null;
  created_at?: string;
};

export type Inspection = {
  id: string;
  client_id: string | null;
  realtor_id: string | null;
  property_address: string;
  square_feet: number | null;
  inspection_date: string | null;
  inspection_type: string | null;
  status: string | null;
  base_price: number | null;
  travel_fee: number | null;
  discount: number | null;
  total_price: number | null;
  agreement_status?: string | null;
  payment_status?: string | null;
  notes: string | null;
  created_at?: string;
  clients?: Client | null;
  realtors?: Realtor | null;
};

export type FindingPhoto = {
  id: string;
  finding_id: string;
  inspection_id: string;
  storage_path: string;
  public_url?: string;
  caption: string | null;
  ai_section_suggestion?: string | null;
  ai_defect_summary?: string | null;
  ai_confidence?: number | null;
  ai_review_status?: string | null;
  sort_order?: number | null;
  created_at?: string;
};

export type Finding = {
  id: string;
  inspection_id: string;
  section_name: string;
  title: string;
  observation: string | null;
  implication: string | null;
  recommendation: string | null;
  severity: string | null;
  status?: string | null;
  created_at?: string;
  photos?: FindingPhoto[];
};

export type Template = {
  id: string;
  category: string;
  title: string;
  observation: string | null;
  implication: string | null;
  recommendation: string | null;
  default_severity?: string | null;
};
