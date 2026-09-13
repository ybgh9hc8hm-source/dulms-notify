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
      admin_audit_log: {
        Row: {
          action: string
          actor_identifier: string
          created_at: string
          detail: Json
          id: string
          target: string | null
        }
        Insert: {
          action: string
          actor_identifier: string
          created_at?: string
          detail?: Json
          id?: string
          target?: string | null
        }
        Update: {
          action?: string
          actor_identifier?: string
          created_at?: string
          detail?: Json
          id?: string
          target?: string | null
        }
        Relationships: []
      }
      admin_auth_attempts: {
        Row: {
          attempted_at: string
          id: string
          identifier: string
          success: boolean
        }
        Insert: {
          attempted_at?: string
          id?: string
          identifier: string
          success?: boolean
        }
        Update: {
          attempted_at?: string
          id?: string
          identifier?: string
          success?: boolean
        }
        Relationships: []
      }
      admin_sessions: {
        Row: {
          expires_at: string
          identifier: string
          issued_at: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          expires_at: string
          identifier: string
          issued_at?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          expires_at?: string
          identifier?: string
          issued_at?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      cluster_events: {
        Row: {
          cluster_id: string | null
          created_at: string
          defining_key: string
          detail: Json
          event: string
          id: string
          kind: string
        }
        Insert: {
          cluster_id?: string | null
          created_at?: string
          defining_key: string
          detail?: Json
          event: string
          id?: string
          kind: string
        }
        Update: {
          cluster_id?: string | null
          created_at?: string
          defining_key?: string
          detail?: Json
          event?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_events_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "content_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      content_clusters: {
        Row: {
          break_reason: string | null
          confidence_score: number
          created_at: string
          cycles: number
          defining_key: string
          fingerprint_hash: string
          id: string
          kind: string
          last_confirmed_at: string | null
          last_representative: string | null
          last_verified_at: string | null
          member_count: number
          member_user_ids: string[]
          observations: number
          status: string
          updated_at: string
        }
        Insert: {
          break_reason?: string | null
          confidence_score?: number
          created_at?: string
          cycles?: number
          defining_key: string
          fingerprint_hash: string
          id?: string
          kind: string
          last_confirmed_at?: string | null
          last_representative?: string | null
          last_verified_at?: string | null
          member_count?: number
          member_user_ids?: string[]
          observations?: number
          status?: string
          updated_at?: string
        }
        Update: {
          break_reason?: string | null
          confidence_score?: number
          created_at?: string
          cycles?: number
          defining_key?: string
          fingerprint_hash?: string
          id?: string
          kind?: string
          last_confirmed_at?: string | null
          last_representative?: string | null
          last_verified_at?: string | null
          member_count?: number
          member_user_ids?: string[]
          observations?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      crypto_keyring: {
        Row: {
          created_at: string
          note: string | null
          secret: string
          version: number
        }
        Insert: {
          created_at?: string
          note?: string | null
          secret: string
          version: number
        }
        Update: {
          created_at?: string
          note?: string | null
          secret?: string
          version?: number
        }
        Relationships: []
      }
      daily_metrics: {
        Row: {
          changed: number
          checks: number
          created_at: string
          day: string
          delivery_avg_ms: number | null
          delivery_dead: number
          delivery_p95_ms: number | null
          delivery_sent: number
          detect_avg_ms: number | null
          detect_p95_ms: number | null
          detect_samples: number
          health_errors: number
          health_p95_ms: number | null
          health_samples: number
          sync_errors: number
          updated_at: string
        }
        Insert: {
          changed?: number
          checks?: number
          created_at?: string
          day: string
          delivery_avg_ms?: number | null
          delivery_dead?: number
          delivery_p95_ms?: number | null
          delivery_sent?: number
          detect_avg_ms?: number | null
          detect_p95_ms?: number | null
          detect_samples?: number
          health_errors?: number
          health_p95_ms?: number | null
          health_samples?: number
          sync_errors?: number
          updated_at?: string
        }
        Update: {
          changed?: number
          checks?: number
          created_at?: string
          day?: string
          delivery_avg_ms?: number | null
          delivery_dead?: number
          delivery_p95_ms?: number | null
          delivery_sent?: number
          detect_avg_ms?: number | null
          detect_p95_ms?: number | null
          detect_samples?: number
          health_errors?: number
          health_p95_ms?: number | null
          health_samples?: number
          sync_errors?: number
          updated_at?: string
        }
        Relationships: []
      }
      dulms_accounts: {
        Row: {
          check_claimed_at: string | null
          check_failures: number
          check_priority: number
          cover_selected_at: string | null
          created_at: string
          dulms_id: string
          key_version: number
          last_check_at: string | null
          last_fingerprint_at: string | null
          last_notification_id: number | null
          last_notification_signature: string | null
          last_registration_check_at: string | null
          last_registration_signature: string | null
          last_registration_snapshot: Json | null
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          next_check_at: string | null
          password_ciphertext: string
          policy_accepted_at: string | null
          policy_version: string | null
          priority_reason: string | null
          profile: Json | null
          sentinel_rank: number
          sync_claimed_at: string | null
          sync_enabled: boolean
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          check_claimed_at?: string | null
          check_failures?: number
          check_priority?: number
          cover_selected_at?: string | null
          created_at?: string
          dulms_id: string
          key_version?: number
          last_check_at?: string | null
          last_fingerprint_at?: string | null
          last_notification_id?: number | null
          last_notification_signature?: string | null
          last_registration_check_at?: string | null
          last_registration_signature?: string | null
          last_registration_snapshot?: Json | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          next_check_at?: string | null
          password_ciphertext: string
          policy_accepted_at?: string | null
          policy_version?: string | null
          priority_reason?: string | null
          profile?: Json | null
          sentinel_rank?: number
          sync_claimed_at?: string | null
          sync_enabled?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          check_claimed_at?: string | null
          check_failures?: number
          check_priority?: number
          cover_selected_at?: string | null
          created_at?: string
          dulms_id?: string
          key_version?: number
          last_check_at?: string | null
          last_fingerprint_at?: string | null
          last_notification_id?: number | null
          last_notification_signature?: string | null
          last_registration_check_at?: string | null
          last_registration_signature?: string | null
          last_registration_snapshot?: Json | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          next_check_at?: string | null
          password_ciphertext?: string
          policy_accepted_at?: string | null
          policy_version?: string | null
          priority_reason?: string | null
          profile?: Json | null
          sentinel_rank?: number
          sync_claimed_at?: string | null
          sync_enabled?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dulms_health_samples: {
        Row: {
          created_at: string
          detail: Json
          endpoint: string
          flagged_reason: string | null
          id: string
          latency_ms: number
          status_code: number | null
          step_limit: number | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          endpoint: string
          flagged_reason?: string | null
          id?: string
          latency_ms?: number
          status_code?: number | null
          step_limit?: number | null
        }
        Update: {
          created_at?: string
          detail?: Json
          endpoint?: string
          flagged_reason?: string | null
          id?: string
          latency_ms?: number
          status_code?: number | null
          step_limit?: number | null
        }
        Relationships: []
      }
      dulms_items: {
        Row: {
          archived_at: string | null
          course: string | null
          due_at: string | null
          external_key: string
          extra: Json
          first_seen_at: string
          id: string
          kind: string
          last_seen_at: string
          score: string | null
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          course?: string | null
          due_at?: string | null
          external_key: string
          extra?: Json
          first_seen_at?: string
          id?: string
          kind: string
          last_seen_at?: string
          score?: string | null
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          course?: string | null
          due_at?: string | null
          external_key?: string
          extra?: Json
          first_seen_at?: string
          id?: string
          kind?: string
          last_seen_at?: string
          score?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dulms_sessions: {
        Row: {
          cookie_data: string
          created_at: string
          dulms_id: string
          expires_at: string
          last_used_at: string
        }
        Insert: {
          cookie_data: string
          created_at?: string
          dulms_id: string
          expires_at?: string
          last_used_at?: string
        }
        Update: {
          cookie_data?: string
          created_at?: string
          dulms_id?: string
          expires_at?: string
          last_used_at?: string
        }
        Relationships: []
      }
      heartbeat_checks: {
        Row: {
          changed: boolean
          check_ms: number
          created_at: string
          id: string
          notify_ms: number | null
          registration_ms: number | null
          requests: number
          skipped_reason: string | null
          user_id: string
        }
        Insert: {
          changed?: boolean
          check_ms?: number
          created_at?: string
          id?: string
          notify_ms?: number | null
          registration_ms?: number | null
          requests?: number
          skipped_reason?: string | null
          user_id: string
        }
        Update: {
          changed?: boolean
          check_ms?: number
          created_at?: string
          id?: string
          notify_ms?: number | null
          registration_ms?: number | null
          requests?: number
          skipped_reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      item_fingerprints: {
        Row: {
          created_at: string
          cycles: number
          defining_key: string
          fingerprint_hash: string
          first_seen_at: string
          id: string
          item_count: number
          kind: string
          last_seen_at: string
          observations: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cycles?: number
          defining_key: string
          fingerprint_hash: string
          first_seen_at?: string
          id?: string
          item_count?: number
          kind: string
          last_seen_at?: string
          observations?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cycles?: number
          defining_key?: string
          fingerprint_hash?: string
          first_seen_at?: string
          id?: string
          item_count?: number
          kind?: string
          last_seen_at?: string
          observations?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      load_test_runs: {
        Row: {
          abort_reason: string | null
          baseline: Json | null
          burst_minutes: number
          cohort: string[]
          created_at: string
          ended_at: string | null
          id: string
          observe_minutes: number
          stage_index: number
          stage_reports: Json
          stage_started_at: string | null
          stages: number[]
          started_at: string | null
          status: string
          updated_at: string
          window_end_hour: number
          window_start_hour: number
        }
        Insert: {
          abort_reason?: string | null
          baseline?: Json | null
          burst_minutes?: number
          cohort?: string[]
          created_at?: string
          ended_at?: string | null
          id?: string
          observe_minutes?: number
          stage_index?: number
          stage_reports?: Json
          stage_started_at?: string | null
          stages?: number[]
          started_at?: string | null
          status?: string
          updated_at?: string
          window_end_hour?: number
          window_start_hour?: number
        }
        Update: {
          abort_reason?: string | null
          baseline?: Json | null
          burst_minutes?: number
          cohort?: string[]
          created_at?: string
          ended_at?: string | null
          id?: string
          observe_minutes?: number
          stage_index?: number
          stage_reports?: Json
          stage_started_at?: string | null
          stages?: number[]
          started_at?: string | null
          status?: string
          updated_at?: string
          window_end_hour?: number
          window_start_hour?: number
        }
        Relationships: []
      }
      notification_events: {
        Row: {
          created_at: string
          dedupe_key: string
          id: string
          notification_id: number | null
          section: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          id?: string
          notification_id?: number | null
          section: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          id?: string
          notification_id?: number | null
          section?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_outbox: {
        Row: {
          attempts: number
          body: string
          chat_id: string
          claimed_at: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          body: string
          chat_id: string
          claimed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          body?: string
          chat_id?: string
          claimed_at?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          item_id: string | null
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          kind: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "dulms_items"
            referencedColumns: ["id"]
          },
        ]
      }
      probe_requests: {
        Row: {
          created_at: string
          dulms_id: string | null
          endpoint: string
          error: string | null
          flag_reason: string | null
          flagged: boolean
          id: number
          latency_ms: number | null
          rate_limit_headers: Json | null
          run_id: string
          size_bytes: number | null
          status_code: number | null
        }
        Insert: {
          created_at?: string
          dulms_id?: string | null
          endpoint: string
          error?: string | null
          flag_reason?: string | null
          flagged?: boolean
          id?: number
          latency_ms?: number | null
          rate_limit_headers?: Json | null
          run_id: string
          size_bytes?: number | null
          status_code?: number | null
        }
        Update: {
          created_at?: string
          dulms_id?: string | null
          endpoint?: string
          error?: string | null
          flag_reason?: string | null
          flagged?: boolean
          id?: number
          latency_ms?: number | null
          rate_limit_headers?: Json | null
          run_id?: string
          size_bytes?: number | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "probe_requests_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "probe_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      probe_runs: {
        Row: {
          abort_reason: string | null
          config: Json
          created_at: string
          current_rate: number
          current_step_index: number
          ended_at: string | null
          id: string
          mode: string
          notes: string | null
          report: Json | null
          session_index: number
          started_at: string | null
          status: string
          step_started_at: string | null
          total_errors: number
          total_requests: number
          updated_at: string
        }
        Insert: {
          abort_reason?: string | null
          config?: Json
          created_at?: string
          current_rate?: number
          current_step_index?: number
          ended_at?: string | null
          id?: string
          mode?: string
          notes?: string | null
          report?: Json | null
          session_index?: number
          started_at?: string | null
          status?: string
          step_started_at?: string | null
          total_errors?: number
          total_requests?: number
          updated_at?: string
        }
        Update: {
          abort_reason?: string | null
          config?: Json
          created_at?: string
          current_rate?: number
          current_step_index?: number
          ended_at?: string | null
          id?: string
          mode?: string
          notes?: string | null
          report?: Json | null
          session_index?: number
          started_at?: string | null
          status?: string
          step_started_at?: string | null
          total_errors?: number
          total_requests?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          notify_telegram: boolean
          telegram_chat_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          notify_telegram?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          notify_telegram?: boolean
          telegram_chat_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_vault: {
        Row: {
          ciphertext: string
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          ciphertext: string
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          ciphertext?: string
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rate_budget: {
        Row: {
          request_count: number
          window_start: string
        }
        Insert: {
          request_count?: number
          window_start: string
        }
        Update: {
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      rate_ramp_runs: {
        Row: {
          abort_reason: string | null
          baseline: Json | null
          created_at: string
          current_step: number
          ended_at: string | null
          hold_minutes: number
          id: string
          last_clean_step: number | null
          recommended_limit: number | null
          started_at: string | null
          status: string
          step_index: number
          step_reports: Json
          step_started_at: string | null
          steps: number[]
          updated_at: string
          window_end_hour: number
          window_start_hour: number
        }
        Insert: {
          abort_reason?: string | null
          baseline?: Json | null
          created_at?: string
          current_step?: number
          ended_at?: string | null
          hold_minutes?: number
          id?: string
          last_clean_step?: number | null
          recommended_limit?: number | null
          started_at?: string | null
          status?: string
          step_index?: number
          step_reports?: Json
          step_started_at?: string | null
          steps?: number[]
          updated_at?: string
          window_end_hour?: number
          window_start_hour?: number
        }
        Update: {
          abort_reason?: string | null
          baseline?: Json | null
          created_at?: string
          current_step?: number
          ended_at?: string | null
          hold_minutes?: number
          id?: string
          last_clean_step?: number | null
          recommended_limit?: number | null
          started_at?: string | null
          status?: string
          step_index?: number
          step_reports?: Json
          step_started_at?: string | null
          steps?: number[]
          updated_at?: string
          window_end_hour?: number
          window_start_hour?: number
        }
        Relationships: []
      }
      realtime_grants: {
        Row: {
          created_at: string
          enabled: boolean
          granted_by: string | null
          interval_ms: number
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          granted_by?: string | null
          interval_ms?: number
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          granted_by?: string | null
          interval_ms?: number
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      realtime_lease: {
        Row: {
          expires_at: string
          holder: string | null
          id: boolean
        }
        Insert: {
          expires_at?: string
          holder?: string | null
          id?: boolean
        }
        Update: {
          expires_at?: string
          holder?: string | null
          id?: boolean
        }
        Relationships: []
      }
      realtime_runs: {
        Row: {
          avg_poll_ms: number | null
          changes: number
          detect_ms: number | null
          ended_at: string | null
          errors: number
          id: number
          interval_ms: number | null
          polls: number
          pushed: number
          started_at: string
          stop_reason: string | null
          user_id: string
        }
        Insert: {
          avg_poll_ms?: number | null
          changes?: number
          detect_ms?: number | null
          ended_at?: string | null
          errors?: number
          id?: number
          interval_ms?: number | null
          polls?: number
          pushed?: number
          started_at?: string
          stop_reason?: string | null
          user_id: string
        }
        Update: {
          avg_poll_ms?: number | null
          changes?: number
          detect_ms?: number | null
          ended_at?: string | null
          errors?: number
          id?: number
          interval_ms?: number | null
          polls?: number
          pushed?: number
          started_at?: string
          stop_reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      registration_admission_reservations: {
        Row: {
          created_at: string
          dulms_id: string
          expires_at: string
        }
        Insert: {
          created_at?: string
          dulms_id: string
          expires_at: string
        }
        Update: {
          created_at?: string
          dulms_id?: string
          expires_at?: string
        }
        Relationships: []
      }
      registration_watches: {
        Row: {
          auto_register: boolean
          course_code: string | null
          course_id: string
          course_name: string
          created_at: string
          group_id: string
          group_name: string
          id: string
          last_checked_at: string | null
          last_result: string | null
          notified_at: string | null
          opened_at: string | null
          status: string
          subgroup_id: string
          subgroup_name: string | null
          updated_at: string
          user_id: string
          was_open: boolean
        }
        Insert: {
          auto_register?: boolean
          course_code?: string | null
          course_id: string
          course_name: string
          created_at?: string
          group_id: string
          group_name: string
          id?: string
          last_checked_at?: string | null
          last_result?: string | null
          notified_at?: string | null
          opened_at?: string | null
          status?: string
          subgroup_id?: string
          subgroup_name?: string | null
          updated_at?: string
          user_id: string
          was_open?: boolean
        }
        Update: {
          auto_register?: boolean
          course_code?: string | null
          course_id?: string
          course_name?: string
          created_at?: string
          group_id?: string
          group_name?: string
          id?: string
          last_checked_at?: string | null
          last_result?: string | null
          notified_at?: string | null
          opened_at?: string | null
          status?: string
          subgroup_id?: string
          subgroup_name?: string | null
          updated_at?: string
          user_id?: string
          was_open?: boolean
        }
        Relationships: []
      }
      student_photos: {
        Row: {
          data_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          data_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          data_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          channel: string
          chat_id: string | null
          content: string
          created_at: string
          id: string
          role: string
          user_id: string | null
        }
        Insert: {
          channel?: string
          chat_id?: string | null
          content: string
          created_at?: string
          id?: string
          role: string
          user_id?: string | null
        }
        Update: {
          channel?: string
          chat_id?: string | null
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_note: string | null
          body: string
          channel: string
          chat_id: string | null
          created_at: string
          dulms_id: string | null
          id: string
          kind: string
          priority: string
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          body: string
          channel?: string
          chat_id?: string | null
          created_at?: string
          dulms_id?: string | null
          id?: string
          kind?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          body?: string
          channel?: string
          chat_id?: string | null
          created_at?: string
          dulms_id?: string | null
          id?: string
          kind?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          created_at: string
          id: string
          items_found: number
          message: string | null
          new_items: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          items_found?: number
          message?: string | null
          new_items?: number
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          items_found?: number
          message?: string | null
          new_items?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_link_tokens: {
        Row: {
          consumed_by_update_id: number | null
          created_at: string
          expires_at: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          consumed_by_update_id?: number | null
          created_at?: string
          expires_at?: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          consumed_by_update_id?: number | null
          created_at?: string
          expires_at?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      telegram_updates: {
        Row: {
          chat_id: string | null
          created_at: string
          update_id: number
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          update_id: number
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          update_id?: number
        }
        Relationships: []
      }
      vault_meta: {
        Row: {
          id: boolean
          kdf: string
          salt: string
          updated_at: string
          verifier: string
        }
        Insert: {
          id?: boolean
          kdf?: string
          salt: string
          updated_at?: string
          verifier: string
        }
        Update: {
          id?: boolean
          kdf?: string
          salt?: string
          updated_at?: string
          verifier?: string
        }
        Relationships: []
      }
    }
    Views: {
      sync_heartbeat_stats: {
        Row: {
          avg_change_to_notify_ms: number | null
          checks: number | null
          full_pulls: number | null
          minute: string | null
          requests_used: number | null
          skipped: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_overview_stats: { Args: { p_since: string }; Returns: Json }
      apply_sentinel_cover: { Args: { p_user_ids: string[] }; Returns: number }
      claim_check_batch: {
        Args: {
          p_limit?: number
          p_lock_seconds?: number
          p_stale_seconds?: number
        }
        Returns: string[]
      }
      claim_check_lane: {
        Args: {
          p_lane?: string
          p_limit?: number
          p_lock_seconds?: number
          p_stale_seconds?: number
        }
        Returns: string[]
      }
      claim_outbox_batch: {
        Args: { p_limit?: number; p_lock_seconds?: number }
        Returns: {
          attempts: number
          body: string
          chat_id: string
          claimed_at: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_realtime_lease: {
        Args: { p_holder: string; p_seconds: number }
        Returns: boolean
      }
      claim_sync_batch: {
        Args: {
          p_limit?: number
          p_lock_seconds?: number
          p_stale_seconds?: number
        }
        Returns: string[]
      }
      consume_rate_budget: {
        Args: { p_cost: number; p_limit: number }
        Returns: boolean
      }
      escalate_checks: {
        Args: {
          p_cap?: number
          p_priority?: number
          p_reason: string
          p_user_ids: string[]
        }
        Returns: number
      }
      health_window_stats: {
        Args: { p_from: string; p_to: string }
        Returns: {
          auth_fail: number
          blocks: number
          errors: number
          flagged: number
          p50: number
          p95: number
          samples: number
        }[]
      }
      lane_stats: { Args: never; Returns: Json }
      prune_dead_clusters: {
        Args: { p_days?: number; p_min_members?: number }
        Returns: number
      }
      purge_cluster_events: { Args: { p_days?: number }; Returns: number }
      purge_health_samples: { Args: { p_days?: number }; Returns: number }
      purge_notification_events: { Args: { p_days?: number }; Returns: number }
      purge_old_sync_logs: { Args: { p_days?: number }; Returns: number }
      purge_outbox: { Args: { p_days?: number }; Returns: number }
      purge_sync_ephemera: { Args: { p_hours?: number }; Returns: undefined }
      rate_budget_used: { Args: never; Returns: number }
      release_realtime_lease: { Args: { p_holder: string }; Returns: undefined }
      reserve_registration_admission: {
        Args: {
          p_dulms_id: string
          p_seat_limit: number
          p_ttl_seconds?: number
        }
        Returns: boolean
      }
      rollup_daily_metrics: {
        Args: { p_day?: string }
        Returns: {
          changed: number
          checks: number
          created_at: string
          day: string
          delivery_avg_ms: number | null
          delivery_dead: number
          delivery_p95_ms: number | null
          delivery_sent: number
          detect_avg_ms: number | null
          detect_p95_ms: number | null
          detect_samples: number
          health_errors: number
          health_p95_ms: number | null
          health_samples: number
          sync_errors: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_metrics"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_maintenance: { Args: never; Returns: Json }
      slo_stats: { Args: { p_since: string }; Returns: Json }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
