import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zitvqatufotoujyrwzjw.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable__2Sk8JVtpzzzDYJ5LT2Lsg_sDusTIcF';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
