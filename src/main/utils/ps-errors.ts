/**
 * Turns raw PowerShell stderr into a short, actionable message for the UI.
 * Kept in its own module so it has no dependency on child_process and can be
 * shared by every service (and unit-tested without mocking PowerShell).
 */
export function describePowerShellError(stderr: string): string {
  if (/access.*denied|acceso.*denegado|UnauthorizedAccess|PermissionDenied|denied/i.test(stderr)) {
    return 'Acceso denegado: ejecuta NitroFlow como administrador'
  }
  const firstLine = stderr.split(/\r?\n/).find((l) => l.trim().length > 0) ?? 'Error desconocido'
  return firstLine.trim().slice(0, 200)
}
