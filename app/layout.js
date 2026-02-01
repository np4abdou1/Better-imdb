import { Inter } from "next/font/google";
import "./globals.css";
import FloatingNav from "@/components/FloatingNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "IMDb",
  description: "Movies, TV and Celebrities",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-black text-white antialiased`}>
        <FloatingNav />
        <main className="min-h-screen pb-20 px-4 max-w-7xl mx-auto">
          {children}
        </main>
      </body>
    </html>
  );
}