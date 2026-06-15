import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PolySearch',
  description: 'Compare the same query across Elasticsearch, OpenSearch and Solr',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
