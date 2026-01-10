import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hchjbzdljkxifanzojne.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjaGpiemRsamt4aWZhbnpvam5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4MzYzMDAsImV4cCI6MjA3MjQxMjMwMH0.HfnGPe5EXtjxp6RA1yOUv0G8MjS7uHUD-FRBnjuFZIs'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)