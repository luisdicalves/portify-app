export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      holdings: {
        Row: {
          avg_price: number
          created_at: string | null
          currency: string | null
          id: string
          name: string | null
          ticker: string
          units: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_price: number
          created_at?: string | null
          currency?: string | null
          id?: string
          name?: string | null
          ticker: string
          units: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_price?: number
          created_at?: string | null
          currency?: string | null
          id?: string
          name?: string | null
          ticker?: string
          units?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "investor_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_plans: {
        Row: {
          amount: number
          created_at: string | null
          frequency: string
          goal_amount: number | null
          horizon_years: number
          id: string
          plan_updated_at: string | null
          preferred_asset_classes: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          frequency: string
          goal_amount?: number | null
          horizon_years: number
          id?: string
          plan_updated_at?: string | null
          preferred_asset_classes?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          frequency?: string
          goal_amount?: number | null
          horizon_years?: number
          id?: string
          plan_updated_at?: string | null
          preferred_asset_classes?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "investor_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "investment_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          allocated_bond_etf: number | null
          allocated_etf: number | null
          allocated_stock: number | null
          avatar_url: string | null
          created_at: string | null
          date_of_birth: string | null
          estimated_rate: number | null
          experience_level: string | null
          financial_status: string | null
          first_name: string | null
          free_funds_annual_rate_pct: number | null
          id: string
          investment_goal: string | null
          investor_since: number | null
          last_name: string | null
          liquidity_need: string | null
          market_reaction: string | null
          pin_hash: string | null
          preferred_sectors: string[] | null
          profile_updated_at: string | null
          risk_profile: string | null
          risk_score: number | null
          uninvested_cash: number | null
          user_handle: string | null
        }
        Insert: {
          allocated_bond_etf?: number | null
          allocated_etf?: number | null
          allocated_stock?: number | null
          avatar_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          estimated_rate?: number | null
          experience_level?: string | null
          financial_status?: string | null
          first_name?: string | null
          free_funds_annual_rate_pct?: number | null
          id: string
          investment_goal?: string | null
          investor_since?: number | null
          last_name?: string | null
          liquidity_need?: string | null
          market_reaction?: string | null
          pin_hash?: string | null
          preferred_sectors?: string[] | null
          profile_updated_at?: string | null
          risk_profile?: string | null
          risk_score?: number | null
          uninvested_cash?: number | null
          user_handle?: string | null
        }
        Update: {
          allocated_bond_etf?: number | null
          allocated_etf?: number | null
          allocated_stock?: number | null
          avatar_url?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          estimated_rate?: number | null
          experience_level?: string | null
          financial_status?: string | null
          first_name?: string | null
          free_funds_annual_rate_pct?: number | null
          id?: string
          investment_goal?: string | null
          investor_since?: number | null
          last_name?: string | null
          liquidity_need?: string | null
          market_reaction?: string | null
          pin_hash?: string | null
          preferred_sectors?: string[] | null
          profile_updated_at?: string | null
          risk_profile?: string | null
          risk_score?: number | null
          uninvested_cash?: number | null
          user_handle?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          currency: string | null
          executed_at: string | null
          external_id: string | null
          id: string
          notes: string | null
          price: number | null
          ticker: string | null
          type: string
          units: number | null
          user_id: string
        }
        Insert: {
          amount: number
          currency?: string | null
          executed_at?: string | null
          external_id?: string | null
          id?: string
          notes?: string | null
          price?: number | null
          ticker?: string | null
          type: string
          units?: number | null
          user_id: string
        }
        Update: {
          amount?: number
          currency?: string | null
          executed_at?: string | null
          external_id?: string | null
          id?: string
          notes?: string | null
          price?: number | null
          ticker?: string | null
          type?: string
          units?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "investor_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      investor_profiles: {
        Row: {
          allocated_bond_etf: number | null
          allocated_etf: number | null
          allocated_stock: number | null
          estimated_rate: number | null
          experience_level: string | null
          financial_status: string | null
          frequency: string | null
          goal_amount: number | null
          horizon_years: number | null
          investment_goal: string | null
          liquidity_need: string | null
          market_reaction: string | null
          monthly_amount: number | null
          onboarding_complete: boolean | null
          preferred_asset_classes: string[] | null
          preferred_sectors: string[] | null
          risk_profile: string | null
          risk_score: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_username_available: { Args: { p_handle: string }; Returns: boolean }
      get_email_by_handle: { Args: { p_handle: string }; Returns: string | null }
      set_pin: { Args: { p_pin: string }; Returns: undefined }
      verify_pin: { Args: { p_pin: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
