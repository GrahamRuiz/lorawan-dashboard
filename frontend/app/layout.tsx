export const metadata = { title: 'LoRaWAN Dashboard' };
export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body style={{fontFamily:'system-ui, -apple-system, Segoe UI, Roboto'}}>{children}</body>
    </html>
  );
}
