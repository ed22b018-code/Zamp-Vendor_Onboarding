/** @type {import('next').NextConfig} */
const nextConfig = {
  // Sample invoice PDFs are read by API routes on the server, so ship them with the functions.
  outputFileTracingIncludes: { '/api/**': ['./public/samples/**'] },
  poweredByHeader: false,
}
export default nextConfig
