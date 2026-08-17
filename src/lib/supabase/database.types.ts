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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_runs: {
        Row: {
          aeo_score: number | null
          aio_score: number | null
          blocked_by_bot_protection: boolean
          completed_at: string | null
          error: string | null
          findings: Json
          geo_score: number | null
          global_keyword_suggestions: Json
          id: string
          page_citability: Json
          page_signals: Json | null
          pages_scanned: number
          pagespeed: Json | null
          seo_score: number | null
          site_id: string
          site_profile: Json | null
          sitemap_url_count: number
          started_at: string
          started_by: string | null
          status: string
          truncated: boolean
        }
        Insert: {
          aeo_score?: number | null
          aio_score?: number | null
          blocked_by_bot_protection?: boolean
          completed_at?: string | null
          error?: string | null
          findings?: Json
          geo_score?: number | null
          global_keyword_suggestions?: Json
          id?: string
          page_citability?: Json
          page_signals?: Json | null
          pages_scanned?: number
          pagespeed?: Json | null
          seo_score?: number | null
          site_id: string
          site_profile?: Json | null
          sitemap_url_count?: number
          started_at?: string
          started_by?: string | null
          status?: string
          truncated?: boolean
        }
        Update: {
          aeo_score?: number | null
          aio_score?: number | null
          blocked_by_bot_protection?: boolean
          completed_at?: string | null
          error?: string | null
          findings?: Json
          geo_score?: number | null
          global_keyword_suggestions?: Json
          id?: string
          page_citability?: Json
          page_signals?: Json | null
          pages_scanned?: number
          pagespeed?: Json | null
          seo_score?: number | null
          site_id?: string
          site_profile?: Json | null
          sitemap_url_count?: number
          started_at?: string
          started_by?: string | null
          status?: string
          truncated?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "audit_runs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_secrets: {
        Row: {
          access_token_enc: string
          connection_id: string
          expires_at: string | null
          refresh_token_enc: string | null
          updated_at: string
        }
        Insert: {
          access_token_enc: string
          connection_id: string
          expires_at?: string | null
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Update: {
          access_token_enc?: string
          connection_id?: string
          expires_at?: string | null
          refresh_token_enc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          account_name: string
          avatar_url: string | null
          connected_at: string
          connected_by: string | null
          error_at: string | null
          error_code: string | null
          error_message: string | null
          external_account_id: string
          id: string
          last_synced_at: string | null
          provider: string
          scopes: string[]
          site_id: string
          status: Database["public"]["Enums"]["connection_status"]
        }
        Insert: {
          account_name: string
          avatar_url?: string | null
          connected_at?: string
          connected_by?: string | null
          error_at?: string | null
          error_code?: string | null
          error_message?: string | null
          external_account_id: string
          id?: string
          last_synced_at?: string | null
          provider: string
          scopes?: string[]
          site_id: string
          status?: Database["public"]["Enums"]["connection_status"]
        }
        Update: {
          account_name?: string
          avatar_url?: string | null
          connected_at?: string
          connected_by?: string | null
          error_at?: string | null
          error_code?: string | null
          error_message?: string | null
          external_account_id?: string
          id?: string
          last_synced_at?: string | null
          provider?: string
          scopes?: string[]
          site_id?: string
          status?: Database["public"]["Enums"]["connection_status"]
        }
        Relationships: [
          {
            foreignKeyName: "connections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      metrics_daily: {
        Row: {
          clicks: number
          connection_id: string
          conversion_value_micros: number
          conversions: number
          cost_micros: number
          date: string
          extra: Json
          impressions: number
          sessions: number
          synced_at: string
          users: number
        }
        Insert: {
          clicks?: number
          connection_id: string
          conversion_value_micros?: number
          conversions?: number
          cost_micros?: number
          date: string
          extra?: Json
          impressions?: number
          sessions?: number
          synced_at?: string
          users?: number
        }
        Update: {
          clicks?: number
          connection_id?: string
          conversion_value_micros?: number
          conversions?: number
          cost_micros?: number
          date?: string
          extra?: Json
          impressions?: number
          sessions?: number
          synced_at?: string
          users?: number
        }
        Relationships: [
          {
            foreignKeyName: "metrics_daily_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          last_site_id: string | null
          locale: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          last_site_id?: string | null
          locale?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          last_site_id?: string | null
          locale?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_site_id_fkey"
            columns: ["last_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_ai_keys: {
        Row: {
          api_key_enc: string
          available_models: Json
          created_at: string
          created_by: string | null
          model: string
          models_fetched_at: string | null
          provider: string
          site_id: string
          updated_at: string
        }
        Insert: {
          api_key_enc: string
          available_models?: Json
          created_at?: string
          created_by?: string | null
          model?: string
          models_fetched_at?: string | null
          provider?: string
          site_id: string
          updated_at?: string
        }
        Update: {
          api_key_enc?: string
          available_models?: Json
          created_at?: string
          created_by?: string | null
          model?: string
          models_fetched_at?: string | null
          provider?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_ai_keys_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["site_role"]
          site_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["site_role"]
          site_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["site_role"]
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_members_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_oauth_apps: {
        Row: {
          client_id_enc: string
          client_secret_enc: string
          created_at: string
          created_by: string | null
          developer_token_enc: string | null
          family: string
          site_id: string
          updated_at: string
        }
        Insert: {
          client_id_enc: string
          client_secret_enc: string
          created_at?: string
          created_by?: string | null
          developer_token_enc?: string | null
          family: string
          site_id: string
          updated_at?: string
        }
        Update: {
          client_id_enc?: string
          client_secret_enc?: string
          created_at?: string
          created_by?: string | null
          developer_token_enc?: string | null
          family?: string
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_oauth_apps_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          country: string | null
          created_at: string
          currency: string
          domain: string
          id: string
          llms_txt_content: string | null
          llms_txt_generated_at: string | null
          name: string
          owner_id: string
          timezone: string
          url: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          currency?: string
          domain: string
          id?: string
          llms_txt_content?: string | null
          llms_txt_generated_at?: string | null
          name: string
          owner_id: string
          timezone?: string
          url: string
        }
        Update: {
          country?: string | null
          created_at?: string
          currency?: string
          domain?: string
          id?: string
          llms_txt_content?: string | null
          llms_txt_generated_at?: string | null
          name?: string
          owner_id?: string
          timezone?: string
          url?: string
        }
        Relationships: []
      }
      tracked_prompts: {
        Row: {
          cadence: string
          created_at: string
          created_by: string | null
          enabled: boolean
          engines: string[]
          id: string
          intent: string
          site_id: string
          text: string
        }
        Insert: {
          cadence?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          engines?: string[]
          id?: string
          intent: string
          site_id: string
          text: string
        }
        Update: {
          cadence?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          engines?: string[]
          id?: string
          intent?: string
          site_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_prompts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      citation_checks: {
        Row: {
          checked_at: string
          cited: boolean
          cited_url: string | null
          competitors_cited: string[]
          date: string
          engine: string
          excerpt: string | null
          id: string
          position: number | null
          prompt_id: string
          sentiment: string | null
        }
        Insert: {
          checked_at?: string
          cited: boolean
          cited_url?: string | null
          competitors_cited?: string[]
          date?: string
          engine: string
          excerpt?: string | null
          id?: string
          position?: number | null
          prompt_id: string
          sentiment?: string | null
        }
        Update: {
          checked_at?: string
          cited?: boolean
          cited_url?: string | null
          competitors_cited?: string[]
          date?: string
          engine?: string
          excerpt?: string | null
          id?: string
          position?: number | null
          prompt_id?: string
          sentiment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "citation_checks_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "tracked_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          period_end: string | null
          period_start: string
          site_id: string
          source: string
          status: string
          total_budget_micros: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          period_end?: string | null
          period_start: string
          site_id: string
          source?: string
          status?: string
          total_budget_micros?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          period_end?: string | null
          period_start?: string
          site_id?: string
          source?: string
          status?: string
          total_budget_micros?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_items: {
        Row: {
          budget_micros: number
          campaign_name: string
          end_date: string
          id: string
          kpi_targets: Json
          notes: string | null
          objective: string
          plan_id: string
          provider: string
          start_date: string
        }
        Insert: {
          budget_micros: number
          campaign_name: string
          end_date: string
          id?: string
          kpi_targets?: Json
          notes?: string | null
          objective: string
          plan_id: string
          provider: string
          start_date: string
        }
        Update: {
          budget_micros?: number
          campaign_name?: string
          end_date?: string
          id?: string
          kpi_targets?: Json
          notes?: string | null
          objective?: string
          plan_id?: string
          provider?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      deployments: {
        Row: {
          created_at: string
          id: string
          owner: string
          plan_item_id: string | null
          providers: string[]
          scheduled_at: string
          site_id: string
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner: string
          plan_item_id?: string | null
          providers?: string[]
          scheduled_at: string
          site_id: string
          status?: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          owner?: string
          plan_item_id?: string | null
          providers?: string[]
          scheduled_at?: string
          site_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployments_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deployments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      content_metrics_daily: {
        Row: {
          comments: number
          connection_id: string
          date: string
          external_post_id: string
          image_url: string | null
          likes: number
          message: string | null
          permalink: string | null
          posted_at: string | null
          provider: string
          shares: number
          synced_at: string
        }
        Insert: {
          comments?: number
          connection_id: string
          date: string
          external_post_id: string
          image_url?: string | null
          likes?: number
          message?: string | null
          permalink?: string | null
          posted_at?: string | null
          provider: string
          shares?: number
          synced_at?: string
        }
        Update: {
          comments?: number
          connection_id?: string
          date?: string
          external_post_id?: string
          image_url?: string | null
          likes?: number
          message?: string | null
          permalink?: string | null
          posted_at?: string | null
          provider?: string
          shares?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_metrics_daily_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      video_metrics_daily: {
        Row: {
          comments: number
          connection_id: string
          cover_image_url: string | null
          date: string
          external_video_id: string
          likes: number
          shares: number
          synced_at: string
          title: string | null
          views: number
        }
        Insert: {
          comments?: number
          connection_id: string
          cover_image_url?: string | null
          date: string
          external_video_id: string
          likes?: number
          shares?: number
          synced_at?: string
          title?: string | null
          views?: number
        }
        Update: {
          comments?: number
          connection_id?: string
          cover_image_url?: string | null
          date?: string
          external_video_id?: string
          likes?: number
          shares?: number
          synced_at?: string
          title?: string | null
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_metrics_daily_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          category: string
          created_at: string
          current_version_id: string | null
          description: string
          id: string
          name: string
          site_id: string
          tags: string[]
          updated_at: string
          variables: Json
        }
        Insert: {
          category: string
          created_at?: string
          current_version_id?: string | null
          description?: string
          id?: string
          name: string
          site_id: string
          tags?: string[]
          updated_at?: string
          variables?: Json
        }
        Update: {
          category?: string
          created_at?: string
          current_version_id?: string | null
          description?: string
          id?: string
          name?: string
          site_id?: string
          tags?: string[]
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "prompts_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          prompt_id: string
          system_prompt: string
          user_template: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          prompt_id: string
          system_prompt: string
          user_template: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          prompt_id?: string
          system_prompt?: string
          user_template?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prompt_versions_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_runs: {
        Row: {
          id: string
          inputs: Json
          latency_ms: number
          model: string
          output: string
          prompt_id: string
          ran_at: string
          ran_by: string | null
          rating: number | null
          tokens_in: number
          tokens_out: number
          version_id: string
        }
        Insert: {
          id?: string
          inputs?: Json
          latency_ms: number
          model: string
          output: string
          prompt_id: string
          ran_at?: string
          ran_by?: string | null
          rating?: number | null
          tokens_in: number
          tokens_out: number
          version_id: string
        }
        Update: {
          id?: string
          inputs?: Json
          latency_ms?: number
          model?: string
          output?: string
          prompt_id?: string
          ran_at?: string
          ran_by?: string | null
          rating?: number | null
          tokens_in?: number
          tokens_out?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_runs_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "prompt_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          id: string
          last_run_at: string | null
          name: string
          prompt_id: string
          role: string
          schedule: Json | null
          site_id: string
          tools: Json
        }
        Insert: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name: string
          prompt_id: string
          role: string
          schedule?: Json | null
          site_id: string
          tools?: Json
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          name?: string
          prompt_id?: string
          role?: string
          schedule?: Json | null
          site_id?: string
          tools?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agents_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string
          finished_at: string | null
          id: string
          site_id: string
          started_at: string
          status: string
          steps: Json
          summary: string | null
          tokens_used: number | null
          trigger: string
        }
        Insert: {
          agent_id: string
          finished_at?: string | null
          id?: string
          site_id: string
          started_at?: string
          status: string
          steps?: Json
          summary?: string | null
          tokens_used?: number | null
          trigger: string
        }
        Update: {
          agent_id?: string
          finished_at?: string | null
          id?: string
          site_id?: string
          started_at?: string
          status?: string
          steps?: Json
          summary?: string | null
          tokens_used?: number | null
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_actions: {
        Row: {
          action_kind: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          diff: Json
          id: string
          provider: string
          rationale: string
          run_id: string
          summary: string
          target_entity_id: string
          target_entity_name: string
          tool: string
        }
        Insert: {
          action_kind: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          diff?: Json
          id?: string
          provider: string
          rationale: string
          run_id: string
          summary: string
          target_entity_id: string
          target_entity_name: string
          tool: string
        }
        Update: {
          action_kind?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          diff?: Json
          id?: string
          provider?: string
          rationale?: string
          run_id?: string
          summary?: string
          target_entity_id?: string
          target_entity_name?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_plan_item_with_deployment: {
        Args: {
          p_budget_micros: number
          p_campaign_name: string
          p_end_date: string
          p_kpi_targets: Json
          p_notes: string | null
          p_objective: string
          p_owner: string
          p_plan_id: string
          p_provider: string
          p_start_date: string
        }
        Returns: Database["public"]["Tables"]["plan_items"]["Row"]
      }
      get_content_trending_snapshots: {
        Args: {
          p_connection_id: string
          p_cutoffs: string[]
          p_provider: string
        }
        Returns: {
          external_post_id: string
          message: string | null
          image_url: string | null
          permalink: string | null
          latest_posted_at: string | null
          latest_date: string
          latest_likes: number
          latest_comments: number
          latest_shares: number
          earliest_date: string | null
          earliest_score: number | null
          cutoff0_date: string | null
          cutoff0_score: number | null
          cutoff1_date: string | null
          cutoff1_score: number | null
          cutoff2_date: string | null
          cutoff2_score: number | null
        }[]
      }
      get_video_range_snapshots: {
        Args: {
          p_connection_id: string
          p_range_start: string
          p_range_end: string
        }
        Returns: {
          external_video_id: string
          title: string | null
          cover_image_url: string | null
          end_date: string
          end_views: number
          end_likes: number
          end_comments: number
          end_shares: number
          baseline_date: string | null
          baseline_views: number | null
          baseline_likes: number | null
          baseline_comments: number | null
          baseline_shares: number | null
        }[]
      }
      get_video_trending_snapshots: {
        Args: {
          p_connection_id: string
          p_cutoffs: string[]
        }
        Returns: {
          external_video_id: string
          title: string | null
          cover_image_url: string | null
          latest_date: string
          latest_views: number
          latest_likes: number
          latest_comments: number
          latest_shares: number
          earliest_date: string | null
          earliest_views: number | null
          cutoff0_date: string | null
          cutoff0_views: number | null
          cutoff1_date: string | null
          cutoff1_views: number | null
          cutoff2_date: string | null
          cutoff2_views: number | null
        }[]
      }
      has_site_role: {
        Args: {
          allowed: Database["public"]["Enums"]["site_role"][]
          target_site: string
        }
        Returns: boolean
      }
      is_site_member: { Args: { target_site: string }; Returns: boolean }
    }
    Enums: {
      connection_status:
        | "connected"
        | "syncing"
        | "expired"
        | "error"
        | "revoked"
      site_role: "owner" | "admin" | "viewer"
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
      connection_status: [
        "connected",
        "syncing",
        "expired",
        "error",
        "revoked",
      ],
      site_role: ["owner", "admin", "viewer"],
    },
  },
} as const
