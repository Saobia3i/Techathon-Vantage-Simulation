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
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased bg-[--steel-100] text-[--ink] min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
