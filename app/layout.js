import "./globals.css";

export const metadata = {
  title: "Alveare",
  description:
    "Puzzle a esagoni ispirato a Hex FRVR: riempi le linee in tre direzioni, con autogioco, modalità Esperto e pagine che spiegano come ragiona il computer.",
};

export const viewport = {
  themeColor: "#020617",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
