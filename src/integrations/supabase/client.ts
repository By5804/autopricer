import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cdzpswzdtgyovomxigtl.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkenBzd3pkdGd5b3ZvbXhpZ3RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxMjY0OTcsImV4cCI6MjA3MzcwMjQ5N30.p6JOpCWECd2B-T6ej8_b5qsVUUGc-ECNKX91ddAohUI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)