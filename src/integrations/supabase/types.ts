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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      new_part_orders: {
        Row: {
          admin_note: string | null
          brand: string
          created_at: string
          discount_amount: number | null
          engine: string | null
          id: string
          model: string | null
          oem_number: string | null
          part_name: string
          quantity: number
          status: Database["public"]["Enums"]["order_status"]
          total_price: number | null
          unit_price: number | null
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          admin_note?: string | null
          brand: string
          created_at?: string
          discount_amount?: number | null
          engine?: string | null
          id?: string
          model?: string | null
          oem_number?: string | null
          part_name: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
          user_id: string
          year?: number | null
        }
        Update: {
          admin_note?: string | null
          brand?: string
          created_at?: string
          discount_amount?: number | null
          engine?: string | null
          id?: string
          model?: string | null
          oem_number?: string | null
          part_name?: string
          quantity?: number
          status?: Database["public"]["Enums"]["order_status"]
          total_price?: number | null
          unit_price?: number | null
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
      parts_catalog: {
        Row: {
          available: boolean
          brand: string | null
          category: string | null
          created_at: string
          id: string
          name: string
          oem_code: string
          price: number
          updated_at: string
        }
        Insert: {
          available?: boolean
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          name: string
          oem_code: string
          price?: number
          updated_at?: string
        }
        Update: {
          available?: boolean
          brand?: string | null
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          oem_code?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          loyalty_active: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          loyalty_active?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          loyalty_active?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      service_bookings: {
        Row: {
          admin_note: string | null
          confirmed_date: string | null
          created_at: string
          discount_amount: number | null
          estimated_price: number | null
          final_price: number | null
          id: string
          note: string | null
          preferred_date: string
          replacement_vehicle_confirmed: boolean | null
          service_type: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          user_id: string
          vehicle_brand: string | null
          vehicle_model: string | null
          wants_replacement_vehicle: boolean
        }
        Insert: {
          admin_note?: string | null
          confirmed_date?: string | null
          created_at?: string
          discount_amount?: number | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          note?: string | null
          preferred_date: string
          replacement_vehicle_confirmed?: boolean | null
          service_type: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          user_id: string
          vehicle_brand?: string | null
          vehicle_model?: string | null
          wants_replacement_vehicle?: boolean
        }
        Update: {
          admin_note?: string | null
          confirmed_date?: string | null
          created_at?: string
          discount_amount?: number | null
          estimated_price?: number | null
          final_price?: number | null
          id?: string
          note?: string | null
          preferred_date?: string
          replacement_vehicle_confirmed?: boolean | null
          service_type?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          user_id?: string
          vehicle_brand?: string | null
          vehicle_model?: string | null
          wants_replacement_vehicle?: boolean
        }
        Relationships: []
      }
      used_part_requests: {
        Row: {
          admin_available: boolean | null
          admin_note: string | null
          admin_price: number | null
          brand: string
          created_at: string
          id: string
          model: string | null
          note: string | null
          part_name: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          user_id: string
          year: string | null
        }
        Insert: {
          admin_available?: boolean | null
          admin_note?: string | null
          admin_price?: number | null
          brand: string
          created_at?: string
          id?: string
          model?: string | null
          note?: string | null
          part_name: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id: string
          year?: string | null
        }
        Update: {
          admin_available?: boolean | null
          admin_note?: string | null
          admin_price?: number | null
          brand?: string
          created_at?: string
          id?: string
          model?: string | null
          note?: string | null
          part_name?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id?: string
          year?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_inquiries: {
        Row: {
          created_at: string
          email: string | null
          id: string
          message: string | null
          name: string | null
          phone: string | null
          status: string
          user_id: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string | null
          phone?: string | null
          status?: string
          user_id?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          message?: string | null
          name?: string | null
          phone?: string | null
          status?: string
          user_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_inquiries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          brand: string
          color: string | null
          condition: string | null
          created_at: string
          description: string | null
          engine: string | null
          fuel: string | null
          id: string
          images: string[] | null
          is_active: boolean
          mileage: number | null
          model: string
          power: string | null
          price: number
          transmission: string | null
          updated_at: string
          vin: string | null
          year: number
        }
        Insert: {
          brand: string
          color?: string | null
          condition?: string | null
          created_at?: string
          description?: string | null
          engine?: string | null
          fuel?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          mileage?: number | null
          model: string
          power?: string | null
          price: number
          transmission?: string | null
          updated_at?: string
          vin?: string | null
          year: number
        }
        Update: {
          brand?: string
          color?: string | null
          condition?: string | null
          created_at?: string
          description?: string | null
          engine?: string | null
          fuel?: string | null
          id?: string
          images?: string[] | null
          is_active?: boolean
          mileage?: number | null
          model?: string
          power?: string | null
          price?: number
          transmission?: string | null
          updated_at?: string
          vin?: string | null
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "customer"
      booking_status:
        | "pending"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
      order_status:
        | "pending"
        | "confirmed"
        | "shipped"
        | "delivered"
        | "cancelled"
      request_status:
        | "pending"
        | "quoted"
        | "accepted"
        | "rejected"
        | "fulfilled"
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
    Enums: {
      app_role: ["admin", "customer"],
      booking_status: [
        "pending",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      order_status: [
        "pending",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
      ],
      request_status: [
        "pending",
        "quoted",
        "accepted",
        "rejected",
        "fulfilled",
      ],
    },
  },
} as const
