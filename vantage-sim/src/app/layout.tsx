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
      <body className="antialiased bg-[#f8fafc] text-[#0f172a] overflow-hidden h-screen">
        {children}
      </body>
    </html>
  );
}
