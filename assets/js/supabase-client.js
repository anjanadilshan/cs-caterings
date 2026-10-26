const projectUrl = 'https://mhculpxhmrlbzoosmtwe.supabase.co';
const publishableKey = 'sb_publishable_48N5El-ZHtGYEcCKOZaHbA_I1zghi5a';

window.csSupabaseConfig = {
    url: projectUrl,
    key: publishableKey
};
window.csSupabase = window.supabase?.createClient(projectUrl, publishableKey) || null;
