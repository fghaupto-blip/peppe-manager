import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dzezeuybcgwzdlgggcuz.supabase.co';
const supabasePublishableKey = 'sb_publishable__Rl_OFnrx2139e0miUr3-Q_wflFm4Rx';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
