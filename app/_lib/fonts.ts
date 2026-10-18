import { Inter } from "next/font/google";

// Self-hosted by next/font: downloaded at build time and served from this origin, so the browser
// makes no font request to Google (R71). Defined once and shared by the root layout and the group
// 404 page (which Next renders in its own error document, outside the root layout's <html>).
export const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
