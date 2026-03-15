export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Login page renders without AppShell (no sidebar/header)
  return <>{children}</>;
}
