// Public settings only. NEVER put passwords, secret keys or the SETUP_CODE here.
// Leave supabaseUrl and publishableKey empty to run the TRIAL copy (data stays in the browser).
window.APP_CONFIG = {
  supabaseUrl: 'https://gyrcelsrahhigdxihnay.supabase.co',
  publishableKey: 'sb_publishable_FB14BBxl1aFN7FHN7HSHOQ_07k4OjRe', // public key only, never the secret key
  functionName: 'academy',  // name of the Edge Function
  functionRegion: 'ap-northeast-1', // run the server next to the database (Tokyo) - far fewer slow trips
  siteUrl: 'https://shrimpshack-academy.github.io/',  // used in certificate QR codes
  defaultLang: 'en'
};
