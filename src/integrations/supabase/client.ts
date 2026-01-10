import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ogiaojwwdkqmdchmegcs.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9naWFvand3ZGtxbWRjaG1lZ2NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMDkxNTUsImV4cCI6MjA3Mzc4NTE1NX0.3cQbRs9yd-PvVzanSHEI8s3MkSetsqeoM5E9uE_yO9E'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)