/**
 * Layout khusus /read — tanpa Navbar dan Footer.
 * Reader membutuhkan full-screen tanpa navigasi global.
 */
export default function ReadLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
