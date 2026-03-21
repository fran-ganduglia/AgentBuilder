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
      agent_automations: {
        Row: {
          action_config: Json
          action_type: string
          agent_id: string
          condition_config: Json
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_enabled: boolean
          last_run_at: string | null
          last_run_status: string | null
          name: string
          organization_id: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          agent_id: string
          condition_config?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          name: string
          organization_id: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          agent_id?: string
          condition_config?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          last_run_at?: string | null
          last_run_status?: string | null
          name?: string
          organization_id?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_automations_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agent_automations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_connections: {
        Row: {
          agent_id: string
          created_at: string | null
          id: string
          integration_id: string
          last_sync_error: string | null
          last_synced_at: string | null
          metadata: Json | null
          organization_id: string
          provider_agent_id: string
          provider_type: string
          remote_updated_at: string | null
          sync_status: string
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          id?: string
          integration_id: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          metadata?: Json | null
          organization_id: string
          provider_agent_id: string
          provider_type: string
          remote_updated_at?: string | null
          sync_status?: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          id?: string
          integration_id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          metadata?: Json | null
          organization_id?: string
          provider_agent_id?: string
          provider_type?: string
          remote_updated_at?: string | null
          sync_status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_connections_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agent_connections_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agent_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_documents: {
        Row: {
          agent_id: string
          chunk_count: number | null
          created_at: string | null
          deleted_at: string | null
          error_message: string | null
          file_name: string
          file_size_bytes: number | null
          file_type: string
          id: string
          organization_id: string
          status: string | null
          storage_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          agent_id: string
          chunk_count?: number | null
          created_at?: string | null
          deleted_at?: string | null
          error_message?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_type: string
          id?: string
          organization_id: string
          status?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          agent_id?: string
          chunk_count?: number | null
          created_at?: string | null
          deleted_at?: string | null
          error_message?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string
          id?: string
          organization_id?: string
          status?: string | null
          storage_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_documents_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agent_documents_uploaded_by_organization_id_fkey"
            columns: ["uploaded_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      agent_tools: {
        Row: {
          agent_id: string
          config: Json | null
          created_at: string | null
          id: string
          integration_id: string | null
          is_enabled: boolean | null
          organization_id: string
          tool_type: string
        }
        Insert: {
          agent_id: string
          config?: Json | null
          created_at?: string | null
          id?: string
          integration_id?: string | null
          is_enabled?: boolean | null
          organization_id: string
          tool_type: string
        }
        Update: {
          agent_id?: string
          config?: Json | null
          created_at?: string | null
          id?: string
          integration_id?: string | null
          is_enabled?: boolean | null
          organization_id?: string
          tool_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tools_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agent_tools_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      agent_versions: {
        Row: {
          agent_id: string
          change_note: string | null
          changed_by: string | null
          changed_by_type: string
          config: Json
          created_at: string | null
          id: string
          llm_model: string
          llm_provider: string
          organization_id: string
          system_prompt: string
          version_number: number
        }
        Insert: {
          agent_id: string
          change_note?: string | null
          changed_by?: string | null
          changed_by_type?: string
          config: Json
          created_at?: string | null
          id?: string
          llm_model: string
          llm_provider: string
          organization_id: string
          system_prompt: string
          version_number: number
        }
        Update: {
          agent_id?: string
          change_note?: string | null
          changed_by?: string | null
          changed_by_type?: string
          config?: Json
          created_at?: string | null
          id?: string
          llm_model?: string
          llm_provider?: string
          organization_id?: string
          system_prompt?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_versions_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      agents: {
        Row: {
          avatar: string | null
          created_at: string | null
          created_by: string
          current_version: number | null
          deleted_at: string | null
          description: string | null
          id: string
          language: string | null
          llm_model: string
          llm_provider: string
          llm_temperature: number | null
          max_conversations_per_day: number | null
          max_tokens: number | null
          memory_enabled: boolean | null
          memory_window: number | null
          name: string
          organization_id: string
          setup_state: Json | null
          status: string
          system_prompt: string
          tone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string | null
          created_by: string
          current_version?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          language?: string | null
          llm_model?: string
          llm_provider?: string
          llm_temperature?: number | null
          max_conversations_per_day?: number | null
          max_tokens?: number | null
          memory_enabled?: boolean | null
          memory_window?: number | null
          name: string
          organization_id: string
          setup_state?: Json | null
          status?: string
          system_prompt: string
          tone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string | null
          created_by?: string
          current_version?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          language?: string | null
          llm_model?: string
          llm_provider?: string
          llm_temperature?: number | null
          max_conversations_per_day?: number | null
          max_tokens?: number | null
          memory_enabled?: boolean | null
          memory_window?: number | null
          name?: string
          organization_id?: string
          setup_state?: Json | null
          status?: string
          system_prompt?: string
          tone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_created_by_organization_id_fkey"
            columns: ["created_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_items: {
        Row: {
          action: string
          agent_id: string
          context: Json
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          payload_summary: Json
          provider: string
          requested_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          risk_level: string
          status: string
          summary: string
          updated_at: string
          workflow_run_id: string
          workflow_step_id: string
        }
        Insert: {
          action: string
          agent_id: string
          context?: Json
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          payload_summary?: Json
          provider: string
          requested_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: string
          status?: string
          summary: string
          updated_at?: string
          workflow_run_id: string
          workflow_step_id: string
        }
        Update: {
          action?: string
          agent_id?: string
          context?: Json
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          payload_summary?: Json
          provider?: string
          requested_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: string
          status?: string
          summary?: string
          updated_at?: string
          workflow_run_id?: string
          workflow_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_items_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "approval_items_requested_by_organization_id_fkey"
            columns: ["requested_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "approval_items_resolved_by_organization_id_fkey"
            columns: ["resolved_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "approval_items_workflow_run_id_organization_id_fkey"
            columns: ["workflow_run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "approval_items_workflow_step_id_organization_id_fkey"
            columns: ["workflow_step_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs_2026_03: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_04: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_05: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_06: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_07: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_08: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_09: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_10: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_11: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_2026_12: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs_default: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          agent_id: string
          channel: string
          ended_at: string | null
          external_id: string | null
          id: string
          initiated_by: string | null
          message_count: number | null
          metadata: Json | null
          organization_id: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          agent_id: string
          channel?: string
          ended_at?: string | null
          external_id?: string | null
          id?: string
          initiated_by?: string | null
          message_count?: number | null
          metadata?: Json | null
          organization_id: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          agent_id?: string
          channel?: string
          ended_at?: string | null
          external_id?: string | null
          id?: string
          initiated_by?: string | null
          message_count?: number | null
          metadata?: Json | null
          organization_id?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "conversations_initiated_by_organization_id_fkey"
            columns: ["initiated_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      deletion_requests: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          id: string
          organization_id: string
          processed_at: string | null
          reason: string | null
          requested_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          id?: string
          organization_id: string
          processed_at?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          id?: string
          organization_id?: string
          processed_at?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deletion_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          agent_id: string
          chunk_index: number
          content: string
          created_at: string | null
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
          organization_id: string
        }
        Insert: {
          agent_id: string
          chunk_index?: number
          content: string
          created_at?: string | null
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
        }
        Update: {
          agent_id?: string
          chunk_index?: number
          content?: string
          created_at?: string | null
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_chunks_document_id_organization_id_fkey"
            columns: ["document_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agent_documents"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      event_queue: {
        Row: {
          attempts: number | null
          correlation_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          max_attempts: number | null
          organization_id: string
          payload: Json
          process_after: string | null
          processed_at: string | null
          status: string | null
          trace_id: string | null
        }
        Insert: {
          attempts?: number | null
          correlation_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          idempotency_key?: string | null
          max_attempts?: number | null
          organization_id: string
          payload: Json
          process_after?: string | null
          processed_at?: string | null
          status?: string | null
          trace_id?: string | null
        }
        Update: {
          attempts?: number | null
          correlation_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string | null
          max_attempts?: number | null
          organization_id?: string
          payload?: Json
          process_after?: string | null
          processed_at?: string | null
          status?: string | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credentials_history: {
        Row: {
          change_reason: string | null
          changed_by: string
          created_at: string | null
          id: string
          integration_id: string
          organization_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_by: string
          created_at?: string | null
          id?: string
          integration_id: string
          organization_id: string
        }
        Update: {
          change_reason?: string | null
          changed_by?: string
          created_at?: string | null
          id?: string
          integration_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_credentials_histo_integration_id_organization__fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "integration_credentials_history_changed_by_organization_id_fkey"
            columns: ["changed_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          created_at: string | null
          credentials: Json
          id: string
          integration_id: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credentials: Json
          id?: string
          integration_id: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credentials?: Json
          id?: string
          integration_id?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_secrets_integration_id_organization_id_fkey"
            columns: ["integration_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      integrations: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          is_active: boolean | null
          last_used: string | null
          metadata: Json | null
          name: string
          organization_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used?: string | null
          metadata?: Json | null
          name: string
          organization_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used?: string | null
          metadata?: Json | null
          name?: string
          organization_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_organization_id_fkey"
            columns: ["conversation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      messages_2026_03: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_04: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_05: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_06: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_07: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_08: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_09: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_10: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_11: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_12: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_default: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          llm_model: string | null
          metadata: Json | null
          organization_id: string
          response_time_ms: number | null
          role: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id: string
          response_time_ms?: number | null
          role: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          llm_model?: string | null
          metadata?: Json | null
          organization_id?: string
          response_time_ms?: number | null
          role?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          organization_id: string
          resource_id: string | null
          resource_type: string | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          organization_id: string
          resource_id?: string | null
          resource_type?: string | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          organization_id?: string
          resource_id?: string | null
          resource_type?: string | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_organization_id_fkey"
            columns: ["user_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organization_webhooks: {
        Row: {
          created_at: string | null
          events: string[]
          id: string
          is_active: boolean | null
          last_triggered: string | null
          name: string
          organization_id: string
          secret_encrypted: string
          secret_hint: string | null
          updated_at: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          events: string[]
          id?: string
          is_active?: boolean | null
          last_triggered?: string | null
          name: string
          organization_id: string
          secret_encrypted: string
          secret_hint?: string | null
          updated_at?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          events?: string[]
          id?: string
          is_active?: boolean | null
          last_triggered?: string | null
          name?: string
          organization_id?: string
          secret_encrypted?: string
          secret_hint?: string | null
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          plan_id: string
          settings: Json | null
          slug: string
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          plan_id: string
          settings?: Json | null
          slug: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          plan_id?: string
          settings?: Json | null
          slug?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          max_agents: number
          max_messages_month: number
          max_users: number
          name: string
          price_monthly_usd: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_agents: number
          max_messages_month: number
          max_users: number
          name: string
          price_monthly_usd?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_agents?: number
          max_messages_month?: number
          max_users?: number
          name?: string
          price_monthly_usd?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      provider_budget_allocations: {
        Row: {
          consumed_at: string | null
          created_at: string
          decision: string
          expires_at: string | null
          id: string
          metadata: Json
          method_key: string
          organization_id: string
          provider: string
          released_at: string | null
          reserved_at: string
          status: string
          units: number
          updated_at: string
          window_key: string
          workflow_run_id: string
          workflow_step_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          decision: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          method_key: string
          organization_id: string
          provider: string
          released_at?: string | null
          reserved_at?: string
          status?: string
          units?: number
          updated_at?: string
          window_key: string
          workflow_run_id: string
          workflow_step_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          decision?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          method_key?: string
          organization_id?: string
          provider?: string
          released_at?: string | null
          reserved_at?: string
          status?: string
          units?: number
          updated_at?: string
          window_key?: string
          workflow_run_id?: string
          workflow_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_budget_allocations_workflow_run_id_organization_i_fkey"
            columns: ["workflow_run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "provider_budget_allocations_workflow_step_id_organization__fkey"
            columns: ["workflow_step_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      runtime_events: {
        Row: {
          action_id: string | null
          approval_item_id: string | null
          created_at: string
          id: string
          latency_ms: number | null
          node: string | null
          organization_id: string
          payload: Json
          provider: string | null
          provider_request_id: string | null
          reason: string | null
          runtime_run_id: string
          status: string | null
          workflow_run_id: string | null
          workflow_step_id: string | null
        }
        Insert: {
          action_id?: string | null
          approval_item_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          node?: string | null
          organization_id: string
          payload?: Json
          provider?: string | null
          provider_request_id?: string | null
          reason?: string | null
          runtime_run_id: string
          status?: string | null
          workflow_run_id?: string | null
          workflow_step_id?: string | null
        }
        Update: {
          action_id?: string | null
          approval_item_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          node?: string | null
          organization_id?: string
          payload?: Json
          provider?: string | null
          provider_request_id?: string | null
          reason?: string | null
          runtime_run_id?: string
          status?: string | null
          workflow_run_id?: string | null
          workflow_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runtime_events_approval_item_id_organization_id_fkey"
            columns: ["approval_item_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "approval_items"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "runtime_events_runtime_run_id_organization_id_fkey"
            columns: ["runtime_run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "runtime_runs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "runtime_events_workflow_run_id_organization_id_fkey"
            columns: ["workflow_run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "runtime_events_workflow_step_id_organization_id_fkey"
            columns: ["workflow_step_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      runtime_runs: {
        Row: {
          action_plan: Json
          agent_id: string
          checkpoint_node: string | null
          conversation_id: string | null
          created_at: string
          current_action_index: number
          estimated_cost_usd: number
          finished_at: string | null
          id: string
          llm_calls: number
          organization_id: string
          planner_confidence: number | null
          planner_model: string | null
          request_id: string
          started_at: string
          status: string
          tokens_input: number
          tokens_output: number
          trace_id: string
          updated_at: string
        }
        Insert: {
          action_plan?: Json
          agent_id: string
          checkpoint_node?: string | null
          conversation_id?: string | null
          created_at?: string
          current_action_index?: number
          estimated_cost_usd?: number
          finished_at?: string | null
          id?: string
          llm_calls?: number
          organization_id: string
          planner_confidence?: number | null
          planner_model?: string | null
          request_id: string
          started_at?: string
          status?: string
          tokens_input?: number
          tokens_output?: number
          trace_id: string
          updated_at?: string
        }
        Update: {
          action_plan?: Json
          agent_id?: string
          checkpoint_node?: string | null
          conversation_id?: string | null
          created_at?: string
          current_action_index?: number
          estimated_cost_usd?: number
          finished_at?: string | null
          id?: string
          llm_calls?: number
          organization_id?: string
          planner_confidence?: number | null
          planner_model?: string | null
          request_id?: string
          started_at?: string
          status?: string
          tokens_input?: number
          tokens_output?: number
          trace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "runtime_runs_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "runtime_runs_conversation_id_organization_id_fkey"
            columns: ["conversation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "runtime_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      runtime_usage_events: {
        Row: {
          action_type: string | null
          agent_id: string
          approval_item_id: string | null
          created_at: string
          estimated_cost_usd: number
          id: string
          metadata: Json
          occurred_at: string
          organization_id: string
          provider: string | null
          provider_request_id: string | null
          quantity: number
          runtime_run_id: string
          surface: string | null
          tokens_input: number
          tokens_output: number
          usage_kind: string
          workflow_run_id: string | null
          workflow_step_id: string | null
        }
        Insert: {
          action_type?: string | null
          agent_id: string
          approval_item_id?: string | null
          created_at?: string
          estimated_cost_usd?: number
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          provider?: string | null
          provider_request_id?: string | null
          quantity?: number
          runtime_run_id: string
          surface?: string | null
          tokens_input?: number
          tokens_output?: number
          usage_kind: string
          workflow_run_id?: string | null
          workflow_step_id?: string | null
        }
        Update: {
          action_type?: string | null
          agent_id?: string
          approval_item_id?: string | null
          created_at?: string
          estimated_cost_usd?: number
          id?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          provider?: string | null
          provider_request_id?: string | null
          quantity?: number
          runtime_run_id?: string
          surface?: string | null
          tokens_input?: number
          tokens_output?: number
          usage_kind?: string
          workflow_run_id?: string | null
          workflow_step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runtime_usage_events_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "runtime_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runtime_usage_events_runtime_run_id_organization_id_fkey"
            columns: ["runtime_run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "runtime_runs"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      usage_records: {
        Row: {
          agent_id: string | null
          created_at: string | null
          estimated_cost_usd: number | null
          id: string
          llm_provider: string | null
          organization_id: string
          period_end: string
          period_start: string
          total_conversations: number | null
          total_messages: number | null
          total_tokens_input: number | null
          total_tokens_output: number | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          llm_provider?: string | null
          organization_id: string
          period_end: string
          period_start: string
          total_conversations?: number | null
          total_messages?: number | null
          total_tokens_input?: number | null
          total_tokens_output?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          llm_provider?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          total_conversations?: number | null
          total_messages?: number | null
          total_tokens_input?: number | null
          total_tokens_output?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "usage_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_agent_permissions: {
        Row: {
          agent_id: string
          can_edit: boolean | null
          can_use: boolean | null
          created_at: string | null
          granted_by: string
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          agent_id: string
          can_edit?: boolean | null
          can_use?: boolean | null
          created_at?: string | null
          granted_by: string
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          agent_id?: string
          can_edit?: boolean | null
          can_use?: boolean | null
          created_at?: string | null
          granted_by?: string
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_agent_permissions_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "user_agent_permissions_granted_by_organization_id_fkey"
            columns: ["granted_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "user_agent_permissions_user_id_organization_id_fkey"
            columns: ["user_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_organization_id_fkey"
            columns: ["user_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      user_sessions_2026_03: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions_2026_04: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions_2026_05: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions_2026_06: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions_2026_07: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions_2026_08: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions_2026_09: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions_2026_10: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions_2026_11: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions_2026_12: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_sessions_default: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          ip_address: unknown
          is_valid: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          last_login: string | null
          organization_id: string
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          last_login?: string | null
          organization_id: string
          role?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login?: string | null
          organization_id?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number | null
          created_at: string | null
          event_type: string
          http_status_code: number | null
          id: string
          last_attempted_at: string | null
          max_attempts: number | null
          next_attempt_at: string | null
          organization_id: string
          payload: Json
          response_body: string | null
          status: string
          webhook_id: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string | null
          event_type: string
          http_status_code?: number | null
          id?: string
          last_attempted_at?: string | null
          max_attempts?: number | null
          next_attempt_at?: string | null
          organization_id: string
          payload: Json
          response_body?: string | null
          status?: string
          webhook_id: string
        }
        Update: {
          attempts?: number | null
          created_at?: string | null
          event_type?: string
          http_status_code?: number | null
          id?: string
          last_attempted_at?: string | null
          max_attempts?: number | null
          next_attempt_at?: string | null
          organization_id?: string
          payload?: Json
          response_body?: string | null
          status?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_organization_id_fkey"
            columns: ["webhook_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "organization_webhooks"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          agent_id: string
          automation_preset: string
          conversation_id: string | null
          created_at: string
          created_by: string | null
          current_step_id: string | null
          failure_code: string | null
          failure_message: string | null
          finished_at: string | null
          id: string
          last_transition_at: string
          metadata: Json
          organization_id: string
          started_at: string | null
          status: string
          trigger_event_type: string | null
          trigger_source: string
          updated_at: string
          workflow_template_id: string | null
        }
        Insert: {
          agent_id: string
          automation_preset: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          current_step_id?: string | null
          failure_code?: string | null
          failure_message?: string | null
          finished_at?: string | null
          id?: string
          last_transition_at?: string
          metadata?: Json
          organization_id: string
          started_at?: string | null
          status?: string
          trigger_event_type?: string | null
          trigger_source: string
          updated_at?: string
          workflow_template_id?: string | null
        }
        Update: {
          agent_id?: string
          automation_preset?: string
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          current_step_id?: string | null
          failure_code?: string | null
          failure_message?: string | null
          finished_at?: string | null
          id?: string
          last_transition_at?: string
          metadata?: Json
          organization_id?: string
          started_at?: string | null
          status?: string
          trigger_event_type?: string | null
          trigger_source?: string
          updated_at?: string
          workflow_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_agent_id_organization_id_fkey"
            columns: ["agent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_runs_conversation_id_organization_id_fkey"
            columns: ["conversation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_runs_created_by_organization_id_fkey"
            columns: ["created_by", "organization_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "workflow_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          action: string
          approval_policy: string
          approval_timeout_ms: number | null
          attempt: number
          compensation_action: string | null
          compensation_status: string
          created_at: string
          error_code: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          input_payload: Json
          is_required: boolean
          max_attempts: number
          organization_id: string
          output_payload: Json | null
          provider: string
          provider_request_key: string | null
          queued_at: string
          started_at: string | null
          status: string
          step_id: string
          step_index: number
          updated_at: string
          workflow_run_id: string
        }
        Insert: {
          action: string
          approval_policy?: string
          approval_timeout_ms?: number | null
          attempt?: number
          compensation_action?: string | null
          compensation_status?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          input_payload?: Json
          is_required?: boolean
          max_attempts?: number
          organization_id: string
          output_payload?: Json | null
          provider: string
          provider_request_key?: string | null
          queued_at?: string
          started_at?: string | null
          status?: string
          step_id: string
          step_index: number
          updated_at?: string
          workflow_run_id: string
        }
        Update: {
          action?: string
          approval_policy?: string
          approval_timeout_ms?: number | null
          attempt?: number
          compensation_action?: string | null
          compensation_status?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          input_payload?: Json
          is_required?: boolean
          max_attempts?: number
          organization_id?: string
          output_payload?: Json | null
          provider?: string
          provider_request_key?: string | null
          queued_at?: string
          started_at?: string | null
          status?: string
          step_id?: string
          step_index?: number
          updated_at?: string
          workflow_run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_run_id_organization_id_fkey"
            columns: ["workflow_run_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_event_queue_events: {
        Args: { p_event_types: string[]; p_limit?: number }
        Returns: {
          attempts: number | null
          correlation_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          event_type: string
          id: string
          idempotency_key: string | null
          max_attempts: number | null
          organization_id: string
          payload: Json
          process_after: string | null
          processed_at: string | null
          status: string | null
          trace_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "event_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_organization_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      increment_conversation_message_count: {
        Args: { p_id: string; p_org_id: string }
        Returns: undefined
      }
      increment_usage_messages: {
        Args: {
          p_agent_id: string
          p_llm_provider: string
          p_organization_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: number
      }
      search_document_chunks:
        | {
            Args: {
              p_agent_id: string
              p_embedding: string
              p_match_count?: number
              p_organization_id: string
              p_threshold?: number
            }
            Returns: {
              chunk_index: number
              content: string
              document_id: string
              id: string
              metadata: Json
              similarity: number
            }[]
          }
        | {
            Args: {
              p_agent_id: string
              p_embedding: string
              p_match_count?: number
              p_organization_id: string
              p_threshold?: number
            }
            Returns: {
              chunk_index: number
              content: string
              document_id: string
              id: string
              metadata: Json
              similarity: number
            }[]
          }
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
