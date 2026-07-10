import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Space+Grotesk:wght@300..700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased bg-[--bg-base] text-[--text-primary] overflow-hidden h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
