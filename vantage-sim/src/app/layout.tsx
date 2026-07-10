import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vantage Robotics — Digital Twin",
  description:
    "Browser-based digital twin and control suite for the Vantage 6-axis robotic arm. " +
    "Visualize, simulate, and validate control software before deploying to hardware.",
  keywords: ["robotics", "digital twin", "URDF", "inverse kinematics", "simulation"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased bg-[#0d0d14] text-white overflow-hidden h-screen">
        {children}
      </body>
    </html>
  );
}
