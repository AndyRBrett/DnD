// Hosted mode (GitHub Pages): rooms and logins live in Supabase. The anon key
// is public by design; the database functions decide what it can do (see
// supabase/migrations). The local server replaces this file with
// `export const SUPABASE = null;` (scripts/build.mjs).
export const SUPABASE = {
  url: "https://gkccophrdqtqcowmblre.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrY2NvcGhyZHF0cWNvd21ibHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzAyMTAsImV4cCI6MjA5NTA0NjIxMH0.zSi-PcQL_ti5KXRq3YRQX4RbsP6HhQ5bAqh5x5kKkbE"
};
