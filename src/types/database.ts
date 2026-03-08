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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_organization_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      search_document_chunks: {
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
