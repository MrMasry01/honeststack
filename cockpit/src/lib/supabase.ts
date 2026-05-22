import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      raw_sources: {
        Row: {
          id: string
          owner_id: string
          source_type: 'twitter' | 'rss'
          source_handle: string | null
          external_id: string | null
          url: string | null
          author: string | null
          content: string | null
          media_urls: string[]
          dedup_hash: string
          verified: boolean
          verification_sources: string[]
          time_bucket: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['raw_sources']['Row']>
        Update: Partial<Database['public']['Tables']['raw_sources']['Row']>
      }
      content_ideas: {
        Row: {
          id: string
          owner_id: string
          source_id: string | null
          hook: string | null
          angle: string | null
          format: 'carousel' | 'short_video' | 'static'
          platforms: string[]
          urgency: number
          status: 'draft' | 'ready' | 'scheduled' | 'posted'
          language: string
          time_bucket: string | null
          script_segments: unknown
          brief: unknown
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['content_ideas']['Row']>
        Update: Partial<Database['public']['Tables']['content_ideas']['Row']>
      }
      assets: {
        Row: {
          id: string
          owner_id: string
          idea_id: string | null
          kind: 'carousel' | 'short_video' | 'static'
          media: unknown
          caption: string | null
          hashtags: string[]
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['assets']['Row']>
        Update: Partial<Database['public']['Tables']['assets']['Row']>
      }
      posts_queue: {
        Row: {
          id: string
          owner_id: string
          asset_id: string | null
          platform: 'instagram' | 'youtube' | 'tiktok'
          publish_at: string | null
          status: 'pending' | 'publishing' | 'posted' | 'failed'
          external_post_id: string | null
          external_url: string | null
          posted_at: string | null
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['posts_queue']['Row']>
        Update: Partial<Database['public']['Tables']['posts_queue']['Row']>
      }
      post_metrics: {
        Row: {
          id: string
          owner_id: string
          post_id: string
          views: number
          likes: number
          comments: number
          shares: number
          saves: number
          measured_at: string
        }
        Insert: Partial<Database['public']['Tables']['post_metrics']['Row']>
        Update: Partial<Database['public']['Tables']['post_metrics']['Row']>
      }
    }
  }
}
