export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      attendance_log: {
        Row: {
          created_at: string;
          id: string;
          note: string | null;
          occurrence_id: string | null;
          performed_on: string;
          profile_id: string;
          series_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          note?: string | null;
          occurrence_id?: string | null;
          performed_on: string;
          profile_id: string;
          series_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          note?: string | null;
          occurrence_id?: string | null;
          performed_on?: string;
          profile_id?: string;
          series_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_log_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'mic_occurrences';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_log_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'attendance_log_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'occurrence_attendance';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'attendance_log_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'occurrence_spots';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'attendance_log_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_log_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_log_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'mic_series';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_log_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['series_id'];
          },
        ];
      };
      attendance_plans: {
        Row: {
          created_at: string;
          occurrence_id: string;
          profile_id: string;
        };
        Insert: {
          created_at?: string;
          occurrence_id: string;
          profile_id: string;
        };
        Update: {
          created_at?: string;
          occurrence_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_plans_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'mic_occurrences';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_plans_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'attendance_plans_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'occurrence_attendance';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'attendance_plans_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'occurrence_spots';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'attendance_plans_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_plans_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      banned_terms: {
        Row: {
          created_at: string;
          term: string;
        };
        Insert: {
          created_at?: string;
          term: string;
        };
        Update: {
          created_at?: string;
          term?: string;
        };
        Relationships: [];
      };
      blocks: {
        Row: {
          blocked_display_name: string | null;
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        Insert: {
          blocked_display_name?: string | null;
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_display_name?: string | null;
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      claim_requests: {
        Row: {
          created_at: string;
          evidence: string | null;
          id: string;
          requester_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          series_id: string;
          status: Database['public']['Enums']['claim_status'];
        };
        Insert: {
          created_at?: string;
          evidence?: string | null;
          id?: string;
          requester_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          series_id: string;
          status?: Database['public']['Enums']['claim_status'];
        };
        Update: {
          created_at?: string;
          evidence?: string | null;
          id?: string;
          requester_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          series_id?: string;
          status?: Database['public']['Enums']['claim_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'claim_requests_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'claim_requests_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'claim_requests_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'claim_requests_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'claim_requests_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'mic_series';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'claim_requests_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['series_id'];
          },
        ];
      };
      device_push_tokens: {
        Row: {
          expo_token: string;
          id: string;
          platform: string;
          profile_id: string;
          updated_at: string;
        };
        Insert: {
          expo_token: string;
          id?: string;
          platform: string;
          profile_id: string;
          updated_at?: string;
        };
        Update: {
          expo_token?: string;
          id?: string;
          platform?: string;
          profile_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'device_push_tokens_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'device_push_tokens_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      eula_versions: {
        Row: {
          body_md: string;
          published_at: string;
          version: string;
        };
        Insert: {
          body_md: string;
          published_at?: string;
          version: string;
        };
        Update: {
          body_md?: string;
          published_at?: string;
          version?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          created_at: string;
          profile_id: string;
          series_id: string;
        };
        Insert: {
          created_at?: string;
          profile_id: string;
          series_id: string;
        };
        Update: {
          created_at?: string;
          profile_id?: string;
          series_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'favorites_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'favorites_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'favorites_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'mic_series';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'favorites_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['series_id'];
          },
        ];
      };
      listing_flags: {
        Row: {
          created_at: string;
          details: string | null;
          flagger_id: string;
          id: string;
          reason: Database['public']['Enums']['flag_reason'];
          resolved_at: string | null;
          resolved_by: string | null;
          series_id: string;
          status: Database['public']['Enums']['flag_status'];
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          flagger_id: string;
          id?: string;
          reason: Database['public']['Enums']['flag_reason'];
          resolved_at?: string | null;
          resolved_by?: string | null;
          series_id: string;
          status?: Database['public']['Enums']['flag_status'];
        };
        Update: {
          created_at?: string;
          details?: string | null;
          flagger_id?: string;
          id?: string;
          reason?: Database['public']['Enums']['flag_reason'];
          resolved_at?: string | null;
          resolved_by?: string | null;
          series_id?: string;
          status?: Database['public']['Enums']['flag_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'listing_flags_flagger_id_fkey';
            columns: ['flagger_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listing_flags_flagger_id_fkey';
            columns: ['flagger_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listing_flags_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listing_flags_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listing_flags_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'mic_series';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'listing_flags_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['series_id'];
          },
        ];
      };
      mic_occurrences: {
        Row: {
          cancellation_note: string | null;
          created_at: string;
          doors_at: string | null;
          featured_name: string | null;
          featured_note: string | null;
          id: string;
          local_date: string;
          override_cost_cents: number | null;
          override_title: string | null;
          override_venue_id: string | null;
          series_id: string;
          starts_at: string;
          status: Database['public']['Enums']['occurrence_status'];
          updated_at: string;
        };
        Insert: {
          cancellation_note?: string | null;
          created_at?: string;
          doors_at?: string | null;
          featured_name?: string | null;
          featured_note?: string | null;
          id?: string;
          local_date: string;
          override_cost_cents?: number | null;
          override_title?: string | null;
          override_venue_id?: string | null;
          series_id: string;
          starts_at: string;
          status?: Database['public']['Enums']['occurrence_status'];
          updated_at?: string;
        };
        Update: {
          cancellation_note?: string | null;
          created_at?: string;
          doors_at?: string | null;
          featured_name?: string | null;
          featured_note?: string | null;
          id?: string;
          local_date?: string;
          override_cost_cents?: number | null;
          override_title?: string | null;
          override_venue_id?: string | null;
          series_id?: string;
          starts_at?: string;
          status?: Database['public']['Enums']['occurrence_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mic_occurrences_override_venue_id_fkey';
            columns: ['override_venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mic_occurrences_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'mic_series';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mic_occurrences_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['series_id'];
          },
        ];
      };
      mic_series: {
        Row: {
          anchor_date: string;
          capacity: number | null;
          cost_cents: number;
          cost_note: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description: string | null;
          disciplines: Database['public']['Enums']['discipline'][];
          doors_offset: string;
          id: string;
          is_active: boolean;
          last_confirmed_at: string | null;
          last_confirmed_by: string | null;
          moderation_status: Database['public']['Enums']['moderation_status'];
          owner_id: string | null;
          poster_url: string | null;
          rrule: string;
          set_length_minutes: number | null;
          signup_closes: string;
          signup_method: Database['public']['Enums']['signup_method'];
          signup_opens: string;
          start_time: string;
          timezone: string;
          title: string;
          updated_at: string;
          venue_id: string;
        };
        Insert: {
          anchor_date: string;
          capacity?: number | null;
          cost_cents?: number;
          cost_note?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          disciplines: Database['public']['Enums']['discipline'][];
          doors_offset?: string;
          id?: string;
          is_active?: boolean;
          last_confirmed_at?: string | null;
          last_confirmed_by?: string | null;
          moderation_status?: Database['public']['Enums']['moderation_status'];
          owner_id?: string | null;
          poster_url?: string | null;
          rrule: string;
          set_length_minutes?: number | null;
          signup_closes?: string;
          signup_method: Database['public']['Enums']['signup_method'];
          signup_opens?: string;
          start_time: string;
          timezone: string;
          title: string;
          updated_at?: string;
          venue_id: string;
        };
        Update: {
          anchor_date?: string;
          capacity?: number | null;
          cost_cents?: number;
          cost_note?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          disciplines?: Database['public']['Enums']['discipline'][];
          doors_offset?: string;
          id?: string;
          is_active?: boolean;
          last_confirmed_at?: string | null;
          last_confirmed_by?: string | null;
          moderation_status?: Database['public']['Enums']['moderation_status'];
          owner_id?: string | null;
          poster_url?: string | null;
          rrule?: string;
          set_length_minutes?: number | null;
          signup_closes?: string;
          signup_method?: Database['public']['Enums']['signup_method'];
          signup_opens?: string;
          start_time?: string;
          timezone?: string;
          title?: string;
          updated_at?: string;
          venue_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mic_series_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mic_series_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mic_series_last_confirmed_by_fkey';
            columns: ['last_confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mic_series_last_confirmed_by_fkey';
            columns: ['last_confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mic_series_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'producer_profiles';
            referencedColumns: ['profile_id'];
          },
          {
            foreignKeyName: 'mic_series_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'producer_public';
            referencedColumns: ['profile_id'];
          },
          {
            foreignKeyName: 'mic_series_venue_id_fkey';
            columns: ['venue_id'];
            isOneToOne: false;
            referencedRelation: 'venues';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_outbox: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          kind: string;
          payload: Json;
          profile_id: string;
          sent_at: string | null;
          title: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          kind: string;
          payload?: Json;
          profile_id: string;
          sent_at?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          payload?: Json;
          profile_id?: string;
          sent_at?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_outbox_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_outbox_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_prefs: {
        Row: {
          favorite_reminders: boolean;
          nearby_radius_km: number;
          new_mic_nearby: boolean;
          profile_id: string;
          signup_updates: boolean;
          updated_at: string;
          weekly_digest: boolean;
        };
        Insert: {
          favorite_reminders?: boolean;
          nearby_radius_km?: number;
          new_mic_nearby?: boolean;
          profile_id: string;
          signup_updates?: boolean;
          updated_at?: string;
          weekly_digest?: boolean;
        };
        Update: {
          favorite_reminders?: boolean;
          nearby_radius_km?: number;
          new_mic_nearby?: boolean;
          profile_id?: string;
          signup_updates?: boolean;
          updated_at?: string;
          weekly_digest?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_prefs_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_prefs_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      performer_profiles: {
        Row: {
          created_at: string;
          disciplines: Database['public']['Enums']['discipline'][];
          experience: Database['public']['Enums']['experience_level'] | null;
          links: Json;
          profile_id: string;
          tags: string[];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          disciplines?: Database['public']['Enums']['discipline'][];
          experience?: Database['public']['Enums']['experience_level'] | null;
          links?: Json;
          profile_id: string;
          tags?: string[];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          disciplines?: Database['public']['Enums']['discipline'][];
          experience?: Database['public']['Enums']['experience_level'] | null;
          links?: Json;
          profile_id?: string;
          tags?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'performer_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'performer_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      producer_profiles: {
        Row: {
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          payout_ref: string | null;
          profile_id: string;
          updated_at: string;
          verified: boolean;
        };
        Insert: {
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          payout_ref?: string | null;
          profile_id: string;
          updated_at?: string;
          verified?: boolean;
        };
        Update: {
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          payout_ref?: string | null;
          profile_id?: string;
          updated_at?: string;
          verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'producer_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'producer_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          birth_year: number | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          eula_accepted_at: string;
          eula_version: string;
          handle: string;
          home_city: string | null;
          home_lat: number | null;
          home_lng: number | null;
          home_location: unknown;
          home_postal_code: string | null;
          home_region: string | null;
          id: string;
          is_admin: boolean;
          is_performer: boolean;
          is_producer: boolean;
          link_instagram: string | null;
          link_tiktok: string | null;
          link_website: string | null;
          link_youtube: string | null;
          moderation_status: Database['public']['Enums']['moderation_status'];
          stage_name: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          birth_year?: number | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          eula_accepted_at?: string;
          eula_version: string;
          handle: string;
          home_city?: string | null;
          home_lat?: number | null;
          home_lng?: number | null;
          home_location?: unknown;
          home_postal_code?: string | null;
          home_region?: string | null;
          id: string;
          is_admin?: boolean;
          is_performer?: boolean;
          is_producer?: boolean;
          link_instagram?: string | null;
          link_tiktok?: string | null;
          link_website?: string | null;
          link_youtube?: string | null;
          moderation_status?: Database['public']['Enums']['moderation_status'];
          stage_name: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          birth_year?: number | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          eula_accepted_at?: string;
          eula_version?: string;
          handle?: string;
          home_city?: string | null;
          home_lat?: number | null;
          home_lng?: number | null;
          home_location?: unknown;
          home_postal_code?: string | null;
          home_region?: string | null;
          id?: string;
          is_admin?: boolean;
          is_performer?: boolean;
          is_producer?: boolean;
          link_instagram?: string | null;
          link_tiktok?: string | null;
          link_website?: string | null;
          link_youtube?: string | null;
          moderation_status?: Database['public']['Enums']['moderation_status'];
          stage_name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_eula_version_fkey';
            columns: ['eula_version'];
            isOneToOne: false;
            referencedRelation: 'eula_versions';
            referencedColumns: ['version'];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          reason: Database['public']['Enums']['report_reason'];
          reporter_id: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database['public']['Enums']['report_status'];
          target_id: string;
          target_type: Database['public']['Enums']['report_target'];
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason: Database['public']['Enums']['report_reason'];
          reporter_id: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database['public']['Enums']['report_status'];
          target_id: string;
          target_type: Database['public']['Enums']['report_target'];
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason?: Database['public']['Enums']['report_reason'];
          reporter_id?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database['public']['Enums']['report_status'];
          target_id?: string;
          target_type?: Database['public']['Enums']['report_target'];
        };
        Relationships: [
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      signups: {
        Row: {
          created_at: string;
          id: string;
          occurrence_id: string;
          on_deck_at: string | null;
          performer_id: string;
          slot_position: number | null;
          status: Database['public']['Enums']['signup_status'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          occurrence_id: string;
          on_deck_at?: string | null;
          performer_id: string;
          slot_position?: number | null;
          status?: Database['public']['Enums']['signup_status'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          occurrence_id?: string;
          on_deck_at?: string | null;
          performer_id?: string;
          slot_position?: number | null;
          status?: Database['public']['Enums']['signup_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'signups_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'mic_occurrences';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signups_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'signups_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'occurrence_attendance';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'signups_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'occurrence_spots';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'signups_performer_id_fkey';
            columns: ['performer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signups_performer_id_fkey';
            columns: ['performer_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      spatial_ref_sys: {
        Row: {
          auth_name: string | null;
          auth_srid: number | null;
          proj4text: string | null;
          srid: number;
          srtext: string | null;
        };
        Insert: {
          auth_name?: string | null;
          auth_srid?: number | null;
          proj4text?: string | null;
          srid: number;
          srtext?: string | null;
        };
        Update: {
          auth_name?: string | null;
          auth_srid?: number | null;
          proj4text?: string | null;
          srid?: number;
          srtext?: string | null;
        };
        Relationships: [];
      };
      venues: {
        Row: {
          address_line: string;
          age_restriction: Database['public']['Enums']['age_restriction'] | null;
          city: string;
          country: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          has_pa: boolean | null;
          has_stage: boolean | null;
          id: string;
          location: unknown;
          moderation_status: Database['public']['Enums']['moderation_status'];
          name: string;
          neighborhood: string | null;
          parking_notes: string | null;
          phone: string | null;
          region: string;
          updated_at: string;
          website: string | null;
          wheelchair_accessible: boolean | null;
        };
        Insert: {
          address_line: string;
          age_restriction?: Database['public']['Enums']['age_restriction'] | null;
          city: string;
          country?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          has_pa?: boolean | null;
          has_stage?: boolean | null;
          id?: string;
          location: unknown;
          moderation_status?: Database['public']['Enums']['moderation_status'];
          name: string;
          neighborhood?: string | null;
          parking_notes?: string | null;
          phone?: string | null;
          region: string;
          updated_at?: string;
          website?: string | null;
          wheelchair_accessible?: boolean | null;
        };
        Update: {
          address_line?: string;
          age_restriction?: Database['public']['Enums']['age_restriction'] | null;
          city?: string;
          country?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          has_pa?: boolean | null;
          has_stage?: boolean | null;
          id?: string;
          location?: unknown;
          moderation_status?: Database['public']['Enums']['moderation_status'];
          name?: string;
          neighborhood?: string | null;
          parking_notes?: string | null;
          phone?: string | null;
          region?: string;
          updated_at?: string;
          website?: string | null;
          wheelchair_accessible?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: 'venues_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'venues_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null;
          f_geography_column: unknown;
          f_table_catalog: unknown;
          f_table_name: unknown;
          f_table_schema: unknown;
          srid: number | null;
          type: string | null;
        };
        Relationships: [];
      };
      geometry_columns: {
        Row: {
          coord_dimension: number | null;
          f_geometry_column: unknown;
          f_table_catalog: string | null;
          f_table_name: unknown;
          f_table_schema: unknown;
          srid: number | null;
          type: string | null;
        };
        Insert: {
          coord_dimension?: number | null;
          f_geometry_column?: unknown;
          f_table_catalog?: string | null;
          f_table_name?: unknown;
          f_table_schema?: unknown;
          srid?: number | null;
          type?: string | null;
        };
        Update: {
          coord_dimension?: number | null;
          f_geometry_column?: unknown;
          f_table_catalog?: string | null;
          f_table_name?: unknown;
          f_table_schema?: unknown;
          srid?: number | null;
          type?: string | null;
        };
        Relationships: [];
      };
      my_upcoming_nights: {
        Row: {
          cancellation_note: string | null;
          cost_cents: number | null;
          disciplines: Database['public']['Enums']['discipline'][] | null;
          featured_name: string | null;
          last_confirmed_at: string | null;
          neighborhood: string | null;
          occurrence_id: string | null;
          occurrence_status: Database['public']['Enums']['occurrence_status'] | null;
          on_deck_at: string | null;
          planning: boolean | null;
          poster_url: string | null;
          rrule: string | null;
          series_id: string | null;
          signup_method: Database['public']['Enums']['signup_method'] | null;
          signup_status: Database['public']['Enums']['signup_status'] | null;
          slot_position: number | null;
          start_time: string | null;
          starts_at: string | null;
          timezone: string | null;
          title: string | null;
          venue_name: string | null;
        };
        Relationships: [];
      };
      occurrence_attendance: {
        Row: {
          occurrence_id: string | null;
          performer_plan_count: number | null;
          plan_count: number | null;
          series_id: string | null;
          signup_count: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'mic_occurrences_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'mic_series';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mic_occurrences_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['series_id'];
          },
        ];
      };
      occurrence_spots: {
        Row: {
          capacity: number | null;
          occurrence_id: string | null;
          planning_performers: number | null;
          series_id: string | null;
          spots_left: number | null;
          taken: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'mic_occurrences_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'mic_series';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'mic_occurrences_series_id_fkey';
            columns: ['series_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['series_id'];
          },
        ];
      };
      performer_public: {
        Row: {
          disciplines: Database['public']['Enums']['discipline'][] | null;
          experience: Database['public']['Enums']['experience_level'] | null;
          links: Json | null;
          profile_id: string | null;
          tags: string[] | null;
        };
        Insert: {
          disciplines?: Database['public']['Enums']['discipline'][] | null;
          experience?: Database['public']['Enums']['experience_level'] | null;
          links?: Json | null;
          profile_id?: string | null;
          tags?: string[] | null;
        };
        Update: {
          disciplines?: Database['public']['Enums']['discipline'][] | null;
          experience?: Database['public']['Enums']['experience_level'] | null;
          links?: Json | null;
          profile_id?: string | null;
          tags?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'performer_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'performer_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      pg_all_foreign_keys: {
        Row: {
          fk_columns: unknown[] | null;
          fk_constraint_name: unknown;
          fk_schema_name: unknown;
          fk_table_name: unknown;
          fk_table_oid: unknown;
          is_deferrable: boolean | null;
          is_deferred: boolean | null;
          match_type: string | null;
          on_delete: string | null;
          on_update: string | null;
          pk_columns: unknown[] | null;
          pk_constraint_name: unknown;
          pk_index_name: unknown;
          pk_schema_name: unknown;
          pk_table_name: unknown;
          pk_table_oid: unknown;
        };
        Relationships: [];
      };
      plan_roster: {
        Row: {
          created_at: string | null;
          handle: string | null;
          is_performer: boolean | null;
          occurrence_id: string | null;
          profile_id: string | null;
          stage_name: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_plans_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'mic_occurrences';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_plans_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'attendance_plans_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'occurrence_attendance';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'attendance_plans_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'occurrence_spots';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'attendance_plans_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_plans_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      producer_public: {
        Row: {
          contact_email: string | null;
          profile_id: string | null;
          verified: boolean | null;
        };
        Insert: {
          contact_email?: string | null;
          profile_id?: string | null;
          verified?: boolean | null;
        };
        Update: {
          contact_email?: string | null;
          profile_id?: string | null;
          verified?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: 'producer_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'producer_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      public_profiles: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string | null;
          handle: string | null;
          id: string | null;
          is_performer: boolean | null;
          is_producer: boolean | null;
          link_instagram: string | null;
          link_tiktok: string | null;
          link_website: string | null;
          link_youtube: string | null;
          stage_name: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          handle?: string | null;
          id?: string | null;
          is_performer?: boolean | null;
          is_producer?: boolean | null;
          link_instagram?: string | null;
          link_tiktok?: string | null;
          link_website?: string | null;
          link_youtube?: string | null;
          stage_name?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          handle?: string | null;
          id?: string | null;
          is_performer?: boolean | null;
          is_producer?: boolean | null;
          link_instagram?: string | null;
          link_tiktok?: string | null;
          link_website?: string | null;
          link_youtube?: string | null;
          stage_name?: string | null;
        };
        Relationships: [];
      };
      signup_roster: {
        Row: {
          created_at: string | null;
          handle: string | null;
          id: string | null;
          occurrence_id: string | null;
          on_deck_at: string | null;
          performer_id: string | null;
          slot_position: number | null;
          stage_name: string | null;
          status: Database['public']['Enums']['signup_status'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'signups_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'mic_occurrences';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signups_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'my_upcoming_nights';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'signups_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'occurrence_attendance';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'signups_occurrence_id_fkey';
            columns: ['occurrence_id'];
            isOneToOne: false;
            referencedRelation: 'occurrence_spots';
            referencedColumns: ['occurrence_id'];
          },
          {
            foreignKeyName: 'signups_performer_id_fkey';
            columns: ['performer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signups_performer_id_fkey';
            columns: ['performer_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      tap_funky: {
        Row: {
          args: string | null;
          is_definer: boolean | null;
          is_strict: boolean | null;
          is_visible: boolean | null;
          kind: unknown;
          langoid: unknown;
          name: unknown;
          oid: unknown;
          owner: unknown;
          returns: string | null;
          returns_set: boolean | null;
          schema: unknown;
          volatility: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      _cleanup: { Args: never; Returns: boolean };
      _contract_on: { Args: { '': string }; Returns: unknown };
      _currtest: { Args: never; Returns: number };
      _db_privs: { Args: never; Returns: unknown[] };
      _extensions: { Args: never; Returns: unknown[] };
      _get: { Args: { '': string }; Returns: number };
      _get_latest: { Args: { '': string }; Returns: number[] };
      _get_note: { Args: { '': string }; Returns: string };
      _is_verbose: { Args: never; Returns: boolean };
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string };
        Returns: undefined;
      };
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown };
        Returns: unknown;
      };
      _postgis_pgsql_version: { Args: never; Returns: string };
      _postgis_scripts_pgsql_version: { Args: never; Returns: string };
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown };
        Returns: number;
      };
      _postgis_stats: {
        Args: { ''?: string; att_name: string; tbl: unknown };
        Returns: string;
      };
      _prokind: { Args: { p_oid: unknown }; Returns: unknown };
      _query: { Args: { '': string }; Returns: string };
      _refine_vol: { Args: { '': string }; Returns: string };
      _retval: { Args: { '': string }; Returns: string };
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_dwithin: {
        Args: {
          geog1: unknown;
          geog2: unknown;
          tolerance: number;
          use_spheroid?: boolean;
        };
        Returns: boolean;
      };
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown };
        Returns: number;
      };
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_sortablehash: { Args: { geom: unknown }; Returns: number };
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_voronoi: {
        Args: {
          clip?: unknown;
          g1: unknown;
          return_polygons?: boolean;
          tolerance?: number;
        };
        Returns: unknown;
      };
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _table_privs: { Args: never; Returns: unknown[] };
      _temptypes: { Args: { '': string }; Returns: string };
      _todo: { Args: never; Returns: string };
      addauth: { Args: { '': string }; Returns: boolean };
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string;
              column_name: string;
              new_dim: number;
              new_srid_in: number;
              new_type: string;
              schema_name: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              new_dim: number;
              new_srid: number;
              new_type: string;
              schema_name: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              new_dim: number;
              new_srid: number;
              new_type: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          };
      col_is_null:
        | {
            Args: {
              column_name: unknown;
              description?: string;
              schema_name: unknown;
              table_name: unknown;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: unknown;
              description?: string;
              table_name: unknown;
            };
            Returns: string;
          };
      col_not_null:
        | {
            Args: {
              column_name: unknown;
              description?: string;
              schema_name: unknown;
              table_name: unknown;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: unknown;
              description?: string;
              table_name: unknown;
            };
            Returns: string;
          };
      dearmor: { Args: { '': string }; Returns: string };
      delete_account: { Args: never; Returns: undefined };
      delete_account_web: { Args: { p_user_id: string }; Returns: undefined };
      deletion_request_allowed: {
        Args: { p_email_key: string; p_ip_key: string };
        Returns: boolean;
      };
      diag:
        | {
            Args: { msg: unknown };
            Returns: {
              error: true;
            } & 'Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved';
          }
        | {
            Args: { msg: string };
            Returns: {
              error: true;
            } & 'Could not choose the best candidate function between: public.diag(msg => text), public.diag(msg => anyelement). Try renaming the parameters or the function itself in the database so function overloading can be resolved';
          };
      diag_test_name: { Args: { '': string }; Returns: string };
      disablelongtransactions: { Args: never; Returns: string };
      do_tap: { Args: never; Returns: string[] } | { Args: { '': string }; Returns: string[] };
      draw_lottery: {
        Args: { p_occurrence_id: string };
        Returns: {
          created_at: string;
          id: string;
          occurrence_id: string;
          on_deck_at: string | null;
          performer_id: string;
          slot_position: number | null;
          status: Database['public']['Enums']['signup_status'];
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'signups';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string;
              column_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | { Args: { column_name: string; table_name: string }; Returns: string };
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string };
      enablelongtransactions: { Args: never; Returns: string };
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      fail: { Args: never; Returns: string } | { Args: { '': string }; Returns: string };
      findfuncs: { Args: { '': string }; Returns: string[] };
      finish: { Args: { exception_on_failure?: boolean }; Returns: string[] };
      format_type_string: { Args: { '': string }; Returns: string };
      gen_random_uuid: { Args: never; Returns: string };
      gen_salt: { Args: { '': string }; Returns: string };
      geometry: { Args: { '': string }; Returns: unknown };
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geomfromewkt: { Args: { '': string }; Returns: unknown };
      gettransactionid: { Args: never; Returns: unknown };
      has_unique: { Args: { '': string }; Returns: string };
      in_todo: { Args: never; Returns: boolean };
      is_empty: { Args: { '': string }; Returns: string };
      isnt_empty: { Args: { '': string }; Returns: string };
      lives_ok: { Args: { '': string }; Returns: string };
      longtransactionsenabled: { Args: never; Returns: boolean };
      mark_on_deck: {
        Args: { p_on_deck?: boolean; p_signup_id: string };
        Returns: undefined;
      };
      mics_near: {
        Args: {
          p_days?: number[];
          p_disciplines?: Database['public']['Enums']['discipline'][];
          p_end_hour?: number;
          p_free_only?: boolean;
          p_lat: number;
          p_limit?: number;
          p_lng: number;
          p_methods?: Database['public']['Enums']['signup_method'][];
          p_radius_m?: number;
          p_start_hour?: number;
        };
        Returns: {
          capacity: number;
          city: string;
          cost_cents: number;
          description: string;
          disciplines: Database['public']['Enums']['discipline'][];
          distance_m: number;
          featured_name: string;
          is_active: boolean;
          last_confirmed_at: string;
          lat: number;
          lng: number;
          neighborhood: string;
          next_local_date: string;
          next_occurrence_id: string;
          next_starts_at: string;
          next_status: Database['public']['Enums']['occurrence_status'];
          poster_url: string;
          region: string;
          rrule: string;
          series_id: string;
          set_length_minutes: number;
          signup_method: Database['public']['Enums']['signup_method'];
          spots_left: number;
          start_time: string;
          timezone: string;
          title: string;
          venue_id: string;
          venue_name: string;
        }[];
      };
      moderate_content: {
        Args: {
          p_approve: boolean;
          p_target: Database['public']['Enums']['report_target'];
          p_target_id: string;
        };
        Returns: undefined;
      };
      no_plan: { Args: never; Returns: boolean[] };
      num_failed: { Args: never; Returns: number };
      os_name: { Args: never; Returns: string };
      pass: { Args: never; Returns: string } | { Args: { '': string }; Returns: string };
      pg_version: { Args: never; Returns: string };
      pg_version_num: { Args: never; Returns: number };
      pgp_armor_headers: {
        Args: { '': string };
        Returns: Record<string, unknown>[];
      };
      pgtap_version: { Args: never; Returns: number };
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string };
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: number;
      };
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: number;
      };
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: string;
      };
      postgis_extensions_upgrade: {
        Args: { target_version?: string };
        Returns: string;
      };
      postgis_full_version: { Args: never; Returns: string };
      postgis_geos_compiled_version: { Args: never; Returns: string };
      postgis_geos_version: { Args: never; Returns: string };
      postgis_lib_build_date: { Args: never; Returns: string };
      postgis_lib_revision: { Args: never; Returns: string };
      postgis_lib_version: { Args: never; Returns: string };
      postgis_libjson_version: { Args: never; Returns: string };
      postgis_liblwgeom_version: { Args: never; Returns: string };
      postgis_libprotobuf_version: { Args: never; Returns: string };
      postgis_libxml_version: { Args: never; Returns: string };
      postgis_proj_version: { Args: never; Returns: string };
      postgis_scripts_build_date: { Args: never; Returns: string };
      postgis_scripts_installed: { Args: never; Returns: string };
      postgis_scripts_released: { Args: never; Returns: string };
      postgis_srs: {
        Args: { auth_name: string; auth_srid: string };
        Returns: {
          auth_name: string;
          auth_srid: string;
          point_ne: unknown;
          point_sw: unknown;
          proj4text: string;
          srname: string;
          srtext: string;
        }[];
      };
      postgis_srs_all: {
        Args: never;
        Returns: {
          auth_name: string;
          auth_srid: string;
          point_ne: unknown;
          point_sw: unknown;
          proj4text: string;
          srname: string;
          srtext: string;
        }[];
      };
      postgis_srs_codes: { Args: { auth_name: string }; Returns: string[] };
      postgis_srs_search: {
        Args: { authname?: string; bounds: unknown };
        Returns: {
          auth_name: string;
          auth_srid: string;
          point_ne: unknown;
          point_sw: unknown;
          proj4text: string;
          srname: string;
          srtext: string;
        }[];
      };
      postgis_svn_version: { Args: never; Returns: string };
      postgis_transform_pipeline_geometry: {
        Args: {
          forward: boolean;
          geom: unknown;
          pipeline: string;
          to_srid: number;
        };
        Returns: unknown;
      };
      postgis_type_name: {
        Args: {
          coord_dimension: number;
          geomname: string;
          use_new_name?: boolean;
        };
        Returns: string;
      };
      postgis_version: { Args: never; Returns: string };
      postgis_wagyu_version: { Args: never; Returns: string };
      review_claim: {
        Args: { p_approve: boolean; p_claim_id: string };
        Returns: undefined;
      };
      runtests: { Args: never; Returns: string[] } | { Args: { '': string }; Returns: string[] };
      search_mics: {
        Args: {
          p_lat?: number;
          p_limit?: number;
          p_lng?: number;
          p_query: string;
        };
        Returns: {
          capacity: number;
          city: string;
          cost_cents: number;
          disciplines: Database['public']['Enums']['discipline'][];
          distance_m: number;
          featured_name: string;
          last_confirmed_at: string;
          lat: number;
          lng: number;
          neighborhood: string;
          next_starts_at: string;
          poster_url: string;
          region: string;
          rrule: string;
          series_id: string;
          signup_method: Database['public']['Enums']['signup_method'];
          spots_left: number;
          start_time: string;
          timezone: string;
          title: string;
          venue_id: string;
          venue_name: string;
        }[];
      };
      set_slot_order: {
        Args: { p_occurrence_id: string; p_signup_ids: string[] };
        Returns: undefined;
      };
      skip:
        | { Args: { '': string }; Returns: string }
        | { Args: { how_many: number; why: string }; Returns: string };
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown };
            Returns: number;
          };
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { '': string }; Returns: number };
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number };
        Returns: string;
      };
      st_asewkt: { Args: { '': string }; Returns: string };
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
            Returns: string;
          }
        | {
            Args: {
              geom_column?: string;
              maxdecimaldigits?: number;
              pretty_bool?: boolean;
              r: Record<string, unknown>;
            };
            Returns: string;
          }
        | { Args: { '': string }; Returns: string };
      st_asgml:
        | {
            Args: {
              geog: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
            };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
            Returns: string;
          }
        | { Args: { '': string }; Returns: string }
        | {
            Args: {
              geog: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
              version: number;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
              version: number;
            };
            Returns: string;
          };
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string };
            Returns: string;
          }
        | { Args: { '': string }; Returns: string };
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string };
        Returns: string;
      };
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string };
      st_asmvtgeom: {
        Args: {
          bounds: unknown;
          buffer?: number;
          clip_geom?: boolean;
          extent?: number;
          geom: unknown;
        };
        Returns: unknown;
      };
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number };
            Returns: string;
          }
        | { Args: { '': string }; Returns: string };
      st_astext: { Args: { '': string }; Returns: string };
      st_astwkb:
        | {
            Args: {
              geom: unknown;
              prec?: number;
              prec_m?: number;
              prec_z?: number;
              with_boxes?: boolean;
              with_sizes?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown[];
              ids: number[];
              prec?: number;
              prec_m?: number;
              prec_z?: number;
              with_boxes?: boolean;
              with_sizes?: boolean;
            };
            Returns: string;
          };
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
        Returns: string;
      };
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown };
        Returns: unknown;
      };
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number };
            Returns: unknown;
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number };
            Returns: unknown;
          };
      st_centroid: { Args: { '': string }; Returns: unknown };
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown };
        Returns: unknown;
      };
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean;
          param_geom: unknown;
          param_pctconvex: number;
        };
        Returns: unknown;
      };
      st_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_coorddim: { Args: { geometry: unknown }; Returns: number };
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number };
        Returns: unknown;
      };
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean };
            Returns: number;
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number };
            Returns: number;
          };
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_dwithin: {
        Args: {
          geog1: unknown;
          geog2: unknown;
          tolerance: number;
          use_spheroid?: boolean;
        };
        Returns: boolean;
      };
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number };
            Returns: unknown;
          }
        | {
            Args: {
              dm?: number;
              dx: number;
              dy: number;
              dz?: number;
              geom: unknown;
            };
            Returns: unknown;
          };
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown };
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number };
        Returns: unknown;
      };
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number };
        Returns: unknown;
      };
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number };
        Returns: unknown;
      };
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number };
            Returns: unknown;
          };
      st_geogfromtext: { Args: { '': string }; Returns: unknown };
      st_geographyfromtext: { Args: { '': string }; Returns: unknown };
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string };
      st_geomcollfromtext: { Args: { '': string }; Returns: unknown };
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean;
          g: unknown;
          max_iter?: number;
          tolerance?: number;
        };
        Returns: unknown;
      };
      st_geometryfromtext: { Args: { '': string }; Returns: unknown };
      st_geomfromewkt: { Args: { '': string }; Returns: unknown };
      st_geomfromgeojson:
        | { Args: { '': Json }; Returns: unknown }
        | { Args: { '': Json }; Returns: unknown }
        | { Args: { '': string }; Returns: unknown };
      st_geomfromgml: { Args: { '': string }; Returns: unknown };
      st_geomfromkml: { Args: { '': string }; Returns: unknown };
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown };
      st_geomfromtext: { Args: { '': string }; Returns: unknown };
      st_gmltosql: { Args: { '': string }; Returns: unknown };
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean };
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number };
        Returns: unknown;
      };
      st_hexagongrid: {
        Args: { bounds: unknown; size: number };
        Returns: Record<string, unknown>[];
      };
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown };
        Returns: number;
      };
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_inversetransformpipeline: {
        Args: { geom: unknown; pipeline: string; to_srid?: number };
        Returns: unknown;
      };
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown };
        Returns: Database['public']['CompositeTypes']['valid_detail'];
        SetofOptions: {
          from: '*';
          to: 'valid_detail';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      st_largestemptycircle: {
        Args: { boundary?: unknown; geom: unknown; tolerance?: number };
        Returns: Record<string, unknown>;
      };
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { '': string }; Returns: number };
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown };
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown };
        Returns: number;
      };
      st_lineextend: {
        Args: {
          distance_backward?: number;
          distance_forward: number;
          geom: unknown;
        };
        Returns: unknown;
      };
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string };
        Returns: unknown;
      };
      st_linefromtext: { Args: { '': string }; Returns: unknown };
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown };
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number };
        Returns: unknown;
      };
      st_locatebetween: {
        Args: {
          frommeasure: number;
          geometry: unknown;
          leftrightoffset?: number;
          tomeasure: number;
        };
        Returns: unknown;
      };
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number };
        Returns: unknown;
      };
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makevalid: {
        Args: { geom: unknown; params: string };
        Returns: unknown;
      };
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number };
        Returns: unknown;
      };
      st_mlinefromtext: { Args: { '': string }; Returns: unknown };
      st_mpointfromtext: { Args: { '': string }; Returns: unknown };
      st_mpolyfromtext: { Args: { '': string }; Returns: unknown };
      st_multilinestringfromtext: { Args: { '': string }; Returns: unknown };
      st_multipointfromtext: { Args: { '': string }; Returns: unknown };
      st_multipolygonfromtext: { Args: { '': string }; Returns: unknown };
      st_node: { Args: { g: unknown }; Returns: unknown };
      st_normalize: { Args: { geom: unknown }; Returns: unknown };
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string };
        Returns: unknown;
      };
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean };
        Returns: number;
      };
      st_pointfromtext: { Args: { '': string }; Returns: unknown };
      st_pointm: {
        Args: {
          mcoordinate: number;
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
        };
        Returns: unknown;
      };
      st_pointz: {
        Args: {
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
          zcoordinate: number;
        };
        Returns: unknown;
      };
      st_pointzm: {
        Args: {
          mcoordinate: number;
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
          zcoordinate: number;
        };
        Returns: unknown;
      };
      st_polyfromtext: { Args: { '': string }; Returns: unknown };
      st_polygonfromtext: { Args: { '': string }; Returns: unknown };
      st_project:
        | {
            Args: { azimuth: number; distance: number; geog: unknown };
            Returns: unknown;
          }
        | {
            Args: { distance: number; geog_from: unknown; geog_to: unknown };
            Returns: unknown;
          }
        | {
            Args: { azimuth: number; distance: number; geom1: unknown };
            Returns: unknown;
          }
        | {
            Args: { distance: number; geom1: unknown; geom2: unknown };
            Returns: unknown;
          };
      st_quantizecoordinates: {
        Args: {
          g: unknown;
          prec_m?: number;
          prec_x: number;
          prec_y?: number;
          prec_z?: number;
        };
        Returns: unknown;
      };
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number };
        Returns: unknown;
      };
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string };
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number };
        Returns: unknown;
      };
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown };
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number };
        Returns: unknown;
      };
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number };
        Returns: unknown;
      };
      st_squaregrid: {
        Args: { bounds: unknown; size: number };
        Returns: Record<string, unknown>[];
      };
      st_srid:
        { Args: { geog: unknown }; Returns: number } | { Args: { geom: unknown }; Returns: number };
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number };
        Returns: unknown[];
      };
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown };
        Returns: unknown;
      };
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_tileenvelope: {
        Args: {
          bounds?: unknown;
          margin?: number;
          x: number;
          y: number;
          zoom: number;
        };
        Returns: unknown;
      };
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string };
            Returns: unknown;
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number };
            Returns: unknown;
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown };
      st_transformpipeline: {
        Args: { geom: unknown; pipeline: string; to_srid?: number };
        Returns: unknown;
      };
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown };
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number };
            Returns: unknown;
          };
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown };
      st_wkttosql: { Args: { '': string }; Returns: unknown };
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number };
        Returns: unknown;
      };
      throws_ok: { Args: { '': string }; Returns: string };
      todo:
        | { Args: { how_many: number }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] }
        | { Args: { why: string }; Returns: boolean[] }
        | { Args: { how_many: number; why: string }; Returns: boolean[] };
      todo_end: { Args: never; Returns: boolean[] };
      todo_start:
        { Args: never; Returns: boolean[] } | { Args: { '': string }; Returns: boolean[] };
      unlockrows: { Args: { '': string }; Returns: number };
      updategeometrysrid: {
        Args: {
          catalogn_name: string;
          column_name: string;
          new_srid_in: number;
          schema_name: string;
          table_name: string;
        };
        Returns: string;
      };
    };
    Enums: {
      age_restriction: 'all_ages' | 'eighteen_plus' | 'twenty_one_plus';
      claim_status: 'pending' | 'approved' | 'rejected';
      discipline: 'music' | 'comedy' | 'poetry' | 'other';
      experience_level: 'new' | 'developing' | 'experienced' | 'professional';
      flag_reason:
        | 'wrong_time'
        | 'wrong_venue'
        | 'wrong_cost'
        | 'not_happening'
        | 'permanently_dead'
        | 'duplicate'
        | 'other';
      flag_status: 'open' | 'confirmed' | 'dismissed';
      moderation_status: 'pending' | 'approved' | 'rejected';
      occurrence_status: 'scheduled' | 'cancelled' | 'moved' | 'completed';
      report_reason:
        | 'spam'
        | 'harassment'
        | 'hate'
        | 'sexual_content'
        | 'violence_threat'
        | 'impersonation'
        | 'illegal'
        | 'other';
      report_status: 'open' | 'in_review' | 'actioned' | 'dismissed';
      report_target: 'series' | 'venue' | 'profile' | 'occurrence';
      signup_method: 'lottery' | 'first_come' | 'reserved_slot' | 'host_booked';
      signup_status: 'requested' | 'confirmed' | 'waitlisted' | 'drawn' | 'performed' | 'no_show';
    };
    CompositeTypes: {
      _time_trial_type: {
        a_time: number | null;
      };
      geometry_dump: {
        path: number[] | null;
        geom: unknown;
      };
      valid_detail: {
        valid: boolean | null;
        reason: string | null;
        location: unknown;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      age_restriction: ['all_ages', 'eighteen_plus', 'twenty_one_plus'],
      claim_status: ['pending', 'approved', 'rejected'],
      discipline: ['music', 'comedy', 'poetry', 'other'],
      experience_level: ['new', 'developing', 'experienced', 'professional'],
      flag_reason: [
        'wrong_time',
        'wrong_venue',
        'wrong_cost',
        'not_happening',
        'permanently_dead',
        'duplicate',
        'other',
      ],
      flag_status: ['open', 'confirmed', 'dismissed'],
      moderation_status: ['pending', 'approved', 'rejected'],
      occurrence_status: ['scheduled', 'cancelled', 'moved', 'completed'],
      report_reason: [
        'spam',
        'harassment',
        'hate',
        'sexual_content',
        'violence_threat',
        'impersonation',
        'illegal',
        'other',
      ],
      report_status: ['open', 'in_review', 'actioned', 'dismissed'],
      report_target: ['series', 'venue', 'profile', 'occurrence'],
      signup_method: ['lottery', 'first_come', 'reserved_slot', 'host_booked'],
      signup_status: ['requested', 'confirmed', 'waitlisted', 'drawn', 'performed', 'no_show'],
    },
  },
} as const;
