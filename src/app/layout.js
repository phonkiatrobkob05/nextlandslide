// app/layout.js
import "./globals.css";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "Your App",
  description: "Example Next.js App",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
