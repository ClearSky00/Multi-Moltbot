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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      agents: {
        Row: {
          agents_content: string | null
          created_at: string | null
          icon: string | null
          id: string
          is_preset: boolean | null
          model: string | null
          name: string
          priority: string | null
          role: string | null
          sandbox_mode: string | null
          soul_content: string | null
          status: string | null
          tools_allow: Json | null
          tools_deny: Json | null
          updated_at: string | null
          user_id: string | null
          workspace: string | null
        }
        Insert: {
          agents_content?: string | null
          created_at?: string | null
          icon?: string | null
          id: string
          is_preset?: boolean | null
          model?: string | null
          name: string
          priority?: string | null
          role?: string | null
          sandbox_mode?: string | null
          soul_content?: string | null
          status?: string | null
          tools_allow?: Json | null
          tools_deny?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workspace?: string | null
        }
        Update: {
          agents_content?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_preset?: boolean | null
          model?: string | null
          name?: string
          priority?: string | null
          role?: string | null
          sandbox_mode?: string | null
          soul_content?: string | null
          status?: string | null
          tools_allow?: Json | null
          tools_deny?: Json | null
          updated_at?: string | null
          user_id?: string | null
          workspace?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          agent_id: string | null
          created_at: string | null
          event_type: string
          id: string
          payload: Json | null
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      builds: {
        Row: {
          agent_id: string | null
          artifact_url: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          output: string | null
          started_at: string | null
          status: string
          task_id: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          artifact_url?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          output?: string | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          artifact_url?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          output?: string | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "builds_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builds_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      checkpoints: {
        Row: {
          action_description: string
          action_payload: Json | null
          agent_id: string
          created_at: string | null
          decided_at: string | null
          decision: string | null
          id: string
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          action_description: string
          action_payload?: Json | null
          agent_id: string
          created_at?: string | null
          decided_at?: string | null
          decision?: string | null
          id?: string
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          action_description?: string
          action_payload?: Json | null
          agent_id?: string
          created_at?: string | null
          decided_at?: string | null
          decision?: string | null
          id?: string
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkpoints_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      skills: {
        Row: {
          agent_id: string | null
          description: string | null
          enabled: boolean | null
          id: string
          installed_at: string | null
          name: string
          scope: string
          skill_content: string | null
          skill_id: string | null
          updated_at: string | null
          user_id: string | null
          version: string | null
        }
        Insert: {
          agent_id?: string | null
          description?: string | null
          enabled?: boolean | null
          id: string
          installed_at?: string | null
          name: string
          scope?: string
          skill_content?: string | null
          skill_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          version?: string | null
        }
        Update: {
          agent_id?: string | null
          description?: string | null
          enabled?: boolean | null
          id?: string
          installed_at?: string | null
          name?: string
          scope?: string
          skill_content?: string | null
          skill_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skills_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          agent_id: string | null
          created_at: string | null
          error: string | null
          goal: string | null
          id: string
          progress: number | null
          result: string | null
          status: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          error?: string | null
          goal?: string | null
          id?: string
          progress?: number | null
          result?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          error?: string | null
          goal?: string | null
          id?: string
          progress?: number | null
          result?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_agent_preferences: {
        Row: {
          agent_id: string
          id: string
          model: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          id?: string
          model?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          id?: string
          model?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_agent_preferences_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          user_id: string | null
          value: Json | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          user_id?: string | null
          value?: Json | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          user_id?: string | null
          value?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
