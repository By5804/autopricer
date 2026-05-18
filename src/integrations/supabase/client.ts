import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bwrbzjzjetdtzlyzcapf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3cmJ6anpqZXRkdHpseXpjYXBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzI2NDcsImV4cCI6MjA5NDY0ODY0N30.laA0J7B-8-I1mlvvGKcJxz6gE6bX52SGZZUnbq4GlHM";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);