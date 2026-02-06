import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import FloatingNav from "@/components/FloatingNav";
import { Providers } from "@/components/Providers";

const inter = Inter({ 
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: 'swap',
});

const thinkingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-thinking",
  display: 'swap'
});

export const metadata = {
  title: "Better IMDb",
  description: "Movies, TV and Celebrities",
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${thinkingFont.variable} text-white antialiased`}>
        <Providers>
          <FloatingNav />
          <main className="min-h-screen px-20 pt-0">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}