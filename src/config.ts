/**
 * Configuración del negocio y de Supabase.
 * Si SUPABASE_URL o SUPABASE_KEY están vacíos, la app funciona en MODO DEMO:
 * los datos se guardan solo en este navegador (sirve para probarla).
 * La clave "publishable" es pública por diseño: la seguridad está en supabase/setup.sql.
 */
export const BUSINESS = 'La Tata Food';
export const BUSINESS_WHATSAPP = '';           // ej. '987654321' (aparece en la página del cliente)
export const SUPABASE_URL = '';                // ej. 'https://xxxx.supabase.co'
export const SUPABASE_KEY = '';                // ej. 'sb_publishable_...'
/** Centro del mapa cuando aún no hay ubicaciones (Lima). */
export const MAP_CENTER: [number, number] = [-12.045, -76.97];
