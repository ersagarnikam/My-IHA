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
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          app: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          app: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          app?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      case_documents: {
        Row: {
          case_id: string | null
          document_category: string
          document_type: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id: string
          mime_type: string
          patient_id: string
          uploaded_at: string
        }
        Insert: {
          case_id?: string | null
          document_category?: string
          document_type?: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id?: string
          mime_type: string
          patient_id: string
          uploaded_at?: string
        }
        Update: {
          case_id?: string | null
          document_category?: string
          document_type?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          patient_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          created_at: string
          description_enc: string
          id: string
          need_stay_booking_assistance: boolean
          need_transportation_assistance: boolean
          need_travel_assistance: boolean
          patient_id: string
          reference_number: string
          specialty: string
          specialty_other: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_enc: string
          id?: string
          need_stay_booking_assistance?: boolean
          need_transportation_assistance?: boolean
          need_travel_assistance?: boolean
          patient_id: string
          reference_number?: string
          specialty: string
          specialty_other?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_enc?: string
          id?: string
          need_stay_booking_assistance?: boolean
          need_transportation_assistance?: boolean
          need_travel_assistance?: boolean
          patient_id?: string
          reference_number?: string
          specialty?: string
          specialty_other?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read: boolean
          sender_id: string
          sender_type: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read?: boolean
          sender_id: string
          sender_type: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read?: boolean
          sender_id?: string
          sender_type?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          closed_at: string | null
          created_at: string
          id: string
          opened_at: string | null
          patient_id: string
          reopen_reason: string | null
          reopen_requested_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string | null
          patient_id: string
          reopen_reason?: string | null
          reopen_requested_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string | null
          patient_id?: string
          reopen_reason?: string | null
          reopen_requested_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_requests: {
        Row: {
          cancellation_reason: string | null
          case_id: string
          id: string
          patient_id: string
          requested_at: string
          selected_slot_id: string | null
          status: string
          treatment_option_id: string
          updated_at: string
          zoom_link: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          case_id: string
          id?: string
          patient_id: string
          requested_at?: string
          selected_slot_id?: string | null
          status?: string
          treatment_option_id: string
          updated_at?: string
          zoom_link?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          case_id?: string
          id?: string
          patient_id?: string
          requested_at?: string
          selected_slot_id?: string | null
          status?: string
          treatment_option_id?: string
          updated_at?: string
          zoom_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultation_requests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_selected_slot_fkey"
            columns: ["selected_slot_id"]
            isOneToOne: false
            referencedRelation: "consultation_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultation_requests_treatment_option_id_fkey"
            columns: ["treatment_option_id"]
            isOneToOne: true
            referencedRelation: "treatment_options"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_slots: {
        Row: {
          consultation_request_id: string
          created_at: string
          id: string
          slot_end_time: string
          slot_time: string
        }
        Insert: {
          consultation_request_id: string
          created_at?: string
          id?: string
          slot_end_time: string
          slot_time: string
        }
        Update: {
          consultation_request_id?: string
          created_at?: string
          id?: string
          slot_end_time?: string
          slot_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultation_slots_consultation_request_id_fkey"
            columns: ["consultation_request_id"]
            isOneToOne: false
            referencedRelation: "consultation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_case_assignments: {
        Row: {
          case_id: string
          decline_reason: string | null
          doctor_id: string
          evaluation_started_at: string | null
          id: string
          invited_at: string
          plan_submitted_at: string | null
          responded_at: string | null
          status: string
        }
        Insert: {
          case_id: string
          decline_reason?: string | null
          doctor_id: string
          evaluation_started_at?: string | null
          id?: string
          invited_at?: string
          plan_submitted_at?: string | null
          responded_at?: string | null
          status?: string
        }
        Update: {
          case_id?: string
          decline_reason?: string | null
          doctor_id?: string
          evaluation_started_at?: string | null
          id?: string
          invited_at?: string
          plan_submitted_at?: string | null
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_case_assignments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_case_assignments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_fee_payments: {
        Row: {
          amount_aud: number
          billing_period: string | null
          created_at: string
          doctor_id: string
          fee_type: string
          gateway: string
          gateway_reference: string | null
          id: string
          invoice_path: string | null
          paid_at: string | null
          status: string
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_aud: number
          billing_period?: string | null
          created_at?: string
          doctor_id: string
          fee_type: string
          gateway?: string
          gateway_reference?: string | null
          id?: string
          invoice_path?: string | null
          paid_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_aud?: number
          billing_period?: string | null
          created_at?: string
          doctor_id?: string
          fee_type?: string
          gateway?: string
          gateway_reference?: string | null
          id?: string
          invoice_path?: string | null
          paid_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctor_fee_payments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_hospital_affiliations: {
        Row: {
          created_at: string
          doctor_id: string
          hospital_id: string
          id: string
        }
        Insert: {
          created_at?: string
          doctor_id: string
          hospital_id: string
          id?: string
        }
        Update: {
          created_at?: string
          doctor_id?: string
          hospital_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_hospital_affiliations_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_hospital_affiliations_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          annual_fee_next_due_at: string | null
          annual_fee_reminder_sent_for: string | null
          availability_schedule: Json
          bio: string | null
          certificates: Json
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          date_of_birth_enc: string | null
          department: string | null
          email_notifications_enabled: boolean
          full_name: string
          gender: string | null
          id: string
          languages_spoken: string[] | null
          license_number_enc: string | null
          more_info_message: string | null
          photo_url: string | null
          qualifications: string | null
          registration_fee_paid_at: string | null
          rejection_reason: string | null
          role: string | null
          sms_notifications_enabled: boolean
          specialties: string[] | null
          status: string
          user_id: string | null
          working_days: string[]
          years_experience: number | null
        }
        Insert: {
          annual_fee_next_due_at?: string | null
          annual_fee_reminder_sent_for?: string | null
          availability_schedule?: Json
          bio?: string | null
          certificates?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          date_of_birth_enc?: string | null
          department?: string | null
          email_notifications_enabled?: boolean
          full_name: string
          gender?: string | null
          id?: string
          languages_spoken?: string[] | null
          license_number_enc?: string | null
          more_info_message?: string | null
          photo_url?: string | null
          qualifications?: string | null
          registration_fee_paid_at?: string | null
          rejection_reason?: string | null
          role?: string | null
          sms_notifications_enabled?: boolean
          specialties?: string[] | null
          status?: string
          user_id?: string | null
          working_days?: string[]
          years_experience?: number | null
        }
        Update: {
          annual_fee_next_due_at?: string | null
          annual_fee_reminder_sent_for?: string | null
          availability_schedule?: Json
          bio?: string | null
          certificates?: Json
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          date_of_birth_enc?: string | null
          department?: string | null
          email_notifications_enabled?: boolean
          full_name?: string
          gender?: string | null
          id?: string
          languages_spoken?: string[] | null
          license_number_enc?: string | null
          more_info_message?: string | null
          photo_url?: string | null
          qualifications?: string | null
          registration_fee_paid_at?: string | null
          rejection_reason?: string | null
          role?: string | null
          sms_notifications_enabled?: boolean
          specialties?: string[] | null
          status?: string
          user_id?: string | null
          working_days?: string[]
          years_experience?: number | null
        }
        Relationships: []
      }
      hospitals: {
        Row: {
          abn_number_enc: string | null
          accreditation_body: string | null
          address: string | null
          bed_count: number | null
          certificates: Json
          city: string
          contact_email: string | null
          country: string
          created_at: string
          email_notifications_enabled: boolean
          id: string
          license_number_enc: string | null
          more_info_message: string | null
          name: string
          phone: string | null
          registration_number_enc: string | null
          registration_type: string | null
          rejection_reason: string | null
          room_types: string[]
          sms_notifications_enabled: boolean
          specialties: string[] | null
          status: string
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          abn_number_enc?: string | null
          accreditation_body?: string | null
          address?: string | null
          bed_count?: number | null
          certificates?: Json
          city: string
          contact_email?: string | null
          country: string
          created_at?: string
          email_notifications_enabled?: boolean
          id?: string
          license_number_enc?: string | null
          more_info_message?: string | null
          name: string
          phone?: string | null
          registration_number_enc?: string | null
          registration_type?: string | null
          rejection_reason?: string | null
          room_types?: string[]
          sms_notifications_enabled?: boolean
          specialties?: string[] | null
          status?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          abn_number_enc?: string | null
          accreditation_body?: string | null
          address?: string | null
          bed_count?: number | null
          certificates?: Json
          city?: string
          contact_email?: string | null
          country?: string
          created_at?: string
          email_notifications_enabled?: boolean
          id?: string
          license_number_enc?: string | null
          more_info_message?: string | null
          name?: string
          phone?: string | null
          registration_number_enc?: string | null
          registration_type?: string | null
          rejection_reason?: string | null
          room_types?: string[]
          sms_notifications_enabled?: boolean
          specialties?: string[] | null
          status?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      lawyers: {
        Row: {
          abn_number_enc: string | null
          address: string | null
          certificates: Json
          city: string | null
          contact_phone: string | null
          created_at: string
          email_notifications_enabled: boolean
          id: string
          immigration_law_certification: string | null
          lawyer_type: string
          lead_lawyer_id: string | null
          more_info_message: string | null
          name: string
          registration_number_enc: string | null
          rejection_reason: string | null
          sms_notifications_enabled: boolean
          status: string
          updated_at: string
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          abn_number_enc?: string | null
          address?: string | null
          certificates?: Json
          city?: string | null
          contact_phone?: string | null
          created_at?: string
          email_notifications_enabled?: boolean
          id?: string
          immigration_law_certification?: string | null
          lawyer_type: string
          lead_lawyer_id?: string | null
          more_info_message?: string | null
          name: string
          registration_number_enc?: string | null
          rejection_reason?: string | null
          sms_notifications_enabled?: boolean
          status?: string
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          abn_number_enc?: string | null
          address?: string | null
          certificates?: Json
          city?: string | null
          contact_phone?: string | null
          created_at?: string
          email_notifications_enabled?: boolean
          id?: string
          immigration_law_certification?: string | null
          lawyer_type?: string
          lead_lawyer_id?: string | null
          more_info_message?: string | null
          name?: string
          registration_number_enc?: string | null
          rejection_reason?: string | null
          sms_notifications_enabled?: boolean
          status?: string
          updated_at?: string
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lawyers_lead_lawyer_id_fkey"
            columns: ["lead_lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          assignment_id: string | null
          case_id: string | null
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          assignment_id?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          message: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          assignment_id?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "doctor_case_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address_enc: string | null
          allergies_enc: string | null
          avatar_url: string | null
          country_of_residence: string | null
          created_at: string
          current_medications_enc: string | null
          date_of_birth_enc: string | null
          deleted_at: string | null
          email_notifications_enabled: boolean
          emergency_contact_name_enc: string | null
          emergency_contact_phone_enc: string | null
          emergency_contact_relationship_enc: string | null
          full_name_enc: string
          gender: string | null
          id: string
          is_deleted: boolean
          medical_history_enc: string | null
          nationality: string | null
          past_surgeries_enc: string | null
          phone_enc: string | null
          scheduled_delete_at: string | null
          sms_notifications_enabled: boolean
          stripe_customer_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_enc?: string | null
          allergies_enc?: string | null
          avatar_url?: string | null
          country_of_residence?: string | null
          created_at?: string
          current_medications_enc?: string | null
          date_of_birth_enc?: string | null
          deleted_at?: string | null
          email_notifications_enabled?: boolean
          emergency_contact_name_enc?: string | null
          emergency_contact_phone_enc?: string | null
          emergency_contact_relationship_enc?: string | null
          full_name_enc: string
          gender?: string | null
          id?: string
          is_deleted?: boolean
          medical_history_enc?: string | null
          nationality?: string | null
          past_surgeries_enc?: string | null
          phone_enc?: string | null
          scheduled_delete_at?: string | null
          sms_notifications_enabled?: boolean
          stripe_customer_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_enc?: string | null
          allergies_enc?: string | null
          avatar_url?: string | null
          country_of_residence?: string | null
          created_at?: string
          current_medications_enc?: string | null
          date_of_birth_enc?: string | null
          deleted_at?: string | null
          email_notifications_enabled?: boolean
          emergency_contact_name_enc?: string | null
          emergency_contact_phone_enc?: string | null
          emergency_contact_relationship_enc?: string | null
          full_name_enc?: string
          gender?: string | null
          id?: string
          is_deleted?: boolean
          medical_history_enc?: string | null
          nationality?: string | null
          past_surgeries_enc?: string | null
          phone_enc?: string | null
          scheduled_delete_at?: string | null
          sms_notifications_enabled?: boolean
          stripe_customer_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          brand: string
          created_at: string
          exp_month: number
          exp_year: number
          id: string
          is_default: boolean
          last4: string
          stripe_payment_method_id: string
          user_id: string
        }
        Insert: {
          brand: string
          created_at?: string
          exp_month: number
          exp_year: number
          id?: string
          is_default?: boolean
          last4: string
          stripe_payment_method_id: string
          user_id: string
        }
        Update: {
          brand?: string
          created_at?: string
          exp_month?: number
          exp_year?: number
          id?: string
          is_default?: boolean
          last4?: string
          stripe_payment_method_id?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_aud: number
          case_id: string
          consultation_request_id: string | null
          created_at: string
          gateway: string
          gateway_reference: string | null
          id: string
          invoice_path: string | null
          paid_at: string | null
          patient_id: string
          payment_type: string
          status: string
          stripe_payment_intent_id: string | null
          treatment_option_id: string | null
        }
        Insert: {
          amount_aud: number
          case_id: string
          consultation_request_id?: string | null
          created_at?: string
          gateway?: string
          gateway_reference?: string | null
          id?: string
          invoice_path?: string | null
          paid_at?: string | null
          patient_id: string
          payment_type?: string
          status?: string
          stripe_payment_intent_id?: string | null
          treatment_option_id?: string | null
        }
        Update: {
          amount_aud?: number
          case_id?: string
          consultation_request_id?: string | null
          created_at?: string
          gateway?: string
          gateway_reference?: string | null
          id?: string
          invoice_path?: string | null
          paid_at?: string | null
          patient_id?: string
          payment_type?: string
          status?: string
          stripe_payment_intent_id?: string | null
          treatment_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_consultation_request_id_fkey"
            columns: ["consultation_request_id"]
            isOneToOne: false
            referencedRelation: "consultation_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_treatment_option_id_fkey"
            columns: ["treatment_option_id"]
            isOneToOne: false
            referencedRelation: "treatment_options"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_fee_settings: {
        Row: {
          amount_aud: number
          fee_key: string
          id: string
          updated_at: string
        }
        Insert: {
          amount_aud: number
          fee_key: string
          id?: string
          updated_at?: string
        }
        Update: {
          amount_aud?: number
          fee_key?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_message_threads: {
        Row: {
          account_type: string
          closed_at: string | null
          created_at: string
          doctor_id: string | null
          hospital_id: string | null
          id: string
          lawyer_id: string | null
          opened_at: string | null
          reopen_reason: string | null
          reopen_requested_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          account_type: string
          closed_at?: string | null
          created_at?: string
          doctor_id?: string | null
          hospital_id?: string | null
          id?: string
          lawyer_id?: string | null
          opened_at?: string | null
          reopen_reason?: string | null
          reopen_requested_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          account_type?: string
          closed_at?: string | null
          created_at?: string
          doctor_id?: string | null
          hospital_id?: string | null
          id?: string
          lawyer_id?: string | null
          opened_at?: string | null
          reopen_reason?: string | null
          reopen_requested_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_message_threads_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_message_threads_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_message_threads_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read: boolean
          sender_id: string
          sender_type: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read?: boolean
          sender_id: string
          sender_type: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read?: boolean
          sender_id?: string
          sender_type?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "provider_message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      specialties: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label_en: string
          label_zh: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label_en: string
          label_zh: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label_en?: string
          label_zh?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      treatment_options: {
        Row: {
          case_id: string
          created_at: string
          id: string
          is_selected: boolean
          mta_commission_aud: number
          published_at: string | null
          treatment_plan_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          is_selected?: boolean
          mta_commission_aud?: number
          published_at?: string | null
          treatment_plan_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          is_selected?: boolean
          mta_commission_aud?: number
          published_at?: string | null
          treatment_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_options_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_options_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: true
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_specialists: {
        Row: {
          cost_aud_enc: string
          created_at: string
          id: string
          notes_enc: string | null
          specialist_name_enc: string | null
          specialist_type: string
          treatment_plan_id: string
        }
        Insert: {
          cost_aud_enc: string
          created_at?: string
          id?: string
          notes_enc?: string | null
          specialist_name_enc?: string | null
          specialist_type: string
          treatment_plan_id: string
        }
        Update: {
          cost_aud_enc?: string
          created_at?: string
          id?: string
          notes_enc?: string | null
          specialist_name_enc?: string | null
          specialist_type?: string
          treatment_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_specialists_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plans: {
        Row: {
          aftercare_enc: string
          case_id: string
          cost_breakdown_enc: string
          cost_notes_enc: string | null
          created_at: string
          department: string | null
          description_enc: string | null
          diagnosis_enc: string | null
          doctor_fees_aud_enc: string | null
          doctor_id: string
          estimated_length_of_stay_enc: string | null
          expected_outcome_enc: string | null
          hospital_fees_aud_enc: string | null
          hospital_id: string | null
          id: string
          patient_instructions_enc: string | null
          procedure_name_enc: string | null
          recovery_time_enc: string | null
          room_category: string | null
          special_requirements_enc: string | null
          status: string
          submitted_at: string | null
          success_rate_enc: string | null
          technique_enc: string | null
          treatment_duration_days: number | null
          treatment_end_date: string | null
          treatment_start_date: string | null
          treatment_type: string | null
          updated_at: string
        }
        Insert: {
          aftercare_enc?: string
          case_id: string
          cost_breakdown_enc?: string
          cost_notes_enc?: string | null
          created_at?: string
          department?: string | null
          description_enc?: string | null
          diagnosis_enc?: string | null
          doctor_fees_aud_enc?: string | null
          doctor_id: string
          estimated_length_of_stay_enc?: string | null
          expected_outcome_enc?: string | null
          hospital_fees_aud_enc?: string | null
          hospital_id?: string | null
          id?: string
          patient_instructions_enc?: string | null
          procedure_name_enc?: string | null
          recovery_time_enc?: string | null
          room_category?: string | null
          special_requirements_enc?: string | null
          status?: string
          submitted_at?: string | null
          success_rate_enc?: string | null
          technique_enc?: string | null
          treatment_duration_days?: number | null
          treatment_end_date?: string | null
          treatment_start_date?: string | null
          treatment_type?: string | null
          updated_at?: string
        }
        Update: {
          aftercare_enc?: string
          case_id?: string
          cost_breakdown_enc?: string
          cost_notes_enc?: string | null
          created_at?: string
          department?: string | null
          description_enc?: string | null
          diagnosis_enc?: string | null
          doctor_fees_aud_enc?: string | null
          doctor_id?: string
          estimated_length_of_stay_enc?: string | null
          expected_outcome_enc?: string | null
          hospital_fees_aud_enc?: string | null
          hospital_id?: string | null
          id?: string
          patient_instructions_enc?: string | null
          procedure_name_enc?: string | null
          recovery_time_enc?: string | null
          room_category?: string | null
          special_requirements_enc?: string | null
          status?: string
          submitted_at?: string | null
          success_rate_enc?: string | null
          technique_enc?: string | null
          treatment_duration_days?: number | null
          treatment_end_date?: string | null
          treatment_start_date?: string | null
          treatment_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_case_notes: {
        Row: {
          body: string
          case_id: string
          created_at: string
          id: string
          lawyer_id: string
        }
        Insert: {
          body: string
          case_id: string
          created_at?: string
          id?: string
          lawyer_id: string
        }
        Update: {
          body?: string
          case_id?: string
          created_at?: string
          id?: string
          lawyer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visa_case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visa_case_notes_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_document_requests: {
        Row: {
          case_id: string
          category: string
          created_at: string
          document_type: string
          id: string
          instructions: string | null
          lawyer_id: string
        }
        Insert: {
          case_id: string
          category: string
          created_at?: string
          document_type: string
          id?: string
          instructions?: string | null
          lawyer_id: string
        }
        Update: {
          case_id?: string
          category?: string
          created_at?: string
          document_type?: string
          id?: string
          instructions?: string | null
          lawyer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visa_document_requests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visa_document_requests_lawyer_id_fkey"
            columns: ["lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_documents: {
        Row: {
          case_id: string | null
          category: string
          file_name: string
          file_path: string
          file_size_bytes: number | null
          hospital_id: string | null
          id: string
          mime_type: string | null
          patient_id: string
          requested_by_lawyer: boolean
          sent_to_patient_at: string | null
          source: string
          uploaded_at: string
          visa_submission_id: string | null
        }
        Insert: {
          case_id?: string | null
          category: string
          file_name: string
          file_path: string
          file_size_bytes?: number | null
          hospital_id?: string | null
          id?: string
          mime_type?: string | null
          patient_id: string
          requested_by_lawyer?: boolean
          sent_to_patient_at?: string | null
          source?: string
          uploaded_at?: string
          visa_submission_id?: string | null
        }
        Update: {
          case_id?: string | null
          category?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number | null
          hospital_id?: string | null
          id?: string
          mime_type?: string | null
          patient_id?: string
          requested_by_lawyer?: boolean
          sent_to_patient_at?: string | null
          source?: string
          uploaded_at?: string
          visa_submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visa_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visa_documents_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visa_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visa_documents_visa_submission_id_fkey"
            columns: ["visa_submission_id"]
            isOneToOne: false
            referencedRelation: "visa_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_submissions: {
        Row: {
          assigned_lawyer_id: string | null
          case_id: string
          created_at: string
          form_data_enc: string | null
          id: string
          patient_id: string
          rejection_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_lawyer_id?: string | null
          case_id: string
          created_at?: string
          form_data_enc?: string | null
          id?: string
          patient_id: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_lawyer_id?: string | null
          case_id?: string
          created_at?: string
          form_data_enc?: string | null
          id?: string
          patient_id?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visa_submissions_assigned_lawyer_id_fkey"
            columns: ["assigned_lawyer_id"]
            isOneToOne: false
            referencedRelation: "lawyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visa_submissions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visa_submissions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      registration_requests: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string | null
          kind: string | null
          more_info_message: string | null
          rejection_reason: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      abn_number:
        | {
            Args: { h: Database["public"]["Tables"]["hospitals"]["Row"] }
            Returns: string
          }
        | {
            Args: { l: Database["public"]["Tables"]["lawyers"]["Row"] }
            Returns: string
          }
      add_visa_documents_for_case: {
        Args: { p_case_id: string; p_documents: Json }
        Returns: Json
      }
      address: {
        Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
        Returns: string
      }
      aftercare: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string[]
      }
      allergies: {
        Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
        Returns: string[]
      }
      cancel_consultation: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      case_lawyer_user_id: { Args: { target_case_id: string }; Returns: string }
      case_patient_user_id: {
        Args: { target_case_id: string }
        Returns: string
      }
      confirm_treatment_option: {
        Args: { p_option_id: string }
        Returns: undefined
      }
      cost_aud: {
        Args: {
          s: Database["public"]["Tables"]["treatment_plan_specialists"]["Row"]
        }
        Returns: number
      }
      cost_breakdown: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: Json
      }
      cost_notes: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string
      }
      create_doctor_fee_payment: {
        Args: { p_fee_type: string }
        Returns: {
          amount_aud: number
          billing_period: string | null
          created_at: string
          doctor_id: string
          fee_type: string
          gateway: string
          gateway_reference: string | null
          id: string
          invoice_path: string | null
          paid_at: string | null
          status: string
          stripe_payment_intent_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "doctor_fee_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_medications: {
        Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
        Returns: string[]
      }
      date_of_birth:
        | {
            Args: { d: Database["public"]["Tables"]["doctors"]["Row"] }
            Returns: string
          }
        | {
            Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
            Returns: string
          }
      decrypt_pii: { Args: { p_cipher: string }; Returns: string }
      delete_patient_account: { Args: never; Returns: undefined }
      description:
        | {
            Args: { c: Database["public"]["Tables"]["cases"]["Row"] }
            Returns: string
          }
        | {
            Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
            Returns: string
          }
      diagnosis: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string
      }
      doctor_fees_aud: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: number
      }
      doctor_has_access_to_patient: {
        Args: { target_patient_id: string }
        Returns: boolean
      }
      doctor_owns_consultation_request: {
        Args: { target_request_id: string }
        Returns: boolean
      }
      doctor_owns_treatment_option: {
        Args: { target_treatment_option_id: string }
        Returns: boolean
      }
      email_already_registered: { Args: { p_email: string }; Returns: boolean }
      emergency_contact_name: {
        Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
        Returns: string
      }
      emergency_contact_phone: {
        Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
        Returns: string
      }
      emergency_contact_relationship: {
        Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
        Returns: string
      }
      encrypt_pii: { Args: { p_plain: string }; Returns: string }
      estimated_length_of_stay: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string
      }
      expected_outcome: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string
      }
      form_data: {
        Args: { v: Database["public"]["Tables"]["visa_submissions"]["Row"] }
        Returns: Json
      }
      full_name: {
        Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
        Returns: string
      }
      generate_case_reference: { Args: never; Returns: string }
      generate_hospital_visa_document: {
        Args: {
          p_case_id: string
          p_document_type: string
          p_file_name: string
          p_file_path: string
          p_file_size_bytes: number
          p_mime_type: string
        }
        Returns: Json
      }
      get_case_provider_user_ids: {
        Args: { p_case_id: string }
        Returns: {
          doctor_user_id: string
          hospital_user_id: string
        }[]
      }
      get_storage_object_names: {
        Args: { p_bucket_id: string; p_folder: string }
        Returns: string[]
      }
      hospital_fees_aud: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: number
      }
      hospital_has_access_to_assignment: {
        Args: { target_case_id: string; target_doctor_id: string }
        Returns: boolean
      }
      hospital_has_access_to_case: {
        Args: { target_case_id: string }
        Returns: boolean
      }
      hospital_has_access_to_patient: {
        Args: { target_patient_id: string }
        Returns: boolean
      }
      hospital_has_confirmed_plan_for_case: {
        Args: { target_case_id: string }
        Returns: boolean
      }
      hospital_treatment_plan_statuses: {
        Args: { p_hospital_id: string }
        Returns: {
          case_id: string
          doctor_id: string
          status: string
        }[]
      }
      insert_case: {
        Args: {
          p_description: string
          p_specialty: string
          p_specialty_other: string
        }
        Returns: {
          id: string
          reference_number: string
        }[]
      }
      lawyer_has_access_to_case: {
        Args: { target_case_id: string }
        Returns: boolean
      }
      lawyer_has_access_to_patient: {
        Args: { target_patient_id: string }
        Returns: boolean
      }
      license_number:
        | {
            Args: { d: Database["public"]["Tables"]["doctors"]["Row"] }
            Returns: string
          }
        | {
            Args: { h: Database["public"]["Tables"]["hospitals"]["Row"] }
            Returns: string
          }
      link_visa_document_to_case: {
        Args: { p_case_id: string; p_document_id: string }
        Returns: Json
      }
      log_audit_event: {
        Args: {
          p_action: string
          p_app: string
          p_entity_id?: string
          p_entity_type?: string
          p_metadata?: Json
        }
        Returns: undefined
      }
      mark_case_completed: { Args: { p_case_id: string }; Returns: undefined }
      medical_history: {
        Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
        Returns: string
      }
      notes: {
        Args: {
          s: Database["public"]["Tables"]["treatment_plan_specialists"]["Row"]
        }
        Returns: string
      }
      notify_doctors_of_upcoming_annual_fee: { Args: never; Returns: undefined }
      past_surgeries: {
        Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
        Returns: string
      }
      patient_instructions: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string
      }
      phone: {
        Args: { p: Database["public"]["Tables"]["patients"]["Row"] }
        Returns: string
      }
      pii_encryption_key: { Args: never; Returns: string }
      procedure_name: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string
      }
      propose_consultation_slots: {
        Args: { p_request_id: string; p_slots: Json }
        Returns: undefined
      }
      record_lawyer_visa_document: {
        Args: {
          p_case_id: string
          p_file_name: string
          p_file_path: string
          p_file_size_bytes: number
          p_mime_type: string
        }
        Returns: Json
      }
      recovery_time: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string
      }
      register_doctor: {
        Args: {
          p_bio: string
          p_certificates?: Json
          p_contact_email: string
          p_contact_phone: string
          p_department?: string
          p_full_name: string
          p_hospital_ids?: string[]
          p_languages_spoken: string[]
          p_license_number: string
          p_photo_url: string
          p_qualifications: string
          p_role?: string
          p_specialties: string[]
          p_working_days?: string[]
          p_years_experience: number
        }
        Returns: string
      }
      register_hospital: {
        Args: {
          p_abn_number: string
          p_accreditation_body: string
          p_address: string
          p_bed_count: number
          p_certificates: Json
          p_city: string
          p_contact_email: string
          p_country: string
          p_license_number: string
          p_name: string
          p_phone: string
          p_registration_number: string
          p_registration_type: string
          p_room_types?: string[]
          p_specialties: string[]
          p_zip_code: string
        }
        Returns: string
      }
      register_lawyer: {
        Args: {
          p_abn_number: string
          p_address: string
          p_certificates: Json
          p_city: string
          p_contact_phone: string
          p_immigration_law_certification: string
          p_lawyer_type: string
          p_name: string
          p_registration_number: string
          p_zip_code: string
        }
        Returns: string
      }
      registration_number:
        | {
            Args: { h: Database["public"]["Tables"]["hospitals"]["Row"] }
            Returns: string
          }
        | {
            Args: { l: Database["public"]["Tables"]["lawyers"]["Row"] }
            Returns: string
          }
      request_case_additional_info: {
        Args: { p_case_id: string; p_message: string }
        Returns: undefined
      }
      request_online_consultation: {
        Args: { p_treatment_option_id: string }
        Returns: string
      }
      request_visa_document: {
        Args: {
          p_case_id: string
          p_category: string
          p_document_type: string
          p_instructions: string
        }
        Returns: string
      }
      reschedule_consultation: {
        Args: { p_request_id: string; p_slots: Json }
        Returns: undefined
      }
      respond_to_case_assignment: {
        Args: {
          p_assignment_id: string
          p_decline_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      resubmit_doctor_registration: {
        Args: {
          p_bio: string
          p_certificates?: Json
          p_contact_email: string
          p_contact_phone: string
          p_department?: string
          p_doctor_id: string
          p_full_name: string
          p_hospital_ids?: string[]
          p_languages_spoken: string[]
          p_license_number: string
          p_photo_url: string
          p_qualifications: string
          p_role?: string
          p_specialties: string[]
          p_working_days?: string[]
          p_years_experience: number
        }
        Returns: undefined
      }
      resubmit_hospital_registration: {
        Args: {
          p_abn_number: string
          p_accreditation_body: string
          p_address: string
          p_bed_count: number
          p_certificates: Json
          p_city: string
          p_contact_email: string
          p_country: string
          p_hospital_id: string
          p_license_number: string
          p_name: string
          p_phone: string
          p_registration_number: string
          p_registration_type: string
          p_room_types?: string[]
          p_specialties: string[]
          p_zip_code: string
        }
        Returns: undefined
      }
      resubmit_lawyer_registration: {
        Args: {
          p_abn_number: string
          p_address: string
          p_certificates: Json
          p_city: string
          p_contact_phone: string
          p_immigration_law_certification: string
          p_lawyer_id: string
          p_lawyer_type: string
          p_name: string
          p_registration_number: string
          p_zip_code: string
        }
        Returns: undefined
      }
      save_treatment_plan_draft: {
        Args: {
          p_aftercare: string[]
          p_case_id: string
          p_cost_breakdown: Json
          p_cost_notes: string
          p_department: string
          p_description: string
          p_diagnosis: string
          p_doctor_fees_aud: number
          p_estimated_length_of_stay: string
          p_expected_outcome: string
          p_hospital_fees_aud: number
          p_hospital_id: string
          p_patient_instructions: string
          p_procedure_name: string
          p_recovery_time: string
          p_room_category: string
          p_special_requirements: string
          p_specialists: Json
          p_success_rate: string
          p_technique: string
          p_treatment_end_date: string
          p_treatment_start_date: string
          p_treatment_type: string
        }
        Returns: string
      }
      schedule_consultation_meeting: {
        Args: { p_request_id: string; p_zoom_link: string }
        Returns: undefined
      }
      select_consultation_slot: {
        Args: { p_request_id: string; p_slot_id: string }
        Returns: undefined
      }
      send_visa_document_to_patient: {
        Args: { p_document_id: string }
        Returns: Json
      }
      set_doctor_fee_payment_stripe_intent: {
        Args: { p_payment_id: string; p_stripe_payment_intent_id: string }
        Returns: {
          amount_aud: number
          billing_period: string | null
          created_at: string
          doctor_id: string
          fee_type: string
          gateway: string
          gateway_reference: string | null
          id: string
          invoice_path: string | null
          paid_at: string | null
          status: string
          stripe_payment_intent_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "doctor_fee_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_payment_stripe_intent: {
        Args: { p_payment_id: string; p_stripe_payment_intent_id: string }
        Returns: {
          amount_aud: number
          case_id: string
          consultation_request_id: string | null
          created_at: string
          gateway: string
          gateway_reference: string | null
          id: string
          invoice_path: string | null
          paid_at: string | null
          patient_id: string
          payment_type: string
          status: string
          stripe_payment_intent_id: string | null
          treatment_option_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      special_requirements: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string
      }
      specialist_name: {
        Args: {
          s: Database["public"]["Tables"]["treatment_plan_specialists"]["Row"]
        }
        Returns: string
      }
      start_case_evaluation: { Args: { p_case_id: string }; Returns: undefined }
      submit_treatment_plan: { Args: { p_plan_id: string }; Returns: undefined }
      submit_visa_application: {
        Args: { p_case_id: string; p_documents: Json; p_form_data: Json }
        Returns: Json
      }
      success_rate: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string
      }
      technique: {
        Args: { tp: Database["public"]["Tables"]["treatment_plans"]["Row"] }
        Returns: string
      }
      update_case_travel_assistance: {
        Args: {
          p_case_id: string
          p_need_stay_booking_assistance: boolean
          p_need_transportation_assistance: boolean
          p_need_travel_assistance: boolean
        }
        Returns: undefined
      }
      update_doctor_professional_details: {
        Args: {
          p_bio: string
          p_department: string
          p_hospital_ids?: string[]
          p_languages_spoken: string[]
          p_license_number: string
          p_qualifications: string
          p_role: string
          p_specialties: string[]
          p_years_experience: number
        }
        Returns: undefined
      }
      update_doctor_profile:
        | {
            Args: {
              p_contact_email: string
              p_contact_phone: string
              p_date_of_birth: string
              p_full_name: string
              p_gender: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_bio: string
              p_contact_email: string
              p_contact_phone: string
              p_date_of_birth: string
              p_department: string
              p_full_name: string
              p_gender: string
              p_hospital_ids?: string[]
              p_languages_spoken: string[]
              p_license_number: string
              p_qualifications: string
              p_role: string
              p_specialties: string[]
              p_years_experience: number
            }
            Returns: undefined
          }
      update_hospital_basic_info: {
        Args: {
          p_abn_number: string
          p_address: string
          p_city: string
          p_contact_email: string
          p_country: string
          p_name: string
          p_phone: string
          p_registration_number: string
          p_zip_code: string
        }
        Returns: undefined
      }
      update_hospital_details: {
        Args: {
          p_accreditation_body: string
          p_bed_count: number
          p_license_number: string
          p_registration_type: string
          p_room_types: string[]
          p_specialties: string[]
        }
        Returns: undefined
      }
      update_lawyer_basic_info: {
        Args: {
          p_abn_number: string
          p_address: string
          p_city: string
          p_contact_phone: string
          p_name: string
          p_registration_number: string
          p_zip_code: string
        }
        Returns: undefined
      }
      update_lawyer_professional_details: {
        Args: { p_immigration_law_certification: string; p_lawyer_type: string }
        Returns: undefined
      }
      update_patient_emergency_contact: {
        Args: {
          p_emergency_contact_name: string
          p_emergency_contact_phone: string
          p_emergency_contact_relationship: string
        }
        Returns: undefined
      }
      update_patient_full_name: {
        Args: { p_full_name: string }
        Returns: undefined
      }
      update_patient_medical_background: {
        Args: {
          p_allergies: string[]
          p_current_medications: string[]
          p_medical_history: string
          p_past_surgeries: string
        }
        Returns: undefined
      }
      update_patient_personal_info: {
        Args: {
          p_address: string
          p_country_of_residence: string
          p_date_of_birth: string
          p_full_name: string
          p_gender: string
          p_nationality: string
          p_phone: string
        }
        Returns: undefined
      }
      update_visa_submission_status: {
        Args: {
          p_case_id: string
          p_rejection_reason?: string
          p_status: string
        }
        Returns: undefined
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
