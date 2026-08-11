import type { MetadataRoute } from "next";

// Served at /robots.txt. Two jobs:
//  1) Tell every crawler to stay out of report/share/client pages and the API,
//     so individual inspection reports never land in a search index.
//  2) Tell the known SEO/backlink/scraper bots to stay out entirely. The
//     reputable ones (MJ12bot, SE Ranking, etc.) obey this; the proxy.ts
//     User-Agent block is the enforcement layer for any that don't.
// Real search engines are left free to crawl the public marketing/directory
// pages (/inspectors, /demo, homepage).

const BLOCKED_BOTS = [
  "MJ12bot",
  "ShapBot",
  "SERankingBacklinksBot",
  "AhrefsBot",
  "SemrushBot",
  "DotBot",
  "DataForSeoBot",
  "BLEXBot",
  "MegaIndex",
  "Bytespider",
  "PetalBot",
];

const PRIVATE_PATHS = [
  "/share/",
  "/public-report/",
  "/environmental-share/",
  "/client/",
  "/client-portal/",
  "/client-agreement/",
  "/repair-request/",
  "/repair-response/",
  "/reports/",
  "/api/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Everyone (incl. Google/Bing): don't index private/report pages.
      {
        userAgent: "*",
        disallow: PRIVATE_PATHS,
      },
      // Known SEO/backlink/scraper bots: no access to anything.
      ...BLOCKED_BOTS.map((bot) => ({
        userAgent: bot,
        disallow: "/",
      })),
    ],
  };
}
