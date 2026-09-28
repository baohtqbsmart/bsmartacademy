// Mirrors supabase/migrations, in the format of `supabase gen types typescript`.
// Regenerate from a running database when one is available (requires Docker
// for the local stack, or a linked hosted project):
//   npm run db:types
// or: npx supabase gen types typescript --project-id <id> --schema public > src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type Timestamps = { created_at: string; updated_at: string }
type TimestampsInsert = { created_at?: string; updated_at?: string }

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      roles: {
        Row: { code: string; name: string; description: string; rank: number } & Timestamps
        Insert: { code: string; name: string; description?: string; rank: number } & TimestampsInsert
        Update: { code?: string; name?: string; description?: string; rank?: number } & TimestampsInsert
        Relationships: []
      }
      permissions: {
        Row: { code: string; module: string; description: string; created_at: string }
        Insert: { code: string; description: string; created_at?: string }
        Update: { code?: string; description?: string; created_at?: string }
        Relationships: []
      }
      role_permissions: {
        Row: {
          role_code: string
          permission_code: string
          scope: Database["public"]["Enums"]["permission_scope"]
          created_at: string
        }
        Insert: {
          role_code: string
          permission_code: string
          scope?: Database["public"]["Enums"]["permission_scope"]
          created_at?: string
        }
        Update: {
          role_code?: string
          permission_code?: string
          scope?: Database["public"]["Enums"]["permission_scope"]
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "role_permissions_permission_code_fkey"
            columns: ["permission_code"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          role_code: string
          email: string
          full_name: string
          phone: string | null
          avatar_path: string | null
          is_active: boolean
          must_change_password: boolean
        } & Timestamps
        Insert: {
          id: string
          role_code?: string
          email: string
          full_name?: string
          phone?: string | null
          avatar_path?: string | null
          is_active?: boolean
          must_change_password?: boolean
        } & TimestampsInsert
        Update: {
          id?: string
          role_code?: string
          email?: string
          full_name?: string
          phone?: string | null
          avatar_path?: string | null
          is_active?: boolean
          must_change_password?: boolean
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "profiles_role_code_fkey"
            columns: ["role_code"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["code"]
          },
        ]
      }
      students: {
        Row: {
          id: string
          profile_id: string | null
          student_code: string
          full_name: string
          date_of_birth: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          school_name: string | null
          status: Database["public"]["Enums"]["student_status"]
          notes: string | null
          phone: string | null
          email: string | null
          address: string | null
          joined_on: string | null
          english_level_code: string | null
          target_level_code: string | null
          avatar_path: string | null
          deleted_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          profile_id?: string | null
          student_code?: string
          full_name: string
          date_of_birth?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          school_name?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          notes?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          joined_on?: string | null
          english_level_code?: string | null
          target_level_code?: string | null
          avatar_path?: string | null
          deleted_at?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          profile_id?: string | null
          student_code?: string
          full_name?: string
          date_of_birth?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          school_name?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          notes?: string | null
          phone?: string | null
          email?: string | null
          address?: string | null
          joined_on?: string | null
          english_level_code?: string | null
          target_level_code?: string | null
          avatar_path?: string | null
          deleted_at?: string | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_english_level_code_fkey"
            columns: ["english_level_code"]
            isOneToOne: false
            referencedRelation: "english_levels"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "students_target_level_code_fkey"
            columns: ["target_level_code"]
            isOneToOne: false
            referencedRelation: "english_levels"
            referencedColumns: ["code"]
          },
        ]
      }
      parents: {
        Row: {
          id: string
          profile_id: string | null
          full_name: string
          phone: string | null
          email: string | null
          address: string | null
          notes: string | null
          deleted_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          profile_id?: string | null
          full_name: string
          phone?: string | null
          email?: string | null
          address?: string | null
          notes?: string | null
          deleted_at?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          profile_id?: string | null
          full_name?: string
          phone?: string | null
          email?: string | null
          address?: string | null
          notes?: string | null
          deleted_at?: string | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "parents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          id: string
          profile_id: string | null
          teacher_code: string
          full_name: string
          phone: string | null
          email: string | null
          hired_on: string | null
          status: Database["public"]["Enums"]["staff_status"]
          notes: string | null
          deleted_at: string | null
          public_bio: string
          public_photo_path: string | null
          show_on_website: boolean
        } & Timestamps
        Insert: {
          id?: string
          profile_id?: string | null
          teacher_code: string
          full_name: string
          phone?: string | null
          email?: string | null
          hired_on?: string | null
          status?: Database["public"]["Enums"]["staff_status"]
          notes?: string | null
          deleted_at?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          profile_id?: string | null
          teacher_code?: string
          full_name?: string
          phone?: string | null
          email?: string | null
          hired_on?: string | null
          status?: Database["public"]["Enums"]["staff_status"]
          notes?: string | null
          deleted_at?: string | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "teachers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_parents: {
        Row: {
          student_id: string
          parent_id: string
          relationship: Database["public"]["Enums"]["guardian_relationship"]
          is_primary_contact: boolean
        } & Timestamps
        Insert: {
          student_id: string
          parent_id: string
          relationship: Database["public"]["Enums"]["guardian_relationship"]
          is_primary_contact?: boolean
        } & TimestampsInsert
        Update: {
          student_id?: string
          parent_id?: string
          relationship?: Database["public"]["Enums"]["guardian_relationship"]
          is_primary_contact?: boolean
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "student_parents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_parents_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "parents"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          id: string
          code: string
          name: string
          description: string
          deleted_at: string | null
          audience: string
          icon: string
          image_path: string | null
          show_on_website: boolean
        } & Timestamps
        Insert: {
          id?: string
          code: string
          name: string
          description?: string
          deleted_at?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string
          deleted_at?: string | null
        } & TimestampsInsert
        Relationships: []
      }
      site_settings: {
        Row: {
          id: boolean
          contact_email: string | null
          contact_phone: string | null
          address: string | null
          facebook_url: string | null
          zalo_url: string | null
          hero_image_path: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: never
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          address?: string | null
          facebook_url?: string | null
          zalo_url?: string | null
          hero_image_path?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      articles: {
        Row: {
          id: string
          slug: string
          title: string
          excerpt: string
          body: string
          cover_image_path: string | null
          status: Database["public"]["Enums"]["article_status"]
          published_at: string | null
          author_id: string | null
          author_name: string
        } & Timestamps
        Insert: {
          id?: string
          slug: string
          title: string
          excerpt?: string
          body?: string
          cover_image_path?: string | null
          status?: Database["public"]["Enums"]["article_status"]
        }
        Update: {
          slug?: string
          title?: string
          excerpt?: string
          body?: string
          cover_image_path?: string | null
          status?: Database["public"]["Enums"]["article_status"]
        }
        Relationships: []
      }
      content_comments: {
        Row: {
          id: string
          lesson_id: string | null
          article_id: string | null
          author_id: string | null
          author_name: string
          body: string
          hidden_at: string | null
          created_at: string
        }
        Insert: { lesson_id?: string | null; article_id?: string | null; body: string }
        Update: { hidden_at?: string | null }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: number
          occurred_at: string
          actor_id: string | null
          actor_name: string
          action: string
          entity: string
          entity_id: string | null
          summary: string
          details: Json
        }
        Insert: never
        Update: never
        Relationships: []
      }
      unit_lessons: {
        Row: { unit_id: string; lesson_id: string; position: number; created_at: string }
        Insert: { unit_id: string; lesson_id: string; position?: number }
        Update: { position?: number }
        Relationships: [
          {
            foreignKeyName: "unit_lessons_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "course_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_lessons_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          id: string
          certificate_no: string
          verify_code: string
          student_id: string
          class_id: string
          course_id: string | null
          student_name: string
          course_name: string
          class_name: string
          completion_percent: number | null
          note: string | null
          issued_on: string
          issued_by: string | null
          issued_by_name: string
          revoked_at: string | null
          revoke_reason: string | null
          created_at: string
        }
        Insert: { student_id: string; class_id: string; completion_percent?: number | null; note?: string | null }
        Update: { revoked_at?: string | null; revoke_reason?: string | null }
        Relationships: [
          {
            foreignKeyName: "certificates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          id: string
          author_name: string
          author_role: string
          quote: string
          is_published: boolean
          sort_order: number
          created_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          author_name: string
          author_role?: string
          quote: string
          is_published?: boolean
          sort_order?: number
        }
        Update: {
          author_name?: string
          author_role?: string
          quote?: string
          is_published?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      levels: {
        Row: {
          id: string
          subject_id: string
          code: string
          name: string
          sort_order: number
          deleted_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          subject_id: string
          code: string
          name: string
          sort_order?: number
          deleted_at?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          subject_id?: string
          code?: string
          name?: string
          sort_order?: number
          deleted_at?: string | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "levels_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          id: string
          code: string
          name: string
          description: string
          subject_id: string
          level_id: string | null
          session_count: number | null
          session_minutes: number | null
          status: Database["public"]["Enums"]["course_status"]
          duration_weeks: number | null
          deleted_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          code: string
          name: string
          description?: string
          subject_id: string
          level_id?: string | null
          session_count?: number | null
          session_minutes?: number | null
          status?: Database["public"]["Enums"]["course_status"]
          duration_weeks?: number | null
          deleted_at?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          code?: string
          name?: string
          description?: string
          subject_id?: string
          level_id?: string | null
          session_count?: number | null
          session_minutes?: number | null
          status?: Database["public"]["Enums"]["course_status"]
          duration_weeks?: number | null
          deleted_at?: string | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "courses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_level_id_subject_id_fkey"
            columns: ["level_id", "subject_id"]
            isOneToOne: false
            referencedRelation: "levels"
            referencedColumns: ["id", "subject_id"]
          },
        ]
      }
      classes: {
        Row: {
          id: string
          code: string
          name: string
          course_id: string
          status: Database["public"]["Enums"]["class_status"]
          start_date: string | null
          end_date: string | null
          capacity: number | null
          room: string | null
          delivery_mode: Database["public"]["Enums"]["delivery_mode"]
          meeting_url: string | null
          deleted_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          code: string
          name: string
          course_id: string
          status?: Database["public"]["Enums"]["class_status"]
          start_date?: string | null
          end_date?: string | null
          capacity?: number | null
          room?: string | null
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"]
          meeting_url?: string | null
          deleted_at?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          code?: string
          name?: string
          course_id?: string
          status?: Database["public"]["Enums"]["class_status"]
          start_date?: string | null
          end_date?: string | null
          capacity?: number | null
          room?: string | null
          delivery_mode?: Database["public"]["Enums"]["delivery_mode"]
          meeting_url?: string | null
          deleted_at?: string | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "classes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      class_members: {
        Row: {
          class_id: string
          teacher_id: string
          member_role: Database["public"]["Enums"]["class_member_role"]
          assigned_on: string
        } & Timestamps
        Insert: {
          class_id: string
          teacher_id: string
          member_role?: Database["public"]["Enums"]["class_member_role"]
          assigned_on?: string
        } & TimestampsInsert
        Update: {
          class_id?: string
          teacher_id?: string
          member_role?: Database["public"]["Enums"]["class_member_role"]
          assigned_on?: string
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "class_members_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_members_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_subjects: {
        Row: { teacher_id: string; subject_id: string; created_at: string }
        Insert: { teacher_id: string; subject_id: string; created_at?: string }
        Update: { teacher_id?: string; subject_id?: string; created_at?: string }
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_qualifications: {
        Row: {
          id: string
          teacher_id: string
          title: string
          institution: string | null
          year_awarded: number | null
        } & Timestamps
        Insert: {
          id?: string
          teacher_id: string
          title: string
          institution?: string | null
          year_awarded?: number | null
        } & TimestampsInsert
        Update: {
          id?: string
          teacher_id?: string
          title?: string
          institution?: string | null
          year_awarded?: number | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "teacher_qualifications_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      course_units: {
        Row: {
          id: string
          course_id: string
          position: number
          title: string
          description: string
          session_count: number | null
        } & Timestamps
        Insert: {
          id?: string
          course_id: string
          position?: number
          title: string
          description?: string
          session_count?: number | null
        } & TimestampsInsert
        Update: {
          id?: string
          course_id?: string
          position?: number
          title?: string
          description?: string
          session_count?: number | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "course_units_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedule_slots: {
        Row: {
          id: string
          class_id: string
          weekday: number
          starts_at: string
          ends_at: string
          room: string | null
        } & Timestamps
        Insert: {
          id?: string
          class_id: string
          weekday: number
          starts_at: string
          ends_at: string
          room?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          class_id?: string
          weekday?: number
          starts_at?: string
          ends_at?: string
          room?: string | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "class_schedule_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          profile_id: string
          permission_code: string
          scope: Database["public"]["Enums"]["permission_scope"]
          granted_by: string | null
          created_at: string
        }
        Insert: {
          profile_id: string
          permission_code: string
          scope?: Database["public"]["Enums"]["permission_scope"]
          granted_by?: string | null
          created_at?: string
        }
        Update: {
          profile_id?: string
          permission_code?: string
          scope?: Database["public"]["Enums"]["permission_scope"]
          granted_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tuition_plans: {
        Row: {
          id: string
          code: string
          name: string
          course_id: string
          amount: number
          currency: string
          duration_months: number
          payment_schedule: Database["public"]["Enums"]["payment_schedule"]
          is_active: boolean
          notes: string | null
          deleted_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          code: string
          name: string
          course_id: string
          amount: number
          currency?: string
          duration_months: number
          payment_schedule: Database["public"]["Enums"]["payment_schedule"]
          is_active?: boolean
          notes?: string | null
          deleted_at?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          code?: string
          name?: string
          course_id?: string
          amount?: number
          currency?: string
          duration_months?: number
          payment_schedule?: Database["public"]["Enums"]["payment_schedule"]
          is_active?: boolean
          notes?: string | null
          deleted_at?: string | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "tuition_plans_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      tuition_discount_rules: {
        Row: {
          id: string
          plan_id: string | null
          name: string
          kind: Database["public"]["Enums"]["discount_kind"]
          value: number
          is_active: boolean
        } & Timestamps
        Insert: {
          id?: string
          plan_id?: string | null
          name: string
          kind: Database["public"]["Enums"]["discount_kind"]
          value: number
          is_active?: boolean
        } & TimestampsInsert
        Update: {
          id?: string
          plan_id?: string | null
          name?: string
          kind?: Database["public"]["Enums"]["discount_kind"]
          value?: number
          is_active?: boolean
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "tuition_discount_rules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "tuition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      student_tuitions: {
        Row: {
          id: string
          student_id: string
          plan_id: string
          plan_name: string
          course_name: string
          original_amount: number
          discount_amount: number
          final_amount: number
          start_date: string
          status: Database["public"]["Enums"]["student_tuition_status"]
          cancelled_at: string | null
          cancel_reason: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          plan_id: string
          plan_name: string
          course_name: string
          original_amount: number
          discount_amount?: number
          start_date: string
          status?: Database["public"]["Enums"]["student_tuition_status"]
          created_by?: string | null
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: "student_tuitions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_tuitions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "tuition_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      student_tuition_discounts: {
        Row: { id: string; student_tuition_id: string; rule_id: string | null; label: string; amount: number }
        Insert: { id?: string; student_tuition_id: string; rule_id?: string | null; label: string; amount: number }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: "student_tuition_discounts_student_tuition_id_fkey"
            columns: ["student_tuition_id"]
            isOneToOne: false
            referencedRelation: "student_tuitions"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          invoice_number: string
          student_id: string
          student_tuition_id: string | null
          description: string
          amount: number
          issue_date: string
          due_date: string
          status: Database["public"]["Enums"]["invoice_status"]
          voided_at: string | null
          void_reason: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          invoice_number?: string
          student_id: string
          student_tuition_id?: string | null
          description: string
          amount: number
          issue_date?: string
          due_date: string
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_tuition_id_fkey"
            columns: ["student_tuition_id"]
            isOneToOne: false
            referencedRelation: "student_tuitions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          id: string
          receipt_number: string
          invoice_id: string
          student_id: string
          amount: number
          paid_on: string
          method: Database["public"]["Enums"]["payment_method"]
          transaction_reference: string | null
          notes: string | null
          status: Database["public"]["Enums"]["payment_status"]
          recorded_by: string | null
          recorded_by_name: string
          provider: string
          provider_payment_id: string | null
          voided_at: string | null
          void_reason: string | null
          voided_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          receipt_number: string
          invoice_id: string
          student_id: string
          amount: number
          paid_on: string
          method: Database["public"]["Enums"]["payment_method"]
          transaction_reference?: string | null
          notes?: string | null
          provider?: string
          provider_payment_id?: string | null
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      english_levels: {
        Row: {
          code: string
          framework: Database["public"]["Enums"]["english_framework"]
          name: string
          cefr: string | null
          sort_order: number
        } & Timestamps
        Insert: {
          code: string
          framework: Database["public"]["Enums"]["english_framework"]
          name: string
          cefr?: string | null
          sort_order: number
        } & TimestampsInsert
        Update: {
          code?: string
          framework?: Database["public"]["Enums"]["english_framework"]
          name?: string
          cefr?: string | null
          sort_order?: number
        } & TimestampsInsert
        Relationships: []
      }
      student_feedback: {
        Row: {
          id: string
          student_id: string
          author_profile_id: string | null
          author_name: string
          body: string
          deleted_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          student_id: string
          author_profile_id?: string | null
          author_name?: string
          body: string
          deleted_at?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          student_id?: string
          author_profile_id?: string | null
          author_name?: string
          body?: string
          deleted_at?: string | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "student_feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          id: string
          student_id: string
          class_id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          enrolled_on: string
          ended_on: string | null
          notes: string | null
        } & Timestamps
        Insert: {
          id?: string
          student_id: string
          class_id: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          enrolled_on?: string
          ended_on?: string | null
          notes?: string | null
        } & TimestampsInsert
        Update: {
          id?: string
          student_id?: string
          class_id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          enrolled_on?: string
          ended_on?: string | null
          notes?: string | null
        } & TimestampsInsert
        Relationships: [
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          id: string
          class_id: string
          session_date: string
          notes: string | null
          recorded_by: string | null
          recorded_by_name: string
          created_at: string
          updated_at: string
        }
        Insert: { id?: string; class_id: string; session_date: string; notes?: string | null }
        Update: { notes?: string | null }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          id: string
          session_id: string
          class_id: string
          session_date: string
          student_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          attended_via: Database["public"]["Enums"]["delivery_mode"] | null
          minutes_late: number | null
          note: string | null
          recorded_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          class_id: string
          session_date: string
          student_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          attended_via?: Database["public"]["Enums"]["delivery_mode"] | null
          minutes_late?: number | null
          note?: string | null
        }
        Update: {
          status?: Database["public"]["Enums"]["attendance_status"]
          attended_via?: Database["public"]["Enums"]["delivery_mode"] | null
          minutes_late?: number | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_class_id_session_date_fkey"
            columns: ["session_id", "class_id", "session_date"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id", "class_id", "session_date"]
          },
          {
            foreignKeyName: "attendance_records_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_file_types: {
        Row: { mime_type: string; extensions: string[]; label: string }
        Insert: never
        Update: never
        Relationships: []
      }
      assignments: {
        Row: {
          id: string
          class_id: string
          unit_id: string | null
          title: string
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          skill: Database["public"]["Enums"]["assignment_skill"] | null
          description: string | null
          instructions: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          publish_at: string | null
          published_at: string | null
          due_at: string | null
          time_limit_minutes: number | null
          max_score: number
          allow_late: boolean
          requires_file: boolean
          closed_at: string | null
          archived_at: string | null
          created_by: string | null
          created_by_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          class_id: string
          title: string
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          skill?: Database["public"]["Enums"]["assignment_skill"] | null
          description?: string | null
          instructions?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          publish_at?: string | null
          due_at?: string | null
          time_limit_minutes?: number | null
          max_score?: number
          allow_late?: boolean
          requires_file?: boolean
        }
        Update: {
          unit_id?: string | null
          class_id?: string
          title?: string
          assignment_type?: Database["public"]["Enums"]["assignment_type"]
          skill?: Database["public"]["Enums"]["assignment_skill"] | null
          description?: string | null
          instructions?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          publish_at?: string | null
          due_at?: string | null
          time_limit_minutes?: number | null
          max_score?: number
          allow_late?: boolean
          requires_file?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_questions: {
        Row: {
          id: string
          assignment_id: string
          position: number
          kind: Database["public"]["Enums"]["question_kind"]
          prompt: string
          options: string[] | null
          points: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          assignment_id: string
          position: number
          kind: Database["public"]["Enums"]["question_kind"]
          prompt: string
          options?: string[] | null
          points?: number
        }
        Update: {
          position?: number
          kind?: Database["public"]["Enums"]["question_kind"]
          prompt?: string
          options?: string[] | null
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_questions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_answer_keys: {
        Row: {
          question_id: string
          correct_option: number | null
          accepted_answers: string[] | null
          explanation: string | null
          updated_at: string
        }
        Insert: {
          question_id: string
          correct_option?: number | null
          accepted_answers?: string[] | null
          explanation?: string | null
        }
        Update: {
          correct_option?: number | null
          accepted_answers?: string[] | null
          explanation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignment_answer_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "assignment_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_attachments: {
        Row: {
          id: string
          assignment_id: string
          object_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          uploaded_by: string | null
          created_at: string
        }
        Insert: { id?: string; assignment_id: string; object_path: string; file_name: string; mime_type: string; size_bytes: number }
        Update: never
        Relationships: [
          {
            foreignKeyName: "assignment_attachments_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          id: string
          assignment_id: string
          student_id: string
          attempt: number
          status: Database["public"]["Enums"]["submission_status"]
          answers: Json
          response_text: string | null
          started_at: string
          deadline_at: string | null
          submitted_at: string | null
          is_late: boolean
          resubmission_allowed: boolean
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: { answers?: Json; response_text?: string | null }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_files: {
        Row: {
          id: string
          submission_id: string
          object_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          created_at: string
        }
        Insert: { id?: string; submission_id: string; object_path: string; file_name: string; mime_type: string; size_bytes: number }
        Update: never
        Relationships: [
          {
            foreignKeyName: "submission_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_grades: {
        Row: {
          submission_id: string
          score: number
          feedback: string | null
          graded_by: string | null
          graded_by_name: string
          graded_at: string
          returned_at: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "submission_grades_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_events: {
        Row: {
          id: string
          submission_id: string
          event: Database["public"]["Enums"]["submission_event"]
          detail: string | null
          actor_id: string | null
          actor_name: string
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "submission_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_questions: {
        Row: {
          id: string
          subject_id: string
          question_type: Database["public"]["Enums"]["question_type"]
          skill: Database["public"]["Enums"]["assignment_skill"] | null
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          topic: string | null
          difficulty: Database["public"]["Enums"]["question_difficulty"]
          prompt: string
          content: Json
          media_path: string | null
          points: number
          tags: string[]
          status: Database["public"]["Enums"]["bank_question_status"]
          version: number
          duplicated_from: string | null
          archived_at: string | null
          created_by: string | null
          created_by_name: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: { status?: Database["public"]["Enums"]["bank_question_status"]; media_path?: string | null }
        Relationships: [
          {
            foreignKeyName: "bank_questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_question_keys: {
        Row: { question_id: string; answer: Json; explanation: string | null; updated_at: string }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "bank_question_keys_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "bank_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          id: string
          class_id: string
          unit_id: string | null
          title: string
          description: string | null
          instructions: string | null
          status: Database["public"]["Enums"]["test_status"]
          available_from: string | null
          available_until: string | null
          time_limit_minutes: number | null
          max_attempts: number
          shuffle_questions: boolean
          shuffle_options: boolean
          total_score: number
          review_policy: Database["public"]["Enums"]["test_review_policy"]
          published_at: string | null
          closed_at: string | null
          archived_at: string | null
          created_by: string | null
          created_by_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          class_id: string
          title: string
          description?: string | null
          instructions?: string | null
          available_from?: string | null
          available_until?: string | null
          time_limit_minutes?: number | null
          max_attempts?: number
          shuffle_questions?: boolean
          shuffle_options?: boolean
          total_score?: number
          review_policy?: Database["public"]["Enums"]["test_review_policy"]
        }
        Update: {
          unit_id?: string | null
          class_id?: string
          title?: string
          description?: string | null
          instructions?: string | null
          status?: Database["public"]["Enums"]["test_status"]
          available_from?: string | null
          available_until?: string | null
          time_limit_minutes?: number | null
          max_attempts?: number
          shuffle_questions?: boolean
          shuffle_options?: boolean
          total_score?: number
          review_policy?: Database["public"]["Enums"]["test_review_policy"]
        }
        Relationships: [
          {
            foreignKeyName: "tests_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      test_questions: {
        Row: {
          id: string
          test_id: string
          position: number
          source_question_id: string | null
          source_version: number | null
          question_type: Database["public"]["Enums"]["question_type"]
          prompt: string
          content: Json
          media_path: string | null
          points: number
        }
        Insert: never
        Update: { points?: number }
        Relationships: [
          {
            foreignKeyName: "test_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_questions_source_question_id_fkey"
            columns: ["source_question_id"]
            isOneToOne: false
            referencedRelation: "bank_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      test_question_keys: {
        Row: { test_question_id: string; answer: Json; explanation: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      test_attempts: {
        Row: {
          id: string
          test_id: string
          student_id: string
          attempt_number: number
          status: Database["public"]["Enums"]["test_attempt_status"]
          question_order: string[]
          option_orders: Json
          started_at: string
          deadline_at: string | null
          submitted_at: string | null
          auto_submitted: boolean
          raw_score: number | null
          raw_max: number | null
          score: number | null
          graded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "test_attempts_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      test_answers: {
        Row: { attempt_id: string; test_question_id: string; response: Json | null; updated_at: string }
        Insert: { attempt_id: string; test_question_id: string; response: Json | null }
        Update: { response?: Json | null }
        Relationships: [
          {
            foreignKeyName: "test_answers_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "test_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabulary_words: {
        Row: {
          id: string
          word: string
          ipa: string | null
          part_of_speech: Database["public"]["Enums"]["part_of_speech"]
          meaning_vi: string
          definition_en: string | null
          example: string | null
          audio_path: string | null
          image_path: string | null
          collocations: string[]
          synonyms: string[]
          antonyms: string[]
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          topic: string | null
          status: Database["public"]["Enums"]["content_status"]
        } & { created_by: string | null; created_by_name: string; created_at: string; updated_at: string }
        Insert: {
          word: string
          ipa?: string | null
          part_of_speech: Database["public"]["Enums"]["part_of_speech"]
          meaning_vi: string
          definition_en?: string | null
          example?: string | null
          audio_path?: string | null
          image_path?: string | null
          collocations?: string[]
          synonyms?: string[]
          antonyms?: string[]
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          topic?: string | null
          status?: Database["public"]["Enums"]["content_status"]
        }
        Update: {
          word?: string
          ipa?: string | null
          part_of_speech?: Database["public"]["Enums"]["part_of_speech"]
          meaning_vi?: string
          definition_en?: string | null
          example?: string | null
          audio_path?: string | null
          image_path?: string | null
          collocations?: string[]
          synonyms?: string[]
          antonyms?: string[]
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          topic?: string | null
          status?: Database["public"]["Enums"]["content_status"]
        }
        Relationships: []
      }
      vocabulary_sets: {
        Row: {
          id: string
          title: string
          description: string | null
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          topic: string | null
          status: Database["public"]["Enums"]["content_status"]
        } & { created_by: string | null; created_by_name: string; created_at: string; updated_at: string }
        Insert: { title: string; description?: string | null; cefr_level?: Database["public"]["Enums"]["cefr_level"] | null; topic?: string | null }
        Update: {
          title?: string
          description?: string | null
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          topic?: string | null
          status?: Database["public"]["Enums"]["content_status"]
        }
        Relationships: []
      }
      vocabulary_set_words: {
        Row: { set_id: string; word_id: string; position: number }
        Insert: { set_id: string; word_id: string; position?: number }
        Update: { position?: number }
        Relationships: [
          {
            foreignKeyName: "vocabulary_set_words_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_set_words_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_words"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabulary_practice: {
        Row: {
          id: string
          student_id: string
          set_id: string
          activity: Database["public"]["Enums"]["vocabulary_activity"]
          correct: number
          total: number
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "vocabulary_practice_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vocabulary_practice_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      vocabulary_progress: {
        Row: {
          student_id: string
          word_id: string
          box: number
          correct_count: number
          wrong_count: number
          last_practiced_at: string
          next_review_on: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "vocabulary_progress_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_words"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          id: string
          skill: Database["public"]["Enums"]["english_skill"]
          title: string
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          topic: string | null
          summary: string | null
          body: string | null
          form: string | null
          usage: string | null
          examples: string[]
          common_mistakes: Json
          media_path: string | null
          response_mode: Database["public"]["Enums"]["response_mode"] | null
          min_words: number | null
          max_words: number | null
          rubric: Json
          max_score: number
          status: Database["public"]["Enums"]["content_status"]
          published_at: string | null
          slug: string | null
          public_access: Database["public"]["Enums"]["public_access"]
        } & { created_by: string | null; created_by_name: string; created_at: string; updated_at: string }
        Insert: {
          skill: Database["public"]["Enums"]["english_skill"]
          title: string
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          topic?: string | null
          summary?: string | null
          body?: string | null
          form?: string | null
          usage?: string | null
          examples?: string[]
          common_mistakes?: Json
          media_path?: string | null
          response_mode?: Database["public"]["Enums"]["response_mode"] | null
          min_words?: number | null
          max_words?: number | null
          rubric?: Json
          max_score?: number
          status?: Database["public"]["Enums"]["content_status"]
        }
        Update: {
          title?: string
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          topic?: string | null
          summary?: string | null
          body?: string | null
          form?: string | null
          usage?: string | null
          examples?: string[]
          common_mistakes?: Json
          media_path?: string | null
          response_mode?: Database["public"]["Enums"]["response_mode"] | null
          min_words?: number | null
          max_words?: number | null
          rubric?: Json
          max_score?: number
          status?: Database["public"]["Enums"]["content_status"]
        }
        Relationships: []
      }
      lesson_words: {
        Row: { lesson_id: string; word_id: string }
        Insert: { lesson_id: string; word_id: string }
        Update: never
        Relationships: [
          {
            foreignKeyName: "lesson_words_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_words_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "vocabulary_words"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_private: {
        Row: { lesson_id: string; transcript: string | null; model_answer: string | null }
        Insert: { lesson_id: string; transcript?: string | null; model_answer?: string | null }
        Update: { transcript?: string | null; model_answer?: string | null }
        Relationships: []
      }
      lesson_questions: {
        Row: {
          id: string
          lesson_id: string
          position: number
          source_question_id: string | null
          question_type: Database["public"]["Enums"]["question_type"]
          prompt: string
          content: Json
          media_path: string | null
          points: number
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "lesson_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_question_keys: {
        Row: { lesson_question_id: string; answer: Json; explanation: string | null }
        Insert: never
        Update: never
        Relationships: []
      }
      lesson_attempts: {
        Row: {
          id: string
          lesson_id: string
          student_id: string
          responses: Json
          results: Json
          score: number
          max_score: number
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "lesson_attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_attempts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_submissions: {
        Row: {
          id: string
          lesson_id: string
          student_id: string
          attempt: number
          text_response: string | null
          file_path: string | null
          file_name: string | null
          file_mime: string | null
          file_size: number | null
          status: Database["public"]["Enums"]["lesson_submission_status"]
          feedback: string | null
          rubric_scores: Json | null
          score: number | null
          max_score: number
          reviewed_by: string | null
          reviewed_by_name: string | null
          reviewed_at: string | null
          submitted_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "lesson_submissions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_rubrics: {
        Row: {
          id: string
          name: string
          kind: Database["public"]["Enums"]["assessment_kind"]
          scoring: Database["public"]["Enums"]["assessment_scoring"]
          criteria: Json
          description: string | null
          is_system: boolean
          archived_at: string | null
          created_by: string | null
          created_by_name: string
          created_at: string
          updated_at: string
        }
        Insert: { name: string; kind: Database["public"]["Enums"]["assessment_kind"]; scoring?: Database["public"]["Enums"]["assessment_scoring"]; criteria: Json; description?: string | null }
        Update: { name?: string; scoring?: Database["public"]["Enums"]["assessment_scoring"]; criteria?: Json; description?: string | null; archived_at?: string | null }
        Relationships: []
      }
      assessment_tasks: {
        Row: {
          id: string
          class_id: string
          kind: Database["public"]["Enums"]["assessment_kind"]
          title: string
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          task: string
          instructions: string | null
          media_path: string | null
          response_mode: Database["public"]["Enums"]["assessment_response"]
          min_words: number | null
          max_words: number | null
          max_duration_seconds: number | null
          rubric_id: string | null
          scoring: Database["public"]["Enums"]["assessment_scoring"]
          criteria: Json
          max_score: number
          max_attempts: number
          due_at: string | null
          allow_late: boolean
          status: Database["public"]["Enums"]["content_status"]
          published_at: string | null
          closed_at: string | null
          created_by: string | null
          created_by_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          class_id: string
          kind: Database["public"]["Enums"]["assessment_kind"]
          title: string
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          task: string
          instructions?: string | null
          media_path?: string | null
          response_mode: Database["public"]["Enums"]["assessment_response"]
          min_words?: number | null
          max_words?: number | null
          max_duration_seconds?: number | null
          rubric_id?: string | null
          scoring?: Database["public"]["Enums"]["assessment_scoring"]
          criteria: Json
          max_score: number
          max_attempts?: number
          due_at?: string | null
          allow_late?: boolean
          status?: Database["public"]["Enums"]["content_status"]
        }
        Update: {
          class_id?: string
          title?: string
          cefr_level?: Database["public"]["Enums"]["cefr_level"] | null
          task?: string
          instructions?: string | null
          media_path?: string | null
          response_mode?: Database["public"]["Enums"]["assessment_response"]
          min_words?: number | null
          max_words?: number | null
          max_duration_seconds?: number | null
          rubric_id?: string | null
          scoring?: Database["public"]["Enums"]["assessment_scoring"]
          criteria?: Json
          max_score?: number
          max_attempts?: number
          due_at?: string | null
          allow_late?: boolean
          status?: Database["public"]["Enums"]["content_status"]
          closed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assessment_tasks_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_submissions: {
        Row: {
          id: string
          task_id: string
          student_id: string
          attempt: number
          text_response: string | null
          word_count: number | null
          file_path: string | null
          file_name: string | null
          file_mime: string | null
          file_size: number | null
          status: Database["public"]["Enums"]["assessment_submission_status"]
          is_late: boolean
          resubmission_allowed: boolean
          submitted_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "assessment_submissions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "assessment_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_grades: {
        Row: {
          submission_id: string
          criterion_scores: Json
          total_score: number
          feedback: string | null
          graded_by: string
          graded_by_name: string
          graded_at: string
          returned_at: string | null
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "assessment_grades_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "assessment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_annotations: {
        Row: {
          id: string
          submission_id: string
          anchor: Database["public"]["Enums"]["annotation_anchor"]
          start_offset: number | null
          end_offset: number | null
          quote: string | null
          time_seconds: number | null
          category: Database["public"]["Enums"]["annotation_category"]
          comment: string | null
          suggestion: string | null
          source: Database["public"]["Enums"]["feedback_source"]
          created_by: string | null
          created_by_name: string
          created_at: string
        }
        Insert: {
          submission_id: string
          anchor: Database["public"]["Enums"]["annotation_anchor"]
          start_offset?: number | null
          end_offset?: number | null
          time_seconds?: number | null
          category?: Database["public"]["Enums"]["annotation_category"]
          comment?: string | null
          suggestion?: string | null
        }
        Update: { category?: Database["public"]["Enums"]["annotation_category"]; comment?: string | null; suggestion?: string | null }
        Relationships: [
          {
            foreignKeyName: "assessment_annotations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assessment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_events: {
        Row: { id: string; submission_id: string; event: Database["public"]["Enums"]["assessment_event"]; actor_name: string; created_at: string }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "assessment_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "assessment_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_comments: {
        Row: {
          id: string
          kind: Database["public"]["Enums"]["assessment_kind"] | null
          category: Database["public"]["Enums"]["annotation_category"]
          body: string
          shared: boolean
          created_by: string | null
          created_by_name: string
          created_at: string
        }
        Insert: { kind?: Database["public"]["Enums"]["assessment_kind"] | null; category?: Database["public"]["Enums"]["annotation_category"]; body: string; shared?: boolean }
        Update: { kind?: Database["public"]["Enums"]["assessment_kind"] | null; category?: Database["public"]["Enums"]["annotation_category"]; body?: string; shared?: boolean }
        Relationships: []
      }
      online_sessions: {
        Row: {
          id: string
          class_id: string
          teacher_id: string
          title: string
          agenda: string | null
          starts_at: string
          ends_at: string
          session_date: string
          provider: Database["public"]["Enums"]["meeting_provider"]
          meeting_url: string | null
          meeting_code: string | null
          passcode: string | null
          link_source: Database["public"]["Enums"]["meeting_link_source"]
          external_meeting_id: string | null
          recording_url: string | null
          status: Database["public"]["Enums"]["online_session_status"]
          started_at: string | null
          ended_at: string | null
          cancelled_reason: string | null
          created_by: string | null
          created_by_name: string
          created_at: string
          updated_at: string
        }
        Insert: {
          class_id: string
          teacher_id: string
          title: string
          agenda?: string | null
          starts_at: string
          ends_at: string
          session_date?: string
          provider: Database["public"]["Enums"]["meeting_provider"]
          meeting_url?: string | null
          meeting_code?: string | null
          passcode?: string | null
          link_source?: Database["public"]["Enums"]["meeting_link_source"]
          external_meeting_id?: string | null
        }
        Update: {
          teacher_id?: string
          title?: string
          agenda?: string | null
          starts_at?: string
          ends_at?: string
          provider?: Database["public"]["Enums"]["meeting_provider"]
          meeting_url?: string | null
          meeting_code?: string | null
          passcode?: string | null
          recording_url?: string | null
          status?: Database["public"]["Enums"]["online_session_status"]
          cancelled_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "online_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_sessions_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      online_session_materials: {
        Row: {
          id: string
          session_id: string
          kind: Database["public"]["Enums"]["material_kind"]
          title: string
          url: string | null
          object_path: string | null
          file_name: string | null
          mime_type: string | null
          size_bytes: number | null
          visible_to_students: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          session_id: string
          kind: Database["public"]["Enums"]["material_kind"]
          title: string
          url?: string | null
          object_path?: string | null
          file_name?: string | null
          mime_type?: string | null
          size_bytes?: number | null
          visible_to_students?: boolean
        }
        Update: { title?: string; url?: string | null; visible_to_students?: boolean }
        Relationships: [
          {
            foreignKeyName: "online_session_materials_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "online_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      online_session_homework: {
        Row: { session_id: string; assignment_id: string; created_at: string }
        Insert: { session_id: string; assignment_id: string }
        Update: never
        Relationships: [
          {
            foreignKeyName: "online_session_homework_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "online_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_session_homework_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      online_session_notes: {
        Row: { session_id: string; notes: string; updated_by_name: string; updated_at: string }
        Insert: { session_id: string; notes: string }
        Update: { notes?: string }
        Relationships: []
      }
      online_session_joins: {
        Row: { session_id: string; student_id: string; first_joined_at: string; last_joined_at: string; join_count: number }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "online_session_joins_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      design_templates: {
        Row: {
          key: string
          category: Database["public"]["Enums"]["design_template_category"]
          kind: Database["public"]["Enums"]["design_kind"]
          name: string
          description: string
          content: Json
          sort_order: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      designs: {
        Row: {
          id: string
          owner_id: string
          owner_name: string
          title: string
          kind: Database["public"]["Enums"]["design_kind"]
          template_key: string | null
          content: Json
          version: number
          share_token: string | null
          shared_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: { title: string; kind: Database["public"]["Enums"]["design_kind"]; template_key?: string | null; content: Json }
        Update: { title?: string; kind?: Database["public"]["Enums"]["design_kind"]; content?: Json }
        Relationships: []
      }
      design_assets: {
        Row: {
          id: string
          design_id: string
          object_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          media: string
          created_at: string
        }
        Insert: { design_id: string; object_path: string; file_name: string; mime_type: string; size_bytes: number }
        Update: never
        Relationships: [
          {
            foreignKeyName: "design_assets_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "designs"
            referencedColumns: ["id"]
          },
        ]
      }
      library_folders: {
        Row: {
          id: string
          scope: Database["public"]["Enums"]["library_scope"]
          owner_id: string | null
          parent_id: string | null
          name: string
          created_at: string
          updated_at: string
        }
        Insert: { scope: Database["public"]["Enums"]["library_scope"]; parent_id?: string | null; name: string }
        Update: { parent_id?: string | null; name?: string }
        Relationships: []
      }
      library_materials: {
        Row: {
          id: string
          scope: Database["public"]["Enums"]["library_scope"]
          owner_id: string
          owner_name: string
          folder_id: string | null
          title: string
          description: string
          subject_id: string | null
          level_id: string | null
          skill: Database["public"]["Enums"]["assignment_skill"] | null
          topic: string | null
          tags: string[]
          visibility: Database["public"]["Enums"]["library_visibility"]
          object_path: string
          file_name: string
          mime_type: string
          size_bytes: number
          file_kind: string
          archived_at: string | null
          public_access: Database["public"]["Enums"]["public_access"]
          created_at: string
          updated_at: string
        }
        Insert: {
          scope?: Database["public"]["Enums"]["library_scope"]
          folder_id?: string | null
          title: string
          description?: string
          subject_id?: string | null
          level_id?: string | null
          skill?: Database["public"]["Enums"]["assignment_skill"] | null
          topic?: string | null
          tags?: string[]
          visibility?: Database["public"]["Enums"]["library_visibility"]
          object_path: string
          file_name: string
          mime_type: string
          size_bytes: number
        }
        Update: {
          folder_id?: string | null
          title?: string
          description?: string
          subject_id?: string | null
          level_id?: string | null
          skill?: Database["public"]["Enums"]["assignment_skill"] | null
          topic?: string | null
          tags?: string[]
          visibility?: Database["public"]["Enums"]["library_visibility"]
          archived_at?: string | null
        }
        Relationships: [
          { foreignKeyName: "library_materials_folder_id_fkey"; columns: ["folder_id"]; isOneToOne: false; referencedRelation: "library_folders"; referencedColumns: ["id"] },
          { foreignKeyName: "library_materials_subject_id_fkey"; columns: ["subject_id"]; isOneToOne: false; referencedRelation: "subjects"; referencedColumns: ["id"] },
          { foreignKeyName: "library_materials_level_id_fkey"; columns: ["level_id"]; isOneToOne: false; referencedRelation: "levels"; referencedColumns: ["id"] },
        ]
      }
      library_material_classes: {
        Row: { material_id: string; class_id: string; shared_by: string | null; shared_by_name: string; created_at: string }
        Insert: { material_id: string; class_id: string }
        Update: never
        Relationships: [
          { foreignKeyName: "library_material_classes_material_id_fkey"; columns: ["material_id"]; isOneToOne: false; referencedRelation: "library_materials"; referencedColumns: ["id"] },
          { foreignKeyName: "library_material_classes_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
        ]
      }
      library_material_students: {
        Row: { material_id: string; student_id: string; shared_by: string | null; shared_by_name: string; created_at: string }
        Insert: { material_id: string; student_id: string }
        Update: never
        Relationships: [
          { foreignKeyName: "library_material_students_material_id_fkey"; columns: ["material_id"]; isOneToOne: false; referencedRelation: "library_materials"; referencedColumns: ["id"] },
          { foreignKeyName: "library_material_students_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
        ]
      }
      library_favorites: {
        Row: { user_id: string; material_id: string; created_at: string }
        Insert: { user_id: string; material_id: string }
        Update: never
        Relationships: [
          { foreignKeyName: "library_favorites_material_id_fkey"; columns: ["material_id"]; isOneToOne: false; referencedRelation: "library_materials"; referencedColumns: ["id"] },
        ]
      }
      announcements: {
        Row: {
          id: string
          audience: Database["public"]["Enums"]["announcement_audience"]
          class_id: string | null
          title: string
          body: string
          pinned: boolean
          expires_at: string | null
          created_by: string | null
          author_name: string
          created_at: string
          updated_at: string
          archived_at: string | null
        }
        Insert: { audience: Database["public"]["Enums"]["announcement_audience"]; class_id?: string | null; title: string; body: string; pinned?: boolean; expires_at?: string | null }
        Update: { title?: string; body?: string; pinned?: boolean; expires_at?: string | null; archived_at?: string | null }
        Relationships: [
          { foreignKeyName: "announcements_class_id_fkey"; columns: ["class_id"]; isOneToOne: false; referencedRelation: "classes"; referencedColumns: ["id"] },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          title: string
          body: string
          link: string | null
          student_id: string | null
          dedupe_key: string
          created_at: string
          read_at: string | null
        }
        Insert: never
        Update: { read_at?: string | null }
        Relationships: [
          { foreignKeyName: "notifications_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
        ]
      }
      notification_preferences: {
        Row: { user_id: string; kind: Database["public"]["Enums"]["notification_kind"]; enabled: boolean; updated_at: string }
        Insert: { user_id: string; kind: Database["public"]["Enums"]["notification_kind"]; enabled: boolean }
        Update: { enabled?: boolean }
        Relationships: []
      }
      message_threads: {
        Row: {
          id: string
          student_id: string
          teacher_profile_id: string
          parent_profile_id: string
          created_by: string | null
          created_at: string
          last_message_at: string | null
          teacher_read_at: string | null
          parent_read_at: string | null
        }
        Insert: { student_id: string; teacher_profile_id: string; parent_profile_id: string }
        Update: never
        Relationships: [
          { foreignKeyName: "message_threads_student_id_fkey"; columns: ["student_id"]; isOneToOne: false; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "message_threads_teacher_profile_id_fkey"; columns: ["teacher_profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "message_threads_parent_profile_id_fkey"; columns: ["parent_profile_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      messages: {
        Row: { id: string; thread_id: string; sender_id: string | null; body: string; created_at: string }
        Insert: { thread_id: string; body: string }
        Update: never
        Relationships: [
          { foreignKeyName: "messages_thread_id_fkey"; columns: ["thread_id"]; isOneToOne: false; referencedRelation: "message_threads"; referencedColumns: ["id"] },
          { foreignKeyName: "messages_sender_id_fkey"; columns: ["sender_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      ai_drafts: {
        Row: {
          id: string
          owner_id: string
          owner_name: string
          task: Database["public"]["Enums"]["ai_task"]
          title: string
          input: Json
          content: Json
          original_content: Json
          provider: string
          model: string
          request_id: string | null
          status: Database["public"]["Enums"]["ai_draft_status"]
          approved_at: string | null
          approved_by_name: string | null
          saved_to: Json
          created_at: string
          updated_at: string
        }
        Insert: { task: Database["public"]["Enums"]["ai_task"]; title: string; input: Json; content: Json; provider: string; model: string; request_id?: string | null }
        Update: { title?: string; content?: Json; status?: Database["public"]["Enums"]["ai_draft_status"]; saved_to?: Json }
        Relationships: []
      }
      ai_requests: {
        Row: {
          id: string
          user_id: string
          task: Database["public"]["Enums"]["ai_task"]
          status: Database["public"]["Enums"]["ai_request_status"]
          provider: string | null
          model: string | null
          error_code: string | null
          input_tokens: number | null
          output_tokens: number | null
          created_at: string
          finished_at: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Views: {
      invoice_balances: {
        Row: {
          id: string
          invoice_number: string
          student_id: string
          student_tuition_id: string | null
          description: string
          amount: number
          issue_date: string
          due_date: string
          invoice_status: Database["public"]["Enums"]["invoice_status"]
          voided_at: string | null
          created_at: string
          paid: number
          remaining: number
          payment_status: "void" | "paid" | "overdue" | "partially_paid" | "unpaid"
          student_name: string | null
          student_code: string | null
        }
        Relationships: []
      }
      student_tuition_balances: {
        Row: {
          id: string
          student_id: string
          plan_id: string
          plan_name: string
          course_name: string
          original_amount: number
          discount_amount: number
          final_amount: number
          start_date: string
          tuition_status: Database["public"]["Enums"]["student_tuition_status"]
          created_at: string
          paid: number
          remaining: number
          next_due_date: string | null
          payment_status: "cancelled" | "paid" | "overdue" | "partially_paid" | "unpaid"
          student_name: string | null
          student_code: string | null
        }
        Relationships: []
      }
      timetable_entries: {
        Row: {
          slot_id: string
          class_id: string
          weekday: number
          starts_at: string
          ends_at: string
          room: string | null
          class_code: string
          class_name: string
          class_status: Database["public"]["Enums"]["class_status"]
          start_date: string | null
          end_date: string | null
          delivery_mode: Database["public"]["Enums"]["delivery_mode"]
          meeting_url: string | null
          course_name: string
          subject_name: string | null
          teacher_ids: string[]
          lead_teacher_name: string | null
        }
        Relationships: []
      }
      student_directory: {
        Row: {
          id: string
          student_code: string
          full_name: string
          date_of_birth: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          phone: string | null
          email: string | null
          status: Database["public"]["Enums"]["student_status"]
          joined_on: string | null
          english_level_code: string | null
          target_level_code: string | null
          avatar_path: string | null
          created_at: string
          deleted_at: string | null
          current_class_ids: string[]
          current_class_names: string | null
          primary_parent_name: string | null
          search_text: string
        }
        Relationships: [
          {
            foreignKeyName: "students_english_level_code_fkey"
            columns: ["english_level_code"]
            isOneToOne: false
            referencedRelation: "english_levels"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Functions: {
      begin_ai_request: { Args: { target_task: Database["public"]["Enums"]["ai_task"] }; Returns: string }
      finish_ai_request: {
        Args: { target_request: string; succeeded: boolean; target_provider: string; target_model: string; target_error: string | null; tokens_in: number; tokens_out: number }
        Returns: undefined
      }
      sync_my_notifications: { Args: Record<string, never>; Returns: number }
      mark_thread_read: { Args: { target_thread: string }; Returns: undefined }
      progress_results: {
        Args: { date_from: string; date_to: string; student_filter?: string | null; class_filter?: string | null }
        Returns: {
          student_id: string
          class_id: string | null
          occurred_on: string
          source: string
          skill: string | null
          item_id: string
          title: string
          raw_score: number
          max_score: number
          percent: number | null
          band: number | null
          assessed_by: string
          assessor: string | null
        }[]
      }
      homework_completion: {
        Args: { date_from: string; date_to: string; student_filter?: string | null; class_filter?: string | null }
        Returns: { student_id: string; class_id: string; set_count: number; handed_in: number; late: number; missing: number; not_due: number }[]
      }
      vocabulary_mastery: { Args: { student_filter?: string | null }; Returns: { student_id: string; box: number; words: number }[] }
      set_design_sharing: { Args: { target_design_id: string; mode: string }; Returns: string | null }
      shared_design: {
        Args: { token: string }
        Returns: {
          id: string
          title: string
          kind: Database["public"]["Enums"]["design_kind"]
          content: Json
          owner_name: string
          updated_at: string
        }[]
      }
      shared_design_assets: { Args: { token: string }; Returns: { id: string; object_path: string; mime_type: string }[] }
      join_online_session: { Args: { target_session_id: string }; Returns: string }
      submit_assessment: { Args: { target_task_id: string; response_text?: string | null; file?: Json | null }; Returns: string }
      grade_assessment: {
        Args: { target_submission_id: string; scores: Json; overall_feedback?: string | null; publish?: boolean }
        Returns: number
      }
      return_assessment_grades: { Args: { target_task_id: string; target_submission_id?: string | null }; Returns: number }
      set_assessment_resubmission: { Args: { target_submission_id: string; allowed: boolean }; Returns: undefined }
      add_lesson_questions: { Args: { target_lesson_id: string; question_ids: string[] }; Returns: number }
      record_vocabulary_practice: {
        Args: { target_set_id: string; target_activity: Database["public"]["Enums"]["vocabulary_activity"]; results: Json }
        Returns: string
      }
      submit_lesson_practice: { Args: { target_lesson_id: string; responses: Json }; Returns: string }
      submit_lesson_work: { Args: { target_lesson_id: string; response_text?: string | null; file?: Json | null }; Returns: string }
      review_lesson_submission: {
        Args: { target_submission_id: string; review_feedback: string; criterion_scores?: Json | null; overall_score?: number | null }
        Returns: undefined
      }
      lesson_attempt_review: {
        Args: { target_attempt_id: string }
        Returns: {
          lesson_question_id: string
          question_position: number
          question_type: Database["public"]["Enums"]["question_type"]
          prompt: string
          content: Json
          points: number
          response: Json | null
          score: number | null
          unlisted: boolean
          correct_answer: Json | null
          explanation: string | null
        }[]
      }
      english_skill_performance: {
        Args: { target_student_ids?: string[] | null }
        Returns: {
          student_id: string
          skill: Database["public"]["Enums"]["english_skill"]
          activities: number
          average_percent: number | null
          last_activity: string | null
        }[]
      }
      save_bank_question: {
        Args: { target_question_id: string | null; fields: Json; answer: Json; answer_explanation?: string | null }
        Returns: string
      }
      duplicate_bank_question: { Args: { source_question_id: string }; Returns: string }
      add_test_questions: { Args: { target_test_id: string; question_ids: string[] }; Returns: number }
      move_test_question: { Args: { target_question_id: string; direction: string }; Returns: undefined }
      grade_test_answer: {
        Args: { target_attempt_id: string; target_question_id: string; new_score: number; new_feedback?: string | null }
        Returns: undefined
      }
      close_expired_attempts: { Args: { target_test_id: string }; Returns: number }
      start_test: { Args: { target_test_id: string }; Returns: string }
      submit_test_attempt: { Args: { target_attempt_id: string }; Returns: undefined }
      attempt_details: {
        Args: { target_attempt_id: string }
        Returns: {
          test_question_id: string
          question_position: number
          question_type: Database["public"]["Enums"]["question_type"]
          prompt: string
          content: Json
          media_path: string | null
          points: number
          response: Json | null
          auto_score: number | null
          manual_score: number | null
          needs_review: boolean | null
          feedback: string | null
          correct_answer: Json | null
          explanation: string | null
          review_open: boolean
        }[]
      }
      test_question_stats: {
        Args: { target_test_id: string }
        Returns: {
          test_question_id: string
          question_position: number
          question_type: Database["public"]["Enums"]["question_type"]
          prompt: string
          points: number
          answered: number
          attempts: number
          average_score: number | null
          full_marks: number
          awaiting_review: number
        }[]
      }
      start_submission: { Args: { target_assignment_id: string }; Returns: string }
      submit_submission: { Args: { target_submission_id: string }; Returns: string }
      grade_submission: {
        Args: { target_submission_id: string; new_score: number; new_feedback?: string | null; publish?: boolean }
        Returns: undefined
      }
      return_grades: { Args: { target_assignment_id: string; target_submission_id?: string | null }; Returns: number }
      set_resubmission: { Args: { target_submission_id: string; allowed: boolean }; Returns: undefined }
      submission_auto_marks: {
        Args: { target_submission_id: string }
        Returns: { question_id: string; points: number; earned: number; correct: boolean | null }[]
      }
      save_attendance: {
        Args: { target_class_id: string; target_date: string; entries: Json; session_notes?: string | null }
        Returns: string
      }
      attendance_summary: {
        Args: {
          date_from: string
          date_to: string
          group_by?: "student" | "class" | "teacher"
          class_filter?: string | null
          teacher_filter?: string | null
          student_filter?: string | null
        }
        Returns: {
          group_id: string
          label: string
          code: string
          sessions: number
          present: number
          late: number
          absent: number
          excused: number
          total: number
        }[]
      }
      attendance_trend: {
        Args: {
          date_from: string
          date_to: string
          class_filter?: string | null
          teacher_filter?: string | null
          student_filter?: string | null
        }
        Returns: { week_start: string; present: number; late: number; absent: number; excused: number }[]
      }
      attendance_alerts: {
        Args: { class_filter?: string | null; student_filter?: string | null; window_days?: number }
        Returns: {
          student_id: string
          student_name: string
          student_code: string
          class_id: string
          class_name: string
          consecutive_absences: number
          recent_absences: number
          last_absent_on: string | null
        }[]
      }
      assign_tuition: {
        Args: {
          target_student_id: string
          target_plan_id: string
          first_due_date: string
          discount_rule_ids?: string[]
          manual_discount?: number
          manual_discount_label?: string | null
        }
        Returns: string
      }
      record_payment: {
        Args: {
          target_invoice_id: string
          payment_amount: number
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          payment_notes?: string | null
          payment_provider?: string
          external_payment_id?: string | null
        }
        Returns: string
      }
      void_payment: { Args: { target_payment_id: string; reason: string }; Returns: undefined }
      void_invoice: { Args: { target_invoice_id: string; reason: string }; Returns: undefined }
      cancel_tuition: { Args: { target_tuition_id: string; reason: string }; Returns: undefined }
      grant_user_permission: {
        Args: { target_user_id: string; target_permission: string; target_scope?: Database["public"]["Enums"]["permission_scope"] }
        Returns: undefined
      }
      revoke_user_permission: {
        Args: { target_user_id: string; target_permission: string; target_scope?: Database["public"]["Enums"]["permission_scope"] }
        Returns: undefined
      }
      assign_class_teacher: {
        Args: {
          target_class_id: string
          target_teacher_id: string
          new_role?: Database["public"]["Enums"]["class_member_role"]
        }
        Returns: undefined
      }
      student_notes: {
        Args: { target_student_id: string }
        Returns: string | null
      }
      teacher_notes: {
        Args: { target_teacher_id: string }
        Returns: string | null
      }
      move_course_unit: {
        Args: { target_unit_id: string; direction: string }
        Returns: undefined
      }
      enroll_student: {
        Args: {
          target_student_id: string
          target_class_id: string
          initial_status?: Database["public"]["Enums"]["enrollment_status"]
          start_on?: string
        }
        Returns: string
      }
      set_enrollment_status: {
        Args: {
          target_enrollment_id: string
          new_status: Database["public"]["Enums"]["enrollment_status"]
        }
        Returns: undefined
      }
      transfer_enrollment: {
        Args: { target_enrollment_id: string; new_class_id: string }
        Returns: string
      }
      learning_days: {
        Args: { target_student: string; since: string }
        Returns: { day: string }[]
      }
      verify_certificate: {
        Args: { code: string }
        Returns: { certificate_no: string; student_name: string; course_name: string; class_name: string; issued_on: string; revoked: boolean }[]
      }
      dictionary_search: {
        Args: { query: string; max_rows?: number }
        Returns: {
          id: string
          word: string
          ipa: string | null
          part_of_speech: Database["public"]["Enums"]["part_of_speech"]
          meaning_vi: string
          definition_en: string | null
          example: string | null
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          topic: string | null
          synonyms: string[]
          antonyms: string[]
        }[]
      }
      public_lessons: {
        Args: never
        Returns: {
          slug: string
          title: string
          skill: Database["public"]["Enums"]["english_skill"]
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          topic: string | null
          summary: string | null
          access: Database["public"]["Enums"]["public_access"]
          has_media: boolean
          published_at: string | null
        }[]
      }
      public_lesson: {
        Args: { target_slug: string }
        Returns: {
          id: string
          slug: string
          title: string
          skill: Database["public"]["Enums"]["english_skill"]
          cefr_level: Database["public"]["Enums"]["cefr_level"] | null
          topic: string | null
          summary: string | null
          access: Database["public"]["Enums"]["public_access"]
          body: string | null
          body_truncated: boolean
          form: string | null
          usage: string | null
          examples: string[]
          common_mistakes: Json
          media_path: string | null
          author_name: string
          published_at: string | null
          updated_at: string
        }[]
      }
      public_materials: {
        Args: never
        Returns: {
          id: string
          title: string
          description: string
          subject_name: string | null
          topic: string | null
          file_kind: string
          size_bytes: number
          access: Database["public"]["Enums"]["public_access"]
          updated_at: string
        }[]
      }
      public_material: {
        Args: { target_material: string }
        Returns: {
          id: string
          title: string
          description: string
          subject_name: string | null
          topic: string | null
          file_kind: string
          mime_type: string
          size_bytes: number
          access: Database["public"]["Enums"]["public_access"]
          object_path: string | null
          file_name: string | null
          updated_at: string
        }[]
      }
      public_teachers: {
        Args: never
        Returns: { id: string; full_name: string; bio: string; photo_path: string | null; subjects: string[]; qualifications: string[] }[]
      }
      set_lesson_public: {
        Args: { target_lesson: string; new_access: Database["public"]["Enums"]["public_access"]; new_slug: string | null }
        Returns: undefined
      }
      set_material_public: {
        Args: { target_material: string; new_access: Database["public"]["Enums"]["public_access"] }
        Returns: undefined
      }
      set_teacher_website: {
        Args: { target_teacher: string; new_bio: string; new_photo_path: string | null; new_show: boolean }
        Returns: undefined
      }
      website_subjects: {
        Args: never
        Returns: {
          id: string
          code: string
          name: string
          description: string
          audience: string
          icon: string
          image_path: string | null
          course_count: number
        }[]
      }
      website_courses: {
        Args: never
        Returns: {
          id: string
          code: string
          name: string
          description: string
          subject_id: string
          subject_name: string
          level_name: string | null
          session_count: number | null
          session_minutes: number | null
          duration_weeks: number | null
        }[]
      }
      set_subject_website: {
        Args: { target_subject: string; new_audience: string; new_icon: string; new_image_path: string | null; new_show: boolean }
        Returns: undefined
      }
      my_permissions: {
        Args: never
        Returns: {
          permission_code: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }[]
      }
      set_user_active: {
        Args: { target_user_id: string; active: boolean }
        Returns: undefined
      }
      set_user_role: {
        Args: { target_user_id: string; new_role_code: string }
        Returns: undefined
      }
    }
    Enums: {
      public_access: "members" | "preview" | "public"
      article_status: "draft" | "published"
      ai_task: "lesson" | "worksheet" | "vocabulary" | "grammar" | "reading" | "listening" | "speaking" | "writing" | "differentiated" | "homework"
      ai_draft_status: "draft" | "approved" | "discarded"
      ai_request_status: "started" | "succeeded" | "failed"
      notification_kind: "new_assignment" | "homework_due" | "new_grade" | "absence" | "schedule_change" | "tuition_due" | "new_announcement" | "message" | "system"
      announcement_audience: "everyone" | "staff" | "parents" | "students" | "class"
      library_scope: "personal" | "academy"
      library_visibility: "private" | "staff"
      design_kind: "presentation" | "worksheet" | "flashcards" | "vocabulary_cards" | "grammar_activity" | "quiz" | "exit_ticket"
      design_template_category: "vocabulary" | "grammar" | "reading" | "listening" | "speaking" | "writing" | "ielts" | "cambridge" | "review"
      permission_scope: "all" | "assigned" | "own" | "children"
      gender: "male" | "female" | "other"
      student_status: "active" | "on_hold" | "graduated" | "withdrawn"
      staff_status: "active" | "on_leave" | "inactive"
      guardian_relationship: "father" | "mother" | "guardian" | "grandparent" | "other"
      class_status: "planned" | "active" | "completed" | "cancelled"
      class_member_role: "lead_teacher" | "assistant_teacher"
      enrollment_status: "pending" | "active" | "completed" | "withdrawn"
      english_framework: "cefr" | "pre_ielts" | "ielts" | "cambridge"
      course_status: "draft" | "active" | "inactive"
      delivery_mode: "in_person" | "online" | "hybrid"
      payment_schedule: "one_time" | "monthly" | "quarterly"
      discount_kind: "percent" | "fixed"
      student_tuition_status: "active" | "cancelled"
      invoice_status: "open" | "void"
      payment_method: "cash" | "bank_transfer" | "other"
      payment_status: "completed" | "voided"
      attendance_status: "present" | "late" | "absent" | "excused"
      assignment_type:
        | "homework"
        | "worksheet"
        | "vocabulary"
        | "grammar"
        | "reading"
        | "listening"
        | "speaking"
        | "writing"
        | "project"
        | "quiz"
        | "test"
      assignment_skill:
        | "vocabulary"
        | "grammar"
        | "reading"
        | "listening"
        | "speaking"
        | "writing"
        | "pronunciation"
        | "problem_solving"
        | "mixed"
      assignment_status: "draft" | "scheduled" | "published" | "closed" | "archived"
      question_kind: "multiple_choice" | "short_answer" | "long_answer"
      submission_status: "in_progress" | "submitted" | "graded" | "returned"
      question_type:
        | "multiple_choice"
        | "multiple_response"
        | "true_false"
        | "matching"
        | "fill_blank"
        | "short_answer"
        | "essay"
        | "listening"
        | "speaking"
        | "sentence_transformation"
        | "error_correction"
      cefr_level: "pre_a1" | "a1" | "a2" | "b1" | "b2" | "c1" | "c2"
      question_difficulty: "easy" | "medium" | "hard"
      bank_question_status: "active" | "archived"
      test_status: "draft" | "published" | "closed" | "archived"
      test_review_policy: "never" | "after_last_attempt" | "after_close"
      test_attempt_status: "in_progress" | "submitted" | "graded"
      english_skill: "vocabulary" | "grammar" | "reading" | "listening" | "speaking" | "writing" | "pronunciation"
      part_of_speech:
        | "noun"
        | "verb"
        | "adjective"
        | "adverb"
        | "pronoun"
        | "preposition"
        | "conjunction"
        | "determiner"
        | "interjection"
        | "phrasal_verb"
        | "phrase"
        | "idiom"
      content_status: "draft" | "published" | "archived"
      vocabulary_activity: "flashcards" | "matching" | "multiple_choice" | "fill_blank" | "spelling" | "pronunciation"
      response_mode: "text" | "audio" | "video" | "audio_or_video"
      lesson_submission_status: "submitted" | "reviewed"
      assessment_kind: "writing" | "speaking"
      assessment_scoring: "points" | "ielts_band"
      assessment_response: "online_text" | "document" | "online_or_document" | "audio" | "video" | "audio_or_video"
      assessment_submission_status: "submitted" | "graded" | "returned"
      annotation_anchor: "text" | "time" | "general"
      annotation_category:
        | "grammar"
        | "vocabulary"
        | "spelling"
        | "punctuation"
        | "organization"
        | "content"
        | "pronunciation"
        | "fluency"
        | "interaction"
        | "other"
      feedback_source: "teacher" | "ai_assisted"
      assessment_event: "submitted" | "returned" | "resubmission_allowed" | "resubmission_revoked"
      meeting_provider: "google_meet" | "zoom" | "microsoft_teams" | "other"
      meeting_link_source: "manual" | "api"
      online_session_status: "scheduled" | "live" | "ended" | "cancelled"
      material_kind: "file" | "link"
      submission_event:
        | "started"
        | "submitted"
        | "graded"
        | "returned"
        | "resubmission_allowed"
        | "resubmission_revoked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
