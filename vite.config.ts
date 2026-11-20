import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The local database server (server/index.mjs) answers /api.
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:5175' } },
  build: {
    rollupOptions: {
      output: {
        // Big libraries in their own files: they change rarely, so after an update the browser
        // only downloads Kairos's own code again.
        // (React and FullCalendar stay in one file: split apart, the calendar code can run
        // before React is ready, and the app shows a blank page.)
        manualChunks: {
          vendor: [
            'react',
            'react-dom',
            'zustand',
            '@fullcalendar/core',
            '@fullcalendar/daygrid',
            '@fullcalendar/interaction',
            '@fullcalendar/react',
            '@fullcalendar/timegrid',
          ],
          supabase: ['@supabase/supabase-js'],
          dates: ['date-fns'],
        },
      },
    },
  },
});
